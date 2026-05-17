# Macro Regime Engine 2.0 — Module 6

Classificeert de wereldeconomie naar één van 5 macro-regimes op basis van 7 indicators, en mapt die naar asset-class impact + portfolio-impact.

> **Voorbeeld-output (huidige seed-snapshot)**: "Het huidige regime lijkt op dalende groei + hardnekkige inflatie. Groei daalt terwijl inflatie hardnekkig hoog blijft." → Portfolio-summary: "Portefeuilles met veel cyclische groeiaandelen zijn dan kwetsbaarder."

---

## 1. De 7 indicators

| # | Key | Bron-veld | Score-richting |
|---|---|---|---|
| 1 | `growth` | BBP YoY % | Hoger = beter |
| 2 | `inflation` | CPI YoY % | Lager (richting target) = beter |
| 3 | `rates` | 10y staatsrente % | Lager = ruimer klimaat |
| 4 | `liquidity` | M2-groei YoY % | Hoger = ruimer |
| 5 | `recession_risk` | Probability 0..100 | Lager = beter |
| 6 | `volatility` | VIX-equivalent | Lager = stabieler |
| 7 | `sentiment` | Composite 0..100 | Hoger = risk-on |

Trend-bepaling (rising/falling/stable) gebeurt uit `value` × `previousValue` met 5%-tolerantie tegen ruis.

---

## 2. De 5 regimes — Dalio-quadranten

| Regime | Groei | Inflatie | Korte uitleg |
|---|---|---|---|
| **GOLDILOCKS** | ↑ | ↓ | Markten belonen winstgroei en growth-aandelen. |
| **REFLATION** | ↑ | ↑ | Cyclische sectoren en grondstoffen krijgen rugwind. |
| **STAGFLATION** | ↓ | ↑ | Defensieve assets en cash zijn relatief sterk. |
| **DEFLATION** | ↓ | ↓ | Lange-rente-obligaties en defensieve quality-namen leiden. |
| **TRANSITIONAL** | ? | ? | Indicatoren tegenstrijdig — markt zoekt richting. |

---

## 3. Architectuur

```
src/lib/analytics/macro-regime/
├── types.ts                # MacroIndicator, MacroRegime, asset-mapping types
├── providers/              # Data-abstractielaag
│   ├── types.ts           # AIProvider-achtige interface
│   ├── seed.ts            # Mock-provider met plausibele 2026-snapshot
│   ├── snapshot.ts        # Leest uit bestaande MarketSnapshot-tabel
│   ├── composite.ts       # Snapshot + seed-fallback per indicator
│   └── index.ts
├── classifier.ts          # 7 raw indicators → 1 regime + confidence
├── asset-mapping.ts       # 5 regimes × 10 asset-classes tabel
├── portfolio-impact.ts    # User-portfolio vs regime-baseline
├── portfolio-classifier.ts# Holdings → AssetClassKey-buckets
├── engine.ts              # Orchestrator
├── loader.ts              # Provider → engine → portfolio-impact
├── classifier.test.ts     # 10 tests
├── asset-mapping.test.ts  # 10 tests
├── portfolio-impact.test.ts # 10 tests
└── index.ts

src/components/macro-regime/
├── regime-card.tsx        # Dashboard-widget
└── indicator-row.tsx      # Detail-pagina rij

src/app/(app)/macro/
└── page.tsx               # Volledige detail-pagina
```

---

## 4. Provider-abstractie

```ts
interface MacroDataProvider {
  readonly id: MacroProviderId;  // "seed" | "snapshot" | "composite"
  fetch(): Promise<MacroDataSnapshot>;
}
```

Drie ingebouwde providers:

| Provider | Bron | Wanneer |
|---|---|---|
| `SeedMacroProvider` | Hardcoded plausibele 2026-snapshot | Dev/CI of als fallback |
| `SnapshotMacroProvider` | `MarketSnapshot`-tabel + Json `indicators` | Productie zodra DB gevuld |
| `CompositeMacroProvider` | Snapshot waar beschikbaar, anders seed | **Default** |

**Toekomstige providers** kunnen drop-in worden gekoppeld zodra de bron beschikbaar is:

| Provider-naam | Bron | Indicators die het invult |
|---|---|---|
| `FredProvider` | FRED API (US St. Louis Fed) | growth, inflation, rates, liquidity (M2) |
| `EcbSdwProvider` | ECB Statistical Data Warehouse | EU-equivalenten van bovenstaande |
| `BloombergProvider` | Bloomberg B-PIPE | volatility (VIX), sentiment, recession-risk |
| `OnsBcbProvider` | National statistical offices | growth + CPI per land |
| `AiForecastProvider` | Eigen ML-model met leading indicators | recession_risk + groei-forecast |

Implementeer alleen `fetch(): Promise<MacroDataSnapshot>`. Per-indicator `confidence` 0..1 zorgt dat de classifier zwakke meetwaarden lager weegt.

---

## 5. Classifier-logica

### Stap 1 — normaliseer

Elke raw-indicator → `MacroIndicator` met:
- `score` 0..100 (50 = neutraal). Specifieke mappings:
  - `growth`: 0% → 10, 4% → 95
  - `inflation`: 0% → 90, 7% → 10 (lager = beter)
  - `rates`: 1.5% → 80, 5% → 20 (hoger = krapper)
  - `liquidity`: -2% → 15, 8% → 90
  - `recession_risk`: 100 − rawValue (al 0..100)
  - `volatility`: 14 → 85, 35 → 15
  - `sentiment`: directe 0..100 mapping
- `trend`: rising / falling / stable / unknown
- `rationale`: 1-zin NL met cijfer (Lynch-laag)

### Stap 2 — quadrant + confidence

- `growth.trend × inflation.trend` bepaalt het quadrant.
- Onbekende trends OF stabiele trends → TRANSITIONAL.
- De andere 5 indicators voegen `support` of `conflict` toe per regime — `confidence = 0.3 + 0.65 × (support / total)`. Maximum is 0.95 (we zijn nooit 100% zeker).

---

## 6. Asset-class mapping

Voor elk regime levert `getAssetMappingForRegime(regime)` een tabel met 10 asset-classes en per stuk: `direction` (tailwind / headwind / neutral) + `magnitude` (0..1) + NL-rationale.

Bron: Dalio All-Weather + decennia van marktdata-onderzoek; tabellen staan als `const` in [asset-mapping.ts](../src/lib/analytics/macro-regime/asset-mapping.ts).

Voorbeelden:
- **STAGFLATION** → goud + cash + defensieve aandelen = tailwind; growth + cyclicals = headwind
- **REFLATION** → cyclicals + commodities + value = tailwind; government bonds = headwind
- **TRANSITIONAL** → alles neutraal (expliciet "geen sterke richting")

---

## 7. Portfolio-impact

Gegeven user-portfolio weights × regime-baseline:

```
gap = currentWeight − regimeBaseline
```

Per bucket berekenen we `direction` afhankelijk van of de asset-class een tailwind heeft:
- Tailwind asset + overgewicht → tailwind voor portfolio
- Tailwind asset + ondergewicht → headwind voor portfolio
- Headwind asset + overgewicht → headwind voor portfolio
- Headwind asset + ondergewicht → tailwind voor portfolio

**Alignment-score** (0..100) is de gemiddelde, op magnitude gewogen, gap-fractie. Hoog = portfolio ligt dicht bij regime-baseline. **Geen advies** — alleen meting.

**Holdings → AssetClassKey** gebeurt in [portfolio-classifier.ts](../src/lib/analytics/macro-regime/portfolio-classifier.ts) heuristisch via:
1. `assetClass`-veld (BOND, COMMODITY, CASH, REAL_ESTATE)
2. Naam/ticker-regex (gold/gld → GOLD)
3. Sector + factor-score (defensive sectors → EQUITY_DEFENSIVE; tech + groei-factor → EQUITY_GROWTH; anders EQUITY_VALUE)

---

## 8. Tests — 30 in totaal

| File | Tests | Coverage |
|---|---|---|
| `classifier.test.ts` | 10 | 4 quadrants + transitional + indicator-shape + determinisme |
| `asset-mapping.test.ts` | 10 | 5 regimes × completeness + directie-checks |
| `portfolio-impact.test.ts` | 10 | Alignment-score, direction-logica, summary-tekst |

---

## 9. Topbelegger-validatie

| Lens | Hoe het zit |
|---|---|
| **Buffett** (geen overmatige complexiteit) | 7 indicators, 5 regimes, 10 asset-classes — klein genoeg om in 30s te begrijpen. Geen 50-factor model. |
| **Dalio** (regime-denken centraal) | Quadrant-classificatie is letterlijk Dalio's framework. Asset-mapping volgt All-Weather-intuïtie. |
| **Lynch** (uitleg simpel) | Per indicator een NL-zin met concrete getallen ("CPI 3.1% YoY, stijgend; boven 2%-target"). Geen jargon zonder uitleg. |
| **Simons** (reproduceerbaar) | Pure functies, deterministisch, 30 unit tests. Drempels zijn `const` in code. |
| **Wood** (uitbreidbaar naar AI) | Provider-abstractie laat een toekomstige `AiForecastProvider` drop-in toe. Per-indicator `confidence` zorgt dat AI-forecasts zonder volledige data niet alles overrulen. |

---

## 10. Wat (nog) niet in scope

| Feature | Status | Reden |
|---|---|---|
| Real-time fetch van FRED/ECB/Bloomberg | Niet | Provider-stubs klaar; productie-koppeling vereist API-keys + rate-limit-strategy |
| Custom-regime per gebruiker | Niet | Default-regime volstaat; persoonlijke tilt komt via portfolio-impact |
| Historische regime-tijdlijn | Niet | Goede vervolgstap — toon hoe regime in afgelopen 12mnd verschoven is |
| Recession-probability AI-forecast | Niet | Hook (`AiForecastProvider`) is voorbereid, model nog niet |
| Cross-regime alert ("regime is 7 dagen geleden geflipt") | Niet | Vereist regime-snapshot-tabel + diff-engine |

---

## 11. Toekomstige uitbreidingen

- **Regime-history-tabel**: log dagelijks de classificatie zodat we drift kunnen tonen ("STAGFLATION sinds 14 dagen").
- **AI-augmentatie**: `AiForecastProvider` die leading indicators voorspelt + extra confidence-laag levert.
- **Country-/region-level**: nu globaal; toevoeging van EU/US/EM/Asia-regimes.
- **Notification-trigger**: "Regime is verschoven van REFLATION → STAGFLATION — check je cyclische exposure".
- **Backtest-integratie**: gebruik regime-classificatie als signal-bron in Strategy Lab.
- **AI-narrative**: laat de Daily Briefing-AI (Module 2) één paragraaf schrijven die regime + portfolio-impact in context van de portefeuille uitlegt.
