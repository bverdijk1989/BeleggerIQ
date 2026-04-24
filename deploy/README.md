# BeleggerIQ 2.0 — deploy op Hetzner

Productiegerichte deploy voor een enkele Hetzner VPS (Ubuntu 22.04 of 24.04).
Architectuur: nginx → Next.js (systemd, port 3000) → PostgreSQL (lokaal).
SSL via Let's Encrypt (certbot). Release-strategie: atomic symlink swap met
rollback-pad.

## Bestanden

| Bestand | Doel |
|---------|------|
| [`server-bootstrap.sh`](./server-bootstrap.sh) | Eenmalige setup: Node 20, PostgreSQL 16, nginx, UFW, `beleggeriq`-user + DB |
| [`nginx.conf.example`](./nginx.conf.example) | Reverse-proxy config met security headers en cache-regels |
| [`beleggeriq.service`](./beleggeriq.service) | systemd unit met hardening (ProtectSystem, NoNewPrivileges) |
| [`deploy.sh`](./deploy.sh) | Pull + build + migrate + swap; draai als `beleggeriq`-user |

## SSH-poort

Deze Hetzner-machine draait sshd op **port 2222** (security-hardening). Voeg
toe aan je lokale `~/.ssh/config`:

```
Host beleggeriq
    HostName 195.201.149.219
    User root
    Port 2222
```

Daarna: `ssh beleggeriq` in plaats van `ssh -p 2222 root@...`.

Het bootstrap-script detecteert automatisch op welke poort sshd luistert en
opent die in UFW. Expliciet overrulen kan met
`SSH_PORT=2222 sudo -E bash bootstrap.sh`.

## Volgorde (eerste deploy)

```bash
# --- Op de server, als root (via 'ssh beleggeriq' of 'ssh -p 2222 root@195.201.149.219') ---
wget -O bootstrap.sh https://raw.githubusercontent.com/bverdijk1989/BeleggerIQ/main/deploy/server-bootstrap.sh
sudo bash bootstrap.sh
# Noteer de DATABASE_URL die het script uitprint.

# --- DNS ---
# Maak een A-record aan dat <subdomain> → 195.201.149.219 wijst.
# Wacht tot dig <subdomain> +short correct antwoord geeft.

# --- nginx + SSL ---
sudo cp /path/to/repo/deploy/nginx.conf.example /etc/nginx/sites-available/beleggeriq.conf
sudo sed -i 's/BELEGGERIQ_DOMAIN/beleggeriq.mijndomein.nl/g' /etc/nginx/sites-available/beleggeriq.conf
sudo ln -s /etc/nginx/sites-available/beleggeriq.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d beleggeriq.mijndomein.nl

# --- Production env ---
sudo -u beleggeriq tee /var/www/beleggeriq/shared/.env.production <<'EOF'
DATABASE_URL="postgresql://beleggeriq:<wachtwoord-uit-bootstrap>@localhost:5432/beleggeriq?schema=public"
NEXT_PUBLIC_APP_NAME="BeleggerIQ"
NEXT_PUBLIC_APP_URL="https://beleggeriq.mijndomein.nl"
NODE_ENV=production
MARKET_DATA_PROVIDER=stub
BIQ_SESSION_SECRET="<openssl rand -hex 32 — min 32 tekens>"
# Zet NIET op true in productie tenzij je bewust demo-auth wilt:
# BIQ_ALLOW_DEMO_AUTH=false
EOF
sudo chmod 0600 /var/www/beleggeriq/shared/.env.production
sudo chown beleggeriq:beleggeriq /var/www/beleggeriq/shared/.env.production

# --- systemd ---
sudo cp /path/to/repo/deploy/beleggeriq.service /etc/systemd/system/
sudo systemctl daemon-reload

# --- Eerste release ---
sudo -u beleggeriq -i
cd /var/www/beleggeriq
wget https://raw.githubusercontent.com/bverdijk1989/BeleggerIQ/main/deploy/deploy.sh
chmod +x deploy.sh
./deploy.sh
exit  # terug naar de sudo-shell

sudo systemctl enable --now beleggeriq
sudo systemctl status beleggeriq
```

Check: `curl -I https://beleggeriq.mijndomein.nl` → `HTTP/2 200`.

## Volgende deploys

```bash
sudo -u beleggeriq -i
cd /var/www/beleggeriq
./deploy.sh                # pakt latest main
./deploy.sh v1.2.0         # specifieke tag
```

## Rollback

```bash
ls /var/www/beleggeriq/releases/
sudo -u beleggeriq ln -sfn /var/www/beleggeriq/releases/<prev-stamp> /var/www/beleggeriq/current
sudo systemctl restart beleggeriq
```

## Checklist voor productie

- [ ] `BIQ_SESSION_SECRET` ≥ 32 tekens (`openssl rand -hex 32`).
- [ ] `BIQ_ALLOW_DEMO_AUTH` **niet** op `true` (of weggelaten).
- [ ] `NODE_ENV=production`.
- [ ] `chmod 0600 .env.production` — eigendom `beleggeriq:beleggeriq`.
- [ ] SSL getest (`ssllabs.com` → minimaal A).
- [ ] `ufw status` → alleen 22/80/443 open.
- [ ] Prisma migraties gedraaid (`prisma migrate deploy`, gebeurt automatisch via `deploy.sh`).
- [ ] Health-check: `curl -I https://<domain>/dashboard` → redirect naar login of 401 (niet 500).
- [ ] Logs: `journalctl -u beleggeriq --since today`.
- [ ] Next.js versie bijgewerkt — 15.0.3 heeft een CVE, upgrade zodra mogelijk.

## Wat er NIET in zit (bewuste scope-limits)

- Geen echte login-flow. De auth-resolver accepteert een signed cookie
  (`biq_session`) — we hebben nog geen OAuth/magic-link flow om die uit te geven.
  Tot die flow landt: zet `BIQ_ALLOW_DEMO_AUTH=true` in staging, of schrijf
  de cookie handmatig met [`signSessionCookie`](../src/lib/auth/session.ts).
- Geen Docker. Bare-metal is eenvoudiger voor 1 VPS; Docker kan later
  worden toegevoegd zonder deze flow te breken.
- Geen CI/CD. Een GitHub Actions workflow kan `deploy.sh` remote
  aanroepen via SSH; dat is een volgende stap.
