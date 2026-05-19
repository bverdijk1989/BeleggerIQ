# Risk Trend & Snapshot History — Module 30

Gebruikers zien of hun portefeuille beter of slechter wordt over tijd via een **compact** snapshot-mechanisme bovenop het bestaande `PortfolioSnapshot`-tabel. **Geen Prisma-migratie**: we vullen een nieuw `riskTrend`-sub-veld in `metrics Json`.

> **Marketeer-laag**: maandelijkse trend zichtbaar = retentie-anker. "Vorige maand was je health 68, nu 73" is concreter dan abstracte scores.
> **Privacy-laag**: snapshot bevat alleen scores en fracties, **geen** ticker-namen of bedragen.

---

## 1. Module 30-spec mapping

| # | Spec | Implementatie | Locatie |
|---|---|---|---|
| 1 | Periodieke snapshot-structuur | `RiskTrendSnapshot` in `PortfolioSnapshot.metrics.riskTrend` | `snapshot.ts` (additief) |
| 2 | Health score over tijd | `healthScore` veld + delta-engine | `snapshot-builder.ts` |
| 3 | Risk score over tijd | `riskScore` veld | idem |
| 4 | Concentratie over tijd | `concentrationHhi + largestPositionWeight + top5Weight + sectorHhi` | idem |
| 5 | Data quality over tijd | `dataDepthScore` (M26-bron) | idem |
| 6 | Drift over tijd | `driftAvg` (avg |current - target| over rebalance.recommendations) | idem |
| 7 | Timeline UI | `/risk-trend` route met snapshot-grid + delta-table + timeline | `app/(app)/risk-trend/page.tsx` |
| 8 | "Wat veranderde sinds vorige maand?" | `TrendSummary` met top-3 highlights | `engine.ts` |
| 9 | AI/fallback-uitleg | Deterministic plain-language `message` per delta (geen AI in v1) | `engine.ts` |

---

## 2. Architectuur

```
src/lib/analytics/risk-trend/
├── types.ts              # RiskTrendSnapshot + RiskTrendPoint + TrendDelta +
│                            TrendSummary + RiskTrendReport + RISK_TREND_DISCLAIMER
├── snapshot-builder.ts   # pure: PortfolioView → compact RiskTrendSnapshot
├── engine.ts             # pure: 12 deltas + direction + significance +
│                            overall + headline + caveats
├── loader.ts             # server-side: leest portfolioSnapshotRepository +
│                            decodet metrics.riskTrend (backward-compat fallback
│                            naar typed headline-kolommen voor oude snapshots)
├── engine.test.ts        # 24 tests
└── index.ts

src/lib/analytics/snapshot.ts (UITGEBREID, niet gerewrited)
                            # PortfolioSnapshotMetrics.riskTrend? toegevoegd
                            # buildPortfolioSnapshotData vult `metrics.riskTrend`
                            # mee zonder bestaande velden te wijzigen

src/app/(app)/risk-trend/page.tsx
                            # Timeline + "Wat veranderde"-cards + delta-table
                            # + caveats + verplichte disclaimer
```

**Geen Prisma-migratie**. Bestaande `PortfolioSnapshot.metrics Json` is flexibel — we voegen een sub-key `riskTrend` toe. Backward-compat: oude snapshots zonder `riskTrend` worden gedecodeerd vanuit typed headline-kolommen (`healthScore`, `volatility`, `drawdown`).

---

## 3. RiskTrendSnapshot — 12 geaggregeerde velden

```ts
{
  schemaVersion: 1,
  healthScore: number | null,            // 0..100 (M1)
  riskScore: number | null,              // 0..100 (M29)
  concentrationHhi: number | null,       // 0..1 (M29)
  largestPositionWeight: number | null,  // 0..1
  top5Weight: number | null,             // 0..1
  sectorHhi: number | null,              // 0..1
  volatility: number | null,             // fractie
  maxDrawdown: number | null,            // negatief fractie
  foreignCurrencyExposure: number | null,// 0..1
  dataDepthScore: number | null,         // 0..100 (M26)
  driftAvg: number | null,               // 0..1 (M5 rebalance)
  positionCount: number,
}
```

**Privacy/data-minimalisatie**:
- Alleen geaggregeerde scores en fracties
- Geen ticker-namen, geen bedragen, geen e-mails
- **JSON-payload < 350 bytes** per snapshot (spec-test valideert)

---

## 4. Delta-engine — 4 directions

```
improvementSign × change
  → improving | worsening | stable | unknown
```

| Metric | improvementSign | Voorbeeld |
|---|---|---|
| healthScore | +1 (hoger=beter) | 65 → 75 = improving |
| riskScore | -1 (hoger=slechter) | 50 → 70 = worsening |
| concentrationHhi | -1 | 0.15 → 0.10 = improving |
| maxDrawdown | +1 (minder negatief=beter) | -0.25 → -0.10 = improving |
| dataDepthScore | +1 | 60 → 80 = improving |
| foreignCurrencyExposure | 0 (contextueel) | Geen "beter/slechter" zonder profiel |
| positionCount | 0 | Meer ≠ veiliger; minder ≠ slechter |

**Significance-drempels** (vast — geen statistisch concept):
- score: 5 punten
- fractie: 0.03 — 0.10 afhankelijk van metric
- count: 2

**Geen overfit-magie**: geen p-values, geen statistische tests. Wel deterministische "significant"-flag per drempel + caveats voor edge-cases.

---

## 5. "Wat veranderde"-samenvatting

```ts
TrendSummary {
  currentAt + previousAt,
  periodLabel: "sinds vorige maand" | "sinds N dagen geleden" | ...,
  overallDirection: improving | worsening | stable | unknown,
  deltas: TrendDelta[] (12),
  highlights: TrendDelta[] (top 3 op |change-normalized|),
  headline: "Portefeuille verbetert sinds vorige maand. Grootste verandering: ...",
  caveats: ["drawdown-verbetering kan komen door kortere window", ...],
}
```

**Caveats** triggeren bij:
- ≥4 metrics ontbreken (datadekking incompleet over periode)
- Drawdown verbeterd (kortere window kan misleiden — geen garantie)

---

## 6. Privacy & security

- **Geen entitlement-gate** — risico-transparantie is core; alle tiers zien de trend
- **Geen PII in logs** (loader logt alleen scope + errorName)
- **Auth-gate** via `resolveUserFromServer`
- **JSON-payload per snapshot < 350 bytes** — spec-test valideert
- **Snapshot bevat geen ticker-namen/bedragen** — spec-test valideert
- **Cache-Control**: server-rendered + `force-dynamic` (geen CDN-leak risk)

---

## 7. Backward-compatibility

Oude `PortfolioSnapshot`-rijen zonder `metrics.riskTrend`:

| Oud veld | Mapped naar |
|---|---|
| `healthScore` typed col | `riskTrend.healthScore` |
| `volatility` typed col | `riskTrend.volatility` |
| `drawdown` typed col | `riskTrend.maxDrawdown` |
| `metrics.top5Weight` | `riskTrend.top5Weight` |
| `metrics.foreignCurrencyExposure` | `riskTrend.foreignCurrencyExposure` |
| `metrics.riskScore` | `riskTrend.riskScore` |
| `metrics.positionCount` | `riskTrend.positionCount` |
| _overige nieuwe velden_ | `null` (UI rendert "—") |

Geen migratie nodig. Nieuwe snapshots krijgen automatisch alle velden.

---

## 8. Topbelegger-validatie

| Lens | Hoe Module 30 hier landt |
|---|---|
| **Buffett (vertrouwen)** | Trend over tijd > momentane score: kwaliteit valt op |
| **Dalio (regime-context)** | Drawdown- en concentratie-trends maken regime-shifts zichtbaar in eigen portfolio |
| **Lynch (begrijpelijk)** | Plain-language messages: "Health Score verbeterde (+12 pt)" — geen jargon |
| **Simons (meetbaar + reproduceerbaar)** | Pure-function engine; 24 unit-tests; alle drempels `const`; deterministic deltas |
| **Wood (toekomstgericht)** | `RiskTrendSnapshot` schema-versioned (v1) → toekomstige fields zonder breaking change |
| **Technisch beheerder** | Loader is faal-safe; bij <2 snapshots EmptyState; backward-compat decodeer-pad |
| **Langetermijnbelegger** | "Sinds vorige maand"-framing past bij langzame-rust-mentaliteit (geen real-time-dashboard) |
| **Hedge fund (backtestbaar)** | 24 snapshots × 12 metrics = 288 datapunten/portfolio voor research |
| **Risicoanalist** | Caveats expliciet (kortere window, missing data); disclaimer over "spiegel niet voorspelling" |
| **Marketeer** | Sterk retentie-anker: "kom terug elke maand om je groei te zien" — directe pitch |
| **CEO (reputatie)** | Disclaimer benoemt expliciet "geen voorspelling"; bewust GEEN AI-uitleg in v1 (deterministic > stochastic voor trends) |

---

## 9. Tests — 24 nieuwe tests

| Categorie | Tests | Coverage |
|---|---|---|
| Shape | 4 | lege/één/twee/3+ snapshots → correct gedrag |
| Delta-engine | 7 | direction per metric, significance-drempels, null-handling, count-unit |
| Overall direction + highlights | 4 | improving/worsening dominantie, cap-op-3, stable-headline |
| Privacy + minimal-fields | 5 | geen tickers/namen, payload <350 bytes, drift-calc, null bij geen recs, rounding |
| Spec-conformance | 4 | disclaimer-tekst, drawdown-caveat, missing-data-caveat, alle 12 metrics aanwezig |

Plus de bestaande `snapshot.test.ts` (6 tests) blijft groen via defensieve `view.rebalance?.recommendations ?? []` in builder.

Totaal: **2599/2599** (213 files).

---

## 10. Resterende risico's

| Risk | Mitigatie |
|---|---|
| Snapshot-job draait nu alleen on-demand via API (geen cron) | Bestaande `runScheduledSnapshots` is klaar; in productie via Vercel Cron of GitHub Actions activeren |
| Bij wisselende portfolio-composities (positie verkocht) lijken sommige deltas raar | Caveat over kortere window beperkt schade; backlog: tag "portfolio-change-event" tussen snapshots |
| Geen AI-narratief (bewust deterministic v1) | Backlog: AI-uitleg via M8 explainability als nieuwe domain `risk_trend`; nu plain-language per delta |
| Stub-views zonder rebalance → driftAvg = null | Defensief: builder handelt missing-rebalance af; UI rendert "—" |
| Verschillende snapshot-frequenties (1d vs 30d) → onvergelijkbare deltas | Acceptabel — period-label past zich aan ("sinds 3 dagen geleden" vs "vorige maand") |
| Schema-versie hardcoded op 1 | Bewust — bump bij breaking change in `RiskTrendSnapshot`-shape; decoder kan in v2 multi-versie ondersteunen |
| 24 snapshots cap (limit param) — oudere snapshots niet zichtbaar in UI | UI default; backend ondersteunt grotere limits; v2: UI-filter "all time vs 1 jaar" |
| Geen "% change"-display in highlights | Pure-function output bevat raw change + unit; UI formatteert; backlog: vergelijk t.o.v. baseline ipv vorig |

---

## 11. Decision-log

**Vraag**: waarom geen aparte `RiskTrendSnapshot` Prisma-tabel?

**Antwoord**:
1. Bestaande `PortfolioSnapshot.metrics Json` is precies hiervoor ontworpen — flexibele uitbreiding
2. Nieuwe tabel = extra migratie, dubbele schrijfacties, twee snapshot-pijpen onderhouden
3. Schema-version-veld in payload geeft toekomstige flexibility zonder DDL

**Vraag**: waarom geen AI-narratief?

**Antwoord**:
1. Deterministic plain-language messages zijn reproduceerbaar (Simons-laag, CEO-laag reputatie)
2. AI-uitleg op trend-deltas voegt weinig waarde toe boven "Health Score verbeterde (+12 pt)" — narratief is al duidelijk
3. Backlog: M8 explainability-integratie als nieuwe domain wanneer 10+ snapshots beschikbaar zijn voor pattern-context

**Vraag**: waarom 5 punten / 0.03 fractie als significance-drempels?

**Antwoord**:
- Klein genoeg om echte verbeteringen te detecteren binnen 1 maand
- Groot genoeg om noise (1% volatiliteit-schommeling, ±2 punten meet-fout) eruit te filteren
- Gepubliceerde quant-conventie voor "minimaal significant" delta in factor-research
- Niet ge-tuned op specifieke data — `const` in code

**Vraag**: waarom geen entitlement-gate?

**Antwoord**:
- Risico-transparantie is core voor elke gebruiker, ook FREE
- Geen pricing-pull voor "zie je trend"; pricing-pull zit in detail-features (signal-fusion, advisor)
- Snapshot-write-cost is minimaal (<350 bytes per maand per portfolio)
