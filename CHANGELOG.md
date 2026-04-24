# Changelog

Alle noemenswaardige wijzigingen aan BeleggerIQ 2.0. Formaat volgt [Keep a Changelog](https://keepachangelog.com/nl/1.1.0/).

## [Unreleased] - 2026-04-24 · Auth + resilience + module-sweep

### Added
- [`src/lib/auth/session.ts`](src/lib/auth/session.ts) — auth resolver met 3 paden: signed HMAC-cookie (`biq_session`, via `BIQ_SESSION_SECRET`), `x-beleggeriq-user` dev-header (non-prod), `DEMO_USER_EMAIL` fallback (opt-in via `BIQ_ALLOW_DEMO_AUTH=true`). Inclusief `signSessionCookie` / `verifySessionCookie` (timing-safe HMAC-SHA256) en `matchesSessionUser` authorization-helper.
- [`src/lib/auth/server.ts`](src/lib/auth/server.ts) — `resolveUserFromServer()` voor RSC pages/layouts; wrapt Next.js `cookies()` + `headers()`.
- [`src/lib/auth/session.test.ts`](src/lib/auth/session.test.ts) — 17 tests: round-trip signing, verkeerd secret, getamperd payload, dev-header pad (incl. productie-block), demo-fallback met opt-in, cross-user authorization.
- [`src/lib/data/resilience.ts`](src/lib/data/resilience.ts) — `withTimeout`, `withRetry` (exponential backoff + jitter), `fetchWithResilience`, `TimeoutError`, `isTransientError` (TimeoutError / netwerk-glitches / 5xx = transient; 4xx = permanent).
- [`src/lib/data/resilience.test.ts`](src/lib/data/resilience.test.ts) — 13 tests: timeout fire + rejection propagatie, transient classification, retry-with-backoff, niet-transient early exit, custom classifier.
- [`src/lib/analytics/enrichment.test.ts`](src/lib/analytics/enrichment.test.ts) — 9 tests tegen de deterministische stub-provider: empty input, FX identity + cross-currency, dedup van tickers, optioneel fundamentals/factors, automatisch fundamentals bij includeFactorScores, bounds 0..100 op composites, geen NaN in valuations.
- Nieuwe repository-methode [`portfolioRepository.findOwnerEmailById`](src/lib/data/portfolio-repository.ts) — enkel-call ownership-check voor de auth-guards in API routes en server actions.

### Changed
- **Auth wiring** — alle entry points gebruiken nu `resolveUser` / `resolveUserFromServer`:
  - API routes: [`/api/snapshots/portfolio`](src/app/api/snapshots/portfolio/route.ts) (authz op `portfolioId`, expliciet verboden `userEmail` in body), [`/api/snapshots/factors`](src/app/api/snapshots/factors/route.ts), [`/api/chat`](src/app/api/chat/route.ts).
  - Server pages: [`/dashboard`](src/app/(app)/dashboard/page.tsx), [`/portfolio`](src/app/(app)/portfolio/page.tsx), [`/risico`](src/app/(app)/risico/page.tsx), [`/chat`](src/app/(app)/chat/page.tsx), [`/maandbeslissing`](src/app/(app)/maandbeslissing/page.tsx), [`/strategy-lab`](src/app/(app)/strategy-lab/page.tsx) — elke page rendert een `ShieldAlert`-EmptyState bij 401/403.
  - Server actions: [`portfolio/actions`](src/app/(app)/portfolio/actions.ts) (DEGIRO import controleert ownership op `portfolioId`), [`strategy-lab/actions`](src/app/(app)/strategy-lab/actions.ts), [`screener/actions`](src/app/(app)/screener/actions.ts) — de sessie-user is altijd de owner; cross-user writes zijn structureel onmogelijk.
- **Resilience wiring** — alle provider calls (`quotes`, `fx`, `fundamentals`, `history`) draaien nu via `withRetry(withTimeout(...))`: 2 retries met exponential backoff (150-200ms basis, 1-1.5s max) en per-call timeouts (5s quotes/fx, 8s fundamentals, 12s history). Transient errors retryen, 4xx en domain errors gaan meteen door.
- Structured logging uitgebreid naar [`enrichment.ts`](src/lib/analytics/enrichment.ts), [`snapshot-service.ts`](src/lib/services/snapshot-service.ts), [`strategy-lab/actions.ts`](src/app/(app)/strategy-lab/actions.ts), [`screener/actions.ts`](src/app/(app)/screener/actions.ts) — alle ad-hoc `console.warn('[mod] msg', err)` regels vervangen door `log.<level>(scope, msg, fields)`.
- [`.env.example`](.env.example) — documenteert `BIQ_SESSION_SECRET` (≥ 32 tekens) en `BIQ_ALLOW_DEMO_AUTH` opt-in-flag.
- [`src/lib/navigation.ts`](src/lib/navigation.ts) — `NavItem.href` is nu typed als `Route` (Next.js typed-routes) zodat sidebar-links type-safe zijn.

### Fixed (12 pre-existing testfouten gefixt tijdens module-sweep)
- [`lib/http/validate.ts`](src/lib/http/validate.ts) — `toFiniteNumber([])` retourneerde 0 i.p.v. null (Array heeft `toString() === ""`). Arrays en `"[object Object]"`-strings zijn expliciet gefilterd.
- [`lib/analytics/factors/shared.ts`](src/lib/analytics/factors/shared.ts) — `buildSignal` rondt de score nu af (voorkomt IEEE-754 ruis zoals `75.00000000000001`). `scoreFromSignals` sorteert rationales op `weight × |score - 50|` zodat hoog-gewogen drivers (bv. ROIC in quality) altijd surfacen.
- [`lib/analytics/rebalance-engine/concentration-classifier.ts`](src/lib/analytics/rebalance-engine/concentration-classifier.ts) — quality-ondergrens verruimd naar `< 60`, momentum naar `< 50` zodat posities met echt gemiddelde signalen (55/45/55) niet onterecht als HEALTHY landen.
- [`lib/analytics/rebalance-engine/engine.ts`](src/lib/analytics/rebalance-engine/engine.ts) — `FRAGILE + weight > fragileHeavyMultiplier × cap` produceert nu `TRIM_HEAVY` vóór `RECONSIDER` wordt overwogen. Een 20%-positie krijgt een rightsize naar 7,5% i.p.v. een "sell all"-signaal.
- [`lib/parsers/degiro.ts`](src/lib/parsers/degiro.ts) — NL-duizendtalpatroon (`1.000`) wordt nu correct als 1000 geparsed dankzij een `\d{1,3}\.\d{3}`-heuristiek.
- [`lib/ai/chat.ts`](src/lib/ai/chat.ts) — intent-regex voor `portfolio_risks` herkent ook het Engelse meervoud "risks".
- [`lib/ai/explainers.ts`](src/lib/ai/explainers.ts) — HEALTHY-winner narrative gebruikt geen woord "verkopen" meer (test guardrail).
- [`lib/analytics/backtest/engine.ts`](src/lib/analytics/backtest/engine.ts) — `finalValue` gebruikt de onafgeronde eindwaarde zodat kleine commission-effecten zichtbaar blijven; points.value blijft afgerond voor UI.
- [`types/backtest.ts`](src/types/backtest.ts) — `tradesCount` is required (engine zet hem altijd). Test dependency op `toBeGreaterThanOrEqual(noCost.tradesCount)` compileert weer.
- [`lib/analytics/valuation.test.ts`](src/lib/analytics/valuation.test.ts) — `makeHolding`-factory gebruikt `{...base, ...overrides}` i.p.v. `??`, zodat tests expliciet `null` kunnen forceren op `currentPrice` en `sector`.

### Fixed (11 TypeScript errors na auth wiring)
- `history-charts.tsx` Recharts Tooltip formatter → narrowing via `typeof value === "number"`.
- `chat.ts` — `HoldingValuation` geïmporteerd uit `@/lib/analytics/valuation` (juiste bron).
- `momentum.ts`, `degiro.ts` — `Object is possibly undefined` guards toegevoegd.
- `snapshot.test.ts` — `AllocationPlan`-fixture volgt nu de juiste shape (`budget` + `cashAvailable` + `monthlyContribution`, géén `totalBudget`/`reservedCash`).
- `portfolio-repository.ts` / `snapshot-repository.ts` — Prisma JSON-bridges krijgen `as unknown as X` om de strictere Prisma JsonValue-typing te passeren.

### Fixed (ESLint/build errors voor productie-build)
- Vijf bestanden met kapotte apostrofe in JSX-tekst (`'s`) — alle vervangen door `&apos;s`.
- `allocation-engine/engine.ts` — `let residual` → `const residual` (prefer-const).

### Design regels
- **Auth is een gatekeeper, geen toegang** — de resolver retourneert een typed `AuthResolution`; elke entry point beslist zelf hoe hij omgaat met 401/403 (page → EmptyState, API → JSON-error, action → error-result). Geen silent fallthroughs.
- **Demo-auth is opt-in per deployment** — productie zet `BIQ_ALLOW_DEMO_AUTH` niet, dus een geforgeteen session-cookie is de enige weg. In dev/staging mag het wel; scheelt een login-flow tijdens bouw.
- **Cross-user requests zijn geblokkeerd bij de bron**: `userEmail` uit de body wordt expliciet afgewezen op `/api/snapshots/portfolio`; DEGIRO import controleert eigenaarschap op `portfolioId`; Strategy Lab laat alleen de sessie-user presets saven/deleten.
- **Resilience is per-call, niet globaal** — elke provider-call krijgt eigen timeout + retry-profiel. Snel bewegende endpoints (quote, fx) zijn korter getuned dan trage (history). Cache-layer blijft producerend; een throw in de producer wordt nog steeds door cache.ts correct opgeruimd.
- **Fix-the-root, not-the-test** — geen testfouten gedempt; elke failure is in productie-code rechtgezet. Waar test-fixtures verkeerd waren (bv. `??` vs spread in valuation.test.ts), is de fixture gerepareerd met een korte uitleg waarom.

### Aannames
- `BIQ_SESSION_SECRET` ≥ 32 bytes is de verantwoordelijkheid van de deployer — de resolver weigert de cookie pad als het secret ontbreekt of te kort is (403).
- `DEMO_USER_EMAIL` zonder `BIQ_ALLOW_DEMO_AUTH=true` doet niets. Een ontwikkelaar die lokaal werkt zet beide.
- De stub-provider is deterministisch, dus tests draaien zonder mocking tegen `quotes/fx/fundamentals/history`. Zodra er live providers landen, worden de tests van `enrichment.ts` mock-based gemaakt.
- Prisma-query retries staan expliciet *niet* rond DB-calls — het connection-pool van Prisma doet dat zelf op infra-niveau.

### Validatie
- `npm test` → **331/331 tests groen** (40 test-bestanden).
- `npx tsc --noEmit` → **schoon**, geen errors.
- `npx next build` → **succesvol**, alle 9 routes compileren, server bundle ~100KB shared.

## [Unreleased] - 2026-04-24 · Hardening & validatie

### Added
- [`src/lib/http/validate.ts`](src/lib/http/validate.ts) — lichtgewicht runtime-validator zonder externe dependency. Helpers: `safeJson`, `expectObject`, `parseString`, `parseStringArray`, `parseIsoDate`, `parseBoundedNumber`, `parseEnum`, `parseTickerStrict`, `toFiniteNumber`. Alle helpers retourneren een typed `ValidationResult<T>`.
- [`src/lib/http/errors.ts`](src/lib/http/errors.ts) — `jsonError(msg, status, code?)` en `jsonServerError(scope, err, msg)` voor uniforme `{ error, code? }` shape op alle API routes.
- [`src/lib/http/client.ts`](src/lib/http/client.ts) — client-safe `postJson<T>(url, body)` die response-body maximaal één keer parse't, netwerkfouten opvangt en een typed `ApiResult | ApiFailure` retourneert.
- [`src/lib/http/index.ts`](src/lib/http/index.ts) — server-only barrel (client componenten importeren `@/lib/http/client` direct; errors.ts leunt op `next/server`).
- [`src/lib/log.ts`](src/lib/log.ts) — gestructureerde logger met `{ scope, level, msg, ...fields }` output; `Error`-objecten worden gereduceerd tot `{ name, message }`.
- [`src/components/common/empty-chart.tsx`](src/components/common/empty-chart.tsx) — compacte placeholder voor chart-containers zonder data, matcht container-afmetingen.
- [`docs/HARDENING_AUDIT.md`](docs/HARDENING_AUDIT.md) — volledig auditrapport: type safety, runtime validatie, API routes, error handling, empty/loading states, provider resilience, test coverage, component structuur, import hygiene + resterende risico's per categorie.
- Nieuwe tests:
  - [`src/lib/http/validate.test.ts`](src/lib/http/validate.test.ts) — 12 suites voor elke helper (pattern, bounds, NaN→null, optional, fallback).
  - [`src/lib/log.test.ts`](src/lib/log.test.ts) — payload-shape + Error serialisatie.
  - [`src/lib/analytics/attention.test.ts`](src/lib/analytics/attention.test.ts) — priority-sortering, NO_ACTION/`low`-severity filter, limit, default message.
  - [`src/lib/analytics/allocation-engine/priority.test.ts`](src/lib/analytics/allocation-engine/priority.test.ts) — hard-blocks (cap + objective minRequirements), RISK_ON momentum boost, DEFENSIVE core-ETF boost, breakdown bounds.
  - [`src/lib/data/cache.test.ts`](src/lib/data/cache.test.ts) — extra cases voor inflight cleanup bij throw, shared rejected promise bij concurrent callers, `clear()` reset.
  - [`src/lib/data/market.test.ts`](src/lib/data/market.test.ts) — extra cases voor invalid date/ticker, endDate<startDate, unknown interval-fallback.

### Changed
- Alle 9 API routes (`/api/ai/explain`, `/api/chat`, `/api/market/*`, `/api/snapshots/*`) gebruiken nu de validator-pipeline (`safeJson` + `expectObject` + typed parsers) en retourneren `jsonError`/`jsonServerError`. Silent body-swallow vervangen door expliciete 400. `GET /api/market/quote` en `GET /api/market/history` valideren nu strict (max tickers, regex-tickers, strikte ISO-dates, `from<=to`, interval whitelist). `POST /api/snapshots/factors` is gecapped op 100 tickers.
- [`src/app/api/market/_shared.ts`](src/app/api/market/_shared.ts) leunt op `parseTickerStrict`; `parseTickers` retourneert nu een `ParsedTickers` resultaat (i.p.v. een array) zodat validatiefouten niet verdwijnen.
- [`src/app/(app)/chat/components/chat-room.tsx`](src/app/(app)/chat/components/chat-room.tsx) en [`src/app/(app)/dashboard/components/snapshot-button.tsx`](src/app/(app)/dashboard/components/snapshot-button.tsx) gebruiken `postJson` i.p.v. inline `fetch`.
- [`src/app/(app)/portfolio/components/import-degiro-dialog.tsx`](src/app/(app)/portfolio/components/import-degiro-dialog.tsx) — max-size 5MB en extension-guard toegevoegd op CSV upload (voorkomt dat een gigabyte- of non-text bestand de browser-tab blokkeert via `file.text()`).
- [`src/app/(app)/backtest/components/equity-chart.tsx`](src/app/(app)/backtest/components/equity-chart.tsx) gebruikt `EmptyChart`.
- [`src/lib/data/regime.ts`](src/lib/data/regime.ts) en [`src/lib/data/strategy-preset-repository.ts`](src/lib/data/strategy-preset-repository.ts) — lokale `toNumber` helpers vervangen door canonieke `toFiniteNumber` uit `@/lib/http/validate`. Eén bron voor NaN/Infinity/Decimal handling.
- Structured logging geïntroduceerd in: [`src/lib/data/quotes.ts`](src/lib/data/quotes.ts), [`src/lib/data/fx.ts`](src/lib/data/fx.ts), [`src/lib/data/history.ts`](src/lib/data/history.ts), [`src/lib/data/regime.ts`](src/lib/data/regime.ts). Raw `console.warn('[mod]', err)` vervangen door `log.warn(scope, msg, fields)`.

### Design regels
- **Runtime-validatie is ondubbelzinnig**: elke POST route decodeert via `safeJson → expectObject → parseX`. Bij elke fout valt de route op een 400 met een specifieke foutboodschap; nergens wordt een malformed body silently als `{}` geïnterpreteerd.
- **Eén error-shape**: `{ error: string, code?: string }` voor elke API route. Client helpers (`postJson`) mappen dit uniform naar `ApiFailure`. UI-componenten tonen direct `result.error`.
- **NaN is altijd null of een 400**: `toFiniteNumber` én `parseBoundedNumber` garanderen dat geen `NaN`/`Infinity` stroomafwaarts in berekeningen of DB-writes terechtkomt.
- **Geen zod in deze ronde**: bundle-overhead + onze inbound surface is klein. Helpers zijn trivial testbaar en pure TS; wél makkelijk te vervangen als schema-sharing met forms nodig wordt.
- **Server/client barrel split**: `@/lib/http/index.ts` is server-only (leunt op `next/server`). Client componenten importeren `@/lib/http/client` direct om geen server-bundle in de browser te krijgen.

### Aannames
- Authenticatie blijft in deze ronde de demo-user shortcut. De routes zijn gehard tegen malformed input maar nog niet tegen cross-user forgery; dat is een grotere auth-beslissing die separaat hoort.
- De stub-provider is deterministisch; tests kunnen hem zonder mock aanroepen. Zodra we op een live provider switchen, moeten we `AbortController` + timeout toevoegen — niet in scope nu.
- `MAX_TICKERS_PER_REQUEST = 50` (market routes) en `MAX_TICKERS_PER_RUN = 100` (factor snapshots) zijn conservatieve defaults; snel aan te passen via een policy-constante.

## [Unreleased] - 2026-04-24 · Snapshotting & historiek

### Added
- `src/lib/analytics/snapshot.ts` — pure builders die engine-output omzetten naar platte snapshot-rijen:
  - `buildPortfolioSnapshotData({view, regime, plan, capturedAt})` → `PortfolioSnapshotData` met typed headline-kolommen (`totalValue`, `volatility`, `drawdown`, `regimeLabel`, `healthGrade`) + flexibele `metrics` Json (avg factor composite, largest position, allocation by currency, risk score, plan deployment).
  - `buildFactorSnapshotData({ticker, factorScore, fundamentals, source, capturedAt})` → `FactorSnapshotData` voor de `(ticker, capturedAt, model)` unique-key.
  - `mapRegimeToLabel` / `mapRegimeStateToLabel` — mapt `MarketRegimeStance` én de legacy `MarketRegimeState` naar de Prisma `RegimeLabel` enum.
- `src/lib/data/snapshot-repository.ts` — `portfolioSnapshotRepository` (`create`, `listForPortfolio`, `latest`) en `factorSnapshotRepository` (`upsertMany` via `$transaction` op de composite key, `listForTicker`). Maps Prisma Decimal → number.
- `src/lib/services/snapshot-service.ts` — orchestrator met drie exports:
  - `snapshotPortfolio({portfolioId, at?})` — draait `buildPortfolioView` + `fetchRegimeInputs` + `computeRegimeScore` + `generateAllocationPlan` in parallel en persisteert één snapshot.
  - `snapshotFactors({tickers?, at?, model?})` — default = `DEFAULT_SCREENER_UNIVERSE`, parallel fundamentals+history per ticker, idempotent upsert.
  - `runScheduledSnapshots({userEmail, at?})` — bundelt portfolio- + factor-snapshots per user zodat een toekomstige cron-handler 'm rechtstreeks kan aanroepen.
- `src/app/api/snapshots/portfolio/route.ts` — `POST /api/snapshots/portfolio` met optionele body `{portfolioId?, userEmail?}`, valt terug op de primary portfolio van de demo-user en triggert `revalidatePath('/dashboard')` + `/portfolio`.
- `src/app/api/snapshots/factors/route.ts` — `POST /api/snapshots/factors` met optionele `{tickers?, model?}`, retourneert `{written, skipped}`.
- `src/app/(app)/dashboard/components/history-charts.tsx` — vijf Recharts in een 2-koloms grid: portefeuille-waarde, drawdown, valuta-exposure (stacked area), gemiddelde factor-composite en grootste positie (met ticker in de tooltip). Empty-state bij nul snapshots.
- `src/app/(app)/dashboard/components/snapshot-button.tsx` — client-actie (`useTransition` + `router.refresh()`) die `/api/snapshots/portfolio` aanroept en UI-feedback geeft (loading / ok / error).
- `src/lib/analytics/snapshot.test.ts` — tests voor afronding, null-fallbacks, factor-data mapping en beide regime-mappings.

### Changed
- `src/lib/analytics/index.ts` — re-exporteert `./snapshot`.
- `src/lib/data/index.ts` — re-exporteert `portfolioSnapshotRepository`, `factorSnapshotRepository` + bijbehorende row-types.
- `src/app/(app)/dashboard/page.tsx` — laadt snapshots parallel met view/regime/screener en rendert een nieuwe `Historiek`-sectie met `HistoryCharts` + `SnapshotButton`.

### Design regels
- **Engine-output is de enige bron**: snapshot-builders rekenen zelf niets opnieuw uit; ze lezen wat `buildPortfolioView`, `computeRegimeScore` en `generateAllocationPlan` al hebben uitgerekend. Geen parallelle berekening van drawdown of volatility.
- **Idempotent & job-vriendelijk**: factor-upserts draaien in één `$transaction` op `(ticker, capturedAt, model)` zodat een scheduled run nooit dubbele rijen produceert. `runScheduledSnapshots` is klaar voor een Vercel Cron / GitHub Actions trigger zonder extra refactor.
- **Typed kolommen + flexibele metrics**: headline-velden blijven direct queryable (handig voor SQL-rapporten), signalen met hogere bewegingsvrijheid (largest position, allocation by currency, plan deployment) zitten in `metrics` Json zodat het schema niet per ronde hoeft te migreren.
- **Stance → label mapping is één plek**: de UI gebruikt `MarketRegimeStance` (RISK_ON/NEUTRAL/DEFENSIVE), de database gebruikt `RegimeLabel` (EXPANSION/SLOWDOWN/RECESSION/…). De mapping leeft uitsluitend in `snapshot.ts` zodat time-series-views consistent blijven.
- **Charts delen één dataset**: `HistoryCharts` transformeert de snapshot-rijen één keer naar een gemeenschappelijke dataset; per chart alleen een select op de juiste key. Goedkoop om later een 6e chart toe te voegen.

### API voorbeelden
`POST /api/snapshots/portfolio` (leeg body = primary portfolio van demo-user):
```json
{ "snapshotId": "ck…", "portfolioId": "p1" }
```
`POST /api/snapshots/factors` (optioneel `{ "tickers": ["ASML.AS", "MSFT"], "model": "beleggeriq.v1" }`):
```json
{ "written": 12, "skipped": 0 }
```

## [Unreleased] - 2026-04-24 · Chat v2

### Added
- `src/types/chat.ts` — `ChatMessage`, `ChatContext`, `ChatRequestBody`, `ChatResponseBody` + `ChatRole` en `ChatIntent` types.
- `src/lib/ai/chat.ts` — intent-detection (5 use cases + fallback), ticker-extractie, `buildAssistantResponse` dispatcher (leunt op `explain()` uit de AI layer), `buildWelcomeMessage` en een `fallback` builder die uitlegt wat wél ondersteund wordt.
- `src/lib/ai/chat.test.ts` — tests voor alle intents, ticker-extractie, out-of-scope fallback en welcome-message shape.
- `src/app/api/chat/route.ts` — `POST /api/chat` met runtime validatie en consistente error-shape; laadt context opnieuw per call zodat chips altijd verse snapshot tonen.
- `src/app/(app)/chat/build-chat-context.ts` — `loadChatContext(email)` bundelt `buildPortfolioView` + `fetchRegimeInputs` + `computeRegimeScore` + `generateAllocationPlan` in één async call en retourneert een compacte `ChatContext`.
- Chat UI componenten (`src/app/(app)/chat/components/`):
  - `context-chips.tsx` — 5–6 chips met portfolio value, regime stance, risk severity, health grade, maandplan en grootste positie.
  - `quick-prompts.tsx` — 5 preset-prompts die 1-op-1 mappen naar use cases, direct verzenden bij klik.
  - `chat-room.tsx` (client) — message history, typing indicator, input + send knop, quick prompts, ContextChips die ververst met elke response.
- `src/app/(app)/chat/page.tsx` — server component, laadt context + welcome message, rendert `ChatRoom`. Empty state bij geen portefeuille.
- `src/app/(app)/chat/loading.tsx` — skeleton.

### Changed
- `src/types/index.ts` + `src/lib/ai/index.ts` — re-exporteren de nieuwe chat types en chat module.

### Design regels
- **Engine-first**: Chat is een natuurlijke-taal front voor de `explain()` layer uit de vorige ronde. Intents zijn deterministisch keyword-matched; het antwoord komt letterlijk uit de engines. Geen LLM-inferentie → nul kans op verzonnen stocks of cijfers.
- **Fallback maakt scope expliciet**: "kan ik niet beantwoorden" antwoord somt op wat wél kan. UI leidt de gebruiker niet het moeras in.
- **Context ververst per antwoord**: `/api/chat` geeft elke keer een nieuwe `ChatContext`-snapshot terug; chips reflecteren altijd de meest recente engine-staat.
- **Ticker-extractie**: uit vrije tekst pikken we een ticker (bv. "ASML" of "ASML.AS") en gebruiken die als target voor holding_score / fragile_concentration. Als geen ticker wordt genoemd, valt de engine terug op de grootste positie.
- **Typing indicator** (drie dots) simuleert reaction tijd zonder echte LLM streaming; houdt UX rustig.

## [Unreleased] - 2026-04-24 · AI explain layer

### Added
- `src/types/ai.ts` — discriminated-union types voor de explain layer: `ExplainUseCase`, `ExplainConfidence`, `ExplainContext` (5 varianten), `ExplainResponse` met `usedContextKeys` voor audit.
- `src/lib/ai/prompts.ts` — shared `EXPLAIN_SYSTEM_PROMPT` met strikte guardrails + `buildExplainPrompt(context)` dat per use-case een user prompt bouwt met engine-output als JSON-block. Pad voor LLM-upgrade.
- `src/lib/ai/explainers.ts` — deterministische `explain(context)` + 5 use-case specifieke functies (`explainHoldingScore`, `explainFragileConcentration`, `explainBuyPlan`, `explainMarketRegime`, `explainPortfolioRisks`). Template-based zodat er per constructie geen nieuwe cijfers verzonnen kunnen worden; rangorde wordt letterlijk uit de engine overgenomen.
- `src/app/api/ai/explain/route.ts` — `POST /api/ai/explain` met runtime validatie per use-case (zonder extra dependency), optionele `includePrompt` voor debug/LLM-handoff.
- `src/lib/ai/explainers.test.ts` — tests voor alle 5 use cases: composite score weergave, confidence tiers, lege-plan cash-hold, HEALTHY-winner narrative, regime narrative pass-through, portfolio risks top-3 flags + cijfer-integriteit.

### Changed
- `src/types/index.ts` + `src/lib/ai/index.ts` — re-exporteren de nieuwe AI-types en modules.

### Guardrails
- **Engine-first**: elke explain-response is gebouwd over `ExplainContext` die exact één-op-één engine-output bevat. Geen externe LLM call in deze ronde → nul kans op verzonnen cijfers of vervangen rangorde.
- **`usedContextKeys`** in response maakt expliciet welke engine-velden zijn gelezen — directe audit trail.
- **Confidence-tier** wordt afgeleid uit coverage/aantal datapunten; lage confidence triggert een `disclaimer`.
- **Prompts zijn klaar voor LLM-upgrade**: zodra een `LlmClient` bolt-on komt, raakt het de bestaande API-shape niet.

### API voorbeeld
`POST /api/ai/explain` met body:
```json
{
  "context": {
    "useCase": "holding_score",
    "ticker": "ASML.AS",
    "name": "ASML Holding",
    "factorScore": {
      "ticker": "ASML.AS",
      "asOf": "2024-04-01T00:00:00.000Z",
      "subScores": { "quality": 85, "value": 40, "momentum": 65, "lowVol": 60 },
      "composite": 72,
      "confidence": 0.8,
      "rationales": {
        "quality": ["Sterke ROIC (22%)."],
        "value": ["P/E 22 — marktconform."],
        "momentum": ["12m rendement +28%."],
        "lowVol": ["Beta 0.9 — rond markt."]
      }
    }
  }
}
```
Levert:
```json
{
  "useCase": "holding_score",
  "headline": "ASML Holding (ASML.AS) · composite 72/100 — bovengemiddeld",
  "narrative": "Composite 72/100 — bovengemiddeld profiel volgens de factor engine. Quality (85) trekt de score omhoog. Value (40) drukt de score.",
  "bullets": [
    "Quality 85/100 — Sterke ROIC (22%).",
    "Momentum 65/100 — 12m rendement +28%.",
    "Value 40/100 — P/E 22 — marktconform."
  ],
  "confidence": "high",
  "usedContextKeys": [
    "factorScore.composite",
    "factorScore.subScores",
    "factorScore.rationales",
    "factorScore.confidence"
  ]
}
```

## [Unreleased] - 2026-04-24 · Strategy Lab

### Added
- `src/lib/analytics/backtest/custom-strategy.ts` — `buildCustomStrategy(config)` factory met `CustomStrategyConfig`. Scoring volgt de factor-gewichten (quality/value/momentum/lowVol), filtert optioneel op dividend-signaal, kan dynamisch 12m-momentum gebruiken en respecteert maxSectorWeight + maxPositionWeight greedy. `defensiveOverlay` reserveert 20% cash door alle position-weights te schalen.
- `src/lib/analytics/backtest/custom-strategy.test.ts` — unit tests voor dividend-filter, defensive overlay, sector-cap enforcement en ontbrekende factor scores.
- `src/lib/data/strategy-preset-repository.ts` — Prisma CRUD wrapper met `listForUserEmail`, `findBySlug`, `save`, `deleteById` + `presetToCustomConfig` helper. Factor weights gaan in `factorWeights` Json; toggles en `maxSectorWeight` in `universeFilter.toggles` / `universeFilter.limits`.
- `src/app/(app)/strategy-lab/actions.ts` — server actions `savePreset` en `deletePreset`. Upsert op slug; `revalidatePath('/strategy-lab')` + `/backtest`.
- Strategy Lab componenten:
  - `components/config-form.tsx` (client) — volledige instellingenform met weight-sliders, toggle-pillen, number fields voor limits, rebalance select, toast feedback en "Opslaan/Opslaan als nieuw/Backtest" knoppen.
  - `components/preset-list.tsx` (client) — sidebar met eigen en publieke presets, delete-knop voor eigen items, link-based activering via `?preset=<slug>`.
- `src/app/(app)/strategy-lab/page.tsx` — server orchestrator: parse `?preset=<slug>`, fetch presets + actieve preset parallel, render 2-koloms layout.
- `src/app/(app)/strategy-lab/loading.tsx` — skeleton.

### Changed
- `src/lib/analytics/backtest/index.ts` — re-exporteert `./custom-strategy`.
- `src/lib/analytics/index.ts` — re-exporteert `buildCustomStrategy` + config-types.
- `src/lib/data/index.ts` — re-exporteert `strategyPresetRepository` + `presetToCustomConfig` + types.
- `src/app/(app)/backtest/prepare-inputs.ts` — strategy resolution uitgebreid naar DB: als slug niet in `STRATEGIES` zit, wordt `strategyPresetRepository.findBySlug` geraadpleegd en via `buildCustomStrategy` in een `StrategyFn` gewrapt. Rebalance frequentie, maxPositions en maxPositionWeight worden uit de preset overgenomen.

### Design regels
- **URL `?preset=<slug>`** als bron van waarheid — elke preset is shareable en cache-vriendelijk.
- **Strikte eigenaarsregels**: publieke presets zijn read-only, alleen de demo-eigenaar kan zijn eigen presets verwijderen.
- **Weight-som hoeft niet 1 te zijn**: de engine normaliseert intern. UI toont alleen de som zodat de gebruiker proporties begrijpt.
- **Config-form = serialiseerbare payload**: de `SavePresetActionInput` map exact 1-op-1 op `CustomStrategyConfig` + metadata, zodat de server action geen extra transformaties hoeft.

## [Unreleased] - 2026-04-24 · Backtest pagina

### Added
- `src/app/(app)/backtest/filters-serde.ts` — URL-serde met `parseBacktestFilters`, `filtersToSearchParams`, `periodRangeFromYears` en `DEFAULT_BACKTEST_FILTERS`. Ondersteunt 4 parameters (strategy / benchmark / years / cost) met expliciete defaults en supported-lijsten voor periode en benchmark.
- `src/app/(app)/backtest/prepare-inputs.ts` — server-side data prep: parallel `getHistory` + `getFundamentals` voor elk universum-lid, downsample naar maandelijkse close, compute factor score via `scoreFactors`, wrap in `BacktestUniverseEntry`. Benchmark wordt apart geladen.
- `src/app/(app)/backtest/components/filters-form.tsx` (client) — URL-driven config form met 4 velden: strategie-dropdown (feed vanuit `STRATEGIES`), benchmark-dropdown (IWDA/VWCE/none), periode-dropdown (1/2/3/5 jaar), commissionBps input. "Backtest draaien" knop pusht naar URL.
- `src/app/(app)/backtest/components/metrics-cards.tsx` — 5 MetricCards: CAGR, volatility, max drawdown, Sharpe (+ Sortino helper), Strategie vs Benchmark delta.
- `src/app/(app)/backtest/components/equity-chart.tsx` (client) — Recharts `LineChart` met strategie-lijn (solid, primary hue) en benchmark-lijn (dashed, muted hue). Responsive container, dark-theme tooltip, X-axis toont YYYY-MM labels.
- `src/app/(app)/backtest/components/disclaimer.tsx` — feitelijke historische-simulatie disclaimer.
- `src/app/(app)/backtest/loading.tsx` — skeleton voor form + 5 cards + chart + disclaimer.
- `src/app/(app)/backtest/page.tsx` — server component orchestrator: parse filters → prepare inputs → `runBacktest` → render. Gracefully afhandelt geen-data en te-weinig-observaties cases met eigen `EmptyState`.

### Design principes
- **URL als bron van waarheid** zodat backtests shareable en cache-vriendelijk zijn.
- **Rustige Recharts styling** — geen animaties of glow, dunne grid, muted labels, dashed benchmark-lijn voor visuele hierarchie.
- **Feitelijke disclaimer** onderaan — "gereedschap, geen advies" — in lijn met de rest van de app.
- **No-logic components**: `MetricsCards` en `EquityChart` krijgen enkel serialisable data uit het `BacktestResult` object. Alle engine- en prep-logica zit in de server files.

## [Unreleased] - 2026-04-24 · Backtest engine

### Added
- `src/lib/analytics/backtest/metrics.ts` — pure metric-wiskunde: `monthlyReturnsFromValues`, `computeTotalReturn`, `computeCagrFromValues`, `computeCagrFromReturns`, `computeAnnualizedVolatility`, `computeMaxDrawdown`, `computeSharpeRatio`, `computeSortinoRatio`, `computeCalmarRatio`, `computeWinRate`, `computeBacktestMetrics` (orchestrator). Maandelijkse basis, annualisatie via √12.
- `src/lib/analytics/backtest/strategies.ts` — strategie-abstractie (`StrategyContext`, `StrategyFn`, `StrategyDefinition`) + vijf concrete implementaties:
  - `equalWeightStrategy`
  - `qualityStrategy`
  - `qualityValueStrategy`
  - `qualityMomentumStrategy` (momentum dynamisch uit prijsreeks)
  - `regimeAwareStrategy` (DEFENSIVE → quality+lowVol met 20% cash buffer; RISK_ON → quality+momentum; NEUTRAL → composite)
  - `STRATEGIES` registry + `getStrategyBySlug` + helpers `topNEqualWeight`, `computeMomentum12m`.
- `src/lib/analytics/backtest/engine.ts` — `runBacktest` orchestrator. Maandelijkse loop: mark-to-market → return opslag (contribution-vrij) → contribution → rebalance (bij frequentie) → equity point. Transactiekosten = commissionBps × turnover. Benchmark wordt genormaliseerd naar initialCapital en per-maand op `EquityPoint.benchmark` gezet; `benchmark` output bevat `BenchmarkComparison` metrics.
- `src/lib/analytics/backtest/index.ts` — barrel.
- Tests: `metrics.test.ts` (alle 9 metrics + integration) en `engine.test.ts` (equal-weight groeit met prijs, quality pikt top-scorers, kosten drukken eindwaarde, regime-tag doorvoer, benchmark comparison, lege input).

### Changed
- `src/lib/analytics/index.ts` — selectieve re-export van `./backtest` om collision op `computeMaxDrawdown` met risk-engine te vermijden. Callers die dat specifiek nodig hebben importeren direct uit `@/lib/analytics/backtest/metrics`.

### Aannames
- **Maandelijkse data**: één observatie per ticker per maand. Engine leest de prijsreeks en valt terug op laatst-bekende prijs als een maand ontbreekt.
- **Fractional shares** toegestaan — geen integer-ronding. Rebalance levert altijd precies de target weight.
- **Transactiekosten** uitsluitend via `commissionBps` × |trade value|. Geen bid/ask spread, geen taxes.
- **Static fundamentals**: quality/value/lowVol sub-scores zijn een snapshot; alleen momentum wordt per rebalance opnieuw uit de prijsreeks gehaald. Documented in `strategies.ts`.
- **Time-weighted returns** voor metrics: returns worden vóór contributie geregistreerd, zodat CAGR/Sharpe niet worden opgepompt door maandelijkse inleg.
- **Benchmark**: rebased naar `initialCapital`. `totalReturn`, `cagr`, `volatility`, `maxDrawdown` worden voor de benchmark zelf herberekend.

## [Unreleased] - 2026-04-24 · Dashboard v2

### Added
- `src/lib/analytics/attention.ts` — `buildAttentionItems` + `countAttentionBySeverity` + types verhuisd uit `/risico` naar de gedeelde analytics-laag zodat dashboard en risicopagina dezelfde prioritering gebruiken.
- Dashboard componenten onder `src/app/(app)/dashboard/components/`:
  - `top-stats.tsx` — 4 metric cards (totale waarde, health grade, marktregime, grootste positie).
  - `next-action-card.tsx` — "Wat nu doen" hoofdactieblok met top-4 geprioriteerde attention-items, gedifferentieerde empty state en link naar /risico.
  - `allocation-cards.tsx` — `HoldingsAllocationCard` (top posities met gewichts-bars) en `CurrencyAllocationCard` (base-highlight + bars).
  - `risks-and-opportunities.tsx` — `TopRisksCard` (top-3 risk flags) en `TopOpportunitiesCard` (top-3 uit screener, leidt naar /screener).
  - `buy-plan-preview-card.tsx` — mini maandbeslissing met deployment total, top-3 recommendations en CTA naar /maandbeslissing; aparte kalme staat bij cash-hold.
- `src/app/(app)/dashboard/loading.tsx` — skeleton die de 5-row layout spiegelt.

### Changed
- `src/app/(app)/dashboard/page.tsx` — volledig herschreven als cockpit:
  - Parallel fetch van `buildPortfolioView`, `fetchRegimeInputs` en `runScreen({ limit: 3 })`.
  - `generateAllocationPlan` synchroon daarna met policy + objective uit `findUserContextByEmail`.
  - Layout: 4 metric cards → next action → regime + holdings → currency + risks → opportunities + buy plan → duiding.
- `src/app/(app)/risico/build-attention.ts` is nu een BC-shim die re-exporteert uit `@/lib/analytics/attention`.
- `src/lib/analytics/index.ts` — re-exporteert `./attention`.

### Design principes
- **Cockpit boven executive summary**: 5 rijen met eigen focus — gebruiker ziet direct waar risico en kansen zitten plus wat deze maand te doen.
- **Consistente deep-link pattern**: elke card met rijkere context heeft een "→ Meer / Open / Risicocentrum" knop naar de volledige pagina.
- **Rustig kleurenpalet**: destructive rood alleen voor high/critical, primary blauw voor neutraal-informatief, success groen voor positief.
- **Stack-veilig**: analytics-modules worden ongewijzigd ingezet — dashboard is puur composition over bestaande engines.

## [Unreleased] - 2026-04-24 · Maandbeslissing pagina

### Added
- `src/app/(app)/maandbeslissing/build-plan-input.ts` — URL-serde voor budget + bias + core-ETF, plus `biasBudgetMultiplier` die defensieve voorkeur (×0.85) op het budget toepast bovenop de engine-adjustments.
- `src/app/(app)/maandbeslissing/components/plan-hero.tsx` — hero met budget, deployed amount, recommendations-teller en stance-badge.
- `src/app/(app)/maandbeslissing/components/inputs-form.tsx` (client) — URL-driven form: budget-input in base currency, 3-way bias toggle, core-ETF switch. Push naar searchParams triggert server re-render.
- `src/app/(app)/maandbeslissing/components/recommendations-grid.tsx` — 1–5 recommendation cards met rank, actie-badge (Nieuwe positie / Bijkopen), bedrag + ~stuks, target weight, ScorePill, conviction + priority.
- `src/app/(app)/maandbeslissing/components/simulation-compare.tsx` — before/after tabel met delta-richting (groen/rood/neutraal) voor totale waarde, cash, aantal posities, grootste positie, vreemde valuta en top-sector.
- `src/app/(app)/maandbeslissing/components/warnings-banner.tsx` — niet-alarmistische banner met warnings of expliciete cash-hold uitleg als er geen recommendations zijn.
- `src/app/(app)/maandbeslissing/loading.tsx` — skeleton die hero + form + 3 cards + simulation spiegelt.
- `src/app/(app)/maandbeslissing/page.tsx` — server component die `findUserContextByEmail` + `buildPortfolioView` + `fetchRegimeInputs` + `generateAllocationPlan` combineert tot het volledige maandplan.

### Changed
- `src/lib/data/portfolio-repository.ts` — nieuwe helper `findUserContextByEmail` die user + primary portfolio + UserProfile (inclusief policy en objective) in één query ophaalt. Voegt `mapProfile` helper toe die de Prisma-row naar het domeintype converteert.

### Design regels
- **Eén hoofdactie**: "Plan genereren" knop in de InputsForm. Gereset = terug naar schone URL.
- **URL als bron van waarheid** voor inputs (`budget`, `bias`, `coreEtf`) — shareable en reproducible tussen sessies.
- **Niet-alarmistisch**: cash-hold + warnings in dezelfde rustige tone als andere pages. Geen waarschuwings-icons die de pagina domineren.
- **Premium + leeg**: hero + form + grid + simulation + optionele signalen. Iedere sectie heeft witruimte; geen dashboards met 8 widgets tegelijk.

## [Unreleased] - 2026-04-24 · Monthly buy engine

### Added
- `src/lib/analytics/allocation-engine/thresholds.ts` — `AllocationThresholds` (minOrderAmount, maxRecommendations, cashBuffer, caps, defensiveHoldback, …) + `DEFAULT_ALLOCATION_THRESHOLDS` en `thresholdsFromPolicy` die `PolicySettings` (`maxPositionWeight`, `maxSectorWeight`, `cashBufferPct`, `minFactorComposite`) doorzet.
- `src/lib/analytics/allocation-engine/context.ts` — `regimeAdjustment(MarketRegimeScore)` (budget-multiplier, factor-biases, core-ETF voorkeur, warnings) en `objectiveTilt(InvestmentObjective)` (factor-weights, minimum sub-score eisen, dividend-vereiste, max-vol cap).
- `src/lib/analytics/allocation-engine/candidates.ts` — `determineBuyCandidates` + `DEFAULT_CORE_ETF`. Filtert excluded tickers, asset-class restricties, positions op cap, onder composite-drempel, zonder dividend-signaal voor INCOME en sector-caps. Core-ETF fallback bij dunne spreiding of alle candidates op cap.
- `src/lib/analytics/allocation-engine/priority.ts` — `scoreAllocationPriority` met 5 componenten (factor 40%, underweight 20%, regime 20%, objective 10%, concentration 10%). Hard-blocks op policy/profile min-requirements. Rationale builder voor UI/explain.
- `src/lib/analytics/allocation-engine/simulate.ts` — `simulatePostBuyPortfolio` projecteert totaal, cash, positie-count, largest weight, foreign exposure en top-sector na uitvoering van de recommendations.
- `src/lib/analytics/allocation-engine/engine.ts` — `generateAllocationPlan` orchestrator. Berekent budget (contribution + cash boven buffer, regime-multiplier, defensieve holdback), filtert + scored candidates, verdeelt budget met headroom-caps en min-order, simuleert, en bouwt `AllocationPlan` met warnings + summary + coreEtfUsed.
- `src/lib/analytics/allocation-engine/engine.test.ts` dekt happy path, hold-cash warning bij posities op cap, DEFENSIVE budget-reductie, policy maxPositionWeight, INCOME dividend-filter, en post-buy simulation.

### Changed
- `src/types/allocation.ts` — nieuwe `PostBuySimulation` + extra optionele velden op `AllocationPlan` (`budget`, `deployedAmount`, `cashReserved`, `warnings`, `simulation`, `regimeScore`, `objective`, `coreEtfUsed`). Non-breaking.
- `src/lib/analytics/index.ts` — selectieve re-export van allocation-engine (voorkomt `thresholdsFromPolicy`-collision met risk- en rebalance-engine).

### Design regels
- **Budget = contribution + max(0, cash − buffer)** waarop regime-multiplier (DEFENSIVE 0.7) en extra holdback (25%) pas toegepast worden. Dat maakt het gedrag expliciet uitlegbaar.
- **Caps respecteren**: elke recommendation wordt afgetopt op `headroom × totalValue`. Residual wordt pas in tweede pass herverdeeld over uncapped candidates.
- **Let winners run**: bestaande positie gaat op "add", nieuwe positie op "buy". Heavy-concentration TRIM logica blijft in de rebalance engine; deze engine trimt niet.
- **Defensieve stance** verhoogt de relatieve waarde van de core-ETF via een bias in de regime-component (+15 punten) en het budget wordt geknipt.
- **Explainability first**: `AllocationRecommendation.rationale` + `factorScore` + `priority` geven de AI/UI alles om de beslissing uit te leggen.

## [Unreleased] - 2026-04-23 · Market regime score

### Added
- `src/lib/analytics/regime/scoring.ts` — per-driver scorers voor waardering, trend/breadth, volatiliteit, rente en credit-spread. Elk driver levert score 0..100 (hoger = meer risk-on) of `null` bij ontbrekende data. Transparante thresholds per driver.
- `src/lib/analytics/regime/engine.ts` — `computeRegimeScore` orchestrator en `stanceFromScore` helper. Herverdelt gewichten over actieve drivers bij ontbrekende data, berekent `confidence`, bouwt Nederlandse narrative met supportive + drag drivers.
- `src/lib/analytics/regime/index.ts` — barrel.
- `src/lib/analytics/regime/engine.test.ts` — stance-mapping, individuele driver-randgevallen, orchestrator flows (risk-on, defensief, partieel, narrative).
- `src/lib/data/regime.ts` — `fetchRegimeInputs` die de laatste `MarketSnapshot` uit Prisma leest, headline-kolommen gebruikt en extra velden uit de flexibele `indicators` Json. Gecached met 5-min TTL.
- `src/app/api/market/regime/route.ts` — `GET /api/market/regime` retourneert `{ regime, inputs, source }` met short-cache headers.
- `src/app/(app)/dashboard/components/market-regime-card.tsx` — dashboard-widget met stance/icoon, score, confidence, narrative en per-driver progress bars.

### Changed
- `src/types/regime.ts` — nieuwe types `MarketRegimeStance` (`RISK_ON`/`NEUTRAL`/`DEFENSIVE`), `RegimeSubScore` en `MarketRegimeScore`.
- `src/lib/analytics/index.ts` — re-export `./regime`.
- `src/lib/data/index.ts` — exporteert `fetchRegimeInputs` + type.
- `src/app/(app)/dashboard/page.tsx` — fetch `regime` parallel met `buildPortfolioView`, toont `MarketRegimeCard` naast de top-posities (2-col grid op lg).

### Design regels
- **Higher = risk-on** als consistent: waardering goedkoop, lage vol, lage rente, tight spreads → hoger cijfer. Stance-drempels: ≤ 35 = DEFENSIVE, ≥ 65 = RISK_ON, anders NEUTRAL.
- **Confidence ≠ zekerheid**: uitsluitend fractie van driver-gewicht waarvoor data aanwezig was. UI toont "Coverage X%".
- **Narrative blijft feitelijk**: één zin per supportive + drag driver, geen alarmisme.
- **Partiële data veilig**: engine levert NEUTRAL 50 met confidence 0 als geen enkele driver data heeft; alloctor kan hierop schakelen.

## [Unreleased] - 2026-04-23 · Risicopagina /risico

### Added
- `src/lib/analytics/scenario.ts` — pure scenario-engine. `applyFxShock`, `applyMarketShock`, `applySectorShock` als bouwstenen plus `runDefaultScenarios` die ~5 scenario's produceert (base +/-10%, markt -20% en +15%, top-sector −30%). `ScenarioResult` bevat projectedValue, delta en deltaPct.
- `src/lib/analytics/scenario.test.ts` met dekking voor FX-shocks (base vs. vreemde posities), market-shocks (cash blijft flat), sector-shocks (alleen doelsector) en de default-set.
- `src/app/(app)/risico/severity.ts` — gedeelde `toneForSeverity`, tone-classes en Nederlandse labels.
- `src/app/(app)/risico/build-attention.ts` — `buildAttentionItems(risk, rebalance)` die RECONSIDER/TRIM_HEAVY-recommendations en high/critical risk flags combineert tot een geprioriteerde lijst (max 6).
- Risicopagina componenten (server):
  - `components/risk-top-summary.tsx` — hero card met severity-icoon, overall score en 3 mini-stats.
  - `components/top-risk-flags.tsx` — top 5 flags met rustige severity-badges.
  - `components/exposure-cards.tsx` — `ConcentrationOverviewCard`, `CurrencyExposureCard`, `SectorExposureCard` met allocation-bars.
  - `components/risk-positions-table.tsx` — sorteert op risk score, toont concentratie/volatility klassen en FX-bijdrage.
  - `components/scenario-panel.tsx` — tabel met 4–5 stress-scenario's en delta-kleuring.
  - `components/attention-summary.tsx` — eindsamenvatting "wat vraagt aandacht".
- `src/app/(app)/risico/loading.tsx` — skeleton die het 5-block layout spiegelt.
- `src/app/(app)/risico/page.tsx` — nieuwe server component die `buildPortfolioView` + `runDefaultScenarios` + `buildAttentionItems` combineert tot het risicocentrum.

### Changed
- `src/lib/analytics/index.ts` — re-export van `./scenario`.

### Design principes
- Toon blijft rustig: alleen `high`/`critical` krijgen destructive rood, `moderate`/`elevated` warning-geel, rest muted.
- Scenario-panel eindigt met "Illustratief — geen voorspelling" om alarmistische framing te vermijden.
- Layout respondent: hero full-width, exposure 3-col → 1-col onder `lg`, positions + flags 2-col → 1-col onder `xl`.

## [Unreleased] - 2026-04-23 · Rebalance engine

### Added
- `src/types/rebalance.ts` — domeintypes: `ConcentrationType` (HEALTHY/NEUTRAL/FRAGILE), `CyclicalityLevel`, `RebalanceAction` (NO_ACTION/TRIM_LIGHT/TRIM_HEAVY/RECONSIDER), `ConcentrationAssessment`, `RebalanceFactorSnapshot`, `RebalanceRecommendation`, `RebalancePlan`.
- `src/lib/analytics/rebalance-engine/sector-cyclicality.ts` — statische mapping sector → cyclicality level en `isCyclical` helper.
- `src/lib/analytics/rebalance-engine/thresholds.ts` — `RebalanceThresholds`, `DEFAULT_REBALANCE_THRESHOLDS` (maxPositionWeight 10%, healthyRunMultiplier 2.0, fragileHeavyMultiplier 1.5, reconsider-score 80) en `thresholdsFromPolicy`.
- `src/lib/analytics/rebalance-engine/concentration-classifier.ts` — `classifyConcentrationType(input)` met fragility-scoring. Verwerkt positionWeight, quality, momentum, composite, volatility/lowVolScore, sector-cyclicality. Levert `ConcentrationClassification` incl. reasons en cyclicality.
- `src/lib/analytics/rebalance-engine/engine.ts` — `buildRebalancePlan` orchestrator. Per-holding: classify + action rules ("let winners run") + target weight + delta amount + indicatief aantal stuks + reasons + confidence. Plan sort: significante acties bovenaan.
- `src/lib/analytics/rebalance-engine/concentration-classifier.test.ts` en `engine.test.ts` dekken healthy-winner, fragile-boven-cap, RECONSIDER, NEUTRAL, sort-volgorde en policy override.

### Changed
- `src/lib/analytics/portfolio-view.ts` — `PortfolioView.rebalance: RebalancePlan` toegevoegd. `BuildPortfolioViewOptions` accepteert `policy` (PolicySettings) en `rebalanceThresholds`.
- `src/lib/analytics/index.ts` — selectieve re-export van rebalance-engine (alleen publieke API; voorkomt naming-collision op `thresholdsFromPolicy` met risk-engine).
- `src/types/index.ts` — re-export van `rebalance`.

### Design regels
- **Winners niet blind verkopen**: HEALTHY positie boven policy-cap → NO_ACTION; pas TRIM_LIGHT vanaf 2× cap (richting 1.7× cap). FRAGILE posities volgen conservatieve regels en TRIM_HEAVY triggert vanaf 1.5× cap naar 0.75× cap.
- **RECONSIDER** triggert bij fragility ≥ 80 (zeer zwak profiel), ongeacht positiegewicht — deze positie past simpelweg niet bij het beleggersprofiel.
- **Uitlegbaarheid**: elke recommendation bevat `factorSnapshot` (quality/value/momentum/composite/volatility/sector/cyclicality) plus een gecombineerde `reasons[]` lijst (action-reasons eerst, dan classifier-reasons). Directe input voor de AI-explain layer.
- **Confidence cap**: maximaal 0.9, zodat UI altijd menselijke review aanmoedigt.

## [Unreleased] - 2026-04-23 · Risk engine

### Added
- `src/lib/analytics/risk-engine/thresholds.ts` — `RiskThresholds` type + `DEFAULT_RISK_THRESHOLDS` + `thresholdsFromPolicy(policySettings)` plus shared classifiers (`classify`, `classifyInverse`, `continuousRiskScore`, `classFromScore`, `CoreRiskClass`).
- `src/lib/analytics/risk-engine/concentration.ts` — `computeHhi`, `computeTop5Weight`, `classifyPositionWeight`, `classifyConcentrationHhi`, `classifyTop5Weight`, `positionConcentrationRiskScore`.
- `src/lib/analytics/risk-engine/volatility.ts` — `classifyVolatility`, `volatilityRiskScore`, `classifyBeta`.
- `src/lib/analytics/risk-engine/drawdown.ts` — `computeMaxDrawdown` (peak-to-trough proxy op historische closes), `classifyDrawdown`, `drawdownRiskScore`.
- `src/lib/analytics/risk-engine/currency.ts` — `computeForeignCurrencyExposure`, `computeCurrencyAllocation`, `currencyContribution` (per positie), `classifyForeignCurrencyExposure`, `currencyRiskScore`.
- `src/lib/analytics/risk-engine/sector.ts` — `computeSectorAllocation`, `topSector`, `classifyTopSectorWeight`, `sectorRiskScore`.
- `src/lib/analytics/risk-engine/warnings.ts` — `buildPortfolioWarnings` met gestandaardiseerde `RiskFlag`-codes (`concentration.position`, `concentration.top5`, `concentration.hhi`, `concentration.sector`, `exposure.currency`, `diversification.positions`) inclusief Nederlandstalige `message`.
- `src/lib/analytics/risk-engine/engine.ts` — `buildRiskReport(input)` orchestrator. Produceert `PortfolioRiskSummary` met per-holding `PositionRiskAnalysis` (concentrationClass, volatilityClass, currencyRiskContribution, riskScore 0..100, riskClass), top-5 weight, top-sector, foreign currency exposure en weighted portfolio `riskScore`/`overallSeverity`.
- Tests: `concentration.test.ts` (HHI + top5 + klassen), `drawdown.test.ts` (proxy + classifier) en `engine.test.ts` (gelijk verdeeld → low, single-position USD → high severity + warnings, top-5 en sector-bias flags, empty safe path).

### Changed
- `src/types/risk.ts` — `PositionRiskAnalysis` krijgt optionele `concentrationClass`, `volatilityClass`, `currencyRiskContribution`, `riskScore`, `riskClass`. `PortfolioRiskSummary` krijgt optionele `top5Weight`, `topSector`, `foreignCurrencyExposure`, `riskScore`. Allemaal non-breaking.
- `src/lib/analytics/portfolio-view.ts` — `PortfolioView.risk: PortfolioRiskSummary` toegevoegd en `buildPortfolioView` roept `buildRiskReport` aan met optionele `riskThresholds` override (kan uit `PolicySettings` komen).
- `src/lib/analytics/index.ts` — her-exporteert `./risk-engine` naast de bestaande simpele `./risk` helpers (geen naming-collisions).

### Design
- Klasse-conventie: engine narrowed `RiskSeverity` naar `"low" | "moderate" | "high"` (laag/gemiddeld/hoog). Positie-score én portfolio-score zijn 0..100 (hoger = meer risico) met continuous interpolatie tussen `low` en `high` thresholds.
- Gewichten: positie-score = 0.4·concentration + 0.4·volatility + 0.2·currency. Portfolio-score = 0.3·HHI + 0.2·top5 + 0.2·sector + 0.2·currency + 0.1·volatility.
- Thresholds zijn volledig overschrijfbaar via `RiskThresholds` of via `thresholdsFromPolicy(PolicySettings)`.

## [Unreleased] - 2026-04-23 · Screener 2.0

### Added
- `src/lib/data/screener-universe.ts` — statisch `DEFAULT_SCREENER_UNIVERSE` met 27 entries (NL/EU/UK/US + 2 wereld-ETF's) plus `SUPPORTED_REGIONS` en `SUPPORTED_SECTORS` als canonieke keuze-lijsten.
- `src/lib/analytics/screener.ts` — factor-first engine: `runScreen`, `preFilter`, `passesPostScoreFilters`, `deriveStrengthsWeaknesses`. Parallel fetch van fundamentals + price history per ticker; scoring via bestaande `scoreFactors`. Zonder AI, volledig reproducible.
- `src/lib/analytics/screener.test.ts` met dekking voor pre-filter combinaties, post-score drempels (factor, composite, debt/equity, market cap, dividendOnly) en strengths/weaknesses extraction.
- `src/components/common/score-pill.tsx` — de portfolio-specifieke ScorePill is verhuisd naar `common` zodat screener en portfolio dezelfde primitief delen.
- Screener-pagina componenten (`src/app/(app)/screener/components/`):
  - `screener-filters-form.tsx` (client) — pill-toggles voor regio/sector, sliders voor Quality/Value/Momentum, number fields voor dividend/debt/mcap, URL-driven `router.push` submit.
  - `screener-result-card.tsx` (client) — rank, ticker, sector, scores, sterk/zwak punten, watchlist- en uitleg-knop.
  - `screener-detail-drawer.tsx` (client) — Sheet met per-sub-factor rationales, composite-uitleg, fundamentals snapshot tabel en watchlist-commit.
  - `screener-results.tsx` (client) — container die selectie-state + watchlist-toasts beheert en één gedeelde `TooltipProvider` wrapt.
- `src/app/(app)/screener/filters-serde.ts` — URL ↔ `ScreenerFilters` serde (regio/sector/factor drempels/fundamentals), zodat filters shareable zijn.
- `src/app/(app)/screener/actions.ts` — `addToWatchlist` server action met `Watchlist(userId, ticker)` upsert en duplicate-detectie, triggert `revalidatePath('/portfolio')`.
- `src/app/(app)/screener/page.tsx` — herschreven server component die searchParams parst, `runScreen` draait en een 2-koloms layout rendert (filters sticky, resultaten grid).
- `src/app/(app)/screener/loading.tsx` — skeleton die het 2-koloms layout spiegelt.

### Changed
- `src/types/screener.ts` — `maxDebtToEquity?` toegevoegd.
- `src/lib/analytics/index.ts` — exporteert `screener`.
- `src/app/(app)/portfolio/components/holdings-table.tsx` — importeert ScorePill nu uit `@/components/common`.
- `src/app/(app)/portfolio/components/score-pill.tsx` verwijderd (verhuisd naar `common`).

### Design principe
- Ranking is factor-first: sort key is uitsluitend `FactorScore.composite`. AI mag signalen aanbieden; zij komen later als aparte "insight"-laag bovenop de ranking, niet als re-ordering.

## [Unreleased] - 2026-04-23 · Portfolio pagina v2

### Added
- `src/lib/analytics/holding-action.ts` — pure `deriveHoldingAction` die BUY CANDIDATE / HOLD / WATCH / TRIM / AVOID bepaalt uit composite score, coverage, huidige weight en target. Labels en beschrijvingen geëxporteerd voor UI.
- `src/lib/analytics/holding-action.test.ts` met dekking voor elke tak incl. onderweighting, insufficient confidence en ontbrekende score.
- Shadcn `src/components/ui/tooltip.tsx` primitief (Radix-based) voor hover-uitleg.
- Portfolio-pagina componenten onder `src/app/(app)/portfolio/components/`:
  - `score-pill.tsx` (client) — 0..100 pill met kleur-tone en optionele tooltip.
  - `action-badge.tsx` (client) — actie-badge met tooltip die default-beschrijving + per-row rationale toont.
  - `portfolio-summary-cards.tsx` (server) — 4 kaarten: totale waarde, aantal posities, grootste positie, valuta verdeling (met inline mini-bars).
  - `holdings-table.tsx` (client) — volledig tabel met symbool, aantal, koers, waarde, %, valuta, quality/value/momentum/composite scores en actie-badge; responsive kolom-hiding met `md:` en `lg:` breakpoints; één `TooltipProvider` wrapt alle score- en action-tooltips.
  - `score-legend.tsx` (server) — uitlegblok met score-bands en actie-legenda.
- `src/app/(app)/portfolio/loading.tsx` — skeleton mirror van de page-layout.
- `src/app/(app)/portfolio/build-rows.ts` — pure mapper van `PortfolioSummary` + `HoldingValuation[]` naar serialiseerbare `HoldingRow[]`.

### Changed
- `src/lib/analytics/enrichment.ts` — fetcht nu parallel price history (~400 dagen) wanneer `includeFactorScores` is; momentum-sub-score werkt daardoor echt in plaats van neutraal 50. `EnrichmentResult.priceHistories` toegevoegd.
- `src/lib/analytics/portfolio-view.ts` — `BuildPortfolioViewOptions` krijgt `includeFactorScores` + `factorWeights`; `PortfolioView.factorScores` toegevoegd en factor scores worden als denormalisatie op `HoldingValuation.holding.factorScore` gepropageerd.
- `src/lib/analytics/index.ts` — exporteert `holding-action`.
- `src/app/(app)/portfolio/page.tsx` — volledig herschreven: schakelt `includeFundamentals` + `includeFactorScores` in, bouwt rows via `buildHoldingRows`, rendert `PortfolioSummaryCards`, `HoldingsTable`, `ScoreLegend`, signals en eigen empty-states voor geen-portfolio en geen-holdings (met inline import-dialog).

### Responsive
- Tabel: horizontale scroll onder 960px, `Symbool / Aantal / Koers` verborgen onder `md`, `Valuta / Quality / Value / Momentum / Totaal` verborgen onder `lg`. Mobiele row toont ticker inline onder de naam.
- Summary cards: 1-col → 2-col → 4-col op `sm`/`lg`.

## [Unreleased] - 2026-04-23 · Factor scoring engine

### Added
- `src/lib/analytics/factors/shared.ts` — gedeelde primitieven: `rampUp`, `rampDown`, `clamp`, `buildSignal`, `scoreFromSignals` (missende-data tolerant, levert top-3 rationales), `formatPct`, `formatRatio`, `FactorSignal` type.
- `src/lib/analytics/factors/quality.ts` — `scoreQuality(fundamentals)` op basis van ROIC, ROE, debt/equity, FCF yield, bruto/operationele marge en rentedekking (hogere score = sterker bedrijf).
- `src/lib/analytics/factors/value.ts` — `scoreValue(fundamentals)` op basis van P/E, P/B, P/S, EV/EBITDA, FCF yield, dividendrendement en afgeleide PEG (P/E ÷ epsGrowth5y·100; skipt PEG bij groei ≤ 2%).
- `src/lib/analytics/factors/momentum.ts` — `scoreMomentum(history)` + `computeMomentumMetrics` + `scoreMomentumFromMetrics` voor 6m-, 12m-, 12-1m-trend en afstand tot 52w-high.
- `src/lib/analytics/factors/risk.ts` — `scoreRisk({ volatility, maxDrawdown, beta })` met absolute drawdown-afhandeling en "hoger = veiliger" conventie zodat composite één richting houdt.
- `src/lib/analytics/factors/composite.ts` — kern-API `scoreFactors(input, weights)`, `computeComposite`, `DEFAULT_FACTOR_WEIGHTS`, `weightsForObjective(objective)` presets per `InvestmentObjective`, holding-integratie `applyFactorScore` en batch `scoreHoldings`.
- `src/lib/analytics/factors/index.ts` — barrel voor de nieuwe module.
- Vitest suites: `shared.test.ts`, `quality.test.ts`, `value.test.ts`, `momentum.test.ts`, `risk.test.ts`, `composite.test.ts`.

### Changed
- `src/types/factor.ts`: `FactorSubScores`, `FactorScore.composite` docs rescaled naar **0..100** (0 = ongunstig, 50 = neutraal, 100 = sterk). `FactorScore` heeft nu optionele `weights` en `rationales` (typed via nieuwe `FactorRationales`).
- `src/lib/analytics/factor-scoring.ts` — legacy signature `scoreHoldings(holdings, weights): FactorScore[]` is nu een BC-shim die naar de nieuwe engine delegeert. Niet meer geëxporteerd vanuit de `@/lib/analytics` barrel om naming-collisions met de nieuwe `scoreHoldings` te vermijden.
- `src/lib/analytics/index.ts` — her-exporteert `./factors`.
- `src/lib/analytics/enrichment.ts` — `EnrichmentOptions` krijgt `includeFactorScores?` + `factorWeights?`. `EnrichmentResult.factorScores: Map<ticker, FactorScore>` wordt gevuld wanneer opt-in.

### Bekende beperkingen
- `enrichHoldings` voedt de factor engine (nog) zonder prijshistorie, dus momentum-sub-score blijft 50 tot de history-feed is aangesloten. Quality/value/risk werken wel meteen mits `includeFundamentals: true`.
- Prisma `FactorSnapshot.*Score` kolommen zijn `Decimal(6,4)` (oud bereik -1..1). Persistence vereist later schema-update naar `Decimal(6,2)` of rescaling bij schrijven (in-memory blijft 0..100 canoniek).

## [Unreleased] - 2026-04-23 · Holdings enrichment + basis portfolio-analyse

### Added
- `src/lib/analytics/valuation.ts` — pure valuation-laag:
  - `HoldingValuation`, `PriceSource`, `valueHolding` met prijsfallback (market → lastKnown → costBasis → 0).
  - `calculateHoldingValue`, `calculatePortfolioValue` (negatieve cash → 0), `calculateTopHoldings`, `calculateCurrencyAllocation`, `aggregateAllocation` (null-keys naar "Onbekend").
- `src/lib/analytics/enrichment.ts` — async enrichment service. Fetcht parallel quotes + FX (en optioneel fundamentals), faalt defensief (ontbrekende FX → rate 1 met warning), retourneert `{ valuations, quotes, fundamentals, fxRates, asOf }`.
- `src/lib/analytics/health.ts` — `computeBasicHealthSummary` met diversification/risk/quality/factor scoring en signals voor concentratie, spreiding, valuta-exposure en drawdowns. Quality + factor vallen terug op 0.5 als holdings nog geen scores dragen.
- `src/lib/analytics/portfolio-view.ts` — high-level orchestrator `buildPortfolioView(portfolio, opts)` die één call doet en `PortfolioView = { summary, health, valuations, lastUpdated }` retourneert.
- Tests: `src/lib/analytics/valuation.test.ts` en `src/lib/analytics/health.test.ts`.

### Changed
- `src/types/summary.ts` — `PortfolioSummary` heeft nu `largestPosition: PositionBreakdown | null` en `allocationByCurrency: AllocationSlice[]`.
- `src/lib/analytics/portfolio-summary.ts` — opgesplitst in een pure `computePortfolioSummaryFromValuations` (canoniek) en backward-compatible `computePortfolioSummary(portfolio, opts)` die onveranderd tests blijft slagen.
- `src/lib/analytics/index.ts` — barrel re-exporteert valuation, enrichment, health en portfolio-view.
- `src/app/(app)/portfolio/page.tsx` — server component gebruikt `buildPortfolioView`, toont 4 metric cards (totalValue, unrealized P&L, grootste positie, health grade), holdings-tabel met live koers + P&L en een lijst met health signals.
- `src/app/(app)/dashboard/page.tsx` — vervangt placeholders door echte nummers van de primary portfolio en een top-posities tabel.
- `src/lib/analytics/risk.test.ts` — test-fixture aangevuld met de nieuwe verplichte `PortfolioSummary` velden.

## [Unreleased] - 2026-04-23 · Server-side market data laag

### Added
- Genormaliseerde marktdata-types in `src/types/market.ts`: `Quote`, `FxRate`, `HistoricalPoint`, `HistoryInterval`, `HistoryRequest`.
- TTL-cache primitief `src/lib/data/cache.ts` met:
  - `TtlCache` class (lazy expiry, insertion-order eviction, inflight-deduplicatie in `getOrSet`, stats).
  - `marketDataCache` global-scoped singleton (overleeft HMR in dev).
  - `buildCacheKey(namespace, ...parts)` helper voor consistente keys.
- Provider-contract + stub-implementatie:
  - `src/lib/data/providers/types.ts` (`QuoteProvider`, `FxProvider`, `FundamentalsProvider`, `HistoryProvider`, `MarketDataProvider`).
  - `src/lib/data/providers/stub.ts` (`StubMarketDataProvider`) — deterministische pseudo-data op basis van ticker-hash, EUR-ankered FX-matrix, geometrische random walk history.
  - `src/lib/data/providers/index.ts` (`getMarketDataProvider`) met env-gebaseerde dispatch via `MARKET_DATA_PROVIDER`.
- Server-side services met cache + defensive error handling + graceful fallback:
  - `src/lib/data/quotes.ts` (`getQuote`, `getQuotes`, TTL 60s).
  - `src/lib/data/fx.ts` (`getFxRate`, `convertAmount`, TTL 5min, identity-shortcut).
  - `src/lib/data/fundamentals.ts` (`getFundamentals`, TTL 6h).
  - `src/lib/data/history.ts` (`getHistory`, TTL 30min, datum-validatie + sortering).
- API routes onder `src/app/api/market/`:
  - `quote/route.ts` (`?ticker=` of `?tickers=CSV`).
  - `fx/route.ts` (`?from=&to=`).
  - `fundamentals/route.ts` (`?ticker=`).
  - `history/route.ts` (`?ticker=&from=&to=&interval=1d|1wk|1mo`).
  - Gedeelde helpers in `_shared.ts` (param parsing, error responses, `Cache-Control` headers).
- Tests: `src/lib/data/cache.test.ts` (TTL, eviction, inflight-dedup, null-caching) en `src/lib/data/market.test.ts` (service shape, normalisatie, FX identity + conversion, history sort).
- `.env.example`: `MARKET_DATA_PROVIDER`, plus placeholders voor provider-secrets.

### Changed
- `src/lib/data/index.ts` exporteert nu ook de marktdata-services en -cache zodat consumers via `@/lib/data` importeren.
- `src/types/index.ts` re-exporteert `market`.

### Security
- Alle market-services draaien via de server (route handlers, server components, server actions). Geen `NEXT_PUBLIC_*` exposure van provider-secrets; `_shared.ts` zet `Cache-Control: private` zodat geen shared CDN per-user data cachet.

## [Unreleased] - 2026-04-23 · DEGIRO CSV-importmodule

### Added
- `src/lib/parsers/degiro.ts` — volledige fouttolerante DEGIRO-parser met:
  - `normalizeDutchNumber` (1.234,56 én 1,234.56, currency-prefix/-suffix, negatief met haakjes, percent-suffix)
  - `detectCurrency` (supported ISO-codes EUR/USD/GBP/CHF/JPY, andere retourneren null)
  - `safeString`, `parseOpenPositionRows`, `parseDegiroCsv`, `toHoldingDrafts`
  - CSV-tokenizer met `,` / `;` / `\t` auto-detect en support voor quoted fields met embedded newlines
  - Kolomaliassen voor NL én EN varianten
  - ISIN- en ticker-detectie met product-name fallback
  - Asset-class heuristiek (ETF/REIT/BOND/EQUITY)
  - Duplicaat-aggregatie binnen bestand met gewogen gemiddelde kostprijs
- `src/lib/parsers/degiro.test.ts` met dekking voor parser-helpers, CSV end-to-end (NL + EN), duplicates en foutpaden.
- Server action `src/app/(app)/portfolio/actions.ts` (`importDegiroCsv`) die serverside opnieuw parsed, upsert uitvoert en `revalidatePath` triggert op `/portfolio` + `/dashboard`.
- `ImportDegiroDialog` client component (`src/app/(app)/portfolio/components/import-degiro-dialog.tsx`) met file-picker, previewtabel, samengevouwen warnings/skipped en success/error notices.
- `portfolioRepository.findPrimaryByEmail` en `portfolioRepository.upsertHoldings` (bulk upsert in transactie, teller voor created/updated).

### Changed
- `src/app/(app)/portfolio/page.tsx` is nu een async server component die de primary portfolio ophaalt, de holdings als tabel toont en de DEGIRO-import dialog koppelt.
- `src/lib/parsers/csv-holdings-parser.ts` dispatcht nu naar `parseDegiroCsv` en normaliseert de output naar het legacy `CsvImportResult` contract.
- `src/lib/parsers/index.ts` exporteert DEGIRO parser + helpers expliciet.
- `.env.example` — `DEMO_USER_EMAIL` toegevoegd (tijdelijk totdat auth landt).

### Duplicate-guard
- Bestandsniveau: parser aggregeert duplicate regels op ISIN → ticker met weighted-average kostprijs.
- DB-niveau: Prisma unique `Holding(portfolioId, ticker)` met `upsert` semantiek; bestaande posities worden bijgewerkt, nieuwe toegevoegd.

## [Unreleased] - 2026-04-23 · State-architectuur refactor

### Added
- `src/store/usePortfolioStore.ts` – nieuwe portfolio store met watchlist, portfolio summary, portfolio risk summary, factor- en position-risk caches per ticker, allocation plan slot en `lastAnalyzedAt` timestamp. `hydrate` accepteert een bulk server-payload.
- `src/store/useProfileStore.ts` – profile store met canonieke `profile`, bewerkbare `policy` draft, `currentObjective`, client-`preferences` (region/sector tilts + dividend/momentum) en automatisch afgeleide `ProfileCompleteness`. `commitPolicyToProfile()` schrijft de draft terug naar het profiel.
- `src/store/useAppSettingsStore.ts` – uitgebreide settings store met `selectedBenchmarkTicker`, `defensivenessLevel`, `activeStrategyPresetSlug`, `screenerFilters` (+ patch/clear helpers), strak persisted via `partialize` en een v1 → v2 `migrate` voor de `displayCurrency` → `baseCurrency` rename.
- Selectors: `selectActivePortfolio`, `selectActiveHoldings`, `selectFactorScoreForTicker`, `selectPositionRiskForTicker`, `selectIsProfileComplete`.
- Type uitbreidingen in `src/types/profile.ts`: `InvestmentObjective`, `InvestorPreferences`, `ProfileCompleteness`, `ProfileCompletenessField`. `UserProfile.objective` is nu verplicht (alignt met Prisma).
- Nieuwe typebestanden: `src/types/screener.ts` (`ScreenerFilters`, `DefensivenessLevel`) en `src/types/watchlist.ts` (`WatchlistItem`).
- Vitest-suites voor alle drie de stores (`usePortfolioStore.test.ts`, `useProfileStore.test.ts`, `useAppSettingsStore.test.ts`).

### Changed
- Storebestanden volgen nu de `useXxxStore.ts` naming (was `xxx-store.ts`). Barrel `src/store/index.ts` geherstructureerd.
- `useAppSettingsStore` persistkey versie bump 1 → 2; oude `displayCurrency` wordt automatisch gemigreerd.
- `src/types/index.ts` re-exporteert `screener` en `watchlist`.

### Removed
- Legacy `src/store/portfolio-store.ts`, `profile-store.ts`, `app-settings-store.ts` (vervangen).

## [Unreleased] - 2026-04-23 · Datamodel uitbreiding

### Added
- Prisma-modellen `MarketSnapshot`, `FactorSnapshot`, `StrategyPreset`, `BacktestRun`, `WatchlistItem`.
- Prisma enums `InvestmentObjective`, `RegimeLabel`, `StrategyType`, `RebalanceFrequency`, `BacktestStatus`, `HealthGrade`.
- Optionele enrichment-kolommen op `Holding`: `beta`, `volatility`, `moatLikeScore`, `targetWeight`, `convictionScore`.
- `UserProfile.objective` en `UserProfile.policy` (Json) afgestemd op `PolicySettings` domeintype.
- Denormalisaties op `PortfolioSnapshot`: `unrealizedPnl`, `unrealizedPnlPct`, `volatility`, `drawdown`, `regimeLabel`, `healthGrade`, `healthScore`.
- Unique-constraints: `Holding(portfolioId, ticker)`, `WatchlistItem(userId, ticker)`, `FactorSnapshot(ticker, capturedAt, model)`.
- Tijdreeks-indexen op `MarketSnapshot(capturedAt)`, `FactorSnapshot(ticker, capturedAt)`, `PortfolioSnapshot(portfolioId, capturedAt)`, `BacktestRun(userId, startedAt)`.
- Idempotent seed-script `prisma/seed.ts` met demo-user, portefeuille, holdings, snapshots, watchlist, strategy presets en een voltooide backtest.
- `prisma.seed`-configuratie in `package.json`, plus scripts `prisma:seed` en `prisma:reset`.
- `tsx` als dev dependency voor het draaien van het TypeScript seed-script.

### Changed
- `portfolioRepository.mapHolding` mapt nu de nieuwe enrichment-kolommen naar het domeintype; `Decimal`-waarden worden defensief naar `number` of `undefined` genormaliseerd.
- README: aangescherpte database-sectie met migrate + seed + reset flow.

## [Unreleased] - 2026-04-23 · Domein-typesysteem

### Added
- `src/types/factor.ts`: `FactorKey`, `FactorSubScores`, `FactorWeights`, `FactorScore`, `FundamentalsSnapshot`.
- `src/types/regime.ts`: `MarketRegimeState`, `MarketTrend`, `VolatilityRegime`, `MarketRegimeIndicator`, `MarketRegime`.
- `src/types/allocation.ts`: `AllocationSlice` (nu canoniek hier), `AllocationAction`, `RebalanceFrequency`, `AllocationRecommendation`, `AllocationPlan`.
- `src/types/risk.ts`: `RiskSeverity`, `RiskFlag`, `PositionRiskAnalysis`, `PortfolioRiskSummary`.
- `src/types/backtest.ts`: `BacktestConfig`, `EquityPoint`, `RegimeBreakdown`, `BacktestResult`, `BenchmarkComparison`, `StrategyPreset`.
- `PortfolioHealthSummary`, `PortfolioHealthSignal`, `HealthGrade`, `HealthSignalSeverity` in `src/types/summary.ts`.
- `PolicySettings` en `EsgStance` in `src/types/profile.ts`; `UserProfile.policy?` toegevoegd.
- `Position` alias van `Holding` voor UI-leesbaarheid.
- Optionele verrijkingsvelden op `Holding`: `beta`, `volatility`, `moatLikeScore`, `targetWeight`, `convictionScore`, `factorScore`, `riskAnalysis`.
- Compile-time typetests in `src/types/types.test.ts`.

### Changed
- `src/types/summary.ts` importeert `AllocationSlice` nu uit `./allocation` (geen duplicatie meer).
- `src/types/index.ts` volgt de dependency-layering en re-exporteert alle domeintypes.
- `src/lib/analytics/factor-scoring.ts` consumeert `FactorScore` / `FactorWeights` uit `@/types/factor` (canoniek contract). `FactorScore.subScores` vervangt de oude `scores`-map; `asOf` toegevoegd.
- `src/lib/analytics/risk.ts`: `RiskSnapshot` vervangen door `ConcentrationMetrics` (subset van `PortfolioRiskSummary`). `computeConcentrationMetrics` is de nieuwe naam; `computeRiskSnapshot` blijft als alias voor backward compatibility.

## [Unreleased] - 2026-04-23

### Added
- Next.js 15 App Router foundation met TypeScript strict mode en premium dark theme.
- Route placeholders voor `/dashboard`, `/portfolio`, `/screener`, `/maandbeslissing`, `/risico`, `/strategy-lab`, `/backtest`, `/chat` en `/profiel` in de `(app)` route-group.
- AppShell met Sidebar, TopBar en responsieve MobileNav (Radix Dialog / Sheet).
- Herbruikbare UI-componenten: `Logo`, `PageHeader`, `MetricCard`, `EmptyState`, `Section` en shadcn primitives `Button`, `Card`, `Sheet`, `Separator`, `Badge`, `Skeleton`.
- Tailwind design tokens (premium dark first) met `surface`, `surface-elevated`, `success`, `warning` en `premium` shadow.
- Prisma schema met `User`, `UserProfile`, `Portfolio`, `Holding`, `PortfolioSnapshot` plus enums voor investor type, risicotolerantie en asset class; PostgreSQL als target.
- Type definities voor `Holding`, `Portfolio`, `PortfolioSnapshot`, `UserProfile`, `InvestorGoal`, `PortfolioSummary` en `AllocationSlice`.
- Analytics engines: `computePortfolioSummary`, `computeConcentration`, `computeRiskSnapshot`, plus een factor-scoring placeholder met gewichten.
- AI explainability placeholder (`DecisionTrace`, `createTrace`).
- CSV holdings parser placeholder voor broker-imports.
- Zustand stores: `usePortfolioStore`, `useProfileStore`, `useAppSettingsStore` (met `persist` middleware).
- Repository-laag `portfolioRepository` en singleton Prisma client.
- Vitest setup met unit tests voor `portfolio-summary` en `risk`.
- `.env.example`, ESLint config, README en deze CHANGELOG.
