#!/usr/bin/env bash
# shellcheck shell=bash
#
# BeleggerIQ — encrypted Postgres backup naar S3-compatible storage.
#
# Pijplijn:
#   pg_dump --format=custom --no-owner --no-acl
#     | gzip -9
#     | (age|gpg) encrypt
#     → upload naar s3://$BACKUP_S3_BUCKET/daily/beleggeriq-<ts>.sql.gz.<ext>
#
# Retentie:
#   - Daily   : laatste $BACKUP_RETENTION_DAILY (default 7) onder daily/
#   - Weekly  : op zondag promoten naar weekly/, retentie $BACKUP_RETENTION_WEEKLY (4)
#   - Monthly : op de 1e v/d maand promoten naar monthly/, retentie $BACKUP_RETENTION_MONTHLY (12)
#
# Status-file (JSON) wordt na elke run geschreven naar
# $BACKUP_STATUS_FILE — gelezen door /api/health/backup zodat een
# >30u-stale-backup een alert kan triggeren.
#
# Aanroep:
#   ./backup.sh                        # gebruik /var/www/beleggeriq/shared/.env.backup
#   BIQ_BACKUP_ENV=/path/.env ./backup.sh
#
# Cron:
#   /etc/systemd/system/beleggeriq-backup.{service,timer}
#   draait dagelijks 03:15 server-tijd, zie deploy/systemd/.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/backup-common.sh
. "$SCRIPT_DIR/lib/backup-common.sh"

ENV_FILE="${BIQ_BACKUP_ENV:-/var/www/beleggeriq/shared/.env.backup}"
biq_load_env "$ENV_FILE"
biq_require_backup_tools

# ============================================================
#  Tempdir met cleanup
# ============================================================

WORKDIR=$(mktemp -d -t biq-backup.XXXXXX)
cleanup() {
    rm -rf "$WORKDIR"
}
trap cleanup EXIT

# ============================================================
#  Run
# ============================================================

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
DAY_OF_WEEK=$(date -u +%u)   # 1=ma … 7=zo
DAY_OF_MONTH=$(date -u +%d)
EXT=$(biq_encryption_extension)
KEY=$(biq_backup_key "$TIMESTAMP")
DUMP_FILE="$WORKDIR/dump.sql.gz"
ENC_FILE="$WORKDIR/dump.sql.gz.$EXT"

log_event INFO backup_start key "$KEY" encryption "$BACKUP_ENCRYPTION"

# 1) pg_dump → gzip
#
# `--format=custom` levert een binary archive die `pg_restore` selectief kan
# herstellen (nodig voor rollback-procedure in docs/BACKUPS.md). We geven 'm
# tóch nog een keer door gzip omdat dat over draaiend transport-formaat blijft
# helpen bij encryptie en checksumming, en omdat custom-format compressie
# (-Z9) afhankelijk is van zlib op de runtime — gzip in pipe is universeel.
if ! pg_dump \
        --format=custom \
        --no-owner \
        --no-acl \
        --dbname "$DATABASE_URL" \
        2>"$WORKDIR/pg_dump.err" \
    | gzip -9 -c > "$DUMP_FILE"; then
    err=$(tr '\n' ' ' <"$WORKDIR/pg_dump.err" || true)
    biq_write_status failure "" "pg_dump failed: $err"
    biq_die pg_dump_failed stderr "$err"
fi

DUMP_BYTES=$(stat -c%s "$DUMP_FILE" 2>/dev/null || stat -f%z "$DUMP_FILE")
if [ "${DUMP_BYTES:-0}" -lt 1024 ]; then
    biq_write_status failure "" "dump too small: $DUMP_BYTES bytes"
    biq_die dump_too_small bytes "$DUMP_BYTES"
fi
log_event INFO dump_done bytes "$DUMP_BYTES"

# 2) Encrypt
if ! biq_encrypt "$DUMP_FILE" "$ENC_FILE" 2>"$WORKDIR/enc.err"; then
    err=$(tr '\n' ' ' <"$WORKDIR/enc.err" || true)
    biq_write_status failure "" "encrypt failed: $err"
    biq_die encrypt_failed stderr "$err"
fi
ENC_BYTES=$(stat -c%s "$ENC_FILE" 2>/dev/null || stat -f%z "$ENC_FILE")
log_event INFO encrypt_done bytes "$ENC_BYTES"

# 3) Upload naar S3 (daily/)
DEST=$(biq_s3_uri "$KEY")
if ! biq_s3 s3 cp "$ENC_FILE" "$DEST" --only-show-errors 2>"$WORKDIR/up.err"; then
    err=$(tr '\n' ' ' <"$WORKDIR/up.err" || true)
    biq_write_status failure "" "upload failed: $err"
    biq_die upload_failed stderr "$err"
fi
log_event INFO upload_done dest "$DEST"

# 4) Promote naar weekly/ en monthly/ via S3-side copy.
#
# We slaan het bestand niet opnieuw op — `aws s3 cp s3://… s3://…` doet een
# server-side copy zonder bytes te downloaden. Geen extra bandbreedte, geen
# extra encryptie-ronde nodig. De daily-versie blijft staan tot retentie.
WEEKLY_KEY="weekly/beleggeriq-${TIMESTAMP}.sql.gz.${EXT}"
MONTHLY_KEY="monthly/beleggeriq-${TIMESTAMP}.sql.gz.${EXT}"

if [ "$DAY_OF_WEEK" = "7" ]; then
    if biq_s3 s3 cp "$DEST" "$(biq_s3_uri "$WEEKLY_KEY")" --only-show-errors 2>>"$WORKDIR/promote.err"; then
        log_event INFO promote_weekly key "$WEEKLY_KEY"
    else
        log_event WARN promote_weekly_failed key "$WEEKLY_KEY"
    fi
fi

if [ "$DAY_OF_MONTH" = "01" ]; then
    if biq_s3 s3 cp "$DEST" "$(biq_s3_uri "$MONTHLY_KEY")" --only-show-errors 2>>"$WORKDIR/promote.err"; then
        log_event INFO promote_monthly key "$MONTHLY_KEY"
    else
        log_event WARN promote_monthly_failed key "$MONTHLY_KEY"
    fi
fi

# 5) Retentie — verwijder oudere bestanden binnen elk prefix.
#
# `aws s3api list-objects-v2 --output text` geeft per object een regel met
# LastModified + Key. We sorteren nieuw → oud, slaan de eerste N over en
# verwijderen de rest. Dit werkt prefix-by-prefix, zodat een fout in één
# prefix niet de andere blokkeert.
biq_prune_prefix() {
    local prefix="$1"
    local keep="$2"
    local list
    if ! list=$(biq_s3 s3api list-objects-v2 \
            --bucket "$BACKUP_S3_BUCKET" \
            --prefix "$prefix" \
            --query 'Contents[].{K:Key,M:LastModified}' \
            --output text 2>>"$WORKDIR/list.err"); then
        log_event WARN prune_list_failed prefix "$prefix"
        return 0
    fi
    if [ -z "$list" ] || [ "$list" = "None" ]; then
        return 0
    fi
    # Sorteer descending op LastModified (kolom 2), neem alles voorbij `keep`.
    local victims
    victims=$(printf '%s\n' "$list" \
        | awk 'NF>=2 {print $2"\t"$1}' \
        | sort -r \
        | awk -v k="$keep" 'NR>k {print $2}')
    if [ -z "$victims" ]; then
        return 0
    fi
    while IFS= read -r victim; do
        [ -z "$victim" ] && continue
        if biq_s3 s3 rm "s3://$BACKUP_S3_BUCKET/$victim" --only-show-errors 2>>"$WORKDIR/rm.err"; then
            log_event INFO prune_deleted key "$victim"
        else
            log_event WARN prune_delete_failed key "$victim"
        fi
    done <<<"$victims"
}

biq_prune_prefix "daily/"   "$BACKUP_RETENTION_DAILY"
biq_prune_prefix "weekly/"  "$BACKUP_RETENTION_WEEKLY"
biq_prune_prefix "monthly/" "$BACKUP_RETENTION_MONTHLY"

# 6) Status-file voor health endpoint.
biq_write_status success "$KEY" "uploaded $ENC_BYTES bytes encrypted=$BACKUP_ENCRYPTION"
log_event INFO backup_done key "$KEY" bytes "$ENC_BYTES"
