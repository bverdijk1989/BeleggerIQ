#!/usr/bin/env bash
# BeleggerIQ 2.0 — deploy-script voor Hetzner (bare-metal).
#
# Draai dit script als user `beleggeriq` vanuit /mnt/HC_Volume_105455257/apps/beleggeriq.
# Elke deploy landt in een tijdelijke release-map en wordt pas actief
# via een atomic symlink swap, zodat een gefaalde build de huidige
# draaiende versie niet sloopt.
#
# Gebruik:
#   su - beleggeriq
#   cd /mnt/HC_Volume_105455257/apps/beleggeriq
#   ./deploy.sh                     # pull main, build, migrate, swap, restart
#   ./deploy.sh <git-ref>           # specifieke tag/commit
#   ./deploy.sh --rollback          # zwap `current` naar de vorige release
#   ./deploy.sh --rollback <stamp>  # zwap naar specifieke release-stamp
#
# Rollback handmatig (zonder script):
#   ln -sfn /mnt/HC_Volume_105455257/apps/beleggeriq/releases/<prev> /mnt/HC_Volume_105455257/apps/beleggeriq/current
#   sudo systemctl restart beleggeriq

set -euo pipefail

BASE=/mnt/HC_Volume_105455257/apps/beleggeriq
REPO_URL="${REPO_URL:-https://github.com/bverdijk1989/BeleggerIQ.git}"
KEEP_RELEASES=5

# ============================================================
#  Rollback-mode — geen clone, geen build, alleen symlink swap.
# ============================================================
if [ "${1:-}" = "--rollback" ]; then
    TARGET_STAMP="${2:-}"
    if [ ! -d "$BASE/releases" ]; then
        echo "ERROR: $BASE/releases ontbreekt — nog geen deploys gedaan?" >&2
        exit 1
    fi
    CURRENT_STAMP=""
    if [ -L "$BASE/current" ]; then
        CURRENT_STAMP=$(basename "$(readlink -f "$BASE/current")")
    fi
    if [ -z "$TARGET_STAMP" ]; then
        # Pak de meest-recente release die niét de huidige `current` is.
        TARGET_STAMP=$(ls -1t "$BASE/releases" \
            | grep -v -F -x "$CURRENT_STAMP" \
            | head -n1)
    fi
    if [ -z "$TARGET_STAMP" ] || [ ! -d "$BASE/releases/$TARGET_STAMP" ]; then
        echo "ERROR: geen geldige rollback-target gevonden (gevraagd: '${2:-<auto>}')." >&2
        echo "Beschikbare releases:" >&2
        ls -1t "$BASE/releases" >&2 || true
        exit 1
    fi
    echo "== Rollback van '$CURRENT_STAMP' naar '$TARGET_STAMP' =="
    ln -sfn "$BASE/releases/$TARGET_STAMP" "$BASE/current"
    sudo /bin/systemctl restart beleggeriq
    echo "== Rollback gereed. Huidige release: $TARGET_STAMP =="
    exit 0
fi

REF="${1:-main}"

mkdir -p "$BASE/releases" "$BASE/shared"

# De shared .env.production moet door de operator eenmalig zijn aangemaakt.
if [ ! -f "$BASE/shared/.env.production" ]; then
    echo "ERROR: $BASE/shared/.env.production ontbreekt — kopieer .env.example en vul in."
    exit 1
fi

STAMP=$(date +%Y%m%d-%H%M%S)
RELEASE="$BASE/releases/$STAMP"

echo "== [1/7] Clone $REF naar $RELEASE =="
git clone --depth 1 --branch "$REF" "$REPO_URL" "$RELEASE"
cd "$RELEASE"

# Capture build-info in shared envfile zodat /api/health 'm exposeert
# en monitoring kan zien welke commit in productie draait.
GIT_SHA=$(git rev-parse HEAD)
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
cat > "$BASE/shared/.env.build-info" <<ENV
BIQ_GIT_SHA=$GIT_SHA
BIQ_BUILD_TIME=$BUILD_TIME
ENV
chmod 0644 "$BASE/shared/.env.build-info"

echo "== [2/7] Symlink shared .env =="
ln -sf "$BASE/shared/.env.production" .env

echo "== [3/7] npm ci (inclusief devDependencies voor build) =="
npm ci --no-audit --no-fund

echo "== [4/7] Prisma generate + migrate deploy =="
# Productie-regel: NOOIT `prisma db push` op productie. Dat sync't
# schema rechtstreeks zonder migration-historie en kan destructieve
# kolom-drops uitvoeren bij divergentie. Gebruik altijd
# `prisma migrate deploy` zodat alle schema-wijzigingen via een
# version-controlled migration-bestand binnenkomen.
# Zie docs/DB_MIGRATIONS.md voor de volledige workflow.
npx prisma generate
npx prisma migrate deploy

echo "== [5/7] next build =="
npm run build

echo "== [6/7] Bundle ops-scripts (esbuild → dist/scripts/) =="
# Bundels de TypeScript-scripts in scripts/ naar plain JS zodat we ze
# post-deploy kunnen draaien zonder tsx / devDependencies. Bijvoorbeeld:
#   npm run validate:symbols
# Belangrijk: dit gebeurt VÓÓR `npm prune --omit=dev` want esbuild zelf
# is een devDependency.
npm run build:scripts

# Prune devDependencies na de build — default aan voor slanke runtime.
# Skip met `PRUNE_DEV=0 ./deploy.sh` als je na deploy nog dev tools nodig hebt
# (bv. `prisma db seed` gebruikt tsx, en tsx zit in devDependencies — de
# gebundelde `dist/scripts/*.js` werkt wél na prune).
if [ "${PRUNE_DEV:-1}" = "1" ]; then
    npm prune --omit=dev
fi

echo "== [7/7] Atomic symlink swap + restart =="
ln -sfn "$RELEASE" "$BASE/current"

# Vereist dat de beleggeriq-user sudo-NOPASSWD heeft op deze service:
#   %beleggeriq ALL=(ALL) NOPASSWD: /bin/systemctl restart beleggeriq, /bin/systemctl status beleggeriq
sudo /bin/systemctl restart beleggeriq

echo "== Gereed. Huidige release: $RELEASE =="

# Prune oude releases (houd de laatste N).
cd "$BASE/releases"
ls -1t | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf
echo "Oude releases opgeruimd (bewaard: laatste $KEEP_RELEASES)."
