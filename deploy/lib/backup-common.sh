#!/usr/bin/env bash
# shellcheck shell=bash
#
# Gedeelde helpers voor backup.sh + restore-test.sh.
#
# Conventies:
#  - Alle secrets komen uit env-bestanden — nooit hardcoded in script.
#  - Logging is **structured JSON op stderr** zodat journalctl/Loki/
#    Datadog parseable events ziet.
#  - Iedere functie geeft een non-zero exit-code bij falen + log_event
#    "ERROR" zodat automation alerts kan filteren op `severity=ERROR`.
#  - Geen `eval` op user-input. Geen `bash -c "$x"`. Geen URL-leak in logs.
#
# Vereiste env (uit /mnt/HC_Volume_105455257/apps/beleggeriq/shared/.env.backup):
#   DATABASE_URL                  postgres://user:pass@host:5432/db
#   BACKUP_S3_ENDPOINT            https://s3.eu-central-003.backblazeb2.com
#   BACKUP_S3_BUCKET              biq-backups
#   BACKUP_S3_REGION              eu-central-003
#   AWS_ACCESS_KEY_ID             …
#   AWS_SECRET_ACCESS_KEY         …
#   BACKUP_ENCRYPTION             age|gpg     (default: age)
#   BACKUP_AGE_RECIPIENT          age1xxx…    (vereist als ENCRYPTION=age)
#   BACKUP_GPG_RECIPIENT          0xKEYID     (vereist als ENCRYPTION=gpg)
#   BACKUP_STATUS_FILE            /mnt/HC_Volume_105455257/apps/beleggeriq/shared/backup-status.json
#   BACKUP_RETENTION_DAILY        default 7
#   BACKUP_RETENTION_WEEKLY       default 4
#   BACKUP_RETENTION_MONTHLY      default 12

set -euo pipefail

# ============================================================
#  Logging — structured JSON
# ============================================================

biq_now_iso() {
    date -u +%Y-%m-%dT%H:%M:%SZ
}

# log_event LEVEL EVENT [extra-json-keypairs…]
# LEVEL ∈ INFO|WARN|ERROR
log_event() {
    local level="$1"
    local event="$2"
    shift 2
    local extra=""
    while [ "$#" -gt 0 ]; do
        # Best-effort JSON-escape — alleen quotes en backslashes.
        local key="$1"
        local val="${2:-}"
        shift 2 || true
        # shellcheck disable=SC2001
        val=$(echo "$val" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')
        extra="$extra,\"$key\":\"$val\""
    done
    printf '{"ts":"%s","scope":"backup","level":"%s","event":"%s"%s}\n' \
        "$(biq_now_iso)" "$level" "$event" "$extra" >&2
}

biq_die() {
    log_event ERROR "$1" "${@:2}"
    exit 1
}

# ============================================================
#  Env-loader — read ./.env.backup of override-pad
# ============================================================

biq_load_env() {
    local env_file="${1:-/mnt/HC_Volume_105455257/apps/beleggeriq/shared/.env.backup}"
    if [ ! -f "$env_file" ]; then
        biq_die env_missing path "$env_file"
    fi
    # shellcheck disable=SC1090
    set -a; . "$env_file"; set +a

    : "${DATABASE_URL:?DATABASE_URL ontbreekt in $env_file}"
    : "${BACKUP_S3_ENDPOINT:?BACKUP_S3_ENDPOINT ontbreekt}"
    : "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET ontbreekt}"
    : "${BACKUP_S3_REGION:?BACKUP_S3_REGION ontbreekt}"
    : "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID ontbreekt}"
    : "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY ontbreekt}"

    BACKUP_ENCRYPTION="${BACKUP_ENCRYPTION:-age}"
    BACKUP_RETENTION_DAILY="${BACKUP_RETENTION_DAILY:-7}"
    BACKUP_RETENTION_WEEKLY="${BACKUP_RETENTION_WEEKLY:-4}"
    BACKUP_RETENTION_MONTHLY="${BACKUP_RETENTION_MONTHLY:-12}"
    BACKUP_STATUS_FILE="${BACKUP_STATUS_FILE:-/mnt/HC_Volume_105455257/apps/beleggeriq/shared/backup-status.json}"

    case "$BACKUP_ENCRYPTION" in
        age) : "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT vereist bij age}" ;;
        gpg) : "${BACKUP_GPG_RECIPIENT:?BACKUP_GPG_RECIPIENT vereist bij gpg}" ;;
        *)   biq_die unsupported_encryption value "$BACKUP_ENCRYPTION" ;;
    esac
}

# ============================================================
#  Tooling-checks — fail fast, geen halve runs
# ============================================================

biq_require_tool() {
    local name="$1"
    if ! command -v "$name" >/dev/null 2>&1; then
        biq_die tool_missing tool "$name"
    fi
}

biq_require_backup_tools() {
    biq_require_tool pg_dump
    biq_require_tool gzip
    biq_require_tool aws
    case "$BACKUP_ENCRYPTION" in
        age) biq_require_tool age ;;
        gpg) biq_require_tool gpg ;;
    esac
}

biq_require_restore_tools() {
    biq_require_tool psql
    biq_require_tool createdb
    biq_require_tool dropdb
    biq_require_tool gunzip
    biq_require_tool aws
    case "$BACKUP_ENCRYPTION" in
        age) biq_require_tool age ;;
        gpg) biq_require_tool gpg ;;
    esac
}

# ============================================================
#  S3 helpers — gebruik aws-cli met endpoint-override zodat
#  Backblaze B2 / Wasabi / MinIO ook werken.
# ============================================================

biq_s3() {
    aws --endpoint-url "$BACKUP_S3_ENDPOINT" --region "$BACKUP_S3_REGION" "$@"
}

biq_s3_uri() {
    local key="$1"
    printf 's3://%s/%s' "$BACKUP_S3_BUCKET" "$key"
}

# ============================================================
#  Encryption-helpers
# ============================================================

biq_encrypt() {
    local input="$1"
    local output="$2"
    case "$BACKUP_ENCRYPTION" in
        age)
            age -r "$BACKUP_AGE_RECIPIENT" -o "$output" "$input"
            ;;
        gpg)
            gpg --batch --yes --trust-model always \
                --encrypt --recipient "$BACKUP_GPG_RECIPIENT" \
                --output "$output" "$input"
            ;;
    esac
}

biq_decrypt() {
    local input="$1"
    local output="$2"
    case "$BACKUP_ENCRYPTION" in
        age)
            : "${BACKUP_AGE_IDENTITY:?BACKUP_AGE_IDENTITY vereist voor decrypt (path naar identity-file)}"
            age -d -i "$BACKUP_AGE_IDENTITY" -o "$output" "$input"
            ;;
        gpg)
            gpg --batch --yes --decrypt --output "$output" "$input"
            ;;
    esac
}

biq_encryption_extension() {
    case "$BACKUP_ENCRYPTION" in
        age) printf 'age' ;;
        gpg) printf 'gpg' ;;
    esac
}

# ============================================================
#  Backup-bestandsnaam-conventie
# ============================================================

biq_backup_key() {
    local timestamp="$1"
    local ext
    ext=$(biq_encryption_extension)
    printf 'daily/beleggeriq-%s.sql.gz.%s' "$timestamp" "$ext"
}

# ============================================================
#  Status-file — voor health endpoint + 30u-alert.
# ============================================================

biq_write_status() {
    local result="$1"     # success|failure
    local key="$2"        # s3 key (empty bij failure)
    local message="${3:-}"
    local file="$BACKUP_STATUS_FILE"
    mkdir -p "$(dirname "$file")"
    cat > "$file" <<JSON
{
  "lastAttemptAt": "$(biq_now_iso)",
  "lastResult": "$result",
  "lastSuccessKey": "$key",
  "message": $(printf '%s' "$message" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | awk 'BEGIN{print "\""}{printf "%s",$0}END{print "\""}')
}
JSON
}
