#!/usr/bin/env bash
# shellcheck shell=bash
#
# BeleggerIQ — restore-test.
#
# Doel: bewijzen dat een backup uit S3 daadwerkelijk te herstellen is.
# Een backup-bestand dat je niet kunt restoren is geen backup.
#
# Wat dit script doet:
#   1. Download de meest recente backup uit `daily/` (of een expliciet meegegeven key).
#   2. Decrypt'em met de configured age/gpg-identity.
#   3. Voer een `pg_restore --list` uit als sanity-check (catalog leest correct).
#   4. Optioneel (`--full`): herstel in een tijdelijke DB en draai een
#      smoke-query (`SELECT count(*) FROM "User";`).
#   5. Cleanup: temp-DB en tempdir verdwijnen, ook bij failure.
#
# Aanroep:
#   ./restore-test.sh                      # listing-mode (snel, ~5s)
#   ./restore-test.sh --full               # full restore in tijdelijke DB (~minuten)
#   ./restore-test.sh --key daily/x.sql.gz.age   # specifieke backup
#
# Vereiste env:
#   BACKUP_AGE_IDENTITY  pad naar age-identity-file (alleen bij ENCRYPTION=age)
#   BACKUP_RESTORE_DB_URL  optioneel — admin-connection voor createdb/dropdb
#                          (default: same host als DATABASE_URL met db=postgres)
#
# Exit-codes:
#   0   restore-test slaagt
#   1   download / decrypt / restore faalt
#   2   smoke-query (full mode) faalt — DB is hersteld maar leeg of corrupt

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/backup-common.sh
. "$SCRIPT_DIR/lib/backup-common.sh"

ENV_FILE="${BIQ_BACKUP_ENV:-/var/www/beleggeriq/shared/.env.backup}"
biq_load_env "$ENV_FILE"
biq_require_restore_tools

# ============================================================
#  Argumenten
# ============================================================

MODE="list"     # list | full
EXPLICIT_KEY=""

while [ "$#" -gt 0 ]; do
    case "$1" in
        --full)  MODE="full"; shift ;;
        --list)  MODE="list"; shift ;;
        --key)   EXPLICIT_KEY="${2:?--key vereist een waarde}"; shift 2 ;;
        -h|--help)
            sed -n '2,30p' "$0"
            exit 0
            ;;
        *)  biq_die unknown_arg arg "$1" ;;
    esac
done

# ============================================================
#  Tempdir met cleanup
# ============================================================

WORKDIR=$(mktemp -d -t biq-restore.XXXXXX)
TEMP_DB=""
cleanup() {
    if [ -n "$TEMP_DB" ]; then
        biq_drop_temp_db "$TEMP_DB" || true
    fi
    rm -rf "$WORKDIR"
}
trap cleanup EXIT

# ============================================================
#  Helpers
# ============================================================

# Lees admin-connection (db=postgres) uit DATABASE_URL — die hebben we nodig
# voor `createdb` / `dropdb`. We bouwen 'em door in DATABASE_URL het pad-deel
# te vervangen door /postgres. Als BACKUP_RESTORE_DB_URL is gezet, override.
biq_admin_url() {
    if [ -n "${BACKUP_RESTORE_DB_URL:-}" ]; then
        printf '%s' "$BACKUP_RESTORE_DB_URL"
        return
    fi
    # Strip schema-query (Prisma-stijl) en vervang /<db> door /postgres.
    printf '%s' "$DATABASE_URL" \
        | sed -E 's#[?&]schema=[^&]+##' \
        | sed -E 's#(://[^/]+)/[^?]*#\1/postgres#'
}

biq_drop_temp_db() {
    local db="$1"
    PGPASSWORD="" dropdb --if-exists --force "--dbname=$(biq_admin_url)" "$db" \
        2>>"$WORKDIR/dropdb.err" || true
}

# ============================================================
#  Stap 1 — bepaal welke backup we restoren
# ============================================================

if [ -z "$EXPLICIT_KEY" ]; then
    log_event INFO restore_pick_latest
    LATEST=$(biq_s3 s3api list-objects-v2 \
        --bucket "$BACKUP_S3_BUCKET" \
        --prefix "daily/" \
        --query 'Contents[].{K:Key,M:LastModified}' \
        --output text 2>"$WORKDIR/list.err" || true)
    if [ -z "$LATEST" ] || [ "$LATEST" = "None" ]; then
        biq_die no_backups_found prefix "daily/"
    fi
    KEY=$(printf '%s\n' "$LATEST" \
        | awk 'NF>=2 {print $2"\t"$1}' \
        | sort -r \
        | head -n1 \
        | awk '{print $2}')
else
    KEY="$EXPLICIT_KEY"
fi

if [ -z "$KEY" ]; then
    biq_die no_key_resolved
fi

EXT=$(biq_encryption_extension)
ENC_FILE="$WORKDIR/$(basename "$KEY")"
DEC_FILE="${ENC_FILE%.$EXT}"

log_event INFO restore_target key "$KEY" mode "$MODE"

# ============================================================
#  Stap 2 — download
# ============================================================

if ! biq_s3 s3 cp "$(biq_s3_uri "$KEY")" "$ENC_FILE" --only-show-errors 2>"$WORKDIR/dl.err"; then
    err=$(tr '\n' ' ' <"$WORKDIR/dl.err" || true)
    biq_die download_failed key "$KEY" stderr "$err"
fi
ENC_BYTES=$(stat -c%s "$ENC_FILE" 2>/dev/null || stat -f%z "$ENC_FILE")
log_event INFO download_done bytes "$ENC_BYTES"

# ============================================================
#  Stap 3 — decrypt + ungzip
# ============================================================

if ! biq_decrypt "$ENC_FILE" "$DEC_FILE" 2>"$WORKDIR/dec.err"; then
    err=$(tr '\n' ' ' <"$WORKDIR/dec.err" || true)
    biq_die decrypt_failed stderr "$err"
fi

# `$DEC_FILE` is `<naam>.sql.gz` — gunzip levert het pg_dump custom-archive op.
DUMP_FILE="${DEC_FILE%.gz}"
if ! gunzip -c "$DEC_FILE" > "$DUMP_FILE" 2>"$WORKDIR/gz.err"; then
    err=$(tr '\n' ' ' <"$WORKDIR/gz.err" || true)
    biq_die gunzip_failed stderr "$err"
fi
DUMP_BYTES=$(stat -c%s "$DUMP_FILE" 2>/dev/null || stat -f%z "$DUMP_FILE")
log_event INFO dump_extracted bytes "$DUMP_BYTES"

# ============================================================
#  Stap 4 — sanity-check via pg_restore --list
# ============================================================

LIST_OUT="$WORKDIR/restore.list"
if ! pg_restore --list "$DUMP_FILE" > "$LIST_OUT" 2>"$WORKDIR/list-restore.err"; then
    err=$(tr '\n' ' ' <"$WORKDIR/list-restore.err" || true)
    biq_die pg_restore_list_failed stderr "$err"
fi

CATALOG_LINES=$(wc -l < "$LIST_OUT" | tr -d ' ')
TABLE_LINES=$(grep -c " TABLE " "$LIST_OUT" || true)
log_event INFO restore_catalog catalog_lines "$CATALOG_LINES" tables "$TABLE_LINES"

if [ "${TABLE_LINES:-0}" -lt 5 ]; then
    biq_die catalog_too_small tables "$TABLE_LINES"
fi

if [ "$MODE" = "list" ]; then
    log_event INFO restore_test_ok mode list key "$KEY" tables "$TABLE_LINES"
    printf 'OK list-mode: key=%s tables=%s catalog_lines=%s\n' \
        "$KEY" "$TABLE_LINES" "$CATALOG_LINES"
    exit 0
fi

# ============================================================
#  Stap 5 — full restore in tijdelijke database
# ============================================================

TEMP_DB="biq_restore_test_$(date -u +%Y%m%d_%H%M%S)_$$"
ADMIN_URL=$(biq_admin_url)

log_event INFO restore_full_create_db db "$TEMP_DB"
if ! createdb "--dbname=$ADMIN_URL" "$TEMP_DB" 2>"$WORKDIR/createdb.err"; then
    err=$(tr '\n' ' ' <"$WORKDIR/createdb.err" || true)
    biq_die createdb_failed db "$TEMP_DB" stderr "$err"
fi

# Bouw URL voor de tijdelijke DB door /postgres → /<temp_db> te vervangen.
TEMP_URL=$(printf '%s' "$ADMIN_URL" | sed -E "s#/postgres([?]|$)#/$TEMP_DB\1#")
if [ "$TEMP_URL" = "$ADMIN_URL" ]; then
    biq_die admin_url_substitution_failed url_template "$ADMIN_URL"
fi

log_event INFO restore_full_running db "$TEMP_DB"
if ! pg_restore \
        --no-owner \
        --no-acl \
        --dbname "$TEMP_URL" \
        "$DUMP_FILE" \
        2>"$WORKDIR/pg_restore.err"; then
    err=$(tr '\n' ' ' <"$WORKDIR/pg_restore.err" || true)
    log_event ERROR pg_restore_failed db "$TEMP_DB" stderr "$err"
    exit 1
fi

# Smoke-queries — als de schema-restore werkt maar de data is leeg/corrupt
# willen we dat hier zien. We leunen op kerntabellen die altijd rijen
# hebben in productie.
SMOKE=$(psql "$TEMP_URL" -X -A -t -c '
    SELECT
      (SELECT count(*) FROM "User") AS users,
      (SELECT count(*) FROM "Portfolio") AS portfolios,
      (SELECT count(*) FROM "Holding") AS holdings;
' 2>"$WORKDIR/psql.err" || true)

if [ -z "$SMOKE" ]; then
    err=$(tr '\n' ' ' <"$WORKDIR/psql.err" || true)
    log_event ERROR smoke_query_failed stderr "$err"
    exit 2
fi

log_event INFO smoke_query_ok counts "$SMOKE"
log_event INFO restore_test_ok mode full key "$KEY" db "$TEMP_DB" counts "$SMOKE"
printf 'OK full-mode: key=%s db=%s counts=%s\n' "$KEY" "$TEMP_DB" "$SMOKE"
exit 0
