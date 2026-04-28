# BeleggerIQ — backup & restore

> "Een backup waarvan je nooit een restore hebt getest, is geen backup."

BeleggerIQ schrijft elke nacht een **encrypted Postgres-dump** naar
S3-compatible storage en verifieert die wekelijks via een restore-test.
Deze pagina beschrijft hoe het systeem werkt en — belangrijker —
**hoe je een restore uitvoert wanneer je 'm écht nodig hebt**.

## Architectuur in één oogopslag

```
┌─────────────────┐  pg_dump --format=custom    ┌────────────────┐
│  PostgreSQL 16  │ ───────────────────────────▶│ deploy/backup  │
│  (lokaal)       │      | gzip -9              │      .sh       │
└─────────────────┘      | age -r <pubkey>      └───────┬────────┘
                                                        │ aws s3 cp
                                                        ▼
                                  ┌────────────────────────────────┐
                                  │  S3-compatible bucket          │
                                  │  daily/  (7)                   │
                                  │  weekly/ (4) — promoted Sun    │
                                  │  monthly/(12) — promoted day-1 │
                                  └────────────────────────────────┘

  systemd-timer 03:15 UTC ─▶ backup.service
  systemd-timer 04:30 Sun ─▶ restore-test.service (--list mode)
  HTTP GET /api/health/backup ─▶ 200 ok / 503 stale|failed
```

## Bestanden

| Bestand | Doel |
|---|---|
| [`deploy/backup.sh`](../deploy/backup.sh) | Dagelijkse run: dump → encrypt → upload → retentie |
| [`deploy/restore-test.sh`](../deploy/restore-test.sh) | Validatie: download → decrypt → `pg_restore --list` (of full) |
| [`deploy/lib/backup-common.sh`](../deploy/lib/backup-common.sh) | Gedeelde helpers (env-loader, logger, S3-wrapper, encryptie) |
| [`deploy/systemd/beleggeriq-backup.{service,timer}`](../deploy/systemd/) | Daily backup-cron |
| [`deploy/systemd/beleggeriq-restore-test.{service,timer}`](../deploy/systemd/) | Wekelijkse restore-list-test |
| [`src/app/api/health/backup/route.ts`](../src/app/api/health/backup/route.ts) | Health endpoint voor monitoring |

## Setup op de server

### 1. Systeem-tools installeren

```bash
sudo apt-get install -y postgresql-client age awscli gzip
# (Op Debian < 12: `age` zit in bookworm-backports of installeer via curl-script.)
```

### 2. age-keypair genereren

```bash
sudo -u beleggeriq mkdir -p /var/www/beleggeriq/shared/keys
sudo -u beleggeriq age-keygen -o /var/www/beleggeriq/shared/keys/backup-identity.txt
sudo chmod 0600 /var/www/beleggeriq/shared/keys/backup-identity.txt
```

De **public** recipient (`age1xxx…`) hoort in `.env.backup`. De **private**
identity-file mag **nooit** in dezelfde bucket eindigen als de backups
zelf — anders heeft een aanvaller die de bucket dumpt direct ook de sleutel.

> **Sleutelbeheer.** Bewaar een offline kopie van `backup-identity.txt` in
> een password-manager / hardware-wallet / fysieke kluis. Zonder die
> sleutel zijn je backups bricks. Test elke nieuwe sleutel-rotatie met
> een full restore-test.

### 3. S3-bucket aanmaken (Backblaze B2-voorbeeld)

```bash
# B2-CLI of webconsole. Maak een bucket "biq-backups" (private).
# Genereer een application-key met scope= write+read+delete op die bucket.
```

Werkt ook met Wasabi, AWS S3, MinIO, Cloudflare R2 — elke provider die
de S3 API + custom endpoint ondersteunt.

### 4. `.env.backup` aanmaken

```bash
sudo -u beleggeriq tee /var/www/beleggeriq/shared/.env.backup <<'EOF'
DATABASE_URL="postgresql://beleggeriq:<wachtwoord>@localhost:5432/beleggeriq?schema=public"

BACKUP_S3_ENDPOINT="https://s3.eu-central-003.backblazeb2.com"
BACKUP_S3_BUCKET="biq-backups"
BACKUP_S3_REGION="eu-central-003"
AWS_ACCESS_KEY_ID="<b2-key-id>"
AWS_SECRET_ACCESS_KEY="<b2-application-key>"

BACKUP_ENCRYPTION="age"
BACKUP_AGE_RECIPIENT="age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
BACKUP_AGE_IDENTITY="/var/www/beleggeriq/shared/keys/backup-identity.txt"

BACKUP_STATUS_FILE="/var/www/beleggeriq/shared/backup-status.json"

BACKUP_RETENTION_DAILY=7
BACKUP_RETENTION_WEEKLY=4
BACKUP_RETENTION_MONTHLY=12
EOF
sudo chmod 0600 /var/www/beleggeriq/shared/.env.backup
sudo chown beleggeriq:beleggeriq /var/www/beleggeriq/shared/.env.backup
```

> **NEVER** commit `.env.backup` naar git. De repo bevat geen example —
> deze docs zijn de enige bron-van-waarheid voor de variabelen.

### 5. systemd installeren

```bash
sudo cp /var/www/beleggeriq/current/deploy/systemd/beleggeriq-backup.service /etc/systemd/system/
sudo cp /var/www/beleggeriq/current/deploy/systemd/beleggeriq-backup.timer   /etc/systemd/system/
sudo cp /var/www/beleggeriq/current/deploy/systemd/beleggeriq-restore-test.service /etc/systemd/system/
sudo cp /var/www/beleggeriq/current/deploy/systemd/beleggeriq-restore-test.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now beleggeriq-backup.timer
sudo systemctl enable --now beleggeriq-restore-test.timer
```

Check:
```bash
systemctl list-timers | grep beleggeriq
```

### 6. Eerste backup handmatig draaien

```bash
sudo systemctl start beleggeriq-backup.service
journalctl -u beleggeriq-backup.service -f
```

Verwachte output (structured JSON):
```
{"ts":"…Z","scope":"backup","level":"INFO","event":"backup_start", …}
{"ts":"…Z","scope":"backup","level":"INFO","event":"dump_done","bytes":"…"}
{"ts":"…Z","scope":"backup","level":"INFO","event":"encrypt_done","bytes":"…"}
{"ts":"…Z","scope":"backup","level":"INFO","event":"upload_done","dest":"s3://…"}
{"ts":"…Z","scope":"backup","level":"INFO","event":"backup_done","key":"daily/…","bytes":"…"}
```

### 7. Health endpoint testen

```bash
curl -i https://beleggeriq.mijndomein.nl/api/health/backup
# 200 OK → status=ok, ageHours < 30
# 503    → status=stale|failed|unknown
```

Hang dit endpoint achter een externe monitor (Healthchecks.io, UptimeRobot,
Datadog) zodat je een page krijgt zodra de status omslaat.

## Restore — de échte test

### Snelle validatie (--list mode, ~5 seconden)

```bash
sudo -u beleggeriq /var/www/beleggeriq/current/deploy/restore-test.sh --list
# OK list-mode: key=daily/beleggeriq-…sql.gz.age tables=12 catalog_lines=…
```

Dit downloadt de meest recente backup, decrypt + ungzip 'em, en checkt
dat `pg_restore --list` een geldige catalog leest. **Dit is geen
volledige proof-of-restore** — het bewijst alleen dat het bestand
leesbaar is.

### Volledige validatie (--full mode, ~minuten)

```bash
sudo -u beleggeriq /var/www/beleggeriq/current/deploy/restore-test.sh --full
# OK full-mode: key=… db=biq_restore_test_… counts=4|2|97
```

Wat 'ie doet:
1. Download + decrypt + ungzip de meest recente backup
2. Maakt een tijdelijke DB `biq_restore_test_<ts>_<pid>`
3. Draait `pg_restore` daarop
4. Voert smoke-queries: `SELECT count(*) FROM "User" / "Portfolio" / "Holding"`
5. Drop't de tijdelijke DB

> Plan dit minstens **maandelijks handmatig**, en log de uitkomst in de
> tabel onderaan deze pagina.

### Restore naar productie (het scenario waarvoor je dit allemaal doet)

**Trigger:** datacorruptie, ransomware, foutieve migration, accidental
DROP TABLE. Stop eerst de app om verdere mutations te voorkomen.

```bash
# 0. Stop de app — geen schrijfverkeer meer.
sudo systemctl stop beleggeriq

# 1. Maak een one-shot backup van de huidige (corrupte) DB voor forensics.
sudo -u beleggeriq pg_dump --format=custom \
    --dbname "$(grep '^DATABASE_URL=' /var/www/beleggeriq/shared/.env.production | cut -d'=' -f2- | tr -d '\"')" \
    > /tmp/forensic-$(date -u +%Y%m%dT%H%M%SZ).pgdump

# 2. Download de backup van keuze.
cd /tmp/biq-restore && rm -rf * && mkdir -p . && cd .
aws --endpoint-url "$BACKUP_S3_ENDPOINT" --region "$BACKUP_S3_REGION" \
    s3 cp s3://$BACKUP_S3_BUCKET/daily/beleggeriq-<TIMESTAMP>.sql.gz.age .

# 3. Decrypt + ungzip.
age -d -i /var/www/beleggeriq/shared/keys/backup-identity.txt \
    -o backup.sql.gz beleggeriq-<TIMESTAMP>.sql.gz.age
gunzip backup.sql.gz   # → backup.sql (custom-format archive)

# 4. Drop + recreate de live DB. ⚠ Destructief — controleer twee keer.
sudo -u postgres psql -c "DROP DATABASE beleggeriq;"
sudo -u postgres psql -c "CREATE DATABASE beleggeriq OWNER beleggeriq;"

# 5. Restore.
sudo -u beleggeriq pg_restore \
    --no-owner --no-acl \
    --dbname "$(grep '^DATABASE_URL=' /var/www/beleggeriq/shared/.env.production | cut -d'=' -f2- | tr -d '\"')" \
    backup.sql

# 6. Sanity-check.
sudo -u beleggeriq psql "$(grep '^DATABASE_URL=' /var/www/beleggeriq/shared/.env.production | cut -d'=' -f2- | tr -d '\"')" \
    -c 'SELECT count(*) FROM "User"; SELECT count(*) FROM "Portfolio";'

# 7. Start app + verifieer endpoints.
sudo systemctl start beleggeriq
curl -I https://beleggeriq.mijndomein.nl/dashboard
```

### Point-in-time-recovery

`pg_dump` levert een snapshot, geen WAL-stream. Tussen 2 backups door
ben je dus de wijzigingen van die periode kwijt. Voor sub-uur RPO heb je
nodig:
- Postgres WAL-archiving (pgBackRest, wal-g, of native `archive_command`)
- Of: continuous logical replication naar een hot-standby

Dat zit niet in deze setup — bewuste keuze: BeleggerIQ verwerkt voor de
gemiddelde gebruiker geen high-frequency mutations, dus dagelijkse RPO
is acceptabel. Als dat verandert (bv. wanneer een orderboek of
audit-trail strict <1u RPO eist) → upgrade naar pgBackRest.

## Stale-backup alert

Twee niveaus:

1. **HTTP-niveau** — `/api/health/backup` retourneert 503 zodra de
   laatste backup > 30u oud is of gefaald is. Hang er een UptimeRobot/
   Healthchecks.io probe achter.
2. **systemd-niveau** — `systemctl status beleggeriq-backup.service`
   toont `failed` bij een non-zero exit. Een hostname-niveau monitor
   (node_exporter + Prometheus, of Healthchecks.io heartbeat) kan dit
   oppakken.

De drempel van 30u is hardcoded in
[`src/lib/ops/backup-health.ts`](../src/lib/ops/backup-health.ts) en
afgestemd op de daily 03:15-cadence + 6u marge. Pas alleen aan met goede
reden — als de cadence verandert (bv. naar 2x/dag), overweeg dan ook de
drempel mee te schalen.

## Encryptie-keuze: age vs. gpg

| | age | gpg |
|---|---|---|
| Recipient-format | `age1…` (32 bytes) | OpenPGP key fingerprint |
| Tooling-overhead | 1 binary, 0 config | gpg-agent, keyring, trust-model |
| Audit | minimal surface, modern | groot, conservatief |
| Default | ✅ | optioneel |

We defaulten op **age**. Als je ecosystem al GPG gebruikt (bv. signed
commits, GPG-encrypted email-archief), zet `BACKUP_ENCRYPTION=gpg` en
gebruik `BACKUP_GPG_RECIPIENT=0xKEYID`.

## Restore-validatie-log

Houd hier maandelijks bij dat een **--full** restore werkelijk slaagt.
Bewijs > belofte.

| Datum (UTC) | Backup-key | Mode | Tables | User-count | Door | Notes |
|---|---|---|---|---|---|---|
| _2026-04-?? eerste run_ | _t.b.d._ | full | _t.b.d._ | _t.b.d._ | bart | Initiële validatie na deploy |

## FAQ

**Q: Mijn backup-bestand is opeens enorm gegroeid.**
Check `pg_dump` zelf is niet stuk: `pg_dump --schema-only` zou klein
moeten zijn. Een groei sprong wijst meestal op:
- nieuwe binary-data kolommen (ai-research-dossiers, factor-snapshot
  blobs);
- ongepruned `MagicLinkToken` of `HuntingSignalLog` rijen.

**Q: Mijn S3-kosten exploderen.**
Onderzoek of je weekly/monthly-promoties klantzij worden gerekend als
PUT (extra storage) of als COPY (gratis op meeste providers). Bij B2:
server-side copy is goedkoop maar telt wel als API-call.

**Q: Kan ik backups laten encrypteren voor meerdere recipients
(4-eyes-recovery)?**
De huidige `biq_encrypt` geeft één `-r`-vlag aan `age` en ondersteunt
dus één recipient. age zélf accepteert meerdere `-r` argumenten — als
4-eyes-recovery vereist wordt: pas `biq_encrypt` aan in
[`deploy/lib/backup-common.sh`](../deploy/lib/backup-common.sh) zodat
het op spaties splitst en per recipient een `-r` toevoegt. Eén van de
identities volstaat dan om te decrypteren.
