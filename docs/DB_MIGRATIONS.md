# Database migraties — BeleggerIQ

BeleggerIQ gebruikt **Prisma migrations** als enige bron-van-waarheid
voor schemawijzigingen. `prisma db push` is **expliciet verboden in
productie**.

## TL;DR

| Stap | Lokaal (dev) | Server (productie) |
|---|---|---|
| Nieuwe schema-wijziging | `npx prisma migrate dev --name <slug>` | n.v.t. — alleen via deploy |
| Migration alleen genereren (niet runnen) | `npx prisma migrate dev --name <slug> --create-only` | n.v.t. |
| Migrations toepassen | `npx prisma migrate dev` | `npx prisma migrate deploy` (door `deploy.sh`) |
| Schema rechtstreeks pushen | **NEE** in productie. Lokaal alleen voor wegwerp-prototypes (`npx prisma db push`). | **VERBODEN.** Geen migration-historie + kan kolommen droppen. |
| Status checken | `npx prisma migrate status` | `npx prisma migrate status` |

## Waarom geen `db push` in productie?

`db push` sync't `schema.prisma` direct naar de database zonder
migration-bestand. Drie problemen:

1. **Geen audit-trail.** Niemand kan zien welke wijziging wanneer is
   toegepast. Rollback wordt giswerk.
2. **Destructief gedrag bij divergentie.** Als de live-DB een kolom
   heeft die niet in `schema.prisma` staat, dropt push'em zonder
   vragen.
3. **Geen review-moment.** Migration-bestanden komen via PR binnen,
   `db push` slaat dat over.

`migrate deploy` daarentegen leest `prisma/migrations/*` op volgorde,
voert alleen niet-toegepaste migrations uit, en weigert te draaien
als de DB-staat afwijkt van de geregistreerde historie.

## Workflow voor een nieuwe schema-wijziging

1. Pas `prisma/schema.prisma` aan.
2. Lokaal:
   ```bash
   npx prisma migrate dev --name <descriptive-slug>
   ```
   Dit:
   - genereert een nieuw `prisma/migrations/<timestamp>_<slug>/migration.sql`
   - voert 'm uit op je lokale DB
   - regenereert de Prisma client (`@prisma/client`)
3. Review de migration-SQL. Geen `DROP TABLE` / `DROP COLUMN` zonder
   bewuste keuze + data-migration-strategie.
4. Commit `prisma/schema.prisma` **én** `prisma/migrations/...`.
5. Push naar `main`. De server-deploy (`deploy/deploy.sh`) draait
   `npx prisma migrate deploy` voor de build-stap.

## Wat doet `--create-only`?

```bash
npx prisma migrate dev --name <slug> --create-only
```

Genereert de migration-SQL zonder 'm uit te voeren. Gebruik dit
wanneer je de SQL eerst handmatig wilt reviewen of aanpassen
(bijvoorbeeld: data-backfill-stappen toevoegen vóór een NOT NULL-
constraint, of een `CONCURRENTLY` toevoegen aan een index).

## Initial migration

De repo bevat een baseline-migration `20260427000000_init` die het
volledige schema vanaf scratch opbouwt. Wanneer je een nieuwe
omgeving opzet:

```bash
# 1. Database aanmaken (Postgres ≥ 14)
createdb beleggeriq

# 2. Migrations toepassen
DATABASE_URL=postgres://... npx prisma migrate deploy

# 3. (Optioneel) seed met demo-data
npm run prisma:seed
```

## Bestaande live-DB importeren in migration-historie

Heb je een productie-database die al via `db push` is opgebouwd?
Run deze procedure om de migrations-tabel te initialiseren zonder
het schema opnieuw uit te voeren:

```bash
# Markeer de baseline als "al toegepast" zonder uitvoering.
DATABASE_URL=<prod-url> npx prisma migrate resolve \
  --applied 20260427000000_init
```

Daarna kunnen nieuwe migrations gewoon via `migrate deploy` landen.

## Rollback

`migrate deploy` kent geen built-in rollback. Patroon:

1. Maak een nieuwe migration die de wijziging terugdraait
   (`<timestamp>_revert_<slug>`).
2. Test 'em lokaal eerst.
3. Deploy.

Voor noodgevallen kun je via een DB-snapshot restore'n; documenteer
dan in een issue welke migrations achteraf nog moeten worden
gemarkeerd als (un)applied.

## Schema-conventies — indexes

Per model documenteren we welke indexes we hebben en waarom:

- **`Holding(ticker)`** + **`Holding(isin)`** — ticker-resolver lookups + ISIN-merging bij broker-imports.
- **`Holding(portfolioId, ticker)` unique** — voorkomt duplicaat-positie bij broker-imports.
- **`PortfolioSnapshot(portfolioId, capturedAt)`** — time-series query voor charts.
- **`FactorSnapshot(ticker, capturedAt, model)` unique** — idempotente factor-runs.
- **`MagicLinkToken(email, tokenHash)` unique** + **`(email, expiresAt)`** + **`(expiresAt)`** — hot-path "vind nog-geldig token voor email" + reaper.
- **`DecisionSnapshot(userId, suggestedBucket, decisionKey)` unique** — idempotente upsert per uur-bucket.

Wanneer een nieuwe `Transaction`-tabel aan het schema wordt
toegevoegd: zorg minimaal voor `(portfolioId, occurredAt)` en
`(ticker, occurredAt)`-indexes (typische query-patronen voor
fiscale rapportage en performance-analyse).

## CI / lokaal validatie

```bash
# Schema is geldig + format
npx prisma format
npx prisma validate

# Generate genereert geen lege output (sanity-check)
npx prisma generate

# Migration-historie + DB-staat zijn in sync
npx prisma migrate status
```

## Verboden in productie (recap)

- ❌ `npx prisma db push`
- ❌ Direct `psql` `ALTER TABLE`-commando's draaien zonder bijhorende migration committen
- ❌ Migrations editen ná ze zijn toegepast op productie (Prisma checksum-mismatch)
- ❌ `prisma migrate reset` (drop't alle data)
