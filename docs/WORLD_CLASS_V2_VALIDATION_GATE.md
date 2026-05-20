# World-Class v2 Validation Gate — Module 35

**Scope**: beoordeelt of de v2-feature-set (Module 22 t/m 34) BeleggerIQ daadwerkelijk dichter bij een wereldklasse beleggingsapp brengt. "v2" verwijst naar de feature-set, niet naar een rapport-iteratie (zie ook `WORLD_CLASS_VALIDATION_REPORT.md` / `_V2` / `_V3` voor eerdere gates).

**Datum**: 2026-05-20 · **Codebase-staat**: typecheck schoon · **2694/2694 tests** (217 files) · 1 kritieke bug gefixt tijdens deze gate.

---

## 0. Samenvatting

| Gate-dimensie | Oordeel | Trend t.o.v. v1 |
|---|---|---|
| UX | Sterk | ↑ |
| Onboarding | Sterk | = |
| Mobile-first | Goed | = |
| Vertrouwen / security / privacy | Sterk | ↑ |
| Paywall / monetisatie | Goed | ↑ |
| B2B / advisor-potentieel | Goed (pilot-klaar) | ↑↑ |
| Datakwaliteit | Sterk | ↑↑ |
| AI-kwaliteit | Goed | = |
| Researchwaarde | Sterk | ↑↑ |
| Risicomanagement | Sterk | ↑↑ |
| Performance | Goed | = |
| Beheerbaarheid | Goed | ↑ |
| Juridisch / compliance | Goed | ↑ |
| Testdekking | Sterk | ↑ |

**Eindoordeel**: de v2-set brengt BeleggerIQ meetbaar dichter bij wereldklasse. Risicomanagement (M29/M30), researchwaarde (M27/M28/M32) en datakwaliteit-transparantie (M26) zijn de grootste sprongen. Eén structurele gap: Module 25 (Live Macro Data Provider) is onafgemaakt. Geen blokkerende compliance-issues.

---

## 1. Validatie vanuit de 5 topbeleggers

### Buffett — vertrouwen, eenvoud, kwaliteit, langetermijnwaarde
- **Sterk**: M32 Moat & Owner Earnings Engine maakt Buffett's kernfilosofie expliciet meetbaar (return-on-capital + FCF + owner-earnings = 50% gewicht). M31 Stock Story geeft per asset een begrijpelijke case.
- **Sterk**: M33 landing page houdt Buffett-toon — geen 10×-claims, geen FOMO, "wat we wel/niet zijn"-trust-sectie.
- **Aandachtspunt**: M32 gebruikt FCF-proxy voor owner-earnings i.p.v. de exacte D&A/maint-CapEx-formule. Gedocumenteerd; v2-verfijning wanneer cashflow-statement-data beschikbaar komt.

### Dalio — risico, regimes, scenario's, spreiding
- **Sterk↑↑**: M29 Risk Control Tower consolideert 12 risicocategorieën in één scherm. M30 Risk Trend maakt risico-evolutie over tijd zichtbaar.
- **Sterk**: M28 Correlation Studio levert de all-weather-kern (lage paarsgewijze correlatie = robuuste portfolio).
- **Gap**: M25 Live Macro Data Provider is onafgemaakt — regime-classificatie draait nog op seed/snapshot-data i.p.v. live ECB/inflatie-feeds. Dalio-laag is daarmee incompleet.

### Lynch — begrijpelijke uitleg
- **Sterk**: M31 Stock Story is expliciet plain-language ("Wat doet dit?"). M29/M30 gebruiken kwalitatieve labels boven ruwe cijfers.
- **Goed**: E-mail-review (M34) en landing (M33) consequent NL-spreektaal.

### Simons — meetbare signalen, reproduceerbaarheid, datakwaliteit
- **Sterk↑↑**: M27 Signal Performance Lab brengt research-grade backtesting (hit-rate, IC, decay) — kernwens van de Simons-laag.
- **KRITIEKE BUG GEVONDEN + GEFIXT**: `opportunity-radar/signals.ts` gebruikte `new Date()` per signal → de "pure" engine was niet-deterministisch; de determinisme-test was flakey (1ms-drift). Fix: `config.now` injecteerbaar + alle `signal.detectedAt` genormaliseerd naar één `scannedAt`. Engine is nu écht reproduceerbaar. Zie §4.
- **Sterk**: M26 Data-Depth-engine kwantificeert datakwaliteit per asset/portefeuille.

### Wood — AI-native, innovatief, toekomstgericht
- **Goed**: M31 levert een AI-prompt-template (`ai-prompt.ts`) als v2-hook, met v1 deterministic — "AI-native ≠ AI-dependent".
- **Aandachtspunt**: de v2-set bevat relatief weinig nieuwe AI-inferentie; M27/M28/M29/M30/M32 zijn pure-function engines. Dat is bewust (reproduceerbaarheid), maar de AI-laag groeide niet mee. Backlog: AI-narratief op risk-trend (M30) + investment-case (M31).

---

## 2. Validatie vanuit operationele rollen

### Technisch/functioneel beheerder
- **Goed↑**: M26 Provider Health geeft per-provider success/failure/latency/stale-status in de admin-console.
- **Aandachtspunt**: `next lint` werkt niet meer (Next 16 deprecatie — `next lint` is verwijderd). Typecheck + Vitest blijven de gates. Backlog: migreer naar standalone ESLint flat-config.
- **Aandachtspunt**: provider-health + cost-meter zijn in-memory — reset bij process-restart, geen multi-instance-aggregatie. Gedocumenteerd; acceptabel voor huidige schaal.

### Langetermijnbelegger — rust, voortgang, discipline
- **Sterk**: M30 Risk Trend ("wat veranderde sinds vorige maand?") en M34 maandelijkse e-mail-review zijn precies retentie-via-rust. Maandelijkse cadans, geen real-time-dashboard-druk.

### Hedge fund / research-user
- **Sterk↑↑**: M27 Signal Performance Lab + M28 Correlation Studio + CSV-exports = research-grade workflow. M32 Moat-engine met per-component `inputsUsed`/`inputsMissing` is auditeerbaar.

### Risicoanalist — kwetsbaarheden, onzekerheid, beheersmaatregelen
- **Sterk↑↑**: consequente "geen schijnzekerheid"-discipline: M26 gray ≠ green, M27 sample-size-warnings, M30 caveats, M32 geen nep-score bij missing data.
- **Sterk**: M34 e-mail-review is privacy-by-default (geen bedragen zonder opt-in) — spec-test valideert geen `€`-bedragen.

### Marketeer — waardepropositie, conversie
- **Goed↑**: M33 landing page met 10 secties + privacy-vriendelijke conversion-tracking (14 events, geen 3rd-party pixel).
- **Aandachtspunt**: demo-cards zijn caption-only ("illustratief"); echte screenshots ontbreken nog.

### CEO — omzet, focus, schaalbaarheid, reputatierisico
- **Goed↑↑**: M23/M24 maken een B2B-advisor-propositie pilot-klaar zonder Prisma-migratie. M22/M27/M28/M32 versterken de Elite-tier-pull.
- **Reputatie**: consequent geen koop/verkoop-advies, geen verzonnen feiten, AFM/Wft-grens expliciet. Laag reputatierisico.

---

## 3. Beoordeling per gate-dimensie

| Dimensie | Bevinding |
|---|---|
| **UX** | 13 nieuwe routes/secties, consistent shadcn-pattern, collapsible detail-drawers. Geen UX-regressie. |
| **Onboarding** | Ongewijzigd t.o.v. M20; landing (M33) voegt een publieke funnel toe vóór onboarding. |
| **Mobile-first** | Nieuwe UI's gebruiken `grid-cols-1 + md:`-breakpoints consistent. Matrix-views (M28) hebben horizontale scroll — acceptabel. |
| **Security/privacy** | M24 HMAC-boundary + audit, M33 geen tracking-pixel, M34 HMAC-unsubscribe + privacy-by-default. Sterk. |
| **Paywall/monetisatie** | 3 nieuwe entitlement-keys (`dividend.drip`, `report.advisor_pdf`, `research.signal_performance`, `research.correlations`). Catalog blijft single-source-of-truth. |
| **B2B/advisor** | M23+M24 = werkende multi-client pilot. White-label voorbereid. |
| **Datakwaliteit** | M26 expliciete data-depth + provider-health. Grootste sprong. |
| **AI-kwaliteit** | Stabiel; v2-set is overwegend deterministisch. AI-prompt-hooks aanwezig maar niet geactiveerd. |
| **Researchwaarde** | M27/M28/M32 + CSV-exports tillen dit naar research-grade. |
| **Risicomanagement** | M29/M30 = centrale risico-tower + trend. Sterk. |
| **Performance** | Pure-function engines; per-ticker fetches blijven cached. Geen nieuwe N+1-patronen behalve M31/M32 per-ticker fundamentals (cached, acceptabel). |
| **Beheerbaarheid** | Provider-health-dashboard ↑. `next lint`-breuk ↓. |
| **Juridisch/compliance** | Disclaimers consequent; geen advies-claims; AVG-conforme unsubscribe + data-minimalisatie. |
| **Testdekking** | +~250 tests over de v2-set. 2694/2694 groen. |

---

## 4. Codewijziging tijdens deze gate (kritieke bug)

**Bevinding**: `src/lib/analytics/opportunity-radar/signals.ts` definieerde `DETECTED_AT = () => new Date().toISOString()`, aangeroepen in 7 signal-builders. Daardoor was `scanOpportunities` / `scanOpportunityRadar` **niet-deterministisch** — terwijl `opportunity/engine.ts` zichzelf documenteert als "Pure functie boven op een pure engine ... Reproduceerbaar". De determinisme-test (`engine.test.ts`) was flakey: faalde wanneer twee opeenvolgende scans in verschillende milliseconden landden.

**Waarom kritiek**: schendt de Simons-laag-eis (reproduceerbaarheid) én een expliciete code-claim. Een flakey test ondermijnt CI-betrouwbaarheid.

**Fix** (minimaal-invasief, geen rewrite):
- `ScanOpportunitiesInput.config.now?: string` toegevoegd — injecteerbare timestamp.
- `scanOpportunities`: `scannedAt = config.now ?? new Date().toISOString()`.
- Na candidate-selectie: alle `signal.detectedAt` genormaliseerd naar de ene `scannedAt` — één plek, raakt de 7 signal-builders niet.
- Determinisme-test geeft nu `config.now` mee en assert dat `generatedAt` + `detectedAt` deterministisch zijn.

**Resultaat**: engine is nu echt deterministisch; flakey test geëlimineerd; 2694/2694 stabiel groen.

Geen andere code gewijzigd — overige bevindingen zijn gedocumenteerd, niet gepatcht (conform Module 35-instructie).

---

## 5. Resterende risico's & gedocumenteerde bevindingen

| # | Bevinding | Ernst | Aanbeveling |
|---|---|---|---|
| 1 | **Module 25 (Live Macro Data Provider) onafgemaakt** — alleen `src/lib/data/macro/types.ts` bestaat (ongetracked). Regime-engine draait op seed/snapshot-data. | Middel | Module 25 hervatten: ECB/inflatie/Stooq-adapters + freshness + admin-integratie afmaken. Of `types.ts` verwijderen als dead code tot hervatting. |
| 2 | `next lint` werkt niet (Next 16 verwijderde de command) | Laag | Migreer naar standalone ESLint flat-config (`eslint.config.mjs`). Typecheck + Vitest dekken nu de gate. |
| 3 | Provider-health + cost-meter zijn in-memory, single-instance | Laag | Bij multi-instance-deploy: shared Redis-counters of Prometheus-export. |
| 4 | M27/M30 missen AI-narratief (bewust deterministic) | Laag | Backlog: M8 explainability-hook als nieuwe domains. |
| 5 | M33 demo-cards zijn caption-only, geen echte screenshots | Laag | Vervang met screenshots bij design-pass. |
| 6 | M34 e-mail-verzending heeft nog geen scheduled cron-handler | Middel | Vercel Cron / GitHub Actions koppelen aan `loadMonthlyReview` + `sendMail`. |
| 7 | M32 owner-earnings = FCF-proxy i.p.v. exacte Buffett-formule | Laag | Verfijnen wanneer cashflow-statement-data beschikbaar is. |
| 8 | M31 `businessSummary` nog niet doorgegeven via `EnrichedInstrument` | Laag | `EnrichedInstrument` uitbreiden met Yahoo `longBusinessSummary`. |
| 9 | Risk-trend (M30) snapshots vereisen actieve snapshot-job | Middel | Scheduled snapshot-run productie-activeren zodat de timeline zich vult. |

---

## 6. Conclusie

De v2-feature-set (M22-M34) is een **substantiële stap richting wereldklasse**:
- **Risicomanagement** is van losse pagina's naar een geconsolideerde Control Tower + trend gegaan.
- **Researchwaarde** is research-grade geworden (backtesting, correlatie, moat-analyse, CSV-export).
- **Datakwaliteit-transparantie** is een onderscheidende kracht — "geen schijnzekerheid" is consequent doorgevoerd.
- **B2B** is pilot-klaar zonder technische schuld.

**Twee echte gaten** vragen opvolging vóór een "wereldklasse"-claim: Module 25 afmaken (live macro-data) en de M34-verzend-cron + M30-snapshot-job in productie activeren — anders blijven regime- en trend-features op gedeeltelijke data draaien.

**Geen blokkerende compliance- of security-issues.** De enige kritieke codebug (non-deterministische opportunity-engine) is tijdens deze gate gefixt.
