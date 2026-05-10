# BeleggerIQ — Implementation Sequence (volgende fase)

> Voortbouwend op [`CODEBASE_AUDIT.md`](./CODEBASE_AUDIT.md) en
> [`ROADMAP.md`](./ROADMAP.md). Modules 1-15 (engineering-schuld + core
> features) zijn shipping. Dit document plant de volgende fase: alles
> wat nodig is om van "feature-complete voor één serieuze NL-belegger"
> naar "wereldklasse beleggingsapp" te gaan.
>
> Gebruik dit document als sprintplan-input. Past zich aan op feedback
> van real-world users.

---

## Strategische volgorde — drie golven

**Golf 1 (4-6 weken) — Statistische rigor + data-redundantie**
Adres de Simons-witte-vlekken. Geen één klap-en-pad-meer-naar-prod;
fundering uitbreiden zodat alle latere features op betrouwbare data leunen.

**Golf 2 (4-6 weken) — Productrijpheid voor breed publiek**
Onboarding, mobile, i18n, plain-language-modus, compliance-banner.
Maakt de tool bruikbaar voor mensen die geen analyst zijn.

**Golf 3 (6-10 weken) — AI-runtime + commercieel**
Echte LLM-client, vector-search, NL-Q&A, abonnementsstructuur. Hier
vergt alles bewuste GDPR-/cost-/vendor-keuzes.

---

## Golf 1 — Statistische rigor + data-redundantie

### M16 — Secondary data-provider + fallback-chain
**Roadmap-#11.** Yahoo-finance2 is unofficial; één lib-bug = blinde app.

- **Bestanden**: nieuwe `src/lib/data/providers/alpha-vantage.ts` of
  `finnhub.ts`. Update [`providers/index.ts`](../src/lib/data/providers/index.ts) met fallback-chain.
- **Schema**: geen migration; provider-keys in env-vars.
- **Tests**: per nieuwe provider een `*.test.ts` + integration-test
  voor fallback-flow (primary throws → secondary kicks in).
- **Parallel safe?** ✅ Geen conflict met andere modules.
- **Effort**: ~1.5 dag.
- **Engine**: **Sonnet** (standaard featurebouw, geen complex ontwerp).

### M17 — Error-banden op composite scores
**Validation-board top-bevinding.** Composite "65/100" wordt nu als
puntwaarde getoond. Voeg confidence-interval toe via bootstrap of
analytische error-propagatie over de pillar-coverages.

- **Bestanden**: [`factors/composite.ts`](../src/lib/analytics/factors/composite.ts), [`etf-factors/composite.ts`](../src/lib/analytics/etf-factors/composite.ts),
  UI-laag (`HoldingScoreCard`, badges).
- **Schema**: optioneel `FactorSnapshot.compositeStdErr` veld
  (Decimal(6,4)) — kleine migration.
- **Tests**: pin error-band breedtes voor 4 reference-cases (lage cov,
  high cov, single pillar, four pillars).
- **Parallel safe?** ⚠ Conflict met M22 (UI-redesign) als die parallel
  loopt. Liever sequentieel.
- **Effort**: ~3 dagen.
- **Engine**: **Opus** (scoringmodellen, statistical reasoning).

### M18 — Monte-Carlo over scenario's
Nu zijn macro-scenarios single-point ("RECESSION → -22%"). MC-simulatie
geeft een **distributie** ("90% kans op verlies tussen -15% en -28%").

- **Bestanden**: [`analytics/macro/`](../src/lib/analytics/macro/) krijgt een sibling
  `monte-carlo.ts` + tests. UI: `ScenarioSnapshot` component.
- **Schema**: geen migration.
- **Tests**: distributie-shape (mean, p10, p90) per scenario; seedable
  voor reproduceerbaarheid.
- **Parallel safe?** ✅
- **Effort**: ~3-4 dagen.
- **Engine**: **Opus** (probabilistische modellering).

### M19 — Model-drift monitor
Detecteer wanneer factor-weights niet meer voorspellend zijn (bv. value
heeft 18 maanden underperformed op je universum).

- **Bestanden**: nieuwe `src/lib/analytics/drift/` met
  `factor-effectiveness.ts` (rolling-IC), notifications-event
  `MODEL_DRIFT_DETECTED`.
- **Schema**: `FactorDriftSnapshot { id, factor, capturedAt, ic12m,
  hitRate12m }` — kleine migration.
- **Tests**: 12-maand IC tegen synthetische return-streams.
- **Parallel safe?** ✅
- **Effort**: ~4 dagen.
- **Engine**: **Opus** (factor research, statistical inference).

### M20 — Audit-log model + multi-user-discovery
Compliance + future-proof voor multi-user. Wie wijzigde wat wanneer.

- **Bestanden**: nieuwe Prisma-model `AuditEntry { id, userId, action,
  resourceType, resourceId, before, after, ipHash, timestamp }`.
  Wrapper-helpers in `src/lib/audit/`.
- **Schema**: 1 migration.
- **Tests**: per kritische action (policy-update, manual-tax-valuation,
  watchlist-add, transaction-import).
- **Parallel safe?** ✅ Pure addition, geen conflict.
- **Effort**: ~2 dagen.
- **Engine**: **Sonnet** (CRUD + plumbing).

### M21 — Redis-store voor multi-instance ratelimit + notifications
Onthand het single-host-blocker. Features die multi-instance nodig hebben
(real-time notifications, horizontal scaling) erven dit.

- **Bestanden**: [`src/lib/ratelimit/store.ts`](../src/lib/ratelimit/store.ts) + [`src/lib/notifications/repository.ts`](../src/lib/notifications/repository.ts) krijgen een
  Redis-backend achter dezelfde interface (`NotificationStore`).
- **Schema**: geen DB-migration; nieuwe env-vars `REDIS_URL`,
  `RATELIMIT_BACKEND=redis`.
- **Tests**: in-memory blijft; Redis path achter feature-flag.
- **Parallel safe?** ✅
- **Effort**: ~2 dagen.
- **Engine**: **Sonnet**.

---

## Golf 2 — Productrijpheid voor breed publiek

### M22 — Onboarding wizard
**Roadmap-#24.** Eerste-login-flow: profiel → DEGIRO-import → eerste
maandbeslissing-walkthrough.

- **Bestanden**: nieuwe `src/app/(app)/onboarding/` met steps + state.
  `UserProfile`-schema bestaat al; we kunnen wel een
  `onboardedAt`-datetime veld toevoegen.
- **Schema**: 1 kleine migration.
- **Tests**: state-machine via `vitest`; geen E2E.
- **Parallel safe?** ⚠ Conflict met M22 zelf — deze module is groot
  genoeg om alleen aan te werken. Geen parallel.
- **Effort**: ~5 dagen.
- **Engine**: **Sonnet** (UI + state-management).

### M23 — Plain-language-modus ("Lynch-toggle")
Per-page-toggle die "Composite 65/100" omzet naar "Een gemiddelde +
solide positie — vergelijkbaar met de bovenste 35% van Nederlandse
beleggers in deze portefeuille-stijl". Vergt vooral copywriting +
percentile-data.

- **Bestanden**: nieuwe helper `src/lib/explain/plain-language.ts` +
  toggle in `UserProfile.preferences`. Hergebruik
  [`ai/explainers.ts`](../src/lib/ai/explainers.ts).
- **Schema**: optioneel `displayMode: "expert" | "plain"` in policy-
  blob (Json), geen migration.
- **Tests**: per UI-output-type een snapshot in beide modi.
- **Parallel safe?** ✅
- **Effort**: ~3 dagen.
- **Engine**: **Sonnet** (UI + content), kort consult **Opus** voor
  beleggings-tone-of-voice.

### M24 — Mobile / PWA
**Roadmap-#16.** Dashboard leesbaar op telefoon, manifest +
service-worker voor offline view van laatste snapshot.

- **Bestanden**: alle pages krijgen mobile-aware Tailwind-breakpoints.
  Nieuwe `src/app/manifest.ts` + service-worker via Next 16 PWA-plugin.
- **Schema**: geen migration.
- **Tests**: Playwright mobile-viewport-tests (eerste E2E).
- **Parallel safe?** ⚠ Werkt op alle pages; rebase-conflict met andere
  UI-modules (M22, M23).
- **Effort**: ~5 dagen.
- **Engine**: **Sonnet** + visual review.

### M25 — Compliance-banner + ack-checkbox bij grote verkopen
Validation-board markeert dit als blocker voor publieke launch.

- **Bestanden**: nieuwe `src/components/common/compliance-banner.tsx`
  + ack-flow op `/maandbeslissing` voor TRIM_HEAVY/SELL > €5000.
- **Schema**: nieuwe `AckLog { id, userId, decisionKey, ackAt }`-tabel
  (kleine migration).
- **Tests**: gating-test (geen submit zonder ack).
- **Parallel safe?** ✅
- **Effort**: ~1.5 dag.
- **Engine**: **Sonnet** (UI + plumbing) + **Opus** voor de banner-
  copy-tekst (legal precision).

### M26 — i18n
EN-vertaling als minimum, structuur klaar voor DE/FR. Geen content-
quality compromise.

- **Bestanden**: alle UI-strings naar `src/i18n/locales/{nl,en}.json`.
  Next 16 i18n-routing.
- **Schema**: `UserProfile.locale` veld (kleine migration).
- **Tests**: snapshot-tests per locale + translation-completeness-check
  in CI.
- **Parallel safe?** ❌ Raakt elke UI-file. Sequentieel; bij voorkeur ná
  M22/M23/M24 zodat we niet 3× hoeven te vertalen.
- **Effort**: ~6 dagen voor NL+EN; +2 dagen per extra taal.
- **Engine**: **Sonnet** (mechanische refactor).

### M27 — Onboarding telemetry + churn-detector
Welke users haken op welke stap af. Pure deterministische telemetry
(geen 3rd-party tracker).

- **Bestanden**: hergebruikt
  [`observability/metrics.ts`](../src/lib/observability/metrics.ts) — emit
  `onboarding_step_complete` events. Dashboard onder `/profiel/admin`.
- **Schema**: geen migration nodig (events leven in
  `NotificationDelivery` of een nieuwe `TelemetryEvent` table —
  ontwerp-keuze).
- **Tests**: aggregator-tests.
- **Parallel safe?** ✅ Hangt af van M22.
- **Effort**: ~2 dagen.
- **Engine**: **Sonnet**.

---

## Golf 3 — AI-runtime + commercieel

### M28 — LLM-client (Anthropic) achter `LlmClient`-interface
Eerst de architectuur, dan kosten beheren. De prompts zijn klaar (zie
[`src/lib/ai/prompts.ts`](../src/lib/ai/prompts.ts)).

- **Bestanden**: nieuwe `src/lib/ai/llm/` met `client.ts` (Anthropic SDK,
  prompt caching aan), `mock.ts` voor tests, swap in `explainers.ts`.
- **Schema**: nieuwe `LlmInvocation { id, userId, useCase, modelId,
  promptHash, tokensIn, tokensOut, costEur, latencyMs, createdAt }`-
  table voor cost-tracking. Migration vereist.
- **Tests**: alle bestaande explainer-tests blijven groen (deterministic
  fallback). Nieuwe tests voor LLM-path met mock-client.
- **Parallel safe?** ⚠ Bij introductie: GDPR-decision + budget-cap eerst.
  Pas live na M29.
- **Effort**: ~4-5 dagen.
- **Engine**: **Opus** (architectuur + GDPR-overwegingen + prompt-engineering),
  daarna **Sonnet** voor mechanisch werk.
- **GDPR**: NL-user-data → EU-region (Anthropic EU is in beta) of mask
  per-user-data uit prompts. Afhankelijk van keuze.
- **Hergebruik**: ALLE bestaande prompts in [`src/lib/ai/prompts.ts`](../src/lib/ai/prompts.ts) zijn al
  guardrail-compatible (JSON-context, geen ruimte voor hallucinated
  cijfers).

### M29 — Cost-cap + observability voor LLM
Budget-bewaking, geen runaway-bills.

- **Bestanden**: in [`observability/metrics.ts`](../src/lib/observability/metrics.ts) +
  `llm/client.ts` — daily/monthly budget-cap via Redis-counter.
- **Schema**: geen extra migration (bouwt op M28).
- **Tests**: budget-overschrijding → graceful-fallback naar
  deterministische explainer.
- **Parallel safe?** Met M28: ja (zelfde sprint).
- **Effort**: ~1.5 dag.
- **Engine**: **Sonnet**.

### M30 — Vector-search over research-dossier + decision-history
Gebruiker kan vragen "wanneer adviseerden we ASML?" of "wat zijn de
overeenkomsten tussen NVDA en deze andere posities?". Embeddings als
retrieval-laag.

- **Bestanden**: nieuwe `src/lib/ai/vectors/` met embedding-write
  (post-decision-snapshot) + retrieval-helper. pgvector-extensie op
  Postgres.
- **Schema**: nieuwe `EmbeddingIndex { id, sourceType, sourceId,
  embedding vector(1536) }`. Migration met `CREATE EXTENSION vector`.
- **Tests**: similarity-search met fixed embeddings (avoid live API in
  CI).
- **Parallel safe?** ✅ Pure addition na M28.
- **Effort**: ~5 dagen.
- **Engine**: **Opus** (architectuur), **Sonnet** voor implementatie.

### M31 — NL-Q&A coach ("Hey BeleggerIQ, wat doet mijn VWCE?")
LLM-gedreven Q&A bovenop M28+M30. Strikte guardrails.

- **Bestanden**: upgrade [`src/lib/ai/chat.ts`](../src/lib/ai/chat.ts) — intent-router blijft determ.
  voor structured-queries; vrije-tekst-vragen routen via M28+M30.
- **Schema**: geen extra migration.
- **Tests**: 50 reference-Q&A-paren met expected-format. Per-Q een
  cost-cap-test.
- **Parallel safe?** ✅ Hangt af van M28+M30.
- **Effort**: ~4 dagen.
- **Engine**: **Opus** (prompt-engineering), **Sonnet** voor plumbing.

### M32 — Stripe-integratie + subscription-tiers
Free / Pro / Adviseur tiers. Feature-flagging per tier.

- **Bestanden**: nieuwe `src/lib/billing/` met Stripe-webhook +
  subscription-state. Feature-flag wrapper voor "Pro-only"-features.
- **Schema**: `Subscription { id, userId, tier, status, currentPeriodEnd,
  stripeCustomerId, stripeSubscriptionId }` + `BillingEvent`-table.
- **Tests**: webhook-handler-tests (Stripe-fixtures) + feature-gate-tests.
- **Parallel safe?** ⚠ Compliance-checks vooraf (PSD2/SCA, BTW).
- **Effort**: ~6-8 dagen incl. compliance-flow.
- **Engine**: **Opus** (commerciële flow + compliance), **Sonnet** voor
  Stripe-API-plumbing.

### M33 — Educational module + glossary
Tooltips + page met beleggers-glossarium ("wat is een composite?",
"wat is een regime?"). Onderscheidt zich van Lynch-toggle (M23) door
**leer-pad** te zijn i.p.v. **vereenvoudigingstoggle**.

- **Bestanden**: nieuwe `src/app/(app)/leren/` met content uit een
  Markdown-bron (`docs/glossary.md`). Tooltips via bestaande Radix-
  component.
- **Schema**: geen migration.
- **Tests**: rendering-tests per glossary-entry.
- **Parallel safe?** ✅
- **Effort**: ~3 dagen incl. content-schrijven.
- **Engine**: **Sonnet** + **Opus** voor content-quality-review.

---

## Modules die NIET in deze fase landen

Roadmap-items 17-23 (stress-test scenario builder, performance
attribution, paper-trading, ESG, correlation matrix, dividend-calendar,
voice-input) blijven **nice-to-have** tot er real-world feedback komt.

Bewuste "niet-doen"-lijst (uit ROADMAP) blijft gehandhaafd:
- ❌ Real-time prices + WebSocket
- ❌ Trading-execution via broker API
- ❌ AI-aanbevelingen die cijfers verzinnen (M28+M31 hebben strikte
  guardrails — output blijft uitleg, niet advies)
- ❌ Options/derivaten
- ❌ Social features / leaderboards

---

## Parallellisatie-matrix

| Module | Veilig parallel met |
|---|---|
| M16 (secondary provider) | M17, M18, M19, M20, M21 |
| M17 (error-bands) | M16, M18, M19, M20, M21 — **niet** met M22-M26 (UI-conflict) |
| M18 (Monte-Carlo) | M16, M17, M19, M20, M21 |
| M19 (drift) | M16, M17, M18, M20, M21 |
| M20 (audit-log) | alle |
| M21 (Redis) | alle |
| M22 (onboarding) | M16-M21 + M27 (M27 hangt af van M22) |
| M23 (Lynch-toggle) | M16-M21 |
| M24 (mobile/PWA) | M16-M21 — conflict met M22, M23 (UI-files) |
| M25 (compliance) | alle |
| M26 (i18n) | **na alle UI-modules**, geen parallel |
| M27 (telemetry) | hangt af van M22 |
| M28 (LLM-client) | alle |
| M29 (LLM-cost) | alleen samen met M28 |
| M30 (vector-search) | na M28 |
| M31 (Q&A) | na M28+M30 |
| M32 (Stripe) | alle |
| M33 (educational) | alle |

**Veilige parallelle "sprints"**:
- Sprint A: M16 + M20 + M21 + M25 (niet-UI-modules)
- Sprint B: M17 + M19 + M18 (Simons-laag, sequencing op statisticus)
- Sprint C: M22 + M27 (één team per onboarding-flow)
- Sprint D: M23 + M28 + M29 (één team per AI-laag)
- Sprint E: M24 → M26 (mobile eerst, dan i18n erover)

---

## Database-migraties — gecentraliseerd plan

Alle migrations conform [`docs/DB_MIGRATIONS.md`](./DB_MIGRATIONS.md) — `prisma migrate dev` lokaal, `prisma migrate deploy` in CI.

| Module | Type | Tabel/kolom | Risico |
|---|---|---|---|
| M17 | ALTER TABLE | `FactorSnapshot.compositeStdErr` | Geen — nullable add |
| M19 | CREATE TABLE | `FactorDriftSnapshot` | Geen |
| M20 | CREATE TABLE | `AuditEntry` | Geen |
| M22 | ALTER TABLE | `UserProfile.onboardedAt` | Geen — nullable add |
| M25 | CREATE TABLE | `AckLog` | Geen |
| M26 | ALTER TABLE | `UserProfile.locale` | Geen — default `'nl'` |
| M28 | CREATE TABLE | `LlmInvocation` | Geen |
| M30 | CREATE EXTENSION + CREATE TABLE | `pgvector` + `EmbeddingIndex` | ⚠ extension-install vereist superuser; documenteer in deploy-runbook |
| M32 | CREATE TABLE | `Subscription`, `BillingEvent` | Geen |

**Geen destructieve migrations gepland** — alle adds zijn nullable of met
default. Een data-backfill-migration (bv. ETF-classification op bestaande
holdings) zou separate scope zijn maar is niet voorzien in M16-M33.

---

## AI-integratie hergebruik

| Bestaand asset | Hergebruikt door |
|---|---|
| `src/lib/ai/prompts.ts` (system + user prompt builders) | M28 — letterlijk via `LlmClient` |
| `src/lib/ai/explainers.ts` (deterministische fallback) | M28+M29 — graceful degradation bij budget-overschrijding |
| `src/lib/ai/research-dossier.ts` (806 LOC determ.) | M30 — bron voor embedding-vectors |
| `src/lib/ai/dashboard-explainer.ts` | M28 — eerste LLM-pad |
| `src/lib/observability/metrics.ts` | M29 — LLM-cost als nieuwe metric |
| `src/lib/notifications/dispatcher.ts` (port-based) | M19 — `MODEL_DRIFT_DETECTED`-event passt in dezelfde flow |

De **prompts zijn klaar voor LLM-swap**. M28 is daarom mechanisch klein
(LlmClient-implementatie achter dezelfde interface). De architectonische
zwaarte zit in M29 (cost-tracking + budget-cap) en M30 (vector-search
+ pgvector).

---

## Tijdslijn-suggestie (indicatief)

```
                  Q3                Q4                Q1
                  weeks 1-6         weeks 7-12        weeks 13-22
Golf 1            ████████          ████              ─
  M16,M20,M21     [Sprint A]        ─                 ─
  M17,M18,M19     ─                 [Sprint B]        ─
Golf 2            ─                 ████████          ████
  M22,M27         ─                 [Sprint C]        ─
  M23             ─                 ─                 ████
  M24             ─                 ─                 ████
  M25             ─                 [parallel]        ─
  M26             ─                 ─                 ████ (last)
Golf 3            ─                 ─                 ████████
  M28,M29         ─                 ─                 [Sprint D]
  M30,M31         ─                 ─                 ████ (na D)
  M32             ─                 ─                 [parallel]
  M33             ─                 ─                 [parallel]
```

Realistische schatting bij solo-developer-cadans: **5-7 maanden** voor
M16-M33. Met een parttime tweede developer: **3-4 maanden**.

---

## Wat ontbreekt op deze planning

- **User-feedback-loop**. Zonder 5-10 actieve users hangt de prioritering
  in de lucht. Aanbeveling: **na M16+M20+M22 een cohort van 10 NL-
  beleggers werven** vóór Golf 2 verder gaat.
- **Marketing/positionering** — niet tech-werk maar wel implicit prioriteit
  voor M32 (paywall-tiers afhangen van pricing-onderzoek).
- **Publieke roadmap** voor users (vs. dit interne implementation-plan).
- **Hiring-besluit** — wat hierboven staat is solo doable maar krap. Twee
  parttime engineers maakt dit comfortabeler.
