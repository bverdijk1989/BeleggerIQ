# BeleggerIQ — engines & methodologie

> **Doel.** Alle adviezen die BeleggerIQ aan de gebruiker voorlegt komen
> uit deterministische engines. Géén black-box ML, geen verborgen
> heuristics, geen op-de-data-getrainde modellen. Wat hieronder staat is
> de complete formule. Wijkt het document af van de code? Dan is de code
> de bron — open een issue zodat we het document bijwerken.
>
> **Snapshot van constanten.** Elke engine heeft een `thresholds.ts` of
> equivalent met `export const DEFAULT_*`. Deze tabel toont de actuele
> waarden van die constanten zoals ze in de huidige bundle leven; de
> tests in dezelfde folder valideren ze.

| Engine | Code | Thresholds-bron | Tests |
|---|---|---|---|
| Allocation (monthly buy) | [`src/lib/analytics/allocation-engine/`](../src/lib/analytics/allocation-engine/) | [`thresholds.ts`](../src/lib/analytics/allocation-engine/thresholds.ts) | [`engine.test.ts`](../src/lib/analytics/allocation-engine/engine.test.ts) |
| Factor scoring (aandelen) | [`src/lib/analytics/factors/`](../src/lib/analytics/factors/) | [`composite.ts`](../src/lib/analytics/factors/composite.ts) | [`composite.test.ts`](../src/lib/analytics/factors/composite.test.ts) |
| ETF factor scoring | [`src/lib/analytics/etf-factors/`](../src/lib/analytics/etf-factors/) | [`composite.ts`](../src/lib/analytics/etf-factors/composite.ts) | [`etf-factors.test.ts`](../src/lib/analytics/etf-factors/etf-factors.test.ts) |
| Regime scoring | [`src/lib/analytics/regime/`](../src/lib/analytics/regime/) | [`scoring.ts`](../src/lib/analytics/regime/scoring.ts) | [`engine.test.ts`](../src/lib/analytics/regime/engine.test.ts) |
| Risk flags | [`src/lib/analytics/risk-engine/`](../src/lib/analytics/risk-engine/) | [`thresholds.ts`](../src/lib/analytics/risk-engine/thresholds.ts) | [`engine.test.ts`](../src/lib/analytics/risk-engine/engine.test.ts) |
| Rebalance decisions | [`src/lib/analytics/rebalance-engine/`](../src/lib/analytics/rebalance-engine/) | [`thresholds.ts`](../src/lib/analytics/rebalance-engine/thresholds.ts) | [`engine.test.ts`](../src/lib/analytics/rebalance-engine/engine.test.ts) |
| Holding-action classifier | [`src/lib/analytics/holding-action.ts`](../src/lib/analytics/holding-action.ts) | inline `ACTION_THRESHOLDS` | [`holding-action.test.ts`](../src/lib/analytics/holding-action.test.ts) |

---

## 1. Factor scoring (aandelen + REITs)

### Purpose
Per ticker een 0–100 composite-score afleiden uit publieke fundamentals
+ koersgeschiedenis, met expliciete data-coverage en confidence — zodat
de UI nooit "65/100" toont op basis van één signaal.

### Inputs
- `fundamentals` — ROIC, FCF-yield, P/E, schuldratio, omzetgroei, etc.
- `priceHistory` — dag-eindkoersen voor momentum + drawdown
- `volatility`, `maxDrawdown`, `beta` — pre-berekend, optioneel

### Logic / formule
Vier sub-scores, elk 0–100 met een `coverage`-fractie:

1. **Quality** ([`quality.ts`](../src/lib/analytics/factors/quality.ts))
   ROIC, gross-margin-stabiliteit, FCF-marges, schuldratio
2. **Value** ([`value.ts`](../src/lib/analytics/factors/value.ts))
   FCF-yield + earnings-yield (P/E inverse)
3. **Momentum** ([`momentum.ts`](../src/lib/analytics/factors/momentum.ts))
   12-1m, 6m, 3m return relatief
4. **Low-vol** ([`risk.ts`](../src/lib/analytics/factors/risk.ts))
   volatility, maxDrawdown, beta

Composite = `Σ wᵢ × scoreᵢ` over **reliable** pillars (coverage ≥ 0.5).
Wanneer minder dan 2 pillars reliable zijn → composite **= 50** en
confidence ≤ 0.3 (zie thresholds).

Per `InvestmentObjective` worden andere weights gebruikt
([`weightsForObjective`](../src/lib/analytics/factors/composite.ts)).

### Thresholds (current snapshot)

| Constant | Waarde | Effect |
|---|---|---|
| `MIN_COVERAGE_FOR_COMPOSITE` | 0.5 | Een pillar telt pas mee als ≥ 50% van z'n inputs aanwezig is |
| `MIN_PILLARS_FOR_COMPOSITE` | 2 | Anders forceer composite naar 50 |
| `MAX_CONFIDENCE_LOW_COVERAGE` | 0.3 | Cap op confidence wanneer coverage dun |
| `DEFAULT_FACTOR_WEIGHTS` | `{quality:0.30, value:0.25, momentum:0.25, lowVol:0.20}` | BALANCED-default |
| Weights GROWTH | `{quality:0.30, value:0.10, momentum:0.40, lowVol:0.20, growth:0.20}` |  |
| Weights INCOME | `{quality:0.30, value:0.30, momentum:0.10, lowVol:0.30, dividend:0.20}` |  |
| Weights CAPITAL_PRESERVATION | `{quality:0.35, value:0.25, momentum:0.10, lowVol:0.30}` |  |
| Weights RETIREMENT | `{quality:0.30, value:0.25, momentum:0.15, lowVol:0.30, dividend:0.10}` |  |
| Weights FIRE | `{quality:0.30, value:0.20, momentum:0.30, lowVol:0.20}` |  |

### Limitations
- Geen ML-fitting. Coefficients zijn handgekozen op basis van
  Asness/Fama-French/Simons-literatuur en het beleggersprofiel-doel.
- Geen sectorneutralisatie — een tech-aandeel concurreert nominaal
  tegen een utility op dezelfde score-as. UI markeert sector apart.
- Beta wordt overgenomen uit provider; geen eigen schatting.

### Voorbeeld
```ts
scoreFactors({
  ticker: "ASML",
  fundamentals: { roic: 0.28, fcfYield: 0.05, pe: 35, debtToEquity: 0.4 },
  volatility: 0.28,
  beta: 1.1,
});
// → composite ~ 65/100, confidence ~ 0.85, action: BUY_CANDIDATE → HOLD bij overweight
```

---

## 2. ETF factor scoring (sinds Module 7)

### Purpose
ETF's beoordelen op **fund-eigenschappen**, niet op verzonnen
fundamentals. Een S&P500-tracker scoort op kosten + schaal + track-
record + pasvorm — niet op ROIC of P/E.

### Inputs
[`EtfMetadata`](../src/lib/analytics/etf-factors/metadata.ts):
- TER, spreadBps, AUM, currency, inceptionDate, trackingErrorYearly,
  distributionPolicy (ACCUMULATING / DISTRIBUTING),
  replicationMethod (PHYSICAL_FULL / PHYSICAL_SAMPLED / SYNTHETIC),
  topRegionWeight, topSectorWeight
- `objective` van het beleggersprofiel (voor fit-pillar)

### Logic / formule
Vier pillars, gemapt op de bestaande `FactorSubScores`-shape voor
backwards-compat met UI-componenten:

| ETF-pillar | Mapt op | Bron |
|---|---|---|
| Cost      | quality  | TER + spread, lager = beter |
| Scale     | value    | AUM (groot = liquider, geen sluitingsrisico) |
| Track-rec | momentum | Leeftijd × tracking-error |
| Fit       | lowVol   | Distribution policy match × sector-spreiding × replicatie-method |

Composite = `Σ wᵢ × scoreᵢ` over reliable pillars (≥ 0.5 coverage),
zelfde min-pillar-floor als bij aandelen.

### Thresholds (current snapshot)

| Constant | Waarde | Effect |
|---|---|---|
| `DEFAULT_ETF_WEIGHTS` | `{quality:0.35, value:0.20, momentum:0.20, lowVol:0.25}` | Cost-pillar weegt het zwaarst |
| `MIN_COVERAGE_FOR_COMPOSITE` | 0.5 | Gedeeld met aandelen-engine |
| `MIN_PILLARS_FOR_COMPOSITE` | 2 | Idem |
| `MAX_CONFIDENCE_LOW_COVERAGE` | 0.3 | Idem |

### Limitations
- Verzint nooit fundamentals voor een ETF. Een ETF zonder metadata
  krijgt composite = 50 met confidence ≤ 0.3 — zichtbaar als "neutraal,
  lage confidence" in de UI.
- Geen factor-overlay-detectie (factor-ETFs worden nominaal als ETF
  gescoord, niet als single-factor-tilt).

### Voorbeeld
```ts
scoreEtfFactors({
  ticker: "VWCE",
  metadata: { ter: 0.0022, aum: 12_000_000_000, ... },
  objective: "GROWTH",
});
// → composite ~ 80/100, etfBreakdown: { cost:85, scale:100, trackRecord:98, fit:88 }
```

---

## 3. Regime scoring

### Purpose
Het brede markt-klimaat samenvatten in één 0–100 score met label
RISK_ON / NEUTRAL / DEFENSIVE, zodat allocation/budget zich
automatisch tilten.

### Inputs
[`RegimeScoreInput`](../src/lib/analytics/regime/scoring.ts):
- valuationPercentile (cross-sectional 0..1)
- breadthScore (fractie aandelen > MA200), index12mReturn
- volatilityIndex (VIX-achtig)
- interestRate10y, rateChange1y, yieldCurveSlope (10y-2y)
- creditSpreadBps (high-yield)
- inflationYoy

### Logic / formule
Per driver een sub-score 0–100 (hoger = meer risk-on). Composite:
gewogen gemiddelde van **active** drivers (Σ active weights → renormaliseer).

Stance:
```
score >= 65 → RISK_ON
score <= 35 → DEFENSIVE
35 < score < 65 → NEUTRAL
```

### Thresholds (current snapshot)

| Driver | Weight | Hoge-score (risk-on) | Lage-score (defensief) |
|---|---|---|---|
| Trend / breadth | 0.25 | Veel aandelen > MA200, +12m > 0 | Breadth < 30%, -12m return |
| Valuation | 0.18 | Percentile ≤ 0.30 (goedkoop) | ≥ 0.70 (duur) |
| Volatility | 0.17 | VIX < 15 | VIX > 25 |
| Spread | 0.13 | HY < 350 bps | HY > 700 bps |
| Rates | 0.12 | Rente stabiel of dalend | Snel stijgend |
| Inflation | 0.08 | YoY 1.5–3% | > 5% of < 0% |
| Curve slope | 0.07 | 10y-2y > 100 bps | Inversie (≤ 0) |

(zie [`scoring.ts`](../src/lib/analytics/regime/scoring.ts) voor de
exacte clamps per driver — bv. P/E 12 → 85, P/E 28 → 20.)

### Limitations
- Single-region (US-aandelen-bias). Driver-set is wereldwijd toepasbaar
  maar de standaard-data-providers leveren primair US-cijfers.
- Geen tijdsreeks-smoothing — een wiggle in VIX kan de score 5 punten
  laten bewegen. UI toont 5-dagen-trend-arrow om dit op te vangen.

### Voorbeeld
```ts
computeRegimeScore({
  valuationPercentile: 0.85, // duur
  breadthScore: 0.42,
  volatilityIndex: 22,
  yieldCurveSlope: -0.005,   // inverse curve
  inflationYoy: 0.038,
});
// → score ~ 38, stance: DEFENSIVE
```

---

## 4. Risk flags

### Purpose
Per portfolio een set risk-classificaties (low / moderate / high)
emitteren over concentratie, volatility, drawdown, sector- en
currency-exposure. Voedt de Decision Cockpit + de notification-engine.

### Inputs
- Holdings + view-model (gewichten, sector-meta)
- 90/180-dagen koersreeks per holding (voor volatility/drawdown)
- `policy: PolicySettings` voor user-overrides

### Logic / formule
Elke metric krijgt een band `{ low, high }`. `value ≤ low` → klasse
"low", `value ≥ high` → "high", anders "moderate". Voor lowVol-style
(hoger = beter) gebruikt de engine `classifyInverse`.

Een continue 0–100 risk-score: 15 onder `low`, 85 boven `high`,
lineair daartussen.

### Thresholds (current snapshot)

| Metric | low (≤) | high (≥) | Eenheid |
|---|---|---|---|
| `positionWeight` | 0.05 | 0.10 | fractie 0..1 |
| `concentrationHhi` | 0.10 | 0.20 | HHI 0..1 |
| `top5Weight` | 0.40 | 0.60 | fractie |
| `volatility` (annualised) | 0.15 | 0.30 | fractie |
| `beta` | 0.90 | 1.30 | factor |
| `drawdown` | 0.15 | 0.35 | fractie |
| `sectorWeight` (grootste) | 0.30 | 0.45 | fractie |
| `foreignCurrencyExposure` | 0.30 | 0.60 | fractie |
| `minPositions` | n.v.t. | n.v.t. | 8 (hard floor) |

Policy-overrides: `policy.maxPositionWeight` zet `positionWeight.high`,
`policy.maxSectorWeight` zet `sectorWeight.high`,
`policy.minPositions` zet `minPositions`.

### Limitations
- Volatility/drawdown vereisen ≥ 60 datapoints; bij minder data scoort
  de metric "moderate" by default zonder false positive.
- Sector-classificatie volgt provider-data; als een ticker geen sector
  heeft, wordt die uit de top-sector-aggregatie gehouden (geen
  "Onbekend"-bucket).

### Voorbeeld
```ts
buildRiskAnalysis({
  positions: [{ ticker: "ASML", weight: 0.18, ... }],
  policy: { maxPositionWeight: 0.10, ... },
});
// → ASML weight 0.18 vs band {low:0.05, high:0.10} → klasse "high"
```

---

## 5. Rebalance decisions

### Purpose
Per overweight-positie een actie afleiden: HOLD, TRIM_LIGHT, TRIM_HEAVY,
RECONSIDER. Versus de Allocation engine: rebalance kijkt naar
**bestaande** posities boven cap; allocation kijkt naar **nieuwe** koop.

### Inputs
- Per-positie gewicht, fragility-score (uit risk-engine), thumbs-up
  vanuit factor-score / business-quality (HEALTHY vs FRAGILE).
- Policy: `maxPositionWeight`, `minPositionWeight`.

### Logic / formule
Stappen:

1. Als `weight ≤ concentratedMinWeight` → geen rebalance-actie.
2. `ratio = weight / maxPositionWeight`.
3. `ratio > healthyRunMultiplier (2.0)` → **TRIM_HEAVY** ongeacht status
   (bewuste keuze: voorbij 2× je cap is geen "winners running" maar
   fragiele single-name-risico).
4. Indien fragility-score ≥ `fragileReconsiderScore (80)`:
   - `ratio > fragileHeavyMultiplier (1.5)` → **TRIM_HEAVY**
   - `ratio > 1.0` → **TRIM_LIGHT**
   - Anders **RECONSIDER**
5. Healthy + ratio > 1.0 → **TRIM_LIGHT**
6. Anders → HOLD.

### Thresholds (current snapshot)

| Constant | Waarde | Effect |
|---|---|---|
| `maxPositionWeight` | 0.10 | Default (override via policy) |
| `concentratedMinWeight` | 0.05 | Onder dit gewicht: geen rebalance-actie |
| `healthyRunMultiplier` | 2.0 | > 2× cap → altijd trim, ook bij HEALTHY |
| `fragileHeavyMultiplier` | 1.5 | > 1.5× cap bij FRAGILE → TRIM_HEAVY |
| `fragileReconsiderScore` | 80 | Fragility-score boven 80 → ander pad |

### Limitations
- Geen tax-aware rebalancing — TRIM-suggesties houden geen rekening
  met realized-PnL implicaties (gebruik `/belasting` om dat zelf te
  bekijken vóór je de SELL plaatst).
- Currency-effect wordt niet meegenomen in de fragility-score.

### Voorbeeld
```
ASML weight 22%, cap 10%, factor=HEALTHY → ratio 2.2 > 2.0 → TRIM_HEAVY
NVDA weight 13%, cap 10%, factor=FRAGILE → ratio 1.3 > 1.0 → TRIM_LIGHT
```

---

## 6. Allocation engine (monthly buy)

### Purpose
Een **maandelijks koopplan** opstellen: maximaal 5 koop-orders die het
budget alloceren over high-conviction kandidaten zonder caps te
overschrijden, met regime-tilts.

### Inputs
- Portfolio-view (huidige gewichten, valuations)
- `monthlyContribution` (uit profiel of UI-override)
- `policy` (caps + min-conviction)
- `objective` (factor-weights via `weightsForObjective`)
- Regime-stance (RISK_ON / NEUTRAL / DEFENSIVE)
- Optionele core-ETF-fallback wanneer < `coreEtfMinPositions`

### Logic / formule
1. **Effective budget** = budget × biasMultiplier (offensive 1.2,
   neutral 1.0, defensive 0.8); bij DEFENSIVE-regime houdt een
   `defensiveBudgetHoldback` (25%) extra cash terug.
2. **Candidates** = posities met `composite ≥ minCandidateComposite`
   en ruimte onder positie-cap; uitgebreid met core-ETF wanneer < 8
   posities én core-ETF-toggle aan.
3. **Priority-sort** op factor-score × conviction-bonus × regime-tilt.
4. **Allocate**: top-N (≤ `maxRecommendations`) krijgt budget naar
   ratio van `priority`, met `minOrderAmount` floor.
5. **Cap-check**: post-buy gewicht mag `maxPositionWeight` en
   `maxSectorWeight` niet overschrijden.

### Thresholds (current snapshot)

| Constant | Default | Effect |
|---|---|---|
| `minOrderAmount` | 100 | Onder dit bedrag → geen order (te klein voor fees) |
| `maxRecommendations` | 5 | Cap op aantal koop-suggesties per maand |
| `minRecommendations` | 3 | Onder dit aantal → cash-warning |
| `cashBufferPct` | 0.05 | 5% cash blijft altijd onbelegd |
| `maxPositionWeight` | 0.10 | Override uit policy |
| `maxSectorWeight` | 0.35 | Override uit policy |
| `defensiveBudgetHoldback` | 0.25 | Bij DEFENSIVE: 25% van budget niet inzetten |
| `riskOnBudgetMultiplier` | 1.0 | Bij RISK_ON: optie om budget op te plussen (default 1.0 — uit) |
| `minCandidateComposite` | 45 | Holdings onder 45/100 vallen uit kandidatenpool |
| `coreEtfMinPositions` | 8 | Onder dit aantal → core-ETF kandidaat erbij |

Policy-overrides: `policy.cashBufferPct`, `policy.maxPositionWeight`,
`policy.maxSectorWeight`, `policy.minFactorComposite` (mapped van
[-1,1] → [0,100] indien nodig).

### Limitations
- Geen tax-loss-harvesting; de engine kijkt alleen naar koopzijde, niet
  naar gelijktijdige verkoop voor fiscale optimalisatie.
- Geen multi-currency-budget. Het budget is in base-currency; FX-
  conversie naar USD-tickers is geschat via huidige FX-rate.

### Voorbeeld
```ts
generateAllocationPlan({
  monthlyContribution: 500,
  policy: { maxPositionWeight: 0.1, maxSectorWeight: 0.35 },
  objective: "BALANCED",
  regime: { stance: "DEFENSIVE", score: 32, ... },
});
// → effectiveBudget = 500 × 0.8 (defensive bias) × (1 - 0.25 holdback) = 300
// → up to 3 BUY orders @ minOrderAmount=100 each
```

---

## 7. Holding-action classifier

### Purpose
Per holding een eindlabel: BUY_CANDIDATE / HOLD / WATCH / TRIM / AVOID.
Wordt door dashboard + cockpit gebruikt voor de "Wat nu?"-tags.

### Inputs
- `composite` (factor-score 0–100)
- `confidence` (0..1)
- `currentWeight`, `targetWeight` (uit policy)

### Logic / formule
Stappen, in volgorde — eerste match wint:

1. `composite === null` → **WATCH** ("nog geen score")
2. `confidence < 0.30` → **WATCH** ("data te dun")
3. `composite ≥ 75` → **BUY_CANDIDATE**
4. `composite ≤ 35` → **AVOID**
5. `composite < 50` && positie `> targetWeight × 1.10` → **TRIM**
6. `composite ≥ 60` → **HOLD**
7. anders → **HOLD** met "matige score"-rationale

### Thresholds (current snapshot)

| Constant | Waarde |
|---|---|
| `buyMin` | 75 |
| `holdMin` | 60 |
| `trimMax` | 50 |
| `avoidMax` | 35 |
| `minConfidence` | 0.30 |
| `trimOverweightMultiplier` | 1.10 |

### Limitations
- Negeert horizon: een 30-jarige FIRE-belegger en een 65-jarige gepens-
  ioneerde krijgen voor dezelfde score hetzelfde label. UX-laag past
  per-objective via de factor-weights, niet hier.
- Geen news-events / earnings-calendar — een upcoming earnings die het
  composite-cijfer materially zou moeten neutraliseren wordt niet
  gedetecteerd.

### Voorbeeld
```
composite 82, confidence 0.90 → BUY_CANDIDATE
composite 65, confidence 0.20 → WATCH (data thin)
composite 42, weight 18%, target 10% → TRIM (overweight + matige score)
```

---

## Hoe BeleggerIQ ze samen gebruikt

```
                  ┌──────────────┐
                  │ Market data  │
                  └──────┬───────┘
                         ▼
       ┌──────────┐  ┌─────────┐  ┌───────────┐
       │ Factors  │  │  ETF    │  │  Regime   │
       │ (3 / 4)  │  │ Factors │  │  scoring  │
       └────┬─────┘  └────┬────┘  └─────┬─────┘
            └────┬────────┘             │
                 ▼                      │
          ┌────────────┐                │
          │ Composite  │                │
          │ + Action   │                │
          │ classifier │                │
          └─────┬──────┘                │
                ▼                       ▼
        ┌──────────────┐    ┌─────────────────────┐
        │ Risk flags   │ ◀──│ Rebalance decisions │
        │ (per-port)   │    │  (per-position)     │
        └──────┬───────┘    └─────────┬───────────┘
               └────────────┬─────────┘
                            ▼
                   ┌─────────────────┐
                   │ Allocation plan │  ← /maandbeslissing
                   │ (monthly buy)   │
                   └─────────────────┘
```

## Wat dit document NIET is

- **Geen prospectus.** Dit is een methodologie-doc voor reviewers en
  technische users. Voor product-marketing zie de App Store / website-
  copy.
- **Geen belastingadvies.** Voor fiscale logica zie [`docs/BACKUPS.md`](./BACKUPS.md)
  en [`docs/OBSERVABILITY.md`](./OBSERVABILITY.md) (voor monitoring-
  uitleg) en de `/belasting`-pagina (voor box-3 onderbouwing).
- **Geen broker-integratie.** Alle adviezen zijn suggesties; uitvoering
  is altijd handmatig — zie [`/maandbeslissing` order-export](../src/app/(app)/maandbeslissing/components/order-export.tsx).

## Bijwerken

Wanneer een threshold of formule wijzigt:

1. Pas de constante aan in de relevante `thresholds.ts` of inline
   `*_THRESHOLDS`-export.
2. Update de bijbehorende test (`engine.test.ts` etc.) zodat de
   verwachte uitkomst klopt.
3. Update dit document — vooral de "Thresholds (current snapshot)"-tabel
   van de gewijzigde engine.
4. Vermeld de wijziging in de PR-omschrijving zodat reviewers zien dat
   doc + code + tests bij elkaar veranderen.

Een grep helpt voor stap 3:

```bash
# Alle exporteerde threshold-constanten
grep -rn "DEFAULT_.*_THRESHOLDS\|ACTION_THRESHOLDS\|MIN_COVERAGE_FOR_COMPOSITE" src/lib/analytics
```
