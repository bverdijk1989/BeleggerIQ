# BeleggerIQ 2.0 — Hardening & Validatie Audit

**Datum:** 2026-04-24
**Scope:** Type safety, runtime validatie, API route robuustheid, error
handling, empty/loading states, data provider failures, test coverage,
component structuur, import hygiene.

Dit document is het resultaat van een gestructureerde audit op de
bestaande codebase. Het bevat:

1. Sterktes die expliciet behouden zijn.
2. Bevindingen per onderwerp met concrete fixes in deze ronde.
3. Resterende risico's die bewust buiten scope zijn gebleven.

---

## 1. Type safety

### Sterktes behouden
- `tsconfig` draait in strikte modus met `noUncheckedIndexedAccess`.
- Domeintypes (`PortfolioView`, `MarketRegimeScore`, `AllocationPlan`) zijn
  exhaustive; engines retourneren eenduidige shapes.
- Barrel in [`src/types/index.ts`](../src/types/index.ts) houdt de dependency-volgorde
  leesbaar.

### Bevindingen + fixes in deze ronde
| Bevinding | Locatie | Fix |
|-----------|---------|-----|
| Twee duplicate `toNumber` helpers met verschillende fallback-gedrag | [`src/lib/data/regime.ts`](../src/lib/data/regime.ts), [`src/lib/data/strategy-preset-repository.ts`](../src/lib/data/strategy-preset-repository.ts) | Beide vervangen door de canonieke [`toFiniteNumber`](../src/lib/http/validate.ts). Eén bron, verplichte NaN→null mapping. |
| `(await request.json()) as Foo` casts in alle POST routes | alle `src/app/api/**/route.ts` | Vervangen door `safeJson()` + `expectObject()` + typed parsers uit [`@/lib/http/validate`](../src/lib/http/validate.ts). |
| `validateContext` in `explain/route.ts` deed handwerk | `src/app/api/ai/explain/route.ts` | Bestaande guard behouden (volledig exhaustive op useCase) + gewrapt met de nieuwe `safeJson`/`expectObject` pipeline voor uniformiteit. |

### Resterend risico (bewust niet in scope)
- `as unknown as Prisma.InputJsonValue` bridges voor JSON-kolommen. Het
  alternatief (een full schema validator bij elke Prisma-write) voegt meer
  dependency- en runtime-overhead toe dan het risico rechtvaardigt.
  Mitigatie: elke bridge ligt in de repository-laag (3 locaties), niet in
  random modules.
- `Number(row.maxPositionWeight)` op Prisma Decimal velden (portfolio- en
  snapshot-repository). Precisieverlies is theoretisch bij bedragen >
  `2^53`; voor portfolio-waardes van particuliere beleggers niet realistisch.

---

## 2. Runtime validatie

### Fix in deze ronde
Geïntroduceerd: [`src/lib/http/validate.ts`](../src/lib/http/validate.ts) — een
lichtgewicht validator zonder externe dependency. Functies:
- `safeJson(request)` — parse zonder throw
- `expectObject` — shape-guard met plain-object check
- `parseString`, `parseStringArray` — met min/maxLength en regex-pattern
- `parseIsoDate` — strikt `YYYY-MM-DD`
- `parseBoundedNumber` — NaN/Infinity worden expliciet null
- `parseEnum` — fallback + allowed-list
- `parseTickerStrict` — `^[A-Z0-9][A-Z0-9._-]{0,23}$` regex, auto-upcase
- `toFiniteNumber` — unified Prisma Decimal / string / number guard

Aanvullend: [`src/lib/http/errors.ts`](../src/lib/http/errors.ts) met
`jsonError(msg, status, code?)` en `jsonServerError(scope, error, msg)` zodat
alle routes dezelfde `{ error, code? }` shape retourneren.

### Keuze: geen Zod
- Zou ~10KB aan runtime bundle toevoegen.
- De geldige input-shapes in deze app zijn klein en stabiel.
- De helpers dekken >95% van de patronen en zijn triviaal te testen.
Overweeg Zod alsnog wanneer (a) de inbound surface groeit met rijke JSON-
schemas, of (b) we Zod-schemas delen tussen server en React-forms.

---

## 3. API route robuustheid

### Refactor per route

| Route | Wijziging |
|-------|-----------|
| `POST /api/ai/explain` | `safeJson` + `expectObject`, typed error shape, bestaande `validateContext` guard blijft. |
| `POST /api/chat` | Runtime guard op `message` (lengte 1..2000) en `history` (array, max 40 items) zodat een grote of malformed payload vroeg 400't. |
| `POST /api/snapshots/portfolio` | `portfolioId` en `userEmail` beide expliciet gevalideerd (email-regex, lengte-caps). Silent catch vervangen door 400 bij malformed body. Response `{ snapshotId, portfolioId }` consistent. `PORTFOLIO_NOT_FOUND` code toegevoegd. |
| `POST /api/snapshots/factors` | `tickers` gecapped op 100 items, per ticker gevalideerd via `parseTickerStrict`. `model` match op `^[a-zA-Z0-9._-]+$`. |
| `GET /api/market/quote` | `parseTickers` faalt expliciet bij >50 tickers of rare karakters i.p.v. silent splitting. |
| `GET /api/market/history` | `from`/`to` als strikt ISO-date; `from > to` geeft 400; `interval` via `parseEnum` met whitelist. |
| `GET /api/market/fundamentals` | Ticker-regex enforcement (was trim-only). |
| `GET /api/market/fx` / `GET /api/market/regime` | Alleen response-shape en error-helpers geüniformeerd; logica ongewijzigd. |

Alle routes gebruiken nu `jsonServerError(scope, error, userMessage)` — stack
traces en raw error-objecten lekken niet naar de client, wel naar de
gestructureerde logger.

### Resterend risico
- **Authorization** is nog op de `DEMO_USER_EMAIL`-shortcut. Elke POST
  route accepteert een `userEmail` uit de body. In productie moet dit
  worden vervangen door een sessie-check (bij voorkeur middleware). De
  hardening-ronde heeft dit gemarkeerd in de routes maar niet opgelost;
  het is een grotere auth-beslissing.
- **Rate limiting / max body size** staan niet op routeniveau. Next.js
  levert een default body limit van 4MB en we legen dit niet kleiner op.
  Overweeg middleware bij productie launch.

---

## 4. Error handling

### Fix in deze ronde
- Gestructureerde logger [`src/lib/log.ts`](../src/lib/log.ts) — elke call
  produceert `{ scope, level, msg, ...fields }`. `Error`-objecten worden
  automatisch gereduceerd tot `{ name, message }`. Vervangt ad-hoc
  `console.warn('[module] ...')` in `market:quote`, `market:fx`,
  `market:history`, `regime`, en alle API routes.
- Client-side: [`src/lib/http/client.ts`](../src/lib/http/client.ts) met
  `postJson<T>()` die body maximaal één keer parse't. Dit voorkomt de
  theoretische bug waarbij twee `response.json()` calls zouden clashen.
  [`chat-room.tsx`](../src/app/(app)/chat/components/chat-room.tsx) en
  [`snapshot-button.tsx`](../src/app/(app)/dashboard/components/snapshot-button.tsx)
  gebruiken nu de helper, met consistente error-state UX.

### Resterend risico
- **Provider timeouts** ontbreken. Een hangende `fetch` in de market-data
  laag blokkeert een route tot de Next.js default (in de praktijk
  functie-timeout). Voor externe providers moet `AbortController` + timeout
  worden toegevoegd zodra we van stub → live provider gaan.

---

## 5. Empty states

### Fix in deze ronde
- Nieuwe component [`src/components/common/empty-chart.tsx`](../src/components/common/empty-chart.tsx)
  — compacte placeholder (dashed border, container-sized) voor chart-containers.
- `equity-chart.tsx` gebruikt de nieuwe `EmptyChart` i.p.v. een ad-hoc
  muted-text-regel. Alle chart-containers hebben nu dezelfde empty-visueel.

### Resterend risico (laag)
- Seed-instructie ("draai `npm run prisma:seed`") staat op drie plekken
  hardcoded in `page.tsx` files. Niet opgelost (pure UX-copy); centrale
  constant is een prima vervolg.

---

## 6. Loading states

Alle 8 routes onder `src/app/(app)/**/page.tsx` hebben een sibling
`loading.tsx` met een consistent skeleton-patroon. Geen fixes nodig.

---

## 7. Data provider failures

### Sterktes behouden
- [`TtlCache.getOrSet`](../src/lib/data/cache.ts) cached expliciet geen
  `null`/`undefined` — "data unavailable" blokkeert geen hele TTL-window.
- `inflight` map wordt via `finally` opgeruimd; concurrent callers delen
  dezelfde rejected promise en een volgende caller mag retry'en.
- `enrichment.ts` isoleert provider-fails per bron (quote, FX,
  fundamentals, history) zodat één falende bron de view niet sloopt.

### Fix in deze ronde
- Toegevoegde tests in [`src/lib/data/cache.test.ts`](../src/lib/data/cache.test.ts):
  - Inflight-map is leeg na een throw.
  - Concurrent callers delen exact één rejected promise (producer 1× aangeroepen).
  - `clear()` reset store, inflight, hits en misses.

### Resterend risico
- Geen retry-logica; een transient blip = volledige TTL-window zonder data.
  Acceptabel voor stub provider; bij live provider overwegen.
- Geen structured metric/observability hooks op cache hit-rate of
  provider-latency. Nu makkelijk toe te voegen dankzij de nieuwe logger.

---

## 8. Test coverage — analytics modules

| Module | Status | Actie |
|--------|--------|-------|
| `attention.ts` | 🔴 → 🟢 | [Nieuwe test](../src/lib/analytics/attention.test.ts): priority-sortering, NO_ACTION filter, `low` severity filter, limit, default message. |
| `allocation-engine/priority.ts` | 🔴 → 🟢 | [Nieuwe test](../src/lib/analytics/allocation-engine/priority.test.ts): hard-blocks, RISK_ON momentum boost, DEFENSIVE core-ETF boost, breakdown bounds. |
| `snapshot.ts` (vorige ronde) | 🟢 | Reeds in `snapshot.test.ts`. |
| `http/validate.ts` | 🆕 | [Nieuwe test](../src/lib/http/validate.test.ts) — 12 suites voor elke helper. |
| `log.ts` | 🆕 | [Nieuwe test](../src/lib/log.test.ts) — payload-shape + Error serialisatie. |
| `data/history.ts` | 🟡 → 🟢 | [Uitgebreid](../src/lib/data/market.test.ts): invalide datum, endDate < startDate, lege ticker, onbekend interval, sortering + finite close. |

### Resterend risico
- `enrichment.ts` (high-level orchestrator) — nog geen dedicated test. Het
  alternatief is een mock-heavy test die de stub-provider vervangt. Gezien
  de determinisme van `market.test.ts` (e2e langs de stub) én de fact dat
  `buildPortfolioView` impliciet ge-exercised wordt in snapshot/e2e-paden,
  is dit de eerstvolgende investering — niet nu.
- `allocation-engine/context.ts` (regime-adjustments) — impliciet getest
  via `priority.test.ts`. Voor explicit coverage op budgetMultiplier zou
  een dedicated `context.test.ts` toegevoegd kunnen worden.

---

## 9. Consistente componentstructuur

### Audit-bevinding
Pages delegeren correct naar services en engines. Client components
bevatten geen business logica > 20 regels; chart- en stats-componenten
accepteren pre-computed data en renderen.

### Fix in deze ronde
- [`snapshot-button.tsx`](../src/app/(app)/dashboard/components/snapshot-button.tsx)
  gebruikt nu `postJson` i.p.v. inline fetch + dubbel-read pattern.
- [`chat-room.tsx`](../src/app/(app)/chat/components/chat-room.tsx) idem.
- [`equity-chart.tsx`](../src/app/(app)/backtest/components/equity-chart.tsx)
  gebruikt `EmptyChart` component i.p.v. ad-hoc tekst.

---

## 10. Import hygiene + mapconsistentie

### Audit-bevinding
- Geen deep relative imports (`../../..`) gevonden. Alle paden via `@/`.
- Geen client components importeren `@/lib/data/prisma`. ✓
- Analytics-barrel heeft gedocumenteerde selectieve re-exports
  (`thresholdsFromPolicy`, `computeMaxDrawdown`) om collisions te voorkomen.

### Fix in deze ronde
- Nieuwe barrel [`src/lib/http/index.ts`](../src/lib/http/index.ts) is
  **server-only** (re-exporteert `errors.ts` dat `next/server` importeert).
  Client components moeten [`src/lib/http/client.ts`](../src/lib/http/client.ts)
  rechtstreeks importeren. Dit is expliciet gedocumenteerd in de barrel.

### Resterend risico
- `src/types/index.ts` re-exporteert 14 sub-modules; een naming-collision
  zou hier neerslaan. Monitoring via `tsc --noEmit` vangt dit. Geen
  actieve fix nodig.

---

## Samenvatting — aanbevelingen na deze ronde

**Klaar voor volgende ronde:**
1. Auth-middleware die de `DEMO_USER_EMAIL`-shortcut in API routes vervangt. ✅ **Opgelost in auth-ronde** — zie [`src/lib/auth/session.ts`](../src/lib/auth/session.ts); alle API routes, RSC pages en server actions gebruiken `resolveUser` / `resolveUserFromServer`.
2. `AbortController` + timeout op market-data provider calls zodra we een live provider aanhaken. ✅ **Opgelost** — zie [`src/lib/data/resilience.ts`](../src/lib/data/resilience.ts); alle provider wrappers draaien nu via `withRetry(withTimeout(...))`.
3. Optional: Zod alsnog introduceren wanneer we form-schemas willen delen tussen client en server. **Blijft open** — nog niet nodig.
4. Retry-logica met exponential backoff op transient provider-errors. ✅ **Opgelost** samen met #2; exponential backoff + ±50ms jitter; transient classifier accepteert timeouts, netwerk-errors en 5xx; 4xx en domain-errors gaan meteen door.
5. Observability hooks: cache hit/miss metrics en provider-latency in de logger-payload. **Blijft open** — de structured logger staat er; metric-emitter is de volgende stap.

**Niet urgent:**
- ~~`enrichment.ts` dedicated test~~. ✅ **Opgelost** — zie [`src/lib/analytics/enrichment.test.ts`](../src/lib/analytics/enrichment.test.ts) (9 tests).
- Seed-instructie centraliseren in een `@/lib/constants/empty-states.ts`.
- Decimal → Number precision guard voor high-value portfolios.

---

## Follow-up auth + resilience ronde (2026-04-24)

Naar aanleiding van bovenstaande punten 1, 2, 4 en de enrichment-coverage-gap
is een aparte ronde uitgevoerd. Samenvatting van wat daar is opgelost; details
in de CHANGELOG onder het kopje **"Auth + resilience + module-sweep"**.

### Wat er nu werkt

| Risk (was open) | Status |
|-----------------|--------|
| Auth-middleware | ✅ 3-laags resolver (signed cookie → dev-header → opt-in demo); alle entry points gewired; cross-user forgery structureel geblokkeerd |
| Provider timeouts + retries | ✅ Per-call timeout + exponential backoff met jitter; transient classifier; per-provider profielen |
| Enrichment test coverage | ✅ 9 tests tegen deterministische stub; covers empty, FX identity/cross-currency, dedup, fundamentals opt-in, factor bounds |

### Module-sweep

Tijdens de auth-wiring is een volledige test-audit gedraaid (`npm test`).
**12 pre-existing testfouten** zijn tegelijk opgelost door bugs in productie-
code te fixen (niet door tests te versoepelen):
- `toFiniteNumber` retourneerde 0 voor arrays (nu `null`).
- `buildSignal` floating-point ruis (nu afgerond).
- `scoreFromSignals` sorteerde rationales zonder gewicht mee te nemen
  (nu `weight × |score - 50|`).
- Concentration classifier te lenient voor mid-range signalen (`< 55` → `< 60`,
  `< 45` → `< 50`).
- Rebalance-engine precedence: `TRIM_HEAVY` vóór `RECONSIDER` bij oversized
  fragile positions.
- DEGIRO-parser herkende `1.000` als 1 i.p.v. 1000 (NL-thousand separator).
- Chat intent-regex miste Engelse meervoudsvorm "risks".
- Backtest `finalValue` was afgerond, maakte commission-deltas onzichtbaar.
- AI explainer HEALTHY-pad bevatte woord "verkopen" (guardrail-violation).
- 2 valuation testfixtures gebruikten `??` waar spread nodig was.
- `tradesCount` was `optional` maar wordt altijd gezet.

### Einstaat

- `npm test` → **331/331 groen** (40 bestanden).
- `npx tsc --noEmit` → **schoon**.
- `npx next build` → **slaagt**, 9 routes compileren.
