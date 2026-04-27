# BeleggerIQ Validation Board Report
## Consolidated review across 5 expert audits — 2026-04-27

**Status:** referentiedocument voor v2.2 / v2.3 / v3.0 sprint-planning.
Brongegevens: `CHANGELOG.md` (entries van 2026-04-27 over de vijf
expertvalidaties).

---

## 1. Executive summary

Vijf parallelle audits (Dalio/Krugman/El-Erian · Buffett/Druckenmiller/Wood
· Asness/Simons/Ng · Taleb/Marks · Kahneman/Thaler) leverden samen
**47 bevindingen**, waarvan **18 al gefixt** in de afgelopen sprint.
De resterende **29 issues** clusteren rond drie thema's:

1. **Schijnzekerheid in numerieke output** — engines geven puntwaardes
   (riskScore, scenario-impact, confidence) zonder error-band of
   cycle-context. Gebruiker ziet "78/100" en interpreteert dat als
   precisie die er statistisch niet is.
2. **Asymmetrische bescherming** — winnaars worden inmiddels beschermd
   (Buffett-laag), maar de allocation-engine sized nog niet
   asymmetrisch (Druck-laag) en de risk-engine is regime-blind.
   Resultaat: defensief gedrag bij rust, agressief bij stress.
3. **Compliance-laag ontbreekt formeel** — geen globale "geen-
   beleggingsadvies"-banner, geen ack-checkbox bij grote verkopen,
   geen audit-trail-export. Voor publieke launch een blocker, niet
   een nice-to-have.

**Totaalverdict:** BeleggerIQ is intern coherent, statistisch verbeterd
ten opzichte van v1, en gedragsmatig veilig voor één-op-één-gebruik door
een geïnformeerde beheerder. **Niet klaar voor publieke launch zonder
de 6 must-fix-items hieronder.** Niet klaar voor monetisatie zonder de
7 should-fix-items.

---

## 2. Top-15 productrisico's

Geordend op risico voor de eindgebruiker (= "verliest hij hierdoor geld
of vertrouwen?"), niet op moeilijkheid.

| # | Risico | Bron-audit | Severity |
|---|---|---|---|
| **1** | Geen "geen-beleggingsadvies"-disclaimer in de UI; bij claim van een gebruiker die geld verliest na een SELL-advies, juridisch kwetsbaar | Compliance (Taleb) | **Critical** |
| **2** | Risk-engine is regime-blind: een "low-risk"-portefeuille in een bull-market is precies wanneer drawdown-risico het hoogst is | Marks / Reality | **High** |
| **3** | Confidence-getallen (78/100, 0.82) suggereren precisie die er statistisch niet is — geen error-band, geen P5/P95 | Asness / Simons | **High** |
| **4** | Allocation-engine sized niet asymmetrisch — high-conviction names krijgen dezelfde EUR-allocatie als lukrake hits | Druckenmiller | **High** |
| **5** | €500-budget edge-case: dure aandelen geven "0 stuks koop"-advies zonder fallback ("spaar 2 maanden") | Strategie | **High** |
| **6** | Look-ahead-bias in custom backtests is niet automatisch detecteerbaar — strategy-developer kan onbedoeld toekomstige prijzen gebruiken | Asness / Simons | **High** |
| **7** | Geen tax-aware selling — NL box-3 maakt verkopen anders dan tax-loss-harvesting jurisdicties | Strategie | **Medium** |
| **8** | USD-shock alleen unidirectioneel (UP_10); geen DOWN-mirror | Macro / Reality | **Medium** |
| **9** | RATES_UP_5 ontbreekt voor 1994/2022-stijl bond-rout | Macro | **Medium** |
| **10** | Geen `INNOVATION`-business-quality-label — Tesla-2018 / Palantir-2020 worden als SPECULATIVE gemerkt | Cathie Wood | **Medium** |
| **11** | AI-validators (`validateDashboardSummary`) niet runtime-gewired; race-condition als LLM-swap komt | Andrew Ng | **Medium** |
| **12** | Geen audit-trail-export voor compliance/tax (downloadbaar CSV/JSON van adviezen + status) | Compliance | **Medium** |
| **13** | Backtest mist bid/ask-spread + slippage-modelling — onderschat reële kosten met 5-15bps per trade | Asness | **Medium** |
| **14** | Mispricing scanner heeft geen min-sample-size voor peer-percentile (n ≥ 5) — dunne sectoren leveren onbetrouwbare percentile-ranks | Quant | **Medium** |
| **15** | Geen ack-checkbox of friction-modal bij HIGH-RISK SELL > €5.000 — System-2 nudge is een tekstregel, geen klikvereiste | Kahneman / UX | **Medium** |

---

## 3. Top-15 verbeteringen (gerangschikt op impact/effort-ratio)

| # | Verbetering | Impact | Effort | Audit |
|---|---|---|---|---|
| 1 | Globale compliance-banner + footer-disclaimer | Critical | 1 dag | Compliance |
| 2 | Tail-risk-pill (rood "Tail-risk") op BLACK_SWAN/TOP_POSITION_BLOWUP-cards | High | 0.5 dag | Reality |
| 3 | Cycle-aware risk-tilt: hoge waardering + lage vol → "complacency"-warning | High | 2 dagen | Marks |
| 4 | Asymmetrische sizing in allocation-engine: composite ≥ 80 + confidence ≥ 0.8 → +X% binnen cap | High | 3 dagen | Druck |
| 5 | €500-budget fractional-fallback + "spaar 2 maanden voor 1 ASML"-suggestion | High | 1 dag | Strategie |
| 6 | Error-bands op scenario-impacts (P5/P50/P95) | High | 3 dagen | Quant / Reality |
| 7 | Wire `validateDashboardSummary` runtime in `/api/ai/explain` (LLM-swap-ready) | Medium | 1 dag | Ng |
| 8 | Audit-trail-export (CSV/JSON van DecisionHistory) | Medium | 1 dag | Compliance |
| 9 | USD_DOWN_20 + RATES_UP_5 scenarios | Medium | 1 dag | Macro |
| 10 | Ack-checkbox bij HIGH RISK_REDUCTION > drempel | Medium | 1 dag | UX |
| 11 | Min-sample-size in mispricing scanner (n ≥ 5 voor peer-percentile) | Medium | 1 dag | Quant |
| 12 | Inflation/yield-curve aansluiten op echte data-feed in `fetchRegimeInputs` | Medium | 2 dagen | Macro |
| 13 | Late-cycle holdback in monthly-buy: RISK_ON + valuation > p80 → 10% extra cash | Medium | 2 dagen | Strategie |
| 14 | Backtest bid/ask + slippage-modelling | Medium | 2 dagen | Asness |
| 15 | Engine-disagreement-warning: SELL & BUY voor zelfde ticker → meta-warning | Low | 1 dag | UX / Quant |

---

## 4. Must-fix before public launch

Zonder deze items is publieke launch onverantwoord. Naar volgorde van
blok-criteria:

1. **Globale compliance-banner** (#1 verbetering). Eén-zin-disclaimer
   onderaan elke pagina + uitgebreide TOS. *Blocker — juridisch.*
2. **Audit-trail-export** voor DecisionHistory (#8). Gebruiker moet
   zijn beslissingen kunnen exporteren voor administratie/tax.
3. **Ack-checkbox bij HIGH RISK_REDUCTION** > €5.000 of > 5% van
   portefeuille (#10). Voorkomt panic-claim.
4. **Tail-risk-pill** op BLACK_SWAN/TOP_POSITION_BLOWUP (#2).
   Schijnzekerheid-blocker.
5. **Inflation/yield-curve data-feed aansluiten** in
   `fetchRegimeInputs` (#12). Engine heeft de drivers; productie-data
   ontbreekt nog.
6. **Look-ahead-warning op custom strategies**. Backtest-output van
   custom strategies krijgt automatisch een `look-ahead`-warning zodat
   de gebruiker weet dat hij zelf moet checken.

**Acceptatiecriterium voor launch:** alle 6 items in productie + e2e-
test dat de banner op `/dashboard`, `/portfolio`, `/risico`, `/kansen`
zichtbaar is.

---

## 5. Should-fix before monetization

Deze 7 items zijn nodig voordat je iemand laat **betalen** voor BeleggerIQ:

7. **Asymmetrische sizing** in allocation-engine (#4). Druck-laag —
   anders ziet betalende user geen verschil met free-ETF-allocator.
8. **Cycle-aware risk-tilt** (#3). Marks-laag — bull-market complacency-warning.
9. **Error-bands op scenario-impacts** (#6). P5/P50/P95 zodat puntwaardes
   geen schijnzekerheid geven.
10. **€500-budget fractional-fallback** (#5). Beperkt anders productivly
    tot grote portefeuilles.
11. **AI-validators runtime-wire-up** (#7). Compliance + LLM-swap-readiness.
12. **USD_DOWN_20 + RATES_UP_5** scenarios (#9). Symmetrische macro-coverage.
13. **Mispricing scanner min-sample-size** (#11). Anders leveren dunne
    sectoren misleidende rankings.

---

## 6. Nice-to-have

14. Late-cycle holdback in monthly-buy (#13).
15. Backtest bid/ask + slippage-modelling (#14).
16. Engine-disagreement-warning (#15).
17. INNOVATION business-quality-label (Wood-laag).
18. Tax-aware selling.
19. Out-of-sample backtest split (`holdoutMonths`).
20. Deflated Sharpe (Bailey/López de Prado) bij multi-strategy-vergelijking.
21. Golden-master tests voor explainer-output.
22. Cycle-meter visualisatie op dashboard.
23. INNOVATION-tilt revenue-growth + R&D-intensity inputs.

---

## 7. Score per domein (consolidated)

Schaal 1-5; **na huidige sprint**.

| Domein | Score | Status |
|---|---|---|
| **Macro & Economische Validatie** | **4** | Inflation + yield-curve drivers + STAGFLATION operationeel; data-feed-aansluiting open |
| **Beleggingsstrategie & Praktische Toepasbaarheid** | **3.5** | Winner-protection in actions; asymmetrische sizing + €500-fallback open |
| **Quant, AI & Algoritme** | **3.7** | Min-coverage-floor + backtest methodology-warnings; AI-runtime-validatie open |
| **Risk, Compliance & Reality Check** | **3.7** | BLACK_SWAN + TOP_POSITION_BLOWUP scenarios; compliance-banner + audit-export open |
| **UX & Behavioral Finance** | **4** | Niets-doen-nudge + softer urgency + System-2-reflectie; ack-checkbox + globale banner open |
| **Production-readiness (overall)** | **3.7** | Goed voor private beta; niet klaar voor publieke launch |

---

## 8. Roadmap

### v2.2 — "Compliance-launch-ready" (target: 2 weken)

**Sprint goal:** publieke launch onverantwoord blokkeren.

- M1: globale compliance-banner + TOS-pagina
- M2: audit-trail-export (CSV/JSON DecisionHistory)
- M3: ack-checkbox HIGH RISK_REDUCTION
- M4: tail-risk-pill UI + tail-banner
- M5: data-feed `inflationYoy` + `yieldCurveSlope` in `fetchRegimeInputs`
- M6: look-ahead-warning op custom backtests

**Validatie-criterium:** alle 6 items in productie; e2e-test op
disclaimer-zichtbaarheid; manual UAT met externe lezer.

### v2.3 — "Pro-features-launch" (target: 4-6 weken)

**Sprint goal:** monetisatie verantwoord ondersteunen.

- M7: asymmetrische sizing in allocation-engine + tests
- M8: cycle-aware risk-tilt (complacency-warning)
- M9: error-bands op scenario-impacts (P5/P50/P95)
- M10: €500-budget fractional-fallback + "spaar X maanden"-suggestion
- M11: AI-validators runtime-wire-up + reject-on-claim
- M12: USD_DOWN_20 + RATES_UP_5 scenarios
- M13: mispricing scanner min-sample-size

**Validatie-criterium:** beta-cohort van 10-25 betalende users gedurende
4 weken; geen incident-class user-loss-claim.

### v3.0 — "Behavioral & data-driven" (target: 3 maanden)

**Sprint goal:** echte product-differentiatie tegenover ETF-only allocators.

- M14: INNOVATION business-quality-label (revenue-growth + R&D inputs)
- M15: late-cycle holdback in monthly-buy
- M16: tax-aware selling (NL box-3-tilt)
- M17: out-of-sample backtest split + deflated Sharpe
- M18: cycle-meter UI-component op dashboard
- M19: feedback-loop: DecisionHistory MARKED_DONE/IGNORED → engine-calibration
- M20: golden-master tests + AI-output-fingerprint per release

**Validatie-criterium:** 100+ users; meetbaar betere outcomes dan
ETF-baseline op 12-maands TWR (statistical-significant ≥ 90% confidence).

---

## 9. Concrete Claude Code-implementatiemodules

Per must/should-fix item, de exacte modules + testcriteria. Volgorde =
uitvoervolgorde.

### M1 — Compliance banner

**Bestanden:**
- `src/components/common/compliance-banner.tsx` (NEW)
- `src/app/(app)/layout.tsx` (wire in als footer)
- `src/app/disclaimer/page.tsx` (NEW — uitgebreide TOS)

**Validatiecriteria:**
- E2E: disclaimer-tekst zichtbaar op `/dashboard`, `/portfolio`,
  `/risico`, `/kansen`, `/maandbeslissing`.
- Tekst bevat: "Indicatief, geen beleggingsadvies",
  "Eindverantwoordelijkheid bij gebruiker", link naar `/disclaimer`.
- Banner is niet weg te klikken zonder cookie-set; cookie respecteert
  GDPR.

### M2 — Audit-trail-export

**Bestanden:**
- `src/lib/analytics/decision-history/export.ts` (NEW — pure CSV/JSON-builder)
- `src/lib/analytics/decision-history/export.test.ts` (NEW — 8+ tests)
- `src/app/api/decisions/export/route.ts` (NEW — auth + ownership)
- `src/components/dashboard/decision-cockpit/decision-history-preview.tsx`
  (export-knop toevoegen)

**Validatiecriteria:**
- CSV bevat alle DecisionRecord-velden + status-historie.
- JSON-export valideert tegen `DecisionRecord[]`-schema.
- API rate-limit max 5 export/min/user.
- Test: export → re-import in Excel → alle kolommen aanwezig.

### M3 — Ack-checkbox HIGH RISK_REDUCTION

**Bestanden:**
- `src/components/dashboard/decision-cockpit/risk-action-card.tsx`
  (UI-uitbreiding)
- `src/lib/analytics/decision-history/snapshot-builder.ts` (extra
  `requiresAck`-flag)
- `src/app/api/decisions/[id]/status/route.ts` (server-side ack-check)

**Validatiecriteria:**
- Ack-checkbox verplicht voor `severity = critical` OF `amount > €5.000`
  OF `weight > 5%`.
- API rejecteert `MARKED_DONE` zonder `ackTimestamp` voor deze records.
- Test: 5 unit-tests dekken alle drempels.

### M4 — Tail-risk-pill UI

**Bestanden:**
- `src/lib/analytics/dashboard/scenario-snapshot.ts` (toevoegen
  `tailRiskTier: 'mild' | 'severe' | 'tail'`)
- `src/components/dashboard/decision-cockpit/scenario-impact-card.tsx`
  (pill-rendering)

**Validatiecriteria:**
- BLACK_SWAN + TOP_POSITION_BLOWUP krijgen `tailRiskTier = 'tail'`
  automatisch.
- Pill: rood "Tail-risk" naast scenario-naam.
- Test: 4 unit-tests (mild/severe/tail/mapping).

### M5 — Data-feed regime-inputs

**Bestanden:**
- `src/lib/data/regime.ts` (uitbreiden met FRED/ECB-fetches voor CPI +
  2y/10y)
- `src/lib/data/regime.test.ts` (nieuwe tests met mock-fetcher)

**Validatiecriteria:**
- `fetchRegimeInputs()` retourneert `inflationYoy` en `yieldCurveSlope`
  met `null`-fallback bij API-fail.
- Cache 24h voor CPI, 1h voor curve-slope.
- Test: mock 200 + 503 + timeout-paths.

### M6 — Look-ahead audit-warning

**Bestanden:**
- `src/lib/analytics/backtest/engine.ts` (toevoegen `look-ahead`-warning
  op `runBacktest` wanneer custom strategy gedetecteerd)

**Validatiecriteria:**
- Custom strategy → `methodologyWarnings` bevat `look-ahead`-entry met
  severity 0.4.
- Test: 2 unit-tests (preset-strategy = geen warning; custom = warning).

### M7 — Asymmetrische sizing

**Bestanden:**
- `src/lib/analytics/allocation-engine/priority.ts`
  (`scoreFactorComponent` bonus)
- `src/lib/analytics/allocation-engine/engine.ts` (high-conviction
  EUR-tilt binnen cap)

**Validatiecriteria:**
- Composite ≥ 80 + confidence ≥ 0.8 → +10pp priority + tot 1.5×
  standaard EUR-allocatie binnen `maxPositionWeight`.
- Test: 5 nieuwe priority-tests + 3 engine-tests.

### M8 — Cycle-aware risk-tilt

**Bestanden:**
- `src/lib/analytics/risk-engine/engine.ts` (toevoegen
  "complacency"-flag)
- `src/lib/analytics/risk-engine/warnings.ts`

**Validatiecriteria:**
- Triggers wanneer: `valuationPercentile > 0.8` + `volatilityIndex < 16`
  + `regime.stance = 'RISK_ON'` → flag `complacency-warning` met
  severity moderate.
- Test: 3 unit-tests (alle drie condities, missing condities, mixed).

### M9 — Error-bands op scenarios

**Bestanden:**
- `src/lib/analytics/macro/scenarios.ts` (uitbreiden
  `MacroScenarioResult` met `impactRange: { p5, p50, p95 }`)
- `src/components/dashboard/decision-cockpit/scenario-impact-card.tsx`
  (range-rendering)

**Validatiecriteria:**
- Range = ±30% rond `portfolioImpact` (heuristiek; documenteren).
- UI toont "Impact: -18% (range -23% tot -13%)".
- Test: 3 nieuwe tests.

### M10 — €500-fallback

**Bestanden:**
- `src/lib/analytics/allocation-engine/engine.ts` (toevoegen
  `accumulateMonths`-suggestion)

**Validatiecriteria:**
- Wanneer `unitPrice > monthlyContribution`: recommendation krijgt
  `accumulateMonths: ceil(price / contribution)` + suggestion-string.
- UI rendert "Spaar 2 maanden voor 1 stuk ASML".
- Test: 4 unit-tests (€500/€1000/€2000 budgets vs ASML/MSFT/VWCE).

### M11 — AI-validators runtime

**Bestanden:**
- `src/app/api/ai/explain/route.ts` (post-render call naar
  `validateDashboardSummary` of `validateExplanationAgainstAction`)

**Validatiecriteria:**
- Response bevat `validation: { ok: boolean; rejectedClaims: string[] }`.
- 422 + reject-error wanneer `ok = false` (alleen relevant bij LLM-swap;
  deterministische renderer haalt altijd `ok = true`).
- Test: 4 nieuwe route-tests.

### M12 — USD_DOWN_20 + RATES_UP_5

**Bestanden:**
- `src/lib/analytics/macro/types.ts` (union uitbreiden)
- `src/lib/analytics/macro/scenarios.ts` (twee nieuwe shock-tabellen +
  scenarios)
- `src/lib/analytics/macro/usd-rates-extended.test.ts` (NEW)

**Validatiecriteria:**
- `runMacroScenarios` retourneert nu 9 scenarios.
- USD_DOWN_20: EUR-investeerder met USD-blootstelling verliest in EUR.
- RATES_UP_5: REITs/utilities harder geraakt dan in RATES_UP_2.
- Test: 6 nieuwe tests.

### M13 — Mispricing min-sample

**Bestanden:**
- `src/lib/analytics/mispricing/peer-dislocation.ts` (sample-size guard)

**Validatiecriteria:**
- Score = null wanneer peer-set < 5 namen.
- Test: 3 nieuwe tests (n=3, n=5, n=10).

---

## 10. Validatiecriteria per module — samenvatting

Elk module heeft drie soorten checks; elk module is "klaar" wanneer
**alle drie** groen zijn.

| Module | Unit-tests | E2E / smoke | Manual UAT |
|---|---|---|---|
| M1 Compliance banner | n/a | banner zichtbaar op 5 routes | externe-lezer-review op TOS-tekst |
| M2 Audit-export | 8 unit-tests | CSV downloadbaar | re-import in Excel/Sheets |
| M3 Ack-checkbox | 5 unit-tests | klik-flow op /risico | persona-test (paniek-user) |
| M4 Tail-pill | 4 unit-tests | pill rendert op tail-cards | designer-review |
| M5 Data-feed regime | mock-tests | live `inflationYoy` zichtbaar in cockpit | data-feed-uptime monitor |
| M6 Look-ahead-warning | 2 unit-tests | custom strategy → warning in /backtest | strategy-developer-review |
| M7 Asymm sizing | 8 unit-tests | high-conviction krijgt extra EUR | persona-test (Druck-style user) |
| M8 Cycle-tilt | 3 unit-tests | warning verschijnt in /risico bij triggers | macro-economist-review |
| M9 Error-bands | 3 unit-tests | range zichtbaar in scenario-card | UX-review (cognitief overwogen) |
| M10 €500-fallback | 4 unit-tests | suggestion verschijnt bij budget < unit-price | persona-test (€500/maand-user) |
| M11 AI-validators runtime | 4 route-tests | response bevat `validation`-object | LLM-swap-readiness-review |
| M12 USD/RATES extended | 6 unit-tests | 9 scenarios in batch | macro-strategist-review |
| M13 Mispricing min-sample | 3 unit-tests | dunne sectoren → null score | quant-review |

---

## Strenge eindconclusie

BeleggerIQ is in deze sprint **statistisch en gedragsmatig substantieel
veiliger** geworden. De meeste critical issues zijn al gefixt. Maar:

- **Publieke launch zonder M1-M6 is roekeloos.** De eerste user die
  geld verliest na een geforceerde SELL-prompt (zonder disclaimer,
  zonder ack) is een PR-incident.
- **Monetisatie zonder M7-M13 is misleidend.** Een betalende user
  verwacht méér dan een gratis ETF-allocator; zonder asymmetrische
  sizing + cycle-awareness + error-bands is BeleggerIQ een goed-
  uitziende confidence-machine, niet een edge-product.
- **De grootste sluipende risicofactor is schijnzekerheid** — niet een
  bug, maar de combinatie van mooie cijfers, neutrale UI-kleuren en
  pseudo-precisie. Error-bands (M9) zijn daarom duurder en belangrijker
  dan ze ogen.

**Aanbeveling Validation Board:** v2.2 (M1-M6) is een go-no-go voor
publieke launch. Plan v2.3 (M7-M13) als monetisatie-pre-condition. v3.0
alleen wanneer feedback-loop-data uit DecisionHistory beschikbaar is om
engines te calibreren.
