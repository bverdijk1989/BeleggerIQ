# Cross-Asset Correlation Studio — Module 28

Geavanceerde onderzoekslaag voor Elite/Professional: visualiseer paarsgewijze correlaties tussen jouw posities + brede indices, met diversification-score en concrete inzichten over concentratie en hedge-kandidaten.

> **Risicoanalist-laag**: disclaimer verplicht — historische correlaties zijn niet stabiel onder stress (correlation-spikes tijdens crises). De studio toont waar je nu staat, niet waar je veilig staat.

---

## 1. Module 28-spec mapping

Gevraagd: "geavanceerde onderzoekslaag voor Elite/Professional-gebruikers."

Geleverd: een dedicated correlation-studio die hergebruikt wat M9 (Signal Fusion), M21 (Benchmark Catalog) en M27 (Research/Elite-pattern) al hadden klaarstaan.

| Deliverable | Implementatie | Locatie |
|---|---|---|
| Pure-function engine | Pearson + classifyPair + diversification-score | `engine.ts` |
| Loader | Top-15 holdings × 3 benchmarks (MSCI/SP500/AllWorld) via `getHistory` | `loader.ts` |
| UI ELITE+ | `/research/correlations` met matrix, insights, score-card | `app/(app)/research/correlations/page.tsx` |
| CSV-export | 3-sectie RFC4180 (matrix + insights + disclaimer) | `csv.ts` + `app/api/research/correlations/csv/route.ts` |
| Entitlement | Nieuwe key `research.correlations` (ELITE_AND_UP) | `catalog.ts` + `types.ts` |
| Tests | 23 pure-function tests | `engine.test.ts` |

---

## 2. Architectuur

```
src/lib/analytics/correlation/
├── types.ts            # CorrelationAsset + Cell + Insight + drempels
├── engine.ts           # pure: pearson, classifyPair, alignReturns,
│                          computeDiversificationScore, extractInsights
├── loader.ts           # top-15 holdings + 3 benchmarks via getHistory
│                          → daily-returns + date-alignment
├── csv.ts              # RFC 4180 export
├── engine.test.ts      # 23 tests
└── index.ts

src/app/(app)/research/correlations/page.tsx
                        # ELITE+-gated UI; score-callout + insights-grid
                        # + matrix-heatmap + "Hoe lezen?" + disclaimer

src/app/api/research/correlations/csv/route.ts
                        # CSV met entitlement-gate + private/no-store

src/lib/entitlements/
├── catalog.ts          # +research.correlations (ELITE_AND_UP)
└── types.ts            # +1 FeatureKey
```

**Geen Prisma-migratie**. Hergebruikt:
- `getHistory` (M16-cached, faal-safe)
- `BENCHMARK_CATALOG` (M21) voor MSCI_WORLD / SP500 / ALL_WORLD tickers
- `buildPortfolioView` voor weight-info per holding
- `PaywallCard` (M13) voor non-Elite UI
- M27-research-pattern (ELITE+, CSV-export, disclaimer-callout)

---

## 3. Berekeningen (pure-function, deterministic)

### 3.1 Pearson correlation
Standaard formula. Returnt `null` bij <2 obs of nul-variantie. Clamped binnen [-1, +1] voor numerieke veiligheid. Output afgerond op 4 decimalen.

### 3.2 Datum-alignment
Voor elk paar (i, j): bouw Maps date→return per asset; itereer over A, lookup in B. Alleen datums die in beide voorkomen tellen mee. Minimum 30 overlappende datums per cell (anders `correlation = null`).

**Bewuste keuze**: per-cell alignment i.p.v. globale inner-join. Voorkomt dat één asset met gaten de hele matrix sloopt.

### 3.3 Diversification-score
```
score = clip(round((1 - avg(cor)) × 100 / 1.5), 0..100)
```

| avg(cor) | score | verdict |
|---|---|---|
| +1.0 | 0 | geconcentreerd |
| +0.5 | 33 | matig |
| 0 | 67 | goed |
| ≤ -0.5 | 100 | uitstekend |

Schaling is bewust agressief: equity-portefeuilles hebben typisch avg ≈ 0.4 → score ≈ 40 (matig), wat realistisch is. Score = 70+ vereist actieve hedge-positie of zeer brede asset-mix.

### 3.4 Insight-classificatie
| Drempel | Kind | Betekenis |
|---|---|---|
| ≥ +0.85 | `highly_correlated` | concentratie-risico — beperkte spreiding |
| +0.50 to +0.85 | `moderately_correlated` | verwacht, niet flagged |
| |cor| < 0.20 | `uncorrelated_diversifier` | sterke spreiding |
| ≤ -0.30 | `negatively_correlated` | hedge-kandidaat |

Drempels zijn **gepubliceerde quant-conventie** — niet ge-tuned op deze data. Insight-lijst gesorteerd op `|correlation|` descending, gecapt op 10.

`moderately_correlated`-paren worden NIET in insight-lijst opgenomen (te ruisrijk).

---

## 4. UI-rendering

| Sectie | Wat |
|---|---|
| **Score-callout** | Score 0-100 + verdict-badge ("uitstekend" / "goed" / "matig" / "geconcentreerd") + sample-info |
| **Top inzichten** | Max-10 grid van cards: pair-label + kind-badge + correlatie-percentage + rationale |
| **Correlatie-matrix** | Heatmap-stijl tabel met kleur-codering (rood=hoog, groen=negatief, neutraal=licht) + tooltip met n + cor.toFixed(3) |
| **Hoe lezen?** | Plain-language uitleg van drempels en methodiek |
| **Disclaimer** | Verplicht onderaan |

Sample-size warnings worden expliciet gerendert (top-banner) wanneer overlap te klein is. Geen schijnzekerheid.

---

## 5. Privacy & security

- **Cache-Control: private, no-store** op CSV-response
- **Geen PII in logs** (alleen tier + assetCount + score + warning-flag)
- **Auth-gate eerst, dan entitlement-gate** in beide route (page + CSV)
- **Top-15 limiet** op holdings — voorkomt onleesbare matrix EN beperkt fetch-cost

---

## 6. Topbelegger-validatie

| Lens | Hoe Module 28 hier landt |
|---|---|
| **Buffett (vertrouwen)** | Geen "magic"-score — alle paren expliciet zichtbaar; gebruiker kan zelf judgment maken |
| **Dalio (risico + spreiding)** | Kern van Dalio's "all-weather"-filosofie: lage paarsgewijze correlatie = robuuste portfolio. Score expliciet meetbaar |
| **Lynch (begrijpelijk)** | Insight-cards gebruiken plain-language ("bewegen vrijwel synchroon", "potentiële hedge") |
| **Simons (research-grade)** | Pure-function engine, 23 unit-tests, deterministisch, CSV-export voor verdere analyse in R/Python |
| **Wood (toekomstgericht)** | `CorrelationAsset`-shape ondersteunt elke ticker (incl. crypto/commodities in v2) zonder breaking change |
| **Technisch beheerder** | Faal-safe per ticker; bij API-fail → asset dropt, geen crash; structured logs |
| **Langetermijnbelegger** | Top-15-limiet voorkomt overweldiging; één score-cijfer + 10 inzichten = consumeerbaar |
| **Hedge fund (research)** | Standaard Pearson + per-pair sample-size; CSV-export voor in-eigen-tool-analyse |
| **Risicoanalist** | Disclaimer benoemt expliciet "correlation-spikes onder stress"; warning bij <5 paren |
| **Marketeer** | Onderscheidende propositie ("zie waar je portefeuille echt overlap heeft") = sterke Elite-upgrade-pull |
| **CEO (research-grade)** | Bewust geen optimizer/rebalance-suggestor — alleen meten, niet "fix"-en. Vermijdt advies-aansprakelijkheid |

---

## 7. Tests — 23 nieuwe tests

| Categorie | Tests | Coverage |
|---|---|---|
| Pearson | 6 | perfect ±1, ortogonaal ≈0, ongelijke lengte → null, nul-variantie → null, clamping |
| classifyPair | 4 | 4 thresholds (highly / moderate / uncorrelated / negative) |
| buildCorrelationReport | 6 | lege input, filter <30 obs, identiek=1+score=0, negatief=-1+score≥80, holiday-alignment, sortering |
| CSV-export | 2 | 3 secties + disclaimer, komma-escape |
| Spec-conformance | 4 | MIN_SAMPLE=30, threshold 0.85, threshold -0.30, disclaimer-tekst |

**Niet in deze pas**:
- E2E-test van `/research/correlations` UI (vereist Playwright)
- Loader-test (Prisma + getHistory afhankelijk; engine dekt de logica)

Totaal: **2551/2551** (211 files).

---

## 8. Resterende risico's

| Risk | Mitigatie |
|---|---|
| Correlatie-spike tijdens crisis is NIET zichtbaar | Disclaimer benoemt dit expliciet; v2: rolling-correlation tijdreeks tonen |
| Holdings >15 worden afgekapt | Top-15 op marktwaarde, gerangschikt; v2: filter/sort-controls in UI |
| Benchmark-tickers (MSCI_WORLD = IWDA.AS, ALL_WORLD = VWCE.DE) zijn ETF-proxies | Acceptabel — bestaande BENCHMARK_CATALOG (M21) is al productie-gehard; fallback-tickers staan klaar |
| Per-ticker fetch via `getHistory` schaalt linair met portfolio-grootte | Acceptabel — caching (30min TTL) dempt impact; 18 tickers × 1 jaar daily ≈ 4500 punten max |
| Diversification-score is intuïtief maar niet directly volatility-equivalent | Documented in "Hoe lezen?"; score is een DIVERSIFICATIE-meter, niet een RISK-meter |
| Insight-kind classificatie kan verschuiven bij andere drempels | Drempels zijn `const`; toekomstige tuning vereist PR + spec-test-update |
| CSV-export bevat ticker-namen — geen anonimisering | Acceptabel: route is auth-gated en private/no-store; CSV is voor user zelf |
| Geen rolling-correlation v1 | Bewust: scope-control. Backlog: 30d/90d/180d rolling-correlation grafiek per pair |

---

## 9. Decision-log

**Vraag**: waarom Pearson en niet Spearman-rank (zoals M27)?

**Antwoord**:
- M27 (Signal Performance): score is een 0-100 cijfer, ranking is wat telt → Spearman
- M28 (Correlation): daily-returns zijn continue financiële variabelen, lineaire co-movement is precies wat we willen meten → Pearson
- Pearson is óók de standaard in factor-research (Modern Portfolio Theory, Markowitz)

**Vraag**: waarom geen rolling-correlation tijdreeks in v1?

**Antwoord**:
1. Scope-control: één goede static-matrix > twee halve features
2. UI-complexiteit: rolling-correlation per pair = O(N²) tijdreeksen, vereist chart-library + meer schermreal estate
3. Backlog: kandidate voor v2 met expliciete "during X period, correlation was Y" cards

**Vraag**: waarom GEEN auto-rebalancer / hedge-suggester?

**Antwoord**:
- Buffett/CEO-laag: scope is informatief, niet advies. Wij meten, gebruiker beslist
- Reputatie-risico bij "verkoop X om correlatie te verlagen"-suggesties (Wft-grens)
- Backlog: optionele "wat-als-ik-XYZ-verkocht" simulator als research-feature, niet als advies-feature
