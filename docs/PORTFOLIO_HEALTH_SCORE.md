# Portfolio Health Score — Module 1

Een gewogen 10-component score (0–100) die in **één blik** vertelt hoe gezond een portefeuille is, **waarom** dat zo is, en **wat te doen** om de score te verbeteren.

> Doel (UX-norm): de gebruiker begrijpt binnen 5 seconden wat de score is, waarom hij dat is, en wat te verbeteren.

---

## 1. Componenten + gewichten

| # | Component | Default gewicht | Bron |
|---|---|---|---|
| 1 | Spreiding (#posities + HHI + top-5) | 15% | `view.summary` + `view.risk.concentrationHhi` |
| 2 | Sectorconcentratie | 10% | `view.risk.exposures.bySector` |
| 3 | Geografische concentratie | 5% | `view.risk.exposures.byRegion` |
| 4 | Volatiliteit | 10% | `view.risk.portfolioVolatility` |
| 5 | Maximale drawdown | 10% | `portfolioSnapshot.totalValue` historie |
| 6 | Cash / risk buffer | 10% | `view.summary.cashBalance / totalValue` |
| 7 | Dividendkwaliteit | 5% | `fundamentals.dividendYield` (gewogen) |
| 8 | Fundamentele kwaliteit | 15% | `factorScore.subScores.quality` |
| 9 | Waarderingsrisico | 10% | `factorScore.subScores.value` |
| 10 | Macro-gevoeligheid | 10% | `regime.stance` × `factorScore.subScores.lowVol` |

Som = 1.00. Bij ontbrekende data wordt het gewicht **renormaliseert** over de actieve componenten — een portefeuille zonder dividend-data wordt niet gestraft.

---

## 2. Architectuur

```
src/lib/analytics/health-score/
├── types.ts          # HealthComponent, PortfolioHealthScore, weights
├── scorers.ts        # 10 pure scorer-functies
├── engine.ts         # orchestrator (totaal-score + grade + headline + top-3 recs)
├── loader-types.ts   # PortfolioHealthInput shape (type-only)
├── loader.ts         # hydrateert input uit PortfolioView + regime + snapshots
└── engine.test.ts    # 6 scenario-tests + per-component edge cases
```

**Pure-functie laag** (`scorers.ts` + `engine.ts`): geen I/O, geen Date.now, geen random — deterministisch en testbaar zonder mocks.

**Loader-laag** (`loader.ts`): mapt server-side data (PortfolioView, regime, snapshots, profile, policy, fundamentals) naar de `PortfolioHealthInput`. Geen extra DB-calls; hergebruikt wat het dashboard al heeft opgehaald.

**UI-laag**:
- `HealthScoreCard` — compacte dashboard-kaart (above-the-fold)
- `/portfolio-health` — detail-pagina met volledige breakdown

---

## 3. Status-tiers

Per component wordt een status-tier afgeleid uit de score:

| Score | Status | Tone | Wanneer aanwezig |
|---|---|---|---|
| ≥ 80 | `strong` | Groen | Component scoort uitstekend |
| ≥ 60 | `ok` | Groen | Op orde |
| ≥ 35 | `weak` | Amber | Aandachtspunt — recommendation verschijnt |
| < 35 | `critical` | Rood | Kritiek — recommendation verschijnt |
| n/a | `no_data` | Neutraal | Onvoldoende data; component telt niet mee |

Letter-grade voor de **totaalscore**:

- A ≥ 85
- B ≥ 70
- C ≥ 55
- D ≥ 40
- F < 40

---

## 4. Scoring-drempels (samenvatting)

| Component | Sweet spot → 100 | Critical → 0 |
|---|---|---|
| Position count | ≥ 15 posities | 1 positie |
| HHI (positions) | 0.05 | 0.30 |
| Top-5 weight | ≤ 30% | ≥ 80% |
| Sector HHI | 0.15 | 0.50 |
| Largest sector | ≤ 25% | ≥ 60% |
| Region HHI | 0.40 | 0.85 |
| Volatility (annualized) | 12% | 35% |
| Max drawdown | 5% | 40% |
| Cash buffer | rond `cashBufferPct` policy (default 5%) | 0% of >30% |
| Dividend yield (income) | 3.5% | < 0% of > 7% (yield-trap risk) |
| Quality sub-score | ≥ 70/100 | < 50/100 |
| Value sub-score | ≥ 65/100 | < 40/100 |

Drempels zijn **expliciete constants** — wijziging vereist een PR met motivatie.

---

## 5. Recommendations

Elke recommendation heeft:

```ts
{
  title: string;       // "Voeg posities toe"
  detail: string;      // 1-zin uitleg waarom + cijfer
  link?: string;       // bv. "/maandbeslissing"
  expectedImpact?: number;  // 0..100 punten op de TOTALE score
}
```

Alleen componenten met status `weak` of `critical` produceren recommendations. De engine sorteert alle recommendations cross-component op `expectedImpact` desc, dedupt op `title`, en levert de top-3 in `topRecommendations`.

---

## 6. 5-lens validatie

Module 1 is gevalideerd tegen alle 5 mentale modellen:

| Lens | Hoe het zich uit |
|---|---|
| **Buffett** (kwaliteit, langetermijn) | Quality + Diversification krijgen samen 30% gewicht — de zwaarste sub-totalen. ROIC-laag (via factor-quality) wordt gewogen meegenomen. |
| **Dalio** (concentratie/correlatie) | Sector + Geo + Macro = 25% gewicht. Macro-mismatch met regime krijgt expliciete penalty. |
| **Lynch** (begrijpelijkheid) | Elke component levert 1-zin rationale in NL. Recommendations gebruiken concrete cijfers ("4 posities", "32% in één sector"). |
| **Simons** (testbaarheid) | Pure functies, deterministisch, 12+ unit tests waaronder 6 scenario-tests. Geen Date.now() in core engine. |
| **Wood** (innovatie/regime) | Macro-component is regime-aware: defensieve tilt scoort hoog in DEFENSIVE-regime, cyclische tilt in RISK_ON. Hook voor latere AI/innovation-overlays via FactorScore.subScores. |

---

## 7. Renormalisatie bij no_data

Wanneer een component geen data heeft (bv. dividend-data ontbreekt voor een growth-portfolio), gebeurt:

1. Component krijgt `score = 50` (neutraal), `confidence = 0`, `status = "no_data"`.
2. In `computeWeightedTotal` worden `no_data`-components **uit de noemer** gehaald.
3. De resterende gewichten worden **herverdeeld** op `effectiveWeight = sum(actieve weights)`.
4. `totalScore = Σ score_i × (weight_i / effectiveWeight)`.

**Effect**: een portefeuille zonder dividend-data wordt niet gestraft; de andere 9 components dragen 100% van de score. De UI toont `effectiveWeight` op de detail-pagina zodat de gebruiker ziet hoeveel weight bruikbaar is.

---

## 8. Test-scenario's

Alle 6 verplichte scenario's staan in `engine.test.ts`:

1. **Lege portefeuille** → meeste components `no_data`; geen crash; neutrale headline
2. **Geconcentreerde portefeuille** (3 pos, 70% in één sector) → diversification + sector zakken naar `weak`/`critical`; recommendations verschijnen
3. **Gespreide portefeuille** (20 pos, lage HHI) → totaalscore ≥ 75, grade A/B
4. **Hoge volatiliteit** (40% jaar) → volatility-score ≤ 15, status `critical`, recommendation
5. **Ontbrekende data** → renormalisatie compenseert; `effectiveWeight < 1.0`; score blijft zinnig
6. **Extreme waarden** (positionCount=999, vol=500%, etc.) → alle scores blijven binnen [0,100]

Plus output-shape tests (10 components in vaste volgorde, top-3 sortering, A/F grades op extremes), determinisme-test (gelijke input → identieke output), en INCOME-objective edge case.

---

## 9. Toekomstige uitbreidingen

| Idee | Waarom waardevol |
|---|---|
| **AI-explainer** boven de top-3 recommendations | Lynch-laag: zet 3 numerieke recommendations om in 1 leesbare alinea per investeerder-persona |
| **Tijdsverloop** van de score (sparkline + delta) | "Health-trend laatste 30/90/180 dagen" — al beschikbaar via PortfolioSnapshot.healthScore-veld; alleen nog de UI-component |
| **Per-positie health** | Drill-down: welke positie kost de meeste health-punten? Hook via FactorScore + risk-engine flags |
| **Empirische base-uncertainty** | Vervang `BASE_PILLAR_UNCERTAINTY = 15` met bootstrap uit historische rebalance-noise (Simons-laag) |
| **Personalisatie van gewichten** | User-profile → Buffett-modus zwaarder op quality, Dalio-modus zwaarder op concentratie |
| **AI/innovation-overlay** (Wood) | Bij sterke groei-tilt: extra component voor "innovation exposure" via thematische ETF-tagging |
| **Score-band (± stdErr)** | Combineer per-component confidence in een totale onzekerheidsband — net als `compositeStdErr` op factor-engine |

---

## 10. Bestanden

| Pad | Doel |
|---|---|
| [src/lib/analytics/health-score/types.ts](../src/lib/analytics/health-score/types.ts) | Types + default weights + NL/EN labels |
| [src/lib/analytics/health-score/scorers.ts](../src/lib/analytics/health-score/scorers.ts) | 10 pure scorer-functies |
| [src/lib/analytics/health-score/engine.ts](../src/lib/analytics/health-score/engine.ts) | Orchestrator + recommendation-builder |
| [src/lib/analytics/health-score/loader.ts](../src/lib/analytics/health-score/loader.ts) | Server-side hydration uit PortfolioView |
| [src/lib/analytics/health-score/engine.test.ts](../src/lib/analytics/health-score/engine.test.ts) | 12 tests (6 scenario's + edge cases) |
| [src/components/dashboard/decision-cockpit/health-score-card.tsx](../src/components/dashboard/decision-cockpit/health-score-card.tsx) | Compacte dashboard-kaart |
| [src/components/portfolio-health/health-component-row.tsx](../src/components/portfolio-health/health-component-row.tsx) | Detail-pagina component-rij |
| [src/app/(app)/portfolio-health/page.tsx](../src/app/(app)/portfolio-health/page.tsx) | Detail-pagina |
