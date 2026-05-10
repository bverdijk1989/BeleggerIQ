# Signal Fusion Engine — Module 6

Combineert 10 signaalbronnen tot één **Investment Confidence Score** 0..100 per instrument. Géén black box: elke component is zichtbaar in de UI met score, gewicht, bijdrage, rationale en data-quality.

> **UX-norm**: een gebruiker ziet binnen 5 seconden de totaalscore + grootste driver + grootste rem, en kan binnen 10 seconden uitleggen waarom de score zo is.

---

## 1. De 10 signalen

| # | Key | Bron | Default-gewicht |
|---|---|---|---|
| 1 | `fundamental_quality` | `factorScore.subScores.quality` + ROIC + D/E | 20% |
| 2 | `valuation` | `factorScore.subScores.value` + P/E + FCF-yield | 15% |
| 3 | `momentum` | `factorScore.subScores.momentum` (12mnd) | 10% |
| 4 | `volatility` | `factorScore.subScores.lowVol` | 10% |
| 5 | `earnings_revisions` | Externe feed (placeholder slot) | 5% |
| 6 | `dividend_quality` | `fundamentals` (yield + payout + 5y growth) | 5% |
| 7 | `macro_sensitivity` | `MacroRegimeReport` × asset-class | 10% |
| 8 | `sentiment` | Externe feed (placeholder slot) | 5% |
| 9 | `insider_analyst` | Externe feed (placeholder slot) | 5% |
| 10 | `portfolio_fit` | currentWeight + sectorWeight + positionCount | 15% |

**Som = 100%**.

**Buffett-bias**: quality + valuation = 35% — bewust het zwaarst.
**Dalio-bias**: macro_sensitivity + portfolio_fit = 25% — risico/diversificatie expliciet.

---

## 2. Architectuur

```
src/lib/analytics/signal-fusion/
├── types.ts             # SignalKey, SignalContribution, ConfidenceScore
├── input.ts             # SignalFusionInput shape (type-only)
├── extractors.ts        # 10 pure extractor-functies
├── engine.ts            # Orchestrator + renormalisatie + warnings
├── loader.ts            # Server-side: ticker + view → hydrate input → engine
├── fixtures.ts          # Test-fixtures
├── engine.test.ts       # 18 tests
└── index.ts

src/components/signal-fusion/
├── confidence-scorecard.tsx     # Volledige breakdown (per signaal-rij)
└── confidence-summary-card.tsx  # Dashboard top-3 widget

src/app/(app)/score/
├── page.tsx              # Lijst van alle posities, gerangschikt op score
└── [ticker]/page.tsx     # Detail-pagina met scorecard + methodologie
```

---

## 3. Renormalisatie bij missende data

Identiek aan health-score / briefing / macro-regime: signalen met `score=null` (status `missing`) worden uit de noemer gehaald, en hun gewicht wordt herverdeeld over de actieve signalen:

```
effectiveWeight = Σ weight_i  // alleen signalen mét data
totalScore       = Σ (score_i × weight_i / effectiveWeight)
```

UI toont `effectiveWeight` als percentage zodat je ziet hoeveel van de score op data is gebaseerd. Onder 40% → automatic warning ("Lage data-dekking — interpreteer met onzekerheidsmarge").

---

## 4. Tier-mapping

| Score | Tier | UI-tone |
|---|---|---|
| ≥ 80 | `STRONG` | Groen |
| ≥ 65 | `POSITIVE` | Groen |
| ≥ 45 | `NEUTRAL` | Neutraal |
| ≥ 30 | `WEAK` | Amber |
| < 30 | `AVOID` | Rood |

Geen koop/verkoop-advies — een meting van confidence over beschikbare signalen.

---

## 5. Data-quality-laag

Per signaal:
- `high` — primaire bron + voldoende sample
- `medium` — primaire bron, beperkte coverage
- `low` — afgeleid signaal of weinig data
- `missing` — signaal kon niet berekend worden

Op composite-niveau:
- `high` — ≥ 5 signalen met `high`-quality én ≥ 40% effectief gewicht
- `medium` — ≥ 3 signalen met `high`
- `low` — minder

**Warning-string** verschijnt boven de scorecard wanneer:
1. effectief gewicht < 40%, of
2. `dataLimitations` is niet leeg.

---

## 6. Voorbeeld-output

Voor een hoog-quality groei-aandeel in een GOLDILOCKS-regime, met 3% portefeuille-weging:

```
totalScore: 78
tier: POSITIVE
headline: "Sterke score — fundamentele kwaliteit draagt zwaarst bij."
signals:
  fundamental_quality: 85/100 (gewicht 20%) — "ROIC 22%, D/E 0.4"
  valuation:           65/100 (gewicht 15%) — "P/E 18, FCF yield 5.5%"
  momentum:            70/100 (gewicht 10%) — "Kracht in trend"
  volatility:          60/100 (gewicht 10%) — "Gemiddeld risico"
  earnings_revisions:  null   (missing)     — "Feed niet aangesloten"
  dividend_quality:    null   (missing)     — "Geen dividend-data"
  macro_sensitivity:   78/100 (gewicht 10%) — "GOLDILOCKS: groei-aandelen rugwind"
  sentiment:           null   (missing)
  insider_analyst:     null   (missing)
  portfolio_fit:       72/100 (gewicht 15%) — "Huidige weging 3%, sector 22%"
effectiveWeight: 0.80 (4 missing signalen)
dataQuality: medium
warning: "Sommige signalen ontbreken; let op bij interpretatie."
```

---

## 7. Topbelegger-validatie

| Lens | Hoe het zit |
|---|---|
| **Buffett** (kwaliteit + waardering zwaar) | quality 20% + valuation 15% = 35% gewicht. Beide signalen hebben rationale met ROIC / P/E / FCF-yield. |
| **Dalio** (macro + diversificatie) | macro_sensitivity (10%) maakt regime-fit expliciet, portfolio_fit (15%) maakt concentratie expliciet. |
| **Lynch** (begrijpelijk) | Elke signal heeft 1-zin NL-rationale met concrete getallen. UI toont scorebar + bron per signaal. |
| **Simons** (kwantificeerbaar) | Pure functies, deterministisch, 18 unit tests over edge-cases. Drempels zijn `const` in code. |
| **Wood** (uitbreidbaar) | `SignalKey` is een union — extra signal toevoegen = (1) key uitbreiden, (2) extractor schrijven, (3) gewicht in `DEFAULT_SIGNAL_WEIGHTS`. UI rendert vanzelf. |

---

## 8. Tests — 18 in totaal

| Categorie | Tests | Coverage |
|---|---|---|
| Output shape | 3 | 10 signalen in volgorde, score 0..100, contributions sommeren |
| Happy path | 2 | strong fundamentals → POSITIVE, zwakke → WEAK |
| Missing data | 5 | factor null, portfolio null, macro null, all-null, low-coverage |
| Extra feeds | 3 | earnings_revisions, sentiment, insider/analyst |
| Portfolio-fit | 2 | hoge fit-score bij ruimte, lage bij concentratie |
| Determinisme | 1 | zelfde input → identieke output |
| Headlines/warnings | 2 | sterke score, dataLimitations namen |

---

## 9. AI-explainability — voorbereid

De score is **AI-uitlegbaar-ready**:
- Elke `SignalContribution` heeft `score` + `rationale` + `source` als input voor een prompt.
- De volledige `InvestmentConfidenceScore`-shape is JSON-serialiseerbaar.
- Hetzelfde guardrail-pattern als de Daily Briefing (Module 2) kan toegepast worden:
  - **System prompt**: "Vat samen waarom deze ticker score X kreeg, gebruik UITSLUITEND cijfers uit CONTEXT, hedged taal."
  - **Numeric-claim cross-check**: elk getal in de output moet in de score-JSON terugkomen.

Hook-point voor toekomstige Wood-laag uitbreiding (innovation/growth-signaal) is voorbereid via `SignalKey` extension.

---

## 10. Toekomstige uitbreidingen

| Idee | Waarom |
|---|---|
| **Earnings-revisions feed** koppelen | Nu placeholder; aansluiting via Yahoo/ConsensusEstimate vult slot 5 vanzelf. |
| **Sentiment-feed** (StockTwits / Reddit / News) | Slot 8 staat klaar; 80%+ data-coverage zou de score-stabiliteit verhogen. |
| **Insider-buying / analyst-rating** via een data-provider | Slot 9 staat klaar; voegt signaal toe dat moeilijk anders te krijgen is. |
| **Risk-profile-aware weights** | Aggressive user → hogere momentum-gewicht; conservative → hogere quality+lowVol. |
| **AI-narrative** | Gebruik de Daily Briefing-AI om per ticker een paragraaf te schrijven die de score uitlegt. |
| **Innovation/growth-signaal** (Wood-laag) | Voeg een `growth_innovation`-signaal toe met R&D-intensity + revenue-CAGR. |
| **Score-tijdreeks** | Persisteer dagelijkse scores → toon trend ("Confidence van AAPL ging van 62 → 78 in 30d"). |
| **Cross-signal correlatie audit** | Detect collinearity (bv. quality + lowVol overlappen vaak); verfijn de gewichten. |
