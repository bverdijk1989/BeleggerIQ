#!/usr/bin/env bash
# BeleggerIQ 2.0 — deploy-script voor Hetzner (bare-metal).
#
# Draai dit script als user `beleggeriq` vanuit /var/www/beleggeriq.
# Elke deploy landt in een tijdelijke release-map en wordt pas actief
# via een atomic symlink swap, zodat een gefaalde build de huidige
# draaiende versie niet sloopt.
#
# Gebruik:
#   su - beleggeriq
#   cd /var/www/beleggeriq
#   ./deploy.sh                     # pull main, build, migrate, swap, restart
#   ./deploy.sh <git-ref>           # specifieke tag/commit
#
# Rollback:
#   ln -sfn /var/www/beleggeriq/releases/<prev> /var/www/beleggeriq/current
#   sudo systemctl restart beleggeriq

set -euo pipefail

BASE=/var/www/beleggeriq
REPO_URL="${REPO_URL:-https://github.com/bverdijk1989/BeleggerIQ.git}"
REF="${1:-main}"
KEEP_RELEASES=5

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

echo "== [2/7] Symlink shared .env =="
ln -sf "$BASE/shared/.env.production" .env

echo "== [3/7] npm ci (inclusief devDependencies voor build) =="
npm ci --no-audit --no-fund

echo "== [4/7] Prisma generate + migrate deploy =="
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
