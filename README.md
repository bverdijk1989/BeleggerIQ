# BeleggerIQ 2.0

Productiegerichte portfolio-analyseapp voor Nederlandse langetermijnbeleggers. Deze foundation bundelt portfolio-analyse, factor scoring, risicoanalyse, maandelijkse koopbeslissingen, market regime analyse, backtesting en AI explainability onder één modulaire architectuur.

## Stack

- **Next.js 15 (App Router)** met TypeScript in strict mode
- **Tailwind CSS** + **shadcn/ui** primitives, premium dark theme
- **Zustand** voor client-side state (portfolio, profiel, app settings)
- **Prisma ORM** met een PostgreSQL-ready schema
- **Recharts** voor dashboard- en risico-visualisaties
- **Vitest** voor pure-unit tests van analytics engines

## Projectstructuur

```
src/
  app/                    # App Router routes (premium dark shell)
    (app)/                # Authenticated app surface
      dashboard/          # Portefeuille-overzicht
      portfolio/          # Posities en allocatie
      screener/           # Factor-/kwaliteitsscreening
      maandbeslissing/    # Maandelijkse koopbeslissing
      risico/             # Risicoanalyse
      strategy-lab/       # Strategie-ontwerp
      backtest/           # Historische simulaties
      chat/               # AI-assistent met explainability
      profiel/            # Beleggersprofiel
  components/
    brand/                # Logo en visuele identiteit
    common/               # PageHeader, MetricCard, EmptyState, Section
    layout/               # AppShell, Sidebar, TopBar, MobileNav
    ui/                   # shadcn primitives (Button, Card, Sheet, ...)
  lib/
    analytics/            # Pure analytics engines (summary, risk, factor scoring)
    ai/                   # Explainability / AI trace structuur
    data/                 # Prisma client + repositories
    parsers/              # CSV parsers voor broker-imports
    utils.ts              # Formatters, cn()
    navigation.ts         # Navigatie definitie
  store/                  # Zustand stores
  types/                  # Shared type definities
prisma/
  schema.prisma           # Prisma datamodel (PostgreSQL)
```

## Designprincipes

- **Businesslogica zit niet in UI-componenten.** Alle aggregaten, scores en risico-metrics leven in `src/lib/analytics/*` als pure functies. UI consumeert alleen getypeerde DTO's uit `src/types`.
- **Repository-laag scheidt ORM van view.** `src/lib/data` bevat de Prisma client en repositories die domain-types teruggeven.
- **Stores houden alleen UI/app-state vast.** Geen domeinberekeningen in stores — die lopen via analytics.
- **Route-group `(app)`** biedt één consistente AppShell voor alle app-pagina's. Marketing-/auth-pagina's kunnen later naast deze group leven zonder de shell.
- **Premium dark first.** Theme variables in `src/app/globals.css`, Tailwind tokens in `tailwind.config.ts`. Light-fallback staat paraat voor later.

## Aan de slag

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run dev
```

De app draait op `http://localhost:3000`. `/` redirect naar `/dashboard`.

### Database

Het schema staat in [prisma/schema.prisma](prisma/schema.prisma) en omvat `User`, `UserProfile`, `Portfolio`, `Holding`, `PortfolioSnapshot`, `MarketSnapshot`, `FactorSnapshot`, `StrategyPreset`, `BacktestRun` en `WatchlistItem`, met enums voor investor-type, objective, risico, asset class, regime, strategy type, rebalance frequency, backtest status en health grade.

```bash
# na het invullen van DATABASE_URL in .env
npm run prisma:generate                 # genereert de Prisma Client
npm run prisma:migrate -- --name init   # eerste migratie
npm run prisma:seed                     # vult demo data (zie prisma/seed.ts)
npm run prisma:studio                   # visuele inspectie
```

`prisma:seed` is idempotent; draai het zo vaak je wilt zonder duplicaten. Gebruik `npm run prisma:reset` wanneer je de dev-database wilt wissen — die commando draait automatisch een nieuwe seed.

De seed creëert een demo-user (`demo@beleggeriq.nl`), een "Core Kwaliteit" portefeuille met vier posities, drie publieke strategy presets, twee marktsnapshots, factor snapshots voor de holdings, een watchlist en één voltooide backtest-run.

### Tests

```bash
npm test              # vitest run
npm run test:watch
npm run typecheck
npm run lint
```

## Uitbreiden

- Nieuwe analytics engine? Voeg een module toe in `src/lib/analytics/` en exporteer pure functies met expliciete input/outputs.
- Nieuwe datasource? Wrap in een repository onder `src/lib/data/` en keep ORM-specifieke types daarbinnen.
- Nieuwe route? Plaats onder `src/app/(app)/...` zodat de AppShell en navigatie automatisch meegaan. Registreer ook in `src/lib/navigation.ts`.

## Deploy

Productie-runbook voor Hetzner (Ubuntu 22.04+): zie [`deploy/README.md`](deploy/README.md).
Architectuur: nginx → Next.js (systemd) → PostgreSQL, SSL via Let's Encrypt,
release-strategie met atomic symlink swap + rollback-pad.

## Docs

- [`CHANGELOG.md`](CHANGELOG.md) — wijzigingen per release.
- [`docs/HARDENING_AUDIT.md`](docs/HARDENING_AUDIT.md) — type safety, runtime validation, auth, resilience.
