# BeleggerIQ — Codebase Audit (2026-04-29)

> Doel: een nuchtere foto van de huidige codebase als startpunt voor de
> volgende roadmap-fase. Geen marketing, geen hype — alleen waar de
> code sterk is, waar 'em krap zit, en waar uitbreiding risico draagt.
>
> Dit document is een **momentopname**. Bij elke significante PR moet
> de relevante sectie hieronder worden bijgewerkt.

---

## 1. Projectstructuur

```
src/
├── app/
│   ├── (app)/           14 user-facing pages (dashboard, portfolio, risico,
│   │                    maandbeslissing, screener, strategy-lab, backtest,
│   │                    chat, kansen, transacties, belasting, watchlist,
│   │                    methodologie, profiel)
│   ├── api/             14 route handlers (ai/explain, ai/research-dossier,
│   │                    chat, decisions, health, health/backup, market/*,
│   │                    snapshots/*, analytics/mispricing)
│   ├── auth/            magic-link callback
│   └── login/           magic-link request UI
├── lib/
│   ├── ai/              determ. explainers + chat + research-dossier
│   │                    (LLM-ready prompts maar geen live LLM-client)
│   ├── analytics/       30+ engine modules — factor scoring, regime,
│   │                    risk, rebalance, allocation, mispricing,
│   │                    decision-engine, ETF-factors, hunting-list,
│   │                    macro scenarios, backtest, opportunity radar
│   ├── auth/            magic-link + signed-cookie sessie + rate-limit
│   ├── data/            Prisma + market-data providers (yahoo/stub/none)
│   │                    + caching + symbol-resolver + 8 repositories
│   ├── http/            request-validation + error helpers
│   ├── log.ts           structured JSON logger met sink-interface
│   ├── mail/            SMTP (dynamic-import nodemailer) + console fallback
│   ├── notifications/   event generators + dispatcher + digest builder
│   ├── observability/   request-id + provider/cache metrics + Sentry sink
│   ├── ops/             backup-health verdict
│   ├── orders/          manual-broker CSV/TSV export
│   ├── parsers/         DEGIRO holding-parser
│   ├── portfolios/      multi-portfolio selector + aggregate + ownership
│   ├── ratelimit/       token-bucket middleware
│   ├── services/        snapshot-service, decision-history-service
│   ├── tax/             box-3 valuations + dividend-overview + position-indicators
│   ├── transactions/    DEGIRO CSV parser + FIFO cost-basis + summary
│   └── watchlist/       repository + ticker-validation + event-types
├── components/
│   ├── ui/              7 primitives (Button/Card/Sheet/Tooltip/Badge/Skeleton/Separator)
│   ├── layout/          AppShell + Sidebar + TopBar + PortfolioSwitcher
│   ├── dashboard/       Decision Cockpit (10+ components)
│   ├── common/          PageHeader + Section + EmptyState
│   └── brand/           logo
└── types/               domain-types (portfolio, factor, regime, risk,
                         allocation, rebalance, ai, common)

prisma/
├── schema.prisma        16 models, 11 enums
└── migrations/          4 migrations (init + transactions + tax + notifications)

deploy/
├── deploy.sh            atomic-symlink release deploy
├── server-bootstrap.sh  one-time host setup
├── backup.sh            encrypted Postgres → S3
├── restore-test.sh      backup-validation
└── systemd/             4 unit/timer files

.github/workflows/
├── ci.yml               install + test + tsc + build
├── deploy.yml           SSH deploy + smoke /api/health
└── rollback.yml         manual rollback

docs/                    8 docs (BACKUPS, CI_CD, DB_MIGRATIONS, ENGINES,
                         HARDENING_AUDIT, OBSERVABILITY, ROADMAP, USER_MANUAL)
```

**Kerngetallen (29-04-2026)**
- ~38.700 LOC in `src/lib` (analytics + ai + data)
- 14 user-facing pages, 14 API-routes
- 142 testfiles, **1478 tests** (alles groen)
- 30+ deterministische analytics-engines
- 16 Prisma-modellen, 4 migrations
- 8 markdown-docs (engines, methodologie, user-manual, etc.)

---

## 2. Frameworkversies

| Component | Versie | Status |
|---|---|---|
| **Next.js** | `^16.2.4` | ⚠ middleware-API gedeprecateerd → `proxy.ts` (niet-blokkerend) |
| **React** | `^18.3.1` | Stable, geen pressure om naar 19 |
| **TypeScript** | `^5.6.3` | Strict + `noUncheckedIndexedAccess` |
| **Prisma** | `^5.22.0` | Major-update beschikbaar (7.8.0); 5.x lifecycle ok |
| **Vitest** | `^2.1.4` | OK; CJS-deprecation-warning is cosmetisch |
| **Tailwind** | `^3.4.14` | OK |
| **Recharts** | `^2.13.3` | OK voor huidige charts |
| **Zustand** | `^5.0.1` | Beperkt gebruik (UI-state) |
| **lucide-react** | `^0.453.0` | Up-to-date |
| **yahoo-finance2** | `^3.14.0` | ⚠ Yahoo zelf is unofficial; geen SLA |

**Node**: 20 LTS op productie. `yahoo-finance2` warns "requires Node ≥22"
maar werkt prima op 20.20.2 in praktijk.

**Niet aanwezig (bewust)**: tRPC, react-query, redux, jest, axios.
Native Next + Prisma + lichte zustand is het hele stack-oppervlak.

---

## 3. Datamodellen

### Kern-domein (van user → naar portfolio → naar analytics)

```
User
 ├─ UserProfile (1:1)              objective, riskTolerance, policy, notifications
 ├─ Portfolio[]
 │   ├─ Holding[]                  ticker, ISIN, qty, cost, sector, region, beta
 │   ├─ PortfolioSnapshot[]        historie van waarde + risk + regime
 │   ├─ Transaction[]              broker-historie (BUY/SELL/DIV/TAX/etc.)
 │   ├─ TaxValuation[]             handmatige peildatum-waarden (box 3)
 │   ├─ DecisionSnapshot[]         append-only adviezen-historie
 │   └─ BacktestRun[]
 ├─ WatchlistItem[]                + HuntingSignalLog[]
 ├─ StrategyPreset[]
 ├─ NotificationDelivery[]         idempotente alert-log
 └─ MagicLinkToken[]               single-use, time-bounded

Globaal (geen user-FK):
 ├─ MarketSnapshot                 dagelijkse regime-snapshot
 └─ FactorSnapshot                 per (ticker, capturedAt, model)
```

### Sterke punten
- **Append-only-disciplines** waar het telt: `DecisionSnapshot`,
  `HuntingSignalLog`, `Transaction`, `NotificationDelivery`,
  `MagicLinkToken`. Mutability is bewust geconstrained.
- **Idempotency-keys ingebouwd**: `(portfolioId, externalId)` op
  Transaction, `(userId, key)` op NotificationDelivery,
  `(email, tokenHash)` op MagicLinkToken,
  `(userId, suggestedBucket, decisionKey)` op DecisionSnapshot.
- **Decimal(20, 8)** voor monetaire/quantity-velden — geen float-precisie-
  drift bij accumulatie.
- **Per-tabel indexes** zijn gedocumenteerd in `docs/DB_MIGRATIONS.md`
  inclusief reasoning ("hot-path: vind nog-geldig token").

### Zwakke punten / open eindes
- **Geen audit-tabel** — wie wijzigde wat wanneer aan profile/policy is
  niet traceerbaar (security-issue als app ooit publiek/multi-user).
- **`Holding.metadata` is een Json-blob** zonder schema-validatie —
  enrichment-velden (distributionPolicy, instrumentType) leven hier
  los van het type-systeem.
- **Geen soft-delete** — `Portfolio.delete` cascadet alle transacties weg.
  Voor compliance (bewaarplicht 7 jaar fiscaal) een latere zorg.
- **Geen `Currency` enum** in DB — `String @default("EUR")`. Een typo
  is geen DB-error.

---

## 4. Bestaande functionaliteit

### Portfolio + analyse
| Onderdeel | Locatie | Volwassenheid |
|---|---|---|
| Portfolio-view (valuations + risk + rebalance) | [`buildPortfolioView`](../src/lib/analytics/portfolio-view.ts) | ⭐⭐⭐⭐ |
| DEGIRO holding-import | [`src/lib/parsers/degiro.ts`](../src/lib/parsers/degiro.ts) | ⭐⭐⭐⭐ |
| Transaction CSV-import + FIFO cost-basis | [`src/lib/transactions/`](../src/lib/transactions/) | ⭐⭐⭐⭐ |
| Multi-portfolio + aggregate dashboard | [`src/lib/portfolios/`](../src/lib/portfolios/) | ⭐⭐⭐⭐ |
| Box-3 valuations + dividend-overview | [`src/lib/tax/`](../src/lib/tax/) | ⭐⭐⭐ — geen export naar M-formulier nog |

### Scoring
| Engine | Locatie | Volwassenheid |
|---|---|---|
| Stock factor scoring (quality/value/momentum/lowVol) | [`src/lib/analytics/factors/`](../src/lib/analytics/factors/) | ⭐⭐⭐⭐ — coverage-floor + min-pillars; objective-aware weights |
| ETF factor scoring (cost/scale/track/fit) | [`src/lib/analytics/etf-factors/`](../src/lib/analytics/etf-factors/) | ⭐⭐⭐⭐ |
| Asset-class router | [`src/lib/analytics/factors/router.ts`](../src/lib/analytics/factors/router.ts) | ⭐⭐⭐ |
| Holding-action classifier | [`src/lib/analytics/holding-action.ts`](../src/lib/analytics/holding-action.ts) | ⭐⭐⭐⭐ |

### Risk + macro
| Engine | Locatie | Volwassenheid |
|---|---|---|
| Risk-engine (concentration, vol, drawdown, sector, currency) | [`src/lib/analytics/risk-engine/`](../src/lib/analytics/risk-engine/) | ⭐⭐⭐⭐ |
| Regime scoring (7 drivers) | [`src/lib/analytics/regime/`](../src/lib/analytics/regime/) | ⭐⭐⭐⭐ |
| Macro-scenarios (RATES_UP_2 / MARKET_CRASH / RECESSION / STAGFLATION / BLACK_SWAN / TOP_POSITION_BLOWUP) | [`src/lib/analytics/macro/`](../src/lib/analytics/macro/) | ⭐⭐⭐⭐ |
| Mispricing scanner | [`src/lib/analytics/mispricing/`](../src/lib/analytics/mispricing/) | ⭐⭐⭐ |

### Beslissingslaag
| Engine | Locatie | Volwassenheid |
|---|---|---|
| Allocation engine (monthly buy) | [`src/lib/analytics/allocation-engine/`](../src/lib/analytics/allocation-engine/) | ⭐⭐⭐⭐ — regime-aware, core-ETF fallback |
| Rebalance engine + run-multiplier | [`src/lib/analytics/rebalance-engine/`](../src/lib/analytics/rebalance-engine/) | ⭐⭐⭐⭐⭐ — type-aware caps na recente fix |
| Decision-engine + dashboard-actions | [`src/lib/analytics/actions/`](../src/lib/analytics/actions/) | ⭐⭐⭐⭐ — paired-BUY + triggerSources |
| Hunting-list (target-zone alerts) | [`src/lib/analytics/hunting-list/`](../src/lib/analytics/hunting-list/) | ⭐⭐⭐ |

### AI/explain laag
| Onderdeel | Locatie | Status |
|---|---|---|
| Deterministische explainers | [`src/lib/ai/explainers.ts`](../src/lib/ai/explainers.ts) | ⭐⭐⭐⭐ — geen LLM, pure templating |
| Dashboard-explainer | [`src/lib/ai/dashboard-explainer.ts`](../src/lib/ai/dashboard-explainer.ts) | ⭐⭐⭐⭐ |
| Research-dossier (per-ticker) | [`src/lib/ai/research-dossier.ts`](../src/lib/ai/research-dossier.ts) | ⭐⭐⭐⭐ — 806 LOC determ. |
| Chat (intent-routing) | [`src/lib/ai/chat.ts`](../src/lib/ai/chat.ts) | ⭐⭐⭐ — deterministisch |
| LLM-prompts klaar voor swap | [`src/lib/ai/prompts.ts`](../src/lib/ai/prompts.ts) | ⭐⭐⭐ — JSON-context guard, geen runtime-client |

**Belangrijk inzicht**: er is **geen actieve LLM-client** (`@anthropic`/`openai`).
De prompts zijn gebouwd, de templates zijn structureel klaar — maar
elke "AI"-output is op dit moment **deterministisch gegenereerd** door
de explainers. Dit is een **bewuste keuze** (zie ROADMAP §"AI-gedreven
aanbevelingen") om hallucinations te voorkomen.

→ Voor toekomstige modules met écht AI: de swap is mechanisch klein
(één LlmClient interface), maar architectonisch significant
(observability, kosten, retries, failover).

---

## 5. UI-componenten

| Laag | Sterkte | Tekortkomingen |
|---|---|---|
| Tailwind + 7 shadcn/ui-primitives | Consistent design-tokens, dark-mode default | Geen Dialog/Toast/Tabs/Select/Form/Combobox primitives |
| Decision Cockpit (`src/components/dashboard/decision-cockpit/`) | 10+ goed-gescheiden components | Sticky-positie ooit een UX-bug geweest; nu opgelost |
| AppShell + Sidebar + TopBar | Server components met PortfolioSwitcher | Geen mobile drawer-animation; zoekbalk in topbar is **placeholder** |
| Common (PageHeader/Section/EmptyState) | Hergebruikt over alle pages | Geen Loading-skeleton-pattern beschreven |
| Brand | Logo + theme | Geen brand-system; kleuren leven in tailwind.config |

**RSC-discipline**: Server components zijn de default; client-only files
hebben expliciete `"use client"`. Dit is correct toegepast — server-only
modules gebruiken `Prisma`, client-only de `"use client"` directive.

---

## 6. Tests

**142 testfiles, 1478 tests, alles groen.**

| Categorie | Aantal tests (schatting) | Kwaliteit |
|---|---|---|
| Engine-tests (factors, regime, risk, rebalance, allocation, decision) | ~600 | ⭐⭐⭐⭐⭐ — exhaustive, bevat winner-protection edge cases |
| AI/explain tests | ~150 | ⭐⭐⭐⭐ — deterministisch, dus stabiel |
| Repository tests | ~80 | ⭐⭐⭐⭐ — in-memory Prisma-mocks |
| Auth tests | ~50 | ⭐⭐⭐⭐ — magic-link expiry/reuse covered |
| Tax/transactions/orders | ~120 | ⭐⭐⭐⭐ — Dutch number formats covered |
| Notifications + observability | ~50 | ⭐⭐⭐⭐ — idempotency + secret redaction |
| Pages/components | ~20 | ⭐⭐ — geen component-snapshot tests, geen E2E |

**Wat ontbreekt**:
- Geen Playwright/Cypress E2E
- Geen visual regression
- Geen mutation-testing (Stryker)
- Geen integratie-tests tegen een echte Postgres (alleen mocks)

Voor een long-only personal-portfolio-app is dit acceptabel, maar voor
een commerciële launch zou je minimaal één Playwright-flow per kritisch
pad willen (login → import → maandbeslissing → export).

---

## 7. Authenticatie / autorisatie

**Architectuur**:
1. Magic-link via SMTP (dynamic-import nodemailer)
2. SHA-256-hashed token in DB; raw nooit opgeslagen
3. Single-use via `usedAt`-flag; 15-min TTL
4. Signed-cookie sessie (`biq_session`) via HMAC over `BIQ_SESSION_SECRET`
5. Rate-limiting: 2/min per (IP+email) via in-memory sliding window
6. Token-bucket op middleware-niveau: 10 req/min default, 3/min voor `/login` POST
7. Per-route ownership-check via [`portfolioRepository.findOwnerEmailById`](../src/lib/data/portfolio-repository.ts)
8. Multi-portfolio selector filtert resultaat op `findByUserId` (security-grens)

**Sterke punten**:
- Defense in depth: rate-limit op IP-niveau + per-action-niveau
- SHA-256 hash i.p.v. raw token in DB
- Timing-safe-compare voor token-validatie
- Constant fallback naar primary-portfolio bij vreemde URL-id (voorkomt cross-user-leak)
- `cookies-only` flow; geen JWT in localStorage

**Zwakke punten**:
- Geen 2FA / WebAuthn
- Geen session-revocation-list (een gestolen cookie blijft geldig tot expiry)
- Geen CSRF-tokens op server-actions (Next 14+ heeft built-in protection
  via origin-check, maar expliciet zou veiliger zijn)
- `BIQ_ALLOW_DEMO_AUTH=true` in non-prod is gemakkelijk per ongeluk in prod te zetten

---

## 8. Deployment / configuratie

**Productie**:
- Hetzner VPS (Ubuntu 22.04+), single-instance bare-metal
- Node 20 + PostgreSQL 16 + nginx + UFW + certbot
- Atomic symlink-swap deploys via `deploy/deploy.sh`
- 5-release-retention; rollback via `--rollback`-flag of GitHub Actions workflow
- Per-deploy `BIQ_GIT_SHA` + `BIQ_BUILD_TIME` in `/var/www/beleggeriq/shared/.env.build-info` → exposed via `/api/health`
- systemd hardening (`ProtectSystem=strict`, `NoNewPrivileges`, etc.)
- SSH-poort 2222 (security-hardening)

**CI/CD**:
- GitHub Actions: `ci.yml` (PRs + push) + `deploy.yml` (push + smoke /api/health) + `rollback.yml` (manual)
- Test-suite gates merge

**Backups**:
- Daily encrypted (age) `pg_dump` → S3-compatible (Backblaze B2 standaard)
- Wekelijkse restore-test via `restore-test.sh --list`
- 7 daily / 4 weekly / 12 monthly retentie
- Stale-check via `/api/health/backup` (30-uur drempel)

**Observability**:
- Structured JSON-logs naar `journalctl` (Loki/Datadog-ready)
- Request-id correlatie via middleware
- Provider/cache metrics als `metric=…` events
- Sentry-sink (opt-in via `SENTRY_DSN`)

**Open issues**:
- Geen multi-instance setup (Redis-rate-limit niet geïmplementeerd, alleen
  TODO-comments)
- Geen blue/green of canary
- Geen WAL-archiving; RPO = 24u
- Geen multi-region disaster-recovery

---

## 9. Technische schuld

| ID | Item | Impact | Effort | Locatie |
|---|---|---|---|---|
| TS-1 | Next 16: `middleware.ts` → `proxy.ts` | Build-warning, future hard-break | 5 min | [`src/middleware.ts`](../src/middleware.ts) |
| TS-2 | Next 16: `experimental.typedRoutes` → top-level `typedRoutes` | Build-warning | 1 min | [`next.config.ts`](../next.config.ts) |
| TS-3 | Prisma 5.22 → 7.x major update available | Geen blockers, toekomstige feature-toegang | 1-2 uur incl. testing | `package.json` |
| TS-4 | Yahoo-finance2 unofficial; geen SLA | Single-point-of-failure data | 1 dag voor secondary provider (zie roadmap-#11) | [`src/lib/data/providers/yahoo.ts`](../src/lib/data/providers/yahoo.ts) |
| TS-5 | `as unknown as Prisma.InputJsonValue` bridges (3×) | Type-safety hole bij Json-writes | Zod-schema's per Json-blob = ~4 uur | repository-laag |
| TS-6 | `Number(decimal)` precision-loss bij accumulatie | Theoretisch bij > 2^53 | `toFiniteNumber`-audit = ~3 uur (gedeeltelijk gedaan) | repositories |
| TS-7 | Geen Redis voor multi-instance rate-limit | Blockt horizontale scaling | 1 dag | [`src/lib/ratelimit/store.ts`](../src/lib/ratelimit/store.ts) |
| TS-8 | Geen audit-log model | Compliance + multi-user discovery | 0.5 dag | nieuwe Prisma table |
| TS-9 | `cron`-fiber voor digest-runner zit nog niet vast in systemd-timer | Friday digest draait nog niet | 30 min | nieuwe systemd-timer |
| TS-10 | Sticky-positie bug op Decision Cockpit ooit teruggezien (al gefixt) | Regressierisico | n.v.t. | gefixt |
| TS-11 | Geen Playwright E2E | Geen confidence in volledige flows | 1 dag voor 3 critical paths | nieuwe `e2e/` map |
| TS-12 | `/api/health` geeft `appVersion: null` (npm_package_version niet exposed via systemd) | Cosmetisch | 5 min | [`src/app/api/health/route.ts`](../src/app/api/health/route.ts) |
| TS-13 | `experimental_*`-API gebruik in instrumentation/proxy | Volgende Next-major | n.v.t. | `instrumentation.ts` |
| TS-14 | `node_modules` bevat `nodemailer` als optional/dynamic-import; CI installeert 'em maar productie alleen via `npm i nodemailer` extra-stap | Email-config-fragiliteit | 30 min — verplaats naar `dependencies` of documenteer scherper | `package.json` + ops |
| TS-15 | `BIQ_ALLOW_DEMO_AUTH` per ongeluk in prod | Security-blast-radius | Compile-time gate = 30 min | [`src/lib/auth/server.ts`](../src/lib/auth/server.ts) |

---

## 10. Risico's bij uitbreiding

### Strategisch
- **Yahoo data-flake**: elke nieuwe feature die op live data leunt (PWA
  offline-mode, dividend-calendar, real-time alerts) erft dit risico. Mitigatie:
  secondary provider implementeren vóór features die data-volume verhogen.
- **LLM-introductie**: het moment dat een echte LLM-client landt, zit je
  vast aan een vendor (Anthropic / OpenAI) met token-kosten. Architectuur
  is klaar (LlmClient swap), maar policy-vraag: mogen Nederlandse user-data
  naar US-providers? GDPR-decision moet expliciet vóór dit landt.
- **Compliance-laag**: ROADMAP en validation-board markeren "geen
  beleggingsadvies"-banner als blocker voor publieke launch. Nu enkel
  aanwezig op /belasting + /maandbeslissing-export. Globaal ontbreekt 'em
  nog.

### Technisch
- **Single-instance**: rate-limiter, notification-store, backup-status
  zitten allemaal in-memory of single-host. Horizontaal opschalen vereist
  een Redis + shared-nothing-refactor.
- **SQLite-mentaliteit op PG**: er zit ongelooflijk veel functionaliteit
  in 16 tabellen. Bij groei (>100k holdings) moet er nagedacht worden
  over partitioning op `PortfolioSnapshot.capturedAt` en archive-strategy
  voor `HuntingSignalLog`.
- **Migration-discipline**: 4 migrations via `prisma migrate deploy`. Bij
  een data-migration met backfill (bv. ETF-classification voor bestaande
  holdings) moet je een aparte migration met `tx`-wrapper schrijven. Geen
  framework hiervoor.

### Productuitlijning
- **Test-coverage groot, E2E-coverage nul**. Een UX-regressie (bv. mobile-
  layout) wordt niet gevangen. Voor "wereldklasse" claim is dit krap.
- **i18n niet aanwezig**. Alle UI is NL. Een internationale launch (UK/DE/FR)
  vereist een full i18n-refactor.
- **Geen onboarding-flow**. Een nieuwe user landt op `/dashboard` zonder
  context. Is een grote kans (zie ROADMAP §24) maar ook een groot project.

---

## 11. Validatie tegen de 5 lenzen

### 🟢 Buffett — eenvoud, kwaliteit, vertrouwen, langetermijnwaarde
**Sterk**:
- Decision-cockpit met 1 primary action — geen scherm vol opties
- Append-only DecisionSnapshot voor audit-trail van adviezen
- Winner-protection in classifier (let winners run, 2× cap multiplier)
- Geen real-time, geen options, geen leverage — disciplined long-only

**Zwak**:
- Geen "moat-rating" of "owner-earnings"-cijfer in factor-pillar (Buffett-
  taxonomie ontbreekt; we leunen op Asness-stijl factors)
- Geen "10-year-hold"-test in research-dossier (zou Buffett-stijl willen
  zien)

### 🟢 Dalio — macroregimes, scenario's, risico, diversificatie
**Sterk**:
- Regime-engine met 7 drivers inclusief yield-curve-slope (klassiek
  recessie-signaal)
- 7 macro-scenarios (RATES_UP_2 / MARKET_CRASH / RECESSION / STAGFLATION /
  BLACK_SWAN / TOP_POSITION_BLOWUP)
- Risk-engine multi-axis (concentration, vol, drawdown, sector, currency)
- Risk-parity-denken in paired-BUY (proceeds → core)

**Zwak**:
- Geen multi-asset-weights (geen bonds/gold-allocation als All-Weather-
  variant)
- Regime-engine is single-region (US-data-bias)
- Geen regime-aware position-sizing (DEFENSIVE krijgt cash-buffer maar
  geen anti-correlated assets)

### 🟢 Lynch — begrijpelijkheid, praktische uitleg
**Sterk**:
- Alle output in Nederlands, geen Anglo-jargon zonder uitleg
- Action-cards met "Waarom?"-rationale + bron-attribution
- /methodologie + docs/ENGINES.md leggen formules uit zonder beleggers-PhD
- Holding-action labels (BUY / HOLD / WATCH / TRIM / AVOID) zijn intuïtief

**Zwak**:
- "Composite 65/100" is voor een lay-person nog steeds een abstract getal
  zonder peer-context (is 65 goed? slecht? mediaan?)
- Research-dossier is 800 LOC determ. — krachtig voor analist, mogelijk
  overweldigend voor een Lynch-stijl ma-en-pa belegger
- Geen "explain like I'm a non-finance-person"-toggle

### 🟡 Simons — datakwaliteit, signalen, probabilistisch
**Sterk**:
- `MIN_COVERAGE_FOR_COMPOSITE = 0.5` + min-pillars-floor om "fake precision" te voorkomen
- Confidence-cap bij thin coverage (`MAX_CONFIDENCE_LOW_COVERAGE = 0.3`)
- Mispricing scanner heeft p-value-achtige drempels
- Backtest-engine bestaat met benchmark-comparison

**Zwak**:
- **Geen error-banden op output** — composite-getallen zijn point-estimates
  zonder confidence-interval. Dit is een terugkomende bevinding van de
  validation-board.
- Geen Monte-Carlo over scenario's (single-point per scenario)
- Geen multi-factor backtest met regime-conditional cohorts
- Yahoo als enige data-bron is een data-quality-blinde-vlek
- Geen drift-detection op het composite-model (als de gewichten over tijd
  niet meer voorspellend zijn weet je 't niet)

### 🟡 Wood — innovatie, AI-first, exponentieel
**Sterk**:
- Architectuur is LLM-ready (prompts + JSON-context guard zijn klaar)
- Research-dossier is een gestructureerd briefing-document, klaar voor
  semantic-search/RAG-laag

**Zwak**:
- **Geen actieve LLM**. De "AI"-explainers zijn 100% deterministisch. Voor
  Wood-laag (semantische search over alle adviezen, AI-coach, NL-prompts
  → action-translation) ontbreekt de runtime-laag.
- Geen vector-DB; geen embeddings van research-dossiers, transactie-
  history, of decision-history
- Geen voice-input, geen mobile-first (enkele Nice-to-have op roadmap)
- Geen extern data — geen news-NLP, geen social-sentiment, geen earnings-
  call-sentiment-analyse
- Geen "what-if-AI": "wat als ik €50k extra inleg en mijn horizon
  verkort tot 5 jaar?"

---

## 12. Conclusie van de audit

BeleggerIQ is **een sterke deterministische analytics-engine** met een
goed-gedocumenteerde architectuur, exhaustive engine-tests, en een
volwassen deploy-pipeline. Buffett/Dalio/Lynch-lenzen zijn solide
gedekt; Simons en Wood-lenzen hebben significante witte vlekken.

De codebase is **niet** "minimum viable" — 'em is "feature-complete voor
één serieuze NL-belegger". Voor "wereldklasse" zijn drie clusters van
investering vereist:

1. **Statistische rigor** (Simons-laag): error-banden, Monte-Carlo,
   model-drift, secondary data-providers
2. **AI-runtime** (Wood-laag): echte LLM-client, vector-search, NL-Q&A
3. **Productrijpheid voor breed publiek** (Lynch + commercieel):
   onboarding, mobile, i18n, plain-language-modus, compliance-banner,
   subscription/paywall

Dit document vormt het startpunt voor de volgende roadmap-fase. Zie
[`IMPLEMENTATION_SEQUENCE.md`](./IMPLEMENTATION_SEQUENCE.md).
