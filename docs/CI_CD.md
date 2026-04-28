# CI/CD — BeleggerIQ 2.0

GitHub Actions draait drie workflows tegen deze repo:

| Workflow | Trigger | Doel |
|---|---|---|
| [`ci.yml`](../.github/workflows/ci.yml) | PR + push naar `main` | Tests + tsc + next build — gate voor merges |
| [`deploy.yml`](../.github/workflows/deploy.yml) | push naar `main` + manual | SSH naar Hetzner, run `deploy.sh`, smoke /api/health |
| [`rollback.yml`](../.github/workflows/rollback.yml) | manual only | SSH + `deploy.sh --rollback [stamp]` of forward-deploy van `<ref>` |

```
PR  ──▶ ci.yml ──▶ ✅ → mergeable
                  ❌ → branch-protection blokkeert merge

main push ──▶ ci.yml ──▶ deploy.yml ──▶ ssh deploy.sh ──▶ smoke /api/health
                                                            └─ 503 → fail run

manual ─────▶ rollback.yml ──▶ ssh deploy.sh --rollback ──▶ smoke /api/health
```

## Branch-protection (eenmalig instellen)

GitHub → Settings → Branches → `main` → Add rule:
- ✅ "Require a pull request before merging"
- ✅ "Require status checks to pass before merging"
  - Required check: **`build`** (uit `ci.yml`)
- ✅ "Require branches to be up to date before merging"

Zonder deze rules kan een rode CI-run alsnog gemergde worden — maak het
expliciet onmogelijk.

## Required GitHub configuration

### Secrets (Settings → Secrets and variables → Actions → Secrets)

| Secret | Beschrijving | Voorbeeld |
|---|---|---|
| `HETZNER_HOST` | IP of hostname van de productie-VPS | `195.201.149.219` |
| `HETZNER_SSH_PORT` | SSH-poort (deze server: 2222) | `2222` |
| `HETZNER_USER` | Login-user (moet `deploy.sh` kunnen draaien) | `beleggeriq` |
| `HETZNER_SSH_PRIVATE_KEY` | Privé-sleutel voor de deploy-user (ED25519). Hele PEM, inclusief BEGIN/END. | `-----BEGIN OPENSSH PRIVATE KEY-----…` |
| `HETZNER_KNOWN_HOSTS` | Output van `ssh-keyscan -p <port> <host>` — verifieert host-key | `[195.201.149.219]:2222 ssh-ed25519 AAAA…` |
| `BIQ_SESSION_SECRET_TEST` | (optioneel) 32+ tekens, alleen gebruikt door tests in CI. Default vaste 48-tekens dummy. | `openssl rand -hex 24` |

### Variables (Settings → Secrets and variables → Actions → Variables)

| Variable | Beschrijving | Voorbeeld |
|---|---|---|
| `PRODUCTION_URL` | Public URL voor smoke-tests (geen trailing slash) | `https://beleggeriq.mijndomein.nl` |

> **Variables vs secrets.** `PRODUCTION_URL` zit in *variables* (niet *secrets*) zodat 'm zichtbaar is in de Actions-UI — het is geen geheim, en debugging zonder de waarde te kunnen zien is pijnlijk.

## Eenmalige server-setup voor CI/CD

```bash
# 1. Op de server: maak een ED25519 keypair voor de deploy-user.
sudo -u beleggeriq ssh-keygen -t ed25519 -N '' -f /home/beleggeriq/.ssh/github_actions
sudo -u beleggeriq cat /home/beleggeriq/.ssh/github_actions.pub \
    >> /home/beleggeriq/.ssh/authorized_keys

# 2. Pak de PRIVATE key (let op: nooit als secret in git zetten!).
sudo -u beleggeriq cat /home/beleggeriq/.ssh/github_actions
# → kopieer naar GitHub secret HETZNER_SSH_PRIVATE_KEY

# 3. Genereer een known_hosts entry vanaf je laptop:
ssh-keyscan -p 2222 195.201.149.219
# → kopieer naar GitHub secret HETZNER_KNOWN_HOSTS

# 4. Zorg dat sudoers de service-restart toestaat zonder wachtwoord:
echo '%beleggeriq ALL=(ALL) NOPASSWD: /bin/systemctl restart beleggeriq' \
    | sudo tee /etc/sudoers.d/beleggeriq-restart
sudo chmod 0440 /etc/sudoers.d/beleggeriq-restart
```

> Geef de `github_actions`-key géén passphrase — non-interactive SSH werkt
> niet met een prompt. De security-grens is "wie de key kan stelen, kan
> deployen"; bewaar 'm uitsluitend in GitHub-secrets en in een offline
> backup.

## Production environment (optioneel maar aanbevolen)

GitHub → Settings → Environments → New environment → `production`:
- ✅ Required reviewers (jezelf) — handig wanneer je later met meer mensen werkt
- ✅ Wait timer (0–5 min) — laatste-kans-veto
- Deployment branches: alleen `main`

`deploy.yml` en `rollback.yml` verwijzen al naar `environment: production`,
dus zodra de environment bestaat krijg je automatisch de approval-gate.

## Smoke-test specifics

De smoke-stap pollt `GET $PRODUCTION_URL/api/health` 6× met 5s tussen-
pauze. Pas vanaf de eerste `HTTP 200` met body `"status":"ok"` slaagt
de run. Een 200 met `"status":"degraded"` (DB down) faalt expliciet —
omdat de app dan wel reageert maar niet bruikbaar is.

`/api/health` rapporteert ook `version.git` (commit-SHA) en
`version.builtAt` zodat je in één call ziet welke release draait. Die
metadata komt uit `/var/www/beleggeriq/shared/.env.build-info` en wordt
per deploy door `deploy.sh` herschreven.

## Rollback procedure

Twee paden:

### Snelste pad — vorige release terughalen (~10s)
```
Actions → Rollback → Run workflow
  stamp:  (leeg)
  ref:    (leeg)
  reason: "<korte beschrijving>"
```
Dit zwapt `current` naar de vorige release-stamp en restart systemd.
Geen rebuild, geen migrate — pure symlink-swap.

### Specifieke release terughalen
```
Actions → Rollback → Run workflow
  stamp:  20260427-091500
  ref:    (leeg)
  reason: "..."
```
Stamps zijn de directory-namen onder `/var/www/beleggeriq/releases/` —
zichtbaar via `ls -1t` op de server.

### Forward-deploy naar specifieke commit/tag
```
Actions → Rollback → Run workflow
  stamp:  (leeg)
  ref:    v1.2.0
  reason: "..."
```
Equivalent aan `./deploy.sh v1.2.0` op de server. Volle build + migrate.

> **Migration-gevaar.** `deploy.sh --rollback` voert *geen* down-migration
> uit. Als de release-die-je-rolt-naar oudere Prisma-schema's verwacht
> en de DB inmiddels nieuwere kolommen heeft → de runtime werkt vaak nog
> (extra kolommen storen niet), maar bij `DROP COLUMN`-style migrations
> kan rollback ondoenlijk zijn zonder DB-restore. Zie
> [docs/DB_MIGRATIONS.md](./DB_MIGRATIONS.md) → "Rollback".

## Lokale validatie van een workflow

GitHub heeft geen ingebouwde "lint mijn yaml"-knop, maar:

```bash
# Syntax-check via actionlint (eenmalig installeren):
brew install actionlint              # macOS
go install github.com/rhysd/actionlint/cmd/actionlint@latest

actionlint .github/workflows/*.yml
```

Of hang de [`reviewdog/action-actionlint`](https://github.com/reviewdog/action-actionlint)
in een eigen workflow voor automatische PR-comments.

## Troubleshooting

**`Permission denied (publickey)`** — `HETZNER_SSH_PRIVATE_KEY` is mogelijk
geknipt (eerste/laatste regel ontbreekt). Plak 'm opnieuw, inclusief
`-----BEGIN OPENSSH PRIVATE KEY-----` en de trailing newline.

**`Host key verification failed`** — `HETZNER_KNOWN_HOSTS` mismatch met
de huidige server-key (host opnieuw geïnstalleerd, of MITM). Run
`ssh-keyscan` opnieuw en update het secret. **Verifieer eerst** dat de
server niet écht is gehijackt — de fingerprint moet matchen met wat
je lokaal kent.

**Smoke-test faalt met `status: "degraded"`** — `/api/health` rapporteert
DB issue. Check op de server: `journalctl -u beleggeriq --since "5 min ago"`.
Vaak is het: migration faalt half, Prisma schema mismatch, of postgresql
niet up. Snelst pad: rollback via Actions → Rollback.

**Smoke-test faalt met HTTP 502** — nginx krijgt niets terug van Next.
De systemd-unit is gecrasht of zit in restart-loop. Check
`systemctl status beleggeriq` en `journalctl -u beleggeriq -n 200`.
