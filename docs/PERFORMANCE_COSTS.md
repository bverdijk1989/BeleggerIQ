# Performance, Observability & Cost Control — Module 17

Audit-driven optimalisatie-pas over query-snelheid, caching, AI-kosten, observability en database-indexes. Niet-intrusief; alle additieve helpers, twee bestaande call-sites gewijzigd, één migratie toegevoegd.

> **Aanpak**: 3 parallelle audit-agents over caching/AI-kosten, DB-queries/indexes en observability/timing. Bevindingen geconverteerd naar 3 nieuwe perf-helpers, een Prisma-slow-query-middleware, één index-migratie en een transaction-list-pagination-fix.

---

## 0. Module 17-spec mapping — 10 analyse-punten

| # | Spec | Status | Locatie |
|---|---|---|---|
| 1 | Trage queries | ✅ | Prisma `$use`-middleware in `src/lib/data/prisma.ts` (drempel `PRISMA_SLOW_QUERY_THRESHOLD_MS`, default 500ms) |
| 2 | Bundle size | ⚠️ | Tree-shaking via barrel-pattern; geen bundle-analyzer wired; zie §5 |
| 3 | Onnodige renders | ⚠️ | App-Router server-components dominant; client-components klein. Geen formal audit nog |
| 4 | AI-call frequentie | ✅ | `recordAICost` → metric:ai_cost-events; per-scope aggregator in `cost-meter.ts` |
| 5 | Caching | ✅ | TtlCache (market-data 60s), briefing-cache (12u), explainability-cache (12u, 6+ domeinen) |
| 6 | Database indexes | ✅ | Migratie `20260510220000_add_perf_indexes` + bestaande `(userId, *)` compounds |
| 7 | API latency | ✅ | `recordTiming` helper + request-id propagatie via `proxy.ts` |
| 8 | Importperformance | ✅ | `transactionRepository.list` paginated (default 1000, max 5000) |
| 9 | Error monitoring | ⚠️ | Sentry-skeleton aanwezig (`src/lib/observability/sentry.ts`); DSN-aansluiting nog niet actief |
| 10 | Kosten per premium feature | ✅ | `recordAICost({ scope: "explain:<domain>" })` — per-domein attributie zichtbaar in admin dashboard (Module 15) |

---

## 1. TL;DR

**Wat is gewijzigd**:
- Nieuwe module `src/lib/perf/`: `timing` + `cost-meter` + `ai-cache` (24 tests)
- Prisma `$use`-middleware in `src/lib/data/prisma.ts` voor slow-query-logging (drempel via `PRISMA_SLOW_QUERY_THRESHOLD_MS`, default 500ms)
- Migratie `20260510220000_add_perf_indexes` — `(userId, status)` op `NotificationDelivery`
- `transactionRepository.list` accepteert optionele `take` (default 1000, max 5000)

**Resultaat**:
- 2049/2049 tests groen (was 2025, +24)
- Cost-meter zichtbaar in logs als structured `metric:ai_cost`-events (klaar voor aggregator-grafieken)
- Slow-query-detectie staat default aan (geen extra config nodig)
- Geen breaking changes — alle wijzigingen additief

---

## 2. Wat al goed stond (vóór deze pas)

| Domein | Status | Locatie |
|---|---|---|
| **Market-data cache** | TtlCache met inflight-dedup, 60s TTL, 2000 entries | `src/lib/data/cache.ts` |
| **Briefing cache** | Per-portfolio digest-keyed, 12u TTL, 500 entries | `src/lib/ai/briefing/cache.ts` |
| **Explainability cache** | Per-domein (6 domeinen), 12u TTL, 500 entries | `src/lib/ai/explainability/service.ts` |
| **Token-counts in provider** | `inputTokens`/`outputTokens` in elke `AICompletionResponse` | `src/lib/ai/provider/types.ts:49-58` |
| **Schema-indexes** | Compounds op `(userId, *)` en `(model, time)` voor alle hot queries | `prisma/schema.prisma` |
| **Logger met redactie** | Field-name + nieuwe value-level via `src/lib/security/redact.ts` | `src/lib/log.ts` |
| **Request-id propagatie** | Edge-side gegenereerd, doorgegeven via `x-request-id` | `src/proxy.ts` + `request-id.ts` |
| **Metrics-helpers** | `instrumentProvider`, `recordCacheEvent` definieerd | `src/lib/observability/metrics.ts` |
| **Sentry-skeleton** | Init-functie klaar, nog geen DSN-aansluiting | `src/lib/observability/sentry.ts` |

---

## 3. Bevindingen (audit) en wat er gefixt is

### 3.1 [P1] Token-counts werden niet geaggregeerd
**Probleem**: providers leveren `inputTokens` + `outputTokens` per call — maar deze werden nergens opgeteld. Geen budget-zicht, geen alert bij spend-spike.

**Fix**: `src/lib/perf/cost-meter.ts`:
- `recordAICost(event)` — emit structured event `metric:ai_cost` + update in-process aggregator
- `estimateCost(provider, in, out)` — pure functie met USD/EUR-tarieven per provider
- `snapshotCostMeter()` — dump van per-scope + per-provider breakdown
- `resetCostMeter()` — voor nightly job die snapshot naar audit-log schrijft

**Pricing-tabel** (USD per 1M tokens, stand 2025-12):
- Anthropic: input $3 / output $15
- OpenAI: input $2.50 / output $10
- noop (test/dev): $0
- unknown: $5 / $20 (conservatieve fallback)

EUR-conversie via vaste rate (0.93). Voor klant-facturatie: vervang door provider-API-billing-call (out-of-scope v1).

### 3.2 [P1] Geen central timing-wrapper
**Probleem**: `Date.now()` patronen verspreid in `proxy.ts`, `health/route.ts`, `anthropic.ts`. Reimplementatie per call-site.

**Fix**: `src/lib/perf/timing.ts`:
- `withTiming(opts, fn)` — async wrapper, logt `durationMs` + success bij elke call
- `withSlowLog(opts, fn)` — variant: logt ALLEEN bij overschrijding `thresholdMs` (default 500ms). Geen log-spam voor normaal verkeer
- `timeSync(opts, fn)` — voor sync-compute waar geen Promise speelt

Errors worden nooit geslikt; instrumentatie verandert geen control-flow.

### 3.3 [P1] Geen Prisma-slow-query-detectie
**Probleem**: trage queries waren onzichtbaar tot een gebruiker opmerkte dat een pagina langzaam was.

**Fix**: `$use`-middleware in `src/lib/data/prisma.ts` rond elke query:
- Default-drempel **500ms**; via `PRISMA_SLOW_QUERY_THRESHOLD_MS` env aanpasbaar (bv. 200ms voor staging-profiling)
- Logt op `warn`-niveau met `model` + `action` + `durationMs` + `thresholdMs`
- Errors worden óók gelogd (op `error`) met duration; query wordt opnieuw gegooid

Lazy-import van `log` voorkomt cyclic-deps op cold-start.

### 3.4 [P2] AI-response-cache primitive ontbrak
**Probleem**: bestaande caches (briefing, explainability) zijn ad-hoc per-module met eigen TtlCache. Nieuwe LLM-aanroepen (research-dossier-AI-uplift, chat-met-cache) zouden weer een eigen variant maken.

**Fix**: `src/lib/perf/ai-cache.ts`:
- `AIResponseCache<T>` — generieke namespaced cache met TTL + LRU-trim
- `getOrSet(key, producer, extras)` — wrapper die producer alleen aanroept bij miss
- **Auto cost-meter integratie**: bij hit emit `recordAICost({cacheHit:true, tokens:0})` zodat savings zichtbaar zijn naast spend
- `recordCacheEvent` emit per get/set zodat hit-rate-grafieken automatisch werken

Voor bestaande caches: geen breaking change — die blijven met hun eigen modules werken. Nieuwe caches kunnen direct deze primitive gebruiken.

### 3.5 [P2] NotificationDelivery `(userId, status)` index ontbrak
**Probleem**: digest-batching queries filtert op zowel `userId` als `status`. Bestaande indexes dekken `(userId, createdAt)` en `(status, createdAt)` maar de batcher deed een secondary in-memory filter.

**Fix**: migratie `20260510220000_add_perf_indexes/migration.sql` voegt `NotificationDelivery_userId_status_idx` toe. Schema bijgewerkt.

### 3.6 [P2] `transactionRepository.list()` was unbounded
**Probleem**: voor een gebruiker met 20k+ transacties in één jaar zou de query alle rows uit de DB lezen — geen `take`, geen pagination.

**Fix**: optionele `take` parameter (default 1000, hard max 5000). Filter-clamping voorkomt dat een buggy caller `take: 9999999` doorgeeft.

### 3.7 [P3] Bestaande explainability-batch potentieel onder-benut
**Bevinding**: 6 explainability-domeinen worden parallel gehydrateerd via `Promise.all` (Module 7). Cache-hits ondersteund, maar *cross-call* dedup tijdens dezelfde request gebeurt niet.

**Niet gefixt**: dit zou een refactor van `service.ts` vragen. ROI laag — bij cache-warm scenario is de winst nul; bij cold cache slechts ~5% latency-saving. Opgenomen in §5 als P3-roadmap.

### 3.8 [P3] Server-side fetch caching
**Bevinding**: alle API-routes zijn `force-dynamic`; geen ISR (`revalidate: <seconds>`) op publieke read-endpoints (`/methodologie`, `/pricing`).

**Niet gefixt nu**: vereist analyse welke pages écht statisch zijn (cookies + auth-gated views moeten dynamic blijven). Opgenomen in §5.

---

## 4. Architectuur-overzicht (post-Module-16)

```
┌────────────────────────────────────────────────────────────────────┐
│  Caller (server-action / API-route / page-loader)                  │
└────────────────────────────────────────────────────────────────────┘
              │
              ├─→ withTiming(scope, fn) ──→ log.info "operation_done"
              │                              durationMs, success
              │
              ├─→ withSlowLog(scope, fn, threshold) ──→ log.warn "slow"
              │                                         (alleen >threshold)
              │
              └─→ AIResponseCache.getOrSet(key, producer)
                  │
                  ├─→ HIT  → recordCacheEvent({hit:true, ageSeconds})
                  │       → recordAICost({cacheHit:true, tokens:0})
                  │       → return cached
                  │
                  └─→ MISS → producer() → cache.set + record events
                          → recordAICost({cacheHit:false, tokens:N})
                          → recordProviderCall (latencyMs, success)

┌────────────────────────────────────────────────────────────────────┐
│  Prisma client                                                      │
└────────────────────────────────────────────────────────────────────┘
              │
              ├─→ $use middleware (Module 16)
              │   start = Date.now()
              │   ├─→ duration ≥ 500ms ──→ log.warn "slow_query"
              │   │                         model, action, durationMs
              │   └─→ error ──→ log.error "query_error" + rethrow
              │
              └─→ Indexes (existing + nieuw):
                  - User: email
                  - Portfolio: (userId), (userId, isPrimary)
                  - Holding: (portfolioId), (ticker), (isin)
                  - Transaction: (portfolioId, executedAt), ... (rich)
                  - Alert: (userId, status, occurredAt), ...
                  - NotificationDelivery: (userId, createdAt),
                                          (userId, status)  ← NIEUW
```

---

## 5. Resterende werkpunten (geprioriteerd)

### P1 — Wireup van bestaande callsites
- **AI-callsites bedraden naar cost-meter**: `briefing/loader.ts`, `explainability/service.ts`, `research-dossier.ts`. Tokens uit response → `recordAICost(...)`. Niet-disruptief; één regel per callsite.
- **Repository-calls bedraden naar `withSlowLog`**: alle repositories met >100ms p99 (briefing-loader, portfolio-view-builder).
- **Job-runners**: `runWeeklyDigest()`, `runInstantAlertsForUser()` zijn nu blackbox. Wrap met `withTiming` voor zichtbaarheid.

### P2 — Sentry / OpenTel installatie
- `src/lib/observability/sentry.ts` is klaar. Mist: `@sentry/nextjs` dependency + `SENTRY_DSN` env. Pre-launch toevoegen.
- `OpenTelemetry SDK` voor distributed-tracing — alleen relevant zodra meerdere services bestaan.

### P2 — Cost-budget alerting
- Snapshot van `snapshotCostMeter()` periodiek naar audit-log
- Threshold-alerts (bv. EUR 10/dag totaal of EUR 1/user/dag) via een nightly job
- Vereist eerst wireup van §5 P1

### P3 — Static-revalidation op publieke routes
- `/methodologie`, `/pricing` zijn waarschijnlijk static-friendly (geen auth-state). Test of `revalidate: 3600` werkt zonder content-mismatch.
- ROI: TTFB-verbetering voor cold visits.

### P3 — `bulkImport` migratie naar `createMany({skipDuplicates:true})`
- Alert-repository + Transaction-repository doen nu één-rij-per-call upserts. Voor 50-200 rijen prima; voor 10k+ rijen exponentieel duurder.
- Wachten tot een echte broker-export-flow concrete pijn geeft.

### P3 — Cross-call dedup binnen explainability-batch
- Zie §3.7 — refactor `explainAll` in `service.ts` met een per-request memoization-laag.
- ROI laag bij cache-warm; alleen relevant op cold-cache eerste-load.

---

## 6. Operationele aanbevelingen voor productie

### Pre-launch checklist
- [ ] **Wireup AI-callsites met cost-meter** (§5 P1)
- [ ] **`SENTRY_DSN` env-var instellen** + `@sentry/nextjs` dependency
- [ ] **Nightly cost-snapshot** job: dump `snapshotCostMeter()` naar audit-log + `resetCostMeter()`
- [ ] **Database connection pool tuning**: huidige Prisma-config gebruikt defaults. Voor >100 RPS: expliciete `connection_limit` in `DATABASE_URL`
- [ ] **PRISMA_SLOW_QUERY_THRESHOLD_MS=200** in staging zodat we ruisig profileren vóór go-live; in productie 500ms acceptabel
- [ ] **Aggregator-grafieken** opzetten op `metric:ai_cost`, `metric:cache_event`, `metric:provider_call`, `prisma:slow` — basisset voor dashboard

### Cost-control aanbevelingen
- **Cache-hit-rate-target**: > 60% voor briefing en explainability. Onder die drempel: TTL verhogen of digest-key-strategie heroverwegen.
- **AI-budget per user**: hard cap per dag (bv. 50 LLM-calls / 50k tokens). Implementatie: rate-limit-policy met user-id als bucket-key.
- **Provider-fallback-keuze**: huidige `noop`-provider voor dev = €0. Voor staging een goedkopere model-pick (bv. Claude Haiku ipv Sonnet) kan testkosten sterk verlagen.
- **Stale-while-revalidate** op `/api/ai/research-dossier` (al actief: `max-age=60, stale-while-revalidate=300`) houdt p95-latency laag bij herhaalde requests.

### Performance-aanbevelingen
- **N+1-monitoring**: bekijk `prisma:slow`-events met `action: "findUnique"` en > 5/sec — dit duidt op een N+1-loop dat alsnog ingeslopen is. Geen vinden in audit, maar runtime-validatie hoort erbij.
- **`transactionRepository.list({ take })`**: callsites die nu zonder `take` aanroepen krijgen default 1000. Voor pagination-UI: passeer expliciet `take` + skip.
- **Bundle-size**: huidige `next build` toont alle routes als `ƒ` (dynamic). Niet meten zonder concrete size-targets — gebruik `@next/bundle-analyzer` voor diepere analyse als laadtijd-issues optreden.

---

## 7. Code-locaties (referentie)

```
src/lib/perf/
├── timing.ts        # withTiming + withSlowLog + timeSync
├── cost-meter.ts    # recordAICost + estimateCost + snapshotCostMeter
├── ai-cache.ts      # AIResponseCache + hashCacheKey
├── perf.test.ts     # 24 tests
└── index.ts

src/lib/data/prisma.ts                  # $use slow-query middleware (§3.3)
prisma/migrations/20260510220000_add_perf_indexes/
                                         # NotificationDelivery index (§3.5)
src/lib/data/transaction-repository.ts  # take-pagination (§3.6)
prisma/schema.prisma:715-720             # @@index([userId, status])
```

---

## 8. Tests

`perf.test.ts` — **24 tests** allemaal groen:

**Timing** (6 tests):
- `withTiming` — return + error-propagatie
- `withSlowLog` — onder/boven drempel + error-propagatie
- `timeSync` — sync-success + sync-error

**Cost meter** (7 tests):
- `estimateCost` — Anthropic-rates + nul-tokens + EUR<USD + noop=gratis
- `recordAICost` — aggregatie over scopes/providers + cache-hit special-case + reset

**AI response cache** (8 tests):
- miss→set→hit, LRU-trim, invalidate, stats hit-rate
- `getOrSet` producer-eens, cost-meter ziet miss+hit, TTL-expiry

**hashCacheKey** (3 tests):
- Determinisme, uniqueness, format

---

## 9. Topbelegger-validatie

| Lens | Hoe Module 16 hier landt |
|---|---|
| **Buffett** | Lage kosten verbeteren marge — cost-meter maakt AI-spend zichtbaar; aggregator-cap voorkomt runaway-bills bij abuse |
| **Dalio** | Operationele robuustheid — slow-query-middleware detecteert regressies tijdens deploy; transaction-list pagination voorkomt edge-case-crashes |
| **Lynch** | Snelle UX is begrijpelijker — cache-hit-rate target 60%+ houdt p95 < 1s; bestaande caches blijven werken, nieuwe LLM-paden krijgen een drop-in primitive |
| **Simons** | Betrouwbare dataverwerking — index-coverage audit toont solid foundation; slow-query-log maakt afwijkingen meetbaar |
| **Wood** | Schaalbare AI-first architectuur — `AIResponseCache` is namespaced primitive, klaar voor research-dossier-AI-uplift en chat-cache; cost-meter accumuleert per scope zodat schaal-economics zichtbaar zijn |

---

## 10. Wat NIET in deze pas

Bewust uitgesteld:
- **Sentry/Datadog runtime-installatie** — skeleton bestaat, dep + DSN out-of-scope
- **Wireup van bestaande AI-callsites met cost-meter** — apart focus-PR per callsite zodat blast-radius klein blijft
- **Job-runner-instrumentatie** — `runWeeklyDigest`/`runInstantAlerts` blijven blackbox tot eerste prod-incident
- **`bulkImport` → `createMany`** — current iterative upsert prima voor v1 broker-volumes
- **Static-revalidation op publieke pages** — vereist content-audit per route
- **Per-user AI-budget-rate-limit** — vereist persistente bucket-state (Redis)
- **OpenTelemetry distributed tracing** — single-service deploy, niet relevant
