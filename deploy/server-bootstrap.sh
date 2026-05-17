#!/usr/bin/env bash
# BeleggerIQ 2.0 — server bootstrap voor een verse Hetzner Ubuntu 22.04/24.04 box.
#
# Draai dit script EENMALIG als root (of via sudo). Het zet Node 20,
# PostgreSQL 16, nginx, certbot en de beleggeriq-systeemuser op.
# Daarna kun je deploy.sh als `beleggeriq` draaien.
#
#   wget -O bootstrap.sh https://raw.githubusercontent.com/bverdijk1989/BeleggerIQ/main/deploy/server-bootstrap.sh
#   sudo bash bootstrap.sh

set -euo pipefail

if [ "$EUID" -ne 0 ]; then
    echo "Draai dit script als root (of met sudo)."
    exit 1
fi

echo "== [1/7] apt update + basis-tools =="
apt-get update -y
apt-get install -y curl ca-certificates gnupg ufw git

echo "== [2/7] Node.js 20 LTS (via NodeSource) =="
if ! command -v node >/dev/null || [ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
node -v
npm -v

echo "== [3/7] PostgreSQL 16 =="
apt-get install -y postgresql postgresql-contrib
systemctl enable --now postgresql

echo "== [4/7] nginx + certbot =="
apt-get install -y nginx
apt-get install -y certbot python3-certbot-nginx

echo "== [5/7] UFW firewall (SSH op poort ${SSH_PORT:-22}, + 80/443) =="
# SSH_PORT overrulet de standaard wanneer sshd op een niet-standaard poort
# luistert (bv. 2222 bij Hetzner security-hardening).
#   SSH_PORT=2222 sudo -E bash bootstrap.sh
# Detecteer automatisch wat sshd listent:
AUTO_SSH_PORT="$(ss -tlnp 2>/dev/null | awk '/sshd/ {sub(/.*:/,"",$4); print $4; exit}')"
SSH_PORT="${SSH_PORT:-${AUTO_SSH_PORT:-22}}"
ufw allow "${SSH_PORT}/tcp" comment "SSH"
ufw allow 'Nginx Full'
ufw --force enable

echo "== [6/7] System user beleggeriq =="
# User-home blijft op /var/www/beleggeriq (dotfiles + bash history).
# App-artefacten (releases/, shared/, backups/, current) leven op het
# Hetzner Cloud Volume om disk-pressure op / te vermijden.
APP_BASE=/mnt/HC_Volume_105455257/apps/beleggeriq
if ! id -u beleggeriq >/dev/null 2>&1; then
    useradd --system --create-home --home-dir /var/www/beleggeriq --shell /bin/bash beleggeriq
fi
if [ ! -d "$(dirname "$APP_BASE")" ]; then
    echo "ERROR: $APP_BASE-parent bestaat niet — is het volume gemount?" >&2
    exit 1
fi
mkdir -p "$APP_BASE/releases" "$APP_BASE/shared" "$APP_BASE/backups"
chown -R beleggeriq:beleggeriq "$APP_BASE" /var/www/beleggeriq

# sudoers-regel zodat de deploy-user alleen de eigen service mag herstarten.
cat > /etc/sudoers.d/beleggeriq <<EOF
%beleggeriq ALL=(ALL) NOPASSWD: /bin/systemctl restart beleggeriq, /bin/systemctl status beleggeriq, /bin/systemctl reload beleggeriq
EOF
chmod 0440 /etc/sudoers.d/beleggeriq

echo "== [7/7] Postgres database + user =="
# LET OP: genereer een sterk wachtwoord en kopieer hem direct naar de
# .env.production — wordt daarna niet opnieuw getoond.
DB_PASS="${DB_PASS:-$(openssl rand -hex 24)}"
sudo -u postgres psql <<SQL
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'beleggeriq') THEN
        CREATE ROLE beleggeriq LOGIN PASSWORD '${DB_PASS}';
    END IF;
END
\$\$;
SQL
sudo -u postgres createdb -O beleggeriq beleggeriq 2>/dev/null || true

echo "================================================================="
echo "Bootstrap gereed."
echo ""
echo "Postgres credentials:"
echo "  DATABASE_URL=\"postgresql://beleggeriq:${DB_PASS}@localhost:5432/beleggeriq?schema=public\""
echo ""
echo "Volgende stappen:"
echo "  1. Kopieer deploy/nginx.conf.example naar /etc/nginx/sites-available/beleggeriq.conf en vul je subdomain in"
echo "  2. ln -s ../sites-available/beleggeriq.conf /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx"
echo "  3. sudo certbot --nginx -d <subdomain>"
echo "  4. Maak ${APP_BASE}/shared/.env.production aan (zie .env.example + DATABASE_URL hierboven)"
echo "     Vergeet BIQ_SESSION_SECRET niet: openssl rand -hex 32"
echo "  5. sudo cp deploy/beleggeriq.service /etc/systemd/system/ && systemctl daemon-reload"
echo "  6. su - beleggeriq && cd ${APP_BASE} && wget https://raw.githubusercontent.com/bverdijk1989/BeleggerIQ/main/deploy/deploy.sh && chmod +x deploy.sh && ./deploy.sh"
echo "  7. sudo systemctl enable --now beleggeriq"
echo "================================================================="
