# BeleggerIQ — World-Class Validation Report

**Datum**: 2026-05-10
**Scope**: volledige kwaliteitsvalidatie na implementatie van Modules 1-16
**Methode**: 4 parallelle audit-agents (product/UX, technical/AI/scale, data/explainability, monetization/privacy) + topbelegger-lens validatie
**Verdict-headline**: **Feature-compleet, technisch sterk, niet-launch-klaar zonder GDPR-flows**.

---

## 0. Executive summary

BeleggerIQ heeft in 16 modules een ongebruikelijk diepgaande analyse-stack gebouwd: 26 productie-pages, 15 API-routes, 2049/2049 tests groen, 4-laags hallucination-guards op AI, k-anonieme community-benchmark, security-hardening en performance-cost-meter zijn allemaal aanwezig. **De competitive moat — "nothing is a black box, let winners run, signaling by coverage" — is reëel en goed verdedigd door tests + docs**.

De launch-blokkades zijn **niet technisch**, maar **legal/compliance**: er is geen delete-account-flow, geen data-export-flow, geen `/privacy`- of `/terms`-pagina, geen cookie-banner en geen formele DPA met AI-providers. Daarnaast zit er één serieus operationeel risico in de in-memory caches (rate-limit + market-data + briefing) die multi-instance deployment ineffectief maken.

**Aanbeveling voor de eerstvolgende sprint**: één `/launch-readiness`-sprint met focus op AVG-flows + Redis-migratie + Stripe-wiring. Geen nieuwe modules; commercialiseren wat er staat.

---

## 1. Beoordeling op 15 kwaliteitsdimensies

### 1.1 Productkwaliteit — **8/10**
**Sterk**: 26 functionele pagina's met consistente structuur (PageHeader → Section → Card-grid). Empty states overal aanwezig. Disclaimer-banner globaal + per-feature waar relevant. Centrale tone-palette (good/neutral/warning/critical) — geen color-drift.
**Zwak**: Geen UI-versie van het Onboarding-statemachine (links uit naar 3 verschillende routes). Voor een nieuwe gebruiker is de "first 60 seconds"-ervaring nog steeds rommelig.

### 1.2 Technische kwaliteit — **9/10**
**Sterk**: TypeScript-discipline excellent (slechts 10 `any`-occurrences, allemaal in test-mocks). Modules logisch gescheiden (analytics/ai/data/security/perf/enterprise/community). Geen circular-import-risico's. Pure functies waar het kan; deterministische fallbacks waar het moet.
**Zwak**: Repository-laag heeft geen unified error-classification (retry vs skip vs fail). Sommige `findMany`-calls zonder `take`-limit (5 files; impact laag voor huidige dataset, niet voor schaal).

### 1.3 UX — **7/10**
**Sterk**: Tone-of-voice is coachend zonder hype. Lynch/Kahneman-frameworks subtiel ingebed in copy. Disclaimers professioneel niet-alarmistisch. Skeleton-loading op alle dashboards.
**Zwak**: Accessibility partial — slechts 7 `focus-visible`-patronen in 48 component-files; icon-only knoppen ontbreken aria-labels op research-dossier, action-cards, before-after-toggles. Color-only signaling (geen tekst-prefix voor kleurenblinden). Mobile-readiness desktop-first; `px-4 py-6` op mobile is krap voor charts.

### 1.4 Performance — **7/10**
**Sterk**: Module 16 leverde slow-query-middleware (default 500ms drempel), `withTiming` / `withSlowLog` helpers, AI-response-cache primitive, cost-meter, en index-migratie op `NotificationDelivery (userId, status)`. `transactionRepository.list({take})` met max 5000 voorkomt unbounded scans.
**Zwak**: Cost-meter bestaat maar is nog NIET gewireup naar de bestaande AI-callsites (briefing, explainability, dossier) — token-counts gaan momenteel ongelogd door. Slow-query-log werkt alleen single-instance (geen aggregator-export).

### 1.5 Security — **8/10**
**Sterk**: Magic-link met 32-byte tokens + SHA-256-hash-storage + timing-safe compare; HMAC-SHA256-signed sessie-cookies; rate-limit-middleware met strikte buckets per /api/-prefix; complete security-headers (CSP/HSTS/X-Frame-Options) globaal via `next.config.ts`; PII-redactor (email/IPv4/Bearer) + AI-prompt-guard; audit-coverage op portfolio/transactions/watchlist write-paths.
**Zwak**: Magic-link rate-limit is in-memory `Map()` — werkt niet over replicas. Sessie-cookie heeft geen sliding-refresh of stale-window-check. `/api/market/*` endpoints zijn ongeauthenticeerd (provider-quota-misuse-risico).

### 1.6 Privacy — **7/10**
**Sterk**: Community Intelligence (Module 13) is exemplary — k-anonimiteit K=25, opt-in per scope, default-deny, synthetische baseline tot drempel bereikt is, expliciete privacy-invarianten in tests. Audit-module met PII-regels in JSDoc. AI-prompt-guard voorkomt email/IP-leakage naar LLM.
**Zwak**: **Geen delete-account-flow, geen data-export-flow, geen `/privacy`-pagina, geen `/terms`-pagina, geen cookie-banner**. Geen DPA met AI-providers gedocumenteerd. Audit-log retention-policy ontbreekt.

### 1.7 AI-kwaliteit — **9/10**
**Sterk**: 4-laags hallucination-defense (JSON-parse → banned-phrase-scanner → required-hedged-language → shape-validator). Numeric-claim-validator cross-checkt elke numerieke claim tegen context-JSON, tolerant voor decimal-conventies. Provider-abstractie met fallback-route. 6 explainability-domeinen delen één output-shape (`DomainExplanation`). Source-tracing per explanation.
**Zwak**: Geen expliciete `temperature=0` of seed-control op provider-calls (mogelijk wel default; niet getest). Hedged-language-check is best-effort (zwakke hedging passeert).

### 1.8 Financiële uitlegbaarheid — **9/10**
**Sterk**: Methodology-pagina met live constants-snapshot (auto-sync uit runtime). 7 engines volledig in `docs/ENGINES.md` gedocumenteerd. Per-positie data-quality-panel met severity-tier en weight-distribution. Signal-fusion-cockpit toont per signaal: score, weight, contribution, rationale, data-quality-pill. Renormalisatie-warning bij missing-data.
**Zwak**: Drill-down ontbreekt — gebruiker ziet "quality-score: 67" maar niet welke onderliggende factor (P/E, ROIC, ...) hoeveel bijdroeg. Confidence-tier-derivation (low/medium/high) niet expliciet gedocumenteerd in types.

### 1.9 Monetisatiepotentieel — **6/10**
**Sterk**: 23 features in 4 tiers correct gemodelleerd; PaywallCard op alle ELITE+-routes (33 callsites in 11 files); pricing-page leest direct uit `FEATURE_CATALOG`. Tier-rangorde voorspelbaar (geen impliciete inheritance). ADVISOR-tier voorbereid (Module 14) met 3 features.
**Zwak**: **Geen Stripe/Mollie integratie** — line 238 van pricing-page erkent "in productie wordt dit door billing-provider gestuurd" maar code is er niet. Geen trial-flow, geen failed-payment-recovery, geen webhook-handler. M32 staat op de roadmap maar is essentieel voor revenue.

### 1.10 Schaalbaarheid — **6/10**
**Sterk**: Pure-functie engines (factor scoring, signal fusion, stress-test) zijn horizontaal schaalbaar. Database-indexes covered voor alle hot queries. Type-safe abstracties op rate-limit-store + AI-provider klaar voor multi-region.
**Zwak**: Drie in-memory caches (`TtlCache` in `src/lib/data/cache.ts`, briefing-cache, explainability-cache) — bij multi-instance deploy heeft elke replica eigen cache; hit-rate stort in. Magic-link rate-limit ook in-memory. Redis-skeletons aanwezig maar nooit geactiveerd.

### 1.11 Datakwaliteit — **9/10**
**Sterk**: `src/lib/analytics/data-quality.ts` met per-holding-severity (ok/minor/major), missing-field-tracking, normalized-ticker-hints. UI-component op dashboard (compact) en portfolio (full table). Renormalisatie-pattern wanneer signaal-data ontbreekt. "Bruikbaar gewicht: X%"-pill in confidence-cockpit.
**Zwak**: Date-based thresholds (180-dag-snapshot in health-score) introduceren temporal non-determinism. Bij snapshot-recompute kan een health-grade kantelen zonder portfolio-mutatie — niet altijd zichtbaar voor de gebruiker.

### 1.12 Testdekking — **7/10**
**Sterk**: 2049 tests, 0 failing. Analytics-laag op ~52% coverage (sterkste). Pure-functie-engines volledig getest (factor, regime, signal-fusion, stress-test, community, enterprise, perf). Privacy-invarianten + role-permission-matrix expliciet getest.
**Zwak**: Data-laag (~31% coverage) — repositories grotendeels niet getest, alleen TtlCache. Audit-module 0 tests. Mail-module 0 tests. Server-actions zelf vrijwel niet getest (alleen via repositories).

### 1.13 Foutafhandeling — **7/10**
**Sterk**: Centrale `jsonServerError()`-helper voor API-routes (geen error.message-leak naar client). `sanitizeActionError` (Module 15) voor server-actions. Audit-writes failen silently (non-blocking). Provider-calls timeout-gewrapped (8s default + 2 retries). DB-resilience-helpers (`withRetry`, `withTimeout`, transient-error-classifier).
**Zwak**: Repositories werpen Prisma-errors door zonder classificatie. Sommige fallbacks zijn silent (`.catch(() => null)`) — gebruiker ziet blanco data zonder error-type. Chat-page doet partial-failure niet expliciet zichtbaar.

### 1.14 Mobiele bruikbaarheid — **6/10**
**Sterk**: 127 responsive Tailwind-klassen (md:/lg:/sm:/xl:) over 56 pages. Mobile-nav via Sheet drawer met sidebar-reuse. Holdings-table responsive.
**Zwak**: Desktop-first patroon — sidebar `hidden md:flex`. `max-w-7xl` met `px-4 py-6` op mobile cramped voor charts (ImpactChart, ScenarioCards). Geen container-queries voor chart-overflow. Op iPhone SE (320px viewport) zal multi-column grid omslaan naar single-column maar info-density is te hoog.

### 1.15 Concurrentiepositie — **9/10**
**Sterk gedifferentieerd**:
- "Nothing is a black box" — composite scores herleidbaar naar 10 transparante signalen
- "Let winners run" — rebalancer doet GEEN automatische trim van winners (Buffett-laag)
- Health-grade A-F als single visueel summary
- 4-quadrant macro-regime drijft monthly buy-allocation
- 9-scenario stress-test + custom-builder
- Privacy-first community (k=25)
- Dutch-first met DEGIRO-integratie

**Concurrentie**:
- vs. Morningstar/Yahoo: BeleggerIQ is portfolio-centric, niet stock-research-centric
- vs. Robo-advisors (Rabo, ABN): analyse-only zonder execution; transparanter
- vs. DIY (Tweakers, blogs): structured framework reduceert decision-anxiety

**Zwak**: Geen publieke competitive-narrative. README/landing legt niet uit waarom dit anders is dan een gemiddelde portfolio-tracker. Voor commerciële launch: positioning-page nodig.

---

## 2. Topbelegger-lens validatie

### 2.1 Buffett — **8/10**

| Vraag | Bewijs | Verdict |
|---|---|---|
| Stimuleert langetermijndenken? | Rebalancer trimt geen winners; "let winners run"; health-grade is samenvatting niet trade-signaal; geen day-trading-tools | ✅ |
| Bouwt vertrouwen? | Methodology-page + live constants; data-quality-panel; explicit-non-claims op stress-test; privacy-first community | ✅ |
| Duurzame waardepropositie? | Type-safe stack, 2049 tests, security-hardening — fundament klopt; **maar Stripe/billing ontbreekt → revenue-recurring is hypothetisch** | ⚠️ |

**Wood-zin van Buffett**: "Risk comes from not knowing what you're doing." — De app helpt de gebruiker te WETEN wat hij doet. Sterk.

### 2.2 Dalio — **9/10**

| Vraag | Bewijs | Verdict |
|---|---|---|
| Begrijpt macroregimes? | Module 5: 7 indicatoren, 4-quadrant (Goldilocks/Reflation/Stagflation/Deflation), asset-class impact-tabel | ✅ |
| Maakt risico/scenario's inzichtelijk? | Module 12: 9 vooraf-gedefinieerde scenarios + custom-builder; per-positie impact; defensiveStrength-meter; assumptions-disclosure | ✅ |
| Helpt diversificatie? | HHI op concentratie (positie + sector + regio); top-5-weight; benchmark vs cohort (Module 13); rebalance-suggestie bij FRAGILE-status | ✅ |

Dalio is de sterkste lens — alle drie aanwezig, met explainability-laag erbij.

### 2.3 Lynch — **8/10**

| Vraag | Bewijs | Verdict |
|---|---|---|
| Begrijpt een normale belegger de uitleg? | 1-zin verdicts ("zware klap", "lichte tegenwind", "je hebt fors meer equity"); 6 explainability-domeinen in spreektaal-NL | ✅ |
| Voorkomt metric-overload? | Health-grade A-F als single summary; tone-palette (4 kleuren); empty-states met EmptyState ipv 0-getallen | ✅ |
| Maakt beleggen praktischer? | Maandelijkse decision-cockpit; alerts per type met opt-in; behavioral-coach met dismiss/snooze; **maar geen echte execution** (alleen analyse) | ⚠️ |

Lynch wordt deels gebroken op "praktisch": app stuurt naar inzicht, niet naar uitvoering. Voor een passieve belegger is dat goed; voor een actieve belegger is "DEGIRO-deeplink" niet hetzelfde als "execute". Designkeuze, niet bug.

### 2.4 Simons — **9/10**

| Vraag | Bewijs | Verdict |
|---|---|---|
| Zijn signalen meetbaar? | Drempels in const (`DEFAULT_RISK_THRESHOLDS`, `DEFAULT_FACTOR_WEIGHTS`); SignalContribution-shape met `score × renormalizedWeight`; alle catalogi versioned | ✅ |
| Reproduceerbare modellen? | Pure functies door analytics-laag; 2049 tests waarvan veel "determinisme"-tests; methodology-pagina met live-snapshot | ✅ |
| Datakwaliteit zichtbaar? | data-quality.ts + DataQualityPanel; per-holding severity; renormalisatie-warnings; `Bruikbaar gewicht: X%`-pills | ✅ |

Simons-lens is volledig gedekt — dit is waarschijnlijk de sterkste dimensie van de app.

### 2.5 Wood — **7/10**

| Vraag | Bewijs | Verdict |
|---|---|---|
| AI-native? | 6-domein explainability-laag, daily-briefing, research-dossier, behavioral-coach, AI-explain-panel; provider-abstractie met cost-meter | ✅ |
| Innovatief genoeg? | Module 13 community-benchmark met k-anonimiteit is novel; Module 12 stress-builder + Module 7 explainability-uniform-shape ook; **maar veel AI is "uitleg-laag" niet "intelligence-laag"** | ⚠️ |
| Exponentieel betere gebruikerswaarde? | Schaalbaar zodra Redis-migratie + cost-meter wireup gebeurt; **op dit moment niet exponentieel — wel meervoudig** | ⚠️ |

Wood-lens is het zwakst. AI is nu vooral *explainer* (vertaalt analytics-output naar spreektaal), niet *predictor* of *agent*. Dat is bewust — Buffett-laag wint hier — maar voor "exponentieel betere waarde" zou bv. een AI-aangedreven research-dossier-uplift, conversational-portfolio-coach met memory, of agent-based-execution nodig zijn.

---

## 3. Top 25 verbeterpunten

Geprioriteerd: P0 = launch-blocker, P1 = sprint-must, P2 = roadmap, P3 = nice-to-have.

| # | Prio | Categorie | Verbeterpunt | Effort |
|---|---|---|---|---|
| 1 | **P0** | Privacy/AVG | Voeg `/api/user/export` JSON-endpoint toe (recht op inzage) | 1d |
| 2 | **P0** | Privacy/AVG | Voeg `/api/user/delete` confirmation-flow toe (recht op vergetelheid) | 2d |
| 3 | **P0** | Privacy/AVG | `/privacy` + `/terms` pagina's (genereer uit bestaande markdown) | 0.5d |
| 4 | **P0** | Privacy/AVG | Cookie-banner (functional-only acknowledgement) | 0.5d |
| 5 | **P0** | Compliance | DPA documenteren met Anthropic + andere AI-providers | 0.5d (legal) |
| 6 | **P0** | Monetisatie | Stripe/Mollie webhook-handler + checkout-flow (M32 finishen) | 5d |
| 7 | **P1** | Schaalbaarheid | Migreer `TtlCache` naar Redis-store (skeleton bestaat) | 3d |
| 8 | **P1** | Schaalbaarheid | Migreer magic-link rate-limit naar Redis | 1d |
| 9 | **P1** | Performance | Wire-up cost-meter naar bestaande AI-callsites (briefing, explainability, dossier) | 1d |
| 10 | **P1** | Observability | `@sentry/nextjs` dependency + DSN aansluiten + `instrumentation.ts` | 1d |
| 11 | **P1** | Audit | Audit-coverage rondmaken (strategy-preset, policy-updates, multi-portfolio mutations) | 1d |
| 12 | **P1** | Security | `/api/market/*` auth-check OF strakker rate-limit (5/min ipv 10/min) | 0.5d |
| 13 | **P1** | UX | Disclaimers op `/portfolio-health` en `/portfolio` toevoegen (consistentie) | 0.25d |
| 14 | **P1** | UX | Onboarding inline-wizard ipv 3-stap-route-bounce | 2d |
| 15 | **P2** | A11y | Focus-visible utility globaal + aria-labels op alle icon-only knoppen | 1.5d |
| 16 | **P2** | Mobile | Container-queries op charts (ImpactChart, allocaties); reduce padding op <=640px | 1d |
| 17 | **P2** | Performance | Static-revalidation op `/methodologie`, `/pricing`, `/login` (publieke pages) | 0.5d |
| 18 | **P2** | Test-coverage | Data-laag tests (repositories): portfolio, alert, transaction | 2d |
| 19 | **P2** | Test-coverage | Audit + mail module krijgen baseline-tests | 1d |
| 20 | **P2** | Validatie | Zod-schemas op server-action-input (incrementeel; start met strategy-lab) | 2d |
| 21 | **P2** | UX | Color-pattern (icon-prefix) voor color-blind-toegankelijkheid | 1d |
| 22 | **P3** | AI | Drill-down per signaal in confidence-cockpit (welke factor leverde welke score) | 2d |
| 23 | **P3** | AI | Conversational-coach met conversation-memory (chat-page uplift) | 4d |
| 24 | **P3** | Monetisatie | Trial-flow + email-nurture na 7d zonder portfolio-import | 2d |
| 25 | **P3** | i18n | URL-routing (`/en/dashboard`) + alle UI-strings via `t()` | 5d |

**Totaal P0**: ~9 dagen werk → eerstvolgende sprint.
**Totaal P1**: ~10 dagen → sprint daarna.

---

## 4. Blocker-issues

Concrete launch-stoppers — kunnen niet weg gepatcht worden zonder commercieel risico:

### B1 — Geen GDPR/AVG-compliance-flows
**Wat ontbreekt**: delete-account-flow, data-export-flow, `/privacy`-pagina, `/terms`-pagina, cookie-banner.
**Wettelijk risico**: AVG art. 15 (inzage), art. 17 (vergetelheid). Zonder deze flows kan een EU-gebruiker een klacht indienen → AP-fine.
**Impact**: launch-blokkade voor commerciële release. Voor private beta met opt-in waivers acceptabel.
**Fix-effort**: ~4 dagen voor flows + pagina's; advocaat-review nodig voor terms.

### B2 — Geen betalingsverwerker
**Wat ontbreekt**: Stripe of Mollie integratie. Pricing-page bestaat, entitlements-catalog correct, maar checkout is een dead-link.
**Impact**: 0 revenue mogelijk. Bestaande PaywallCard tonen "upgrade naar Pro" maar er is geen upgrade-flow.
**Fix-effort**: ~5 dagen (subscription model + webhook + failed-payment-recovery).

### B3 — In-memory caches breken multi-instance deploy
**Wat ontbreekt**: Redis-store voor `TtlCache` (market-data + briefing + explainability) en magic-link rate-limit.
**Impact**: Bij Vercel-deploy met >1 replica: cache-hit-rate halveert per extra replica. Magic-link rate-limit wordt ineffectief — een aanvaller die N IPs heeft krijgt N× de quota. Op single-instance acceptabel, op horizontal-scale operationeel risico.
**Fix-effort**: ~4 dagen (skeleton bestaat).

---

## 5. Quick wins

Lage effort, hoge zichtbare impact — kunnen in 1 sprint-dag.

| # | Actie | Effort | Impact |
|---|---|---|---|
| Q1 | Disclaimer-banner op `/portfolio-health` + `/portfolio` toevoegen | 30min | Consistente compliance-impressie |
| Q2 | `/privacy` en `/terms` pages renderen uit bestaande markdown | 1u | GDPR-zichtbaarheid + footer-link |
| Q3 | Cookie-banner (functional-only) | 1u | Wettelijk transparant zonder tracking-claim |
| Q4 | Aria-labels op icon-only knoppen (research-dossier, action-cards, before-after-toggles) | 2u | A11y-compliance verbeterd |
| Q5 | Wire-up cost-meter naar `briefing/loader.ts` (`recordAICost(...)` na elke provider-call) | 1u | Kosten-zicht zichtbaar in logs |
| Q6 | Wire-up cost-meter naar `explainability/service.ts` | 1u | Zelfde |
| Q7 | `temperature: 0` expliciet in provider-calls | 30min | Reproduceerbare AI-output |
| Q8 | Footer-component met "Privacy / Terms / Methodology / Status"-links | 30min | Trust-signal |
| Q9 | Grow `transactionRepository.list({take})` naar UI-pagination (server-component al ready) | 2u | Voorkomt edge-case-laadtijden |
| Q10 | README.md publieke "wat maakt dit anders"-positioning toevoegen | 1u | Marketing-narrative |

**Totaal**: ~10-11 uur — 1 dag oplevert 10 zichtbare verbeteringen.

---

## 6. Technische schuld

### TS1 — Repository-laag heeft geen unified error-classification
Sommige repositories werpen Prisma-errors door, andere catchen en returnen null. UI moet zelf raden of het "geen rechten" / "tijdelijke fout" / "data ontbreekt" is.
**Aanbeveling**: introduceer `RepositoryResult<T> = {ok: true, value: T} | {ok: false, code: ErrorCode, retryable: boolean}` en migreer incrementeel.

### TS2 — `bulkImport` doet één-rij-per-call upserts
`alertRepository.persistCandidates` en `transactionRepository.bulkImport` doen iteratief `try { create } catch (P2002) { update }`. Acceptabel voor 50-200 rijen, niet voor 10k+.
**Aanbeveling**: `createMany({skipDuplicates: true})` + 1 fallback-update voor de echte conflicts.

### TS3 — In-memory caches (zie B3 hierboven)
**Aanbeveling**: zelfde Redis-skeleton uitbreiden naar 3 caches.

### TS4 — Onboarding-flow is route-bouncing
3 routes gelinkt vanuit één state-machine. Geen inline-wizard; geen telemetrie per stap.
**Aanbeveling**: Module 22-style refactor naar inline-wizard met server-action per stap.

### TS5 — Test-coverage onevenwichtig
Analytics 52% / Data-laag 31% / audit + mail 0%. Repositoires zijn de meest-frequent-changed code en hebben de minste tests.
**Aanbeveling**: data-laag-tests prioriteren; één per repository als baseline.

### TS6 — Sommige `findMany` zonder `take`
5 files met unbounded reads. Voor huidige dataset prima; voor schaal niet.
**Aanbeveling**: lint-rule of audit-grep in CI.

### TS7 — AI-providers zonder expliciete `temperature=0`
Niet getest of huidige defaults reproduceerbaar zijn. Caching maskeert het probleem (zelfde input = cache-hit) maar bij cache-miss kan output verschillen.
**Aanbeveling**: expliciet `temperature: 0` overdragen via `AICompletionRequest`.

### TS8 — Numeric-claim-validator is "best-effort"
Hedged-language-check accepteert "kan mogelijk overweeg kijken" als geldig.
**Aanbeveling**: zwaardere taalmodel-test of regex-set strenger maken.

---

## 7. UX-fricties

### F1 — Onboarding bouncet tussen routes
Nieuwe gebruiker komt op `/onboarding` → klikt naar `/profiel` → vergeet → komt terug → klikt naar `/portfolio` → vergeet ... Geen save-progress-feedback.

### F2 — Mobile: charts overflow op <=640px viewport
ImpactChart, allocaties-charts, factor-radar — desktop-first met `lg:grid-cols-2`. Op mobile val je op single-column met krappe padding.

### F3 — Color-only signaling
Tone-palette gebruikt alleen kleur. 8% van mannelijke gebruikers heeft kleurenblindheid. Geen tekst/icon-prefix.

### F4 — Silent failures in chat-page
`ContextChat` doet `.catch(() => null)` → "Chat wacht op data" zonder reden. Gebruiker weet niet of het permission, network of parse-error is.

### F5 — Disclaimers ongelijk verdeeld
Stress-test heeft prominente amber-banner; portfolio-health heeft geen banner. Voor consistentie: globale `ComplianceBanner` is correct, maar feature-specifieke "data is informatief" prompts ontbreken op sommige pagina's.

### F6 — Monetisatie-friction: PaywallCard toont upgrade-CTA naar dead pricing-page
Pricing-page bestaat maar heeft geen checkout. Klik op "Upgrade naar Pro" → pricing-page → tier-switcher (dev-only) → niets. Frustration-loop.

### F7 — Geen breadcrumbs of navigatie-context op detail-pagina's
`/score/[ticker]` heeft geen "Terug naar watchlist"-link. `/doelen/[id]` idem.

### F8 — Empty-states zijn statisch
"Geen portefeuille" / "Geen alerts" — geen actiegerichte CTA met deeplink naar de import/setup-flow.

### F9 — Keyboard-navigatie verstrooid
Focus-visible ontbreekt op tabs, action-cards, dialog-triggers. Voor power-users die met tab-key navigeren is de ervaring brokkelig.

### F10 — Decimal-conventie inconsistent in copy
Sommige pagina's tonen `12.5%` (US-style), andere `12,5%` (NL-style). EU-norm zou `12,5%` overal moeten zijn. Numeric-claim-validator tolereert beide; UI tolereert het niet.

---

## 8. Monetisatie-lekken

### M1 — Geen checkout-flow
Pricing-page → klik upgrade → niets. **Direct revenue-lek**: geïnteresseerde gebruikers kunnen niet betalen.

### M2 — Geen trial-experience
FREE-tier heeft 10 holdings. Een gebruiker met 25 holdings ziet PaywallCard maar krijgt geen "probeer Pro 14 dagen gratis"-aanbod. Standard SaaS-conversion-mechanic ontbreekt.

### M3 — Geen email-nurture na onboarding
Gebruiker importeert geen portfolio binnen 7d → geen reminder. Drop-off zonder follow-up.

### M4 — ADVISOR-tier is "op aanvraag" zonder lead-form
Pricing-page noemt "Advisor — voor adviseurs en vermogensbeheerders" maar er is geen contact-formulier. `mailto:` of typeform-link minstens.

### M5 — Geen retention-loop
Geen "comeback after 14 days inactive"-email. Geen "your portfolio changed significantly"-trigger naar inactieve gebruikers.

### M6 — Geen referral-mechaniek
Geen "invite a friend" / "give 1 month, get 1 month"-flow. SaaS-norm voor B2C.

### M7 — Pricing-tier-switcher staat in productie zichtbaar
`/pricing` toont "In productie wordt dit door billing-provider gestuurd"-debug-strook. **Trust-issue**: gebruiker ziet "dit werkt nog niet" — moet weg vóór commerciële launch.

### M8 — Geen invoice/receipt download
Eenmaal Stripe gewireup is: factuur-flow + Auto-VAT-handling EU-regels (BTW per land voor B2C/B2B-klanten).

### M9 — Geen annual-discount-keuze in pricing-page
TIER_CATALOG heeft `monthlyPriceEur: 9.95` en `yearlyPriceEur: 95` (PRO) — yearly = ~21% korting — maar pricing-page maakt het niet expliciet. Mensen kiezen monthly omdat de keuze niet wordt aangeboden.

### M10 — Geen team-pricing
ADVISOR-tier is per-organisatie maar billing-model nog niet uitgewerkt. Per-seat? Per-cliënt? Flat-fee? Niet beslist.

---

## 9. Security/privacy-risico's

### R1 — In-memory rate-limit (multi-instance)
Bij replicas: aanvaller met N IPs krijgt N× de quota. **Risk-level**: medium. Mitigatie: Redis-migratie (zie B3).

### R2 — Geen sliding-refresh op sessie-cookies
7-dagen-vast geldig. Gestolen cookie blijft 7 dagen bruikbaar. **Risk-level**: medium. Mitigatie: 24u-stale-window + activity-based refresh.

### R3 — `/api/market/*` ongeauthenticeerd
Provider-quota-misuse mogelijk. Yahoo-fallback houdt het deels af; Alpha Vantage 25 req/dag free-tier is fragiel. **Risk-level**: low-medium. Mitigatie: auth-check OF strakker rate-limit (5/min ipv 10/min).

### R4 — Geen audit-log retention-policy
`AuditEntry`-rijen blijven oneindig staan. AVG vraagt om rechtvaardigheid bij retentie. **Risk-level**: medium. Mitigatie: 12-maanden TTL, of 5 jaar voor financial-tracing-context (afhankelijk van AFM-context).

### R5 — Geen DPA met AI-providers
Anthropic/OpenAI verwerken portfolio-holdings (geen PII maar wel financieel). Zonder DPA: AVG art. 28-overtreding bij commerciële launch. **Risk-level**: high voor commerciële launch, low voor private beta. Mitigatie: provider-DPA's tekenen + documenteren.

### R6 — `redactDeep` niet automatisch toegepast op log-output
Module 15 leverde de helper, maar wireup als log-sink-pre-processor is nog niet gedaan. Een toekomstige `log.error("...", { detail: req.headers })` kan nog steeds een Cookie-string lekken. **Risk-level**: low. Mitigatie: één regel in `src/lib/log.ts`.

### R7 — Geen Zod-validatie op nested input
Server-actions accepteren typed-interfaces maar runtime-checks zijn handmatig. Een malformed `factorWeights` of `config` object kan deels worden geaccepteerd. **Risk-level**: low. Mitigatie: incrementeel Zod introduceren op de meest-gebruikte actions.

### R8 — Watchlist `note`-veld niet XSS-sanitized
Length-capped maar niet gesanitiseerd. Op dit moment geen XSS-risico (alle rendering server-side), maar als de UI ooit `dangerouslySetInnerHTML` introduceert: risico. **Risk-level**: low.

---

## 10. Advies voor de eerstvolgende sprint

### Sprint-thema: **"Launch readiness"**

**Doel**: van "feature-compleet" naar "commercieel lanceerbaar". Geen nieuwe features.

**Sprint-duur**: 2 weken (10 werkdagen).

### Week 1 — Compliance & legal

| Dag | Taak | Effort |
|---|---|---|
| D1 | `/api/user/export` JSON-endpoint (recht op inzage) | 1d |
| D2 | `/api/user/delete` confirmation-flow + cascading-deletes | 1d |
| D3 | `/privacy` + `/terms` pagina's (uit markdown rendering) | 0.5d |
| D3 | Cookie-banner (functional-only) | 0.5d |
| D4 | DPA-templates met Anthropic + OpenAI tekenen + documenteren | 0.5d (legal heen-en-weer) |
| D4 | Footer-component (Privacy / Terms / Methodology / Status) | 0.5d |
| D5 | Audit-log retention-policy + cron-job voor 12-mnd-purge | 1d |

### Week 2 — Operations & monetisatie

| Dag | Taak | Effort |
|---|---|---|
| D6 | Redis-migratie `TtlCache` (briefing + explainability + market-data) | 2d |
| D7 | (D6 vervolg) | |
| D8 | Magic-link rate-limit naar Redis | 0.5d |
| D8 | Cost-meter wire-up (3 callsites) + `temperature: 0` | 0.5d |
| D9 | Stripe webhook + checkout-flow (PRO + ELITE; ADVISOR sales-led) | 1.5d |
| D10 | (D9 vervolg) + smoke-test + deploy-staging | 0.5d |

### Out-of-sprint (parallel-track)
- Quick wins Q1-Q4 (1u elk; door junior of solo-dev)
- Sentry installatie + DSN (1u; door ops)
- README publieke positioning (1u; door PM/lead)

### Definition of Done voor sprint
- ✅ EU-gebruiker kan alle data exporteren in 1 click
- ✅ EU-gebruiker kan account verwijderen + krijgt confirmation-email
- ✅ `/privacy` + `/terms` zijn live met geldige juridische tekst
- ✅ Cookie-banner is zichtbaar bij eerste bezoek
- ✅ Multi-instance Vercel-deploy heeft cache-hit-rate >50% (Redis)
- ✅ Magic-link rate-limit blijft effectief over replicas
- ✅ AI-cost-meter draait op alle 3 hot AI-callsites; nightly-snapshot in audit-log
- ✅ PRO en ELITE checkout-flow werkt end-to-end via Stripe-staging
- ✅ Pricing-page toont monthly/yearly toggle met -21% korting

### Wat NIET in deze sprint
- Nieuwe features (ondanks roadmap-druk)
- AI-uplifts (chat-memory, dossier-AI) — Wood-laag-werk komt v2
- Mobile-first refactor — accepteer "mobile-usable" voor v1
- Multi-language URL-routing — `t()` werkt al
- ADVISOR-tier billing-model — wachten op pilot-organisatie

---

## 11. Methodologie-bijlage

**Audit-aanpak**:
1. 4 parallelle Explore-agents in het BeleggerIQ-codebase
   - Agent 1: product-quality + UX + mobile + a11y
   - Agent 2: technical + AI + scalability + tests
   - Agent 3: data-quality + financial-explainability + reproducibility
   - Agent 4: monetization + privacy + competitive
2. Synthesese tegen 5 belegger-lenzen
3. Geprioritiseerde verbeterpunten + sprint-advies

**Data-bronnen**:
- Codebase op commit `9ef9ff7` (post-Module-16)
- 16 module-docs (`docs/*.md`)
- 26 productie-pages onder `src/app/(app)/`
- 15 API-routes onder `src/app/api/`
- 2049/2049 tests groen

**Beperkingen**:
- Geen runtime-load-test (productie-data ontbreekt)
- Geen pen-test door derde
- A11y-audit op code-niveau, niet via screenreader-walkthrough
- Geen bundle-size-meting (out-of-scope)

---

## 12. Slot

**De app is sterk in fundament, niet in commercialisering**. Het verschil tussen "16 modules met 2049 tests" en "een product dat klanten betaalt" zit in 9 dagen werk: GDPR-flows + Stripe + Redis. Daarna zit elk volgende module op een schaalbaar fundament.

De topbelegger-lenzen scoren gemiddeld **8.2/10** (Buffett 8, Dalio 9, Lynch 8, Simons 9, Wood 7). Wood is bewust het zwakst — de keuze om AI als *explainer* te positioneren ipv *predictor* is een Buffett-conform-keuze. Voor een Wood-uplift (chat-met-memory, agent-flows) is een aparte AI-architecture-sprint nodig na launch.

**Aanbevolen volgende stap**: Sprint hierboven planmen, geen nieuwe features. Privacy-flows zijn niet sexy maar zijn de poort naar omzet.
