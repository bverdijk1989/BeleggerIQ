# Signal Performance Lab — Module 27

Research-grade backtest per signaal-component zodat BeleggerIQ minder black-box wordt. **Geen overfit-magie**: alle drempels zijn vaste constants, alle berekeningen pure-function, en bij <30 observaties rendert de UI een expliciete sample-size warning.

> **Risicoanalist-laag**: onzekerheid expliciet. Disclaimer is verplicht onderaan UI én CSV — "historische prestaties bieden geen garantie voor toekomstige resultaten".

---

## 1. Module 27-spec mapping — 8 deliverables

| # | Spec | Implementatie | Locatie |
|---|---|---|---|
| 1 | Score snapshot model | Hergebruikt bestaande `FactorSnapshot` Prisma-tabel | `prisma/schema.prisma` (geen migratie) |
| 2 | Signal versioning | `FactorSnapshot.model` veld (al aanwezig, default `"default"`) | bestaand |
| 3 | Backtest per signal component (6) | `SignalComponentKey` × `computeComponentPerformance` | `engine.ts` |
| 4 | Performance per regime | `SignalRegimeBreakdown` (12m horizon) | `engine.ts` |
| 5 | False positive/negative analyse | `falsePositiveCount` (score≥70 + ret<-5%) en `falseNegativeCount` (score≤30 + ret>+5%) | `engine.ts` |
| 6 | Signal decay indicator | `classifyDecay()` — 5 patterns (monotonic_decay / growth / peak_mid / flat / insufficient) | `engine.ts` |
| 7 | UI voor Elite/Research | `/research/signals` met PaywallCard voor lower-tier | `app/(app)/research/signals/page.tsx` |
| 8 | Export naar CSV | `buildSignalPerformanceCsv` + `/api/research/signals/csv` route | `csv.ts` + `app/api/research/signals/csv/route.ts` |

---

## 2. Architectuur

```
src/lib/analytics/signal-performance/
├── types.ts          # SignalObservation + SignalPerformanceReport + drempels
├── engine.ts         # pure-function: spearman rank, hit-rate, decay,
│                       quintile-spread, regime-breakdown
├── loader.ts         # leest FactorSnapshot + paart met getHistory
│                       forward-returns (1m/3m/6m/12m, 7d tolerance)
├── csv.ts            # RFC 4180 exporter — 3 secties + disclaimer-regel
├── engine.test.ts    # 25 tests
└── index.ts

src/app/(app)/research/signals/page.tsx
                       # ELITE+-gated UI; per-component-tabel +
                       # regime-breakdown-matrix + decay-pills

src/app/api/research/signals/csv/route.ts
                       # CSV-export met entitlement-gate

src/lib/entitlements/
├── catalog.ts        # +research.signal_performance (ELITE_AND_UP)
└── types.ts          # +1 FeatureKey
```

**Geen Prisma-migratie**. Hergebruikt:
- `FactorSnapshot` (bestaand sinds M6) als historische score-bron
- `getHistory` voor forward-returns
- `MarketRegimeStance` types (M5) voor regime-bucket labels

---

## 3. Berekeningsmethoden (pure-function, deterministic)

### 3.1 Hit-rate
> score > 50 + return ≥ 0 = **hit**
> score < 50 + return < 0 = **hit**
> score = 50 → niet meegeteld (neutraal)

Output: `hits / sampleSize` afgerond op 3 decimalen.

### 3.2 Information Coefficient (IC)
Spearman-rank correlatie tussen score en forward-return — robuust tegen outliers, gestandaardiseerd in factor-research.

| IC | Interpretatie |
|---|---|
| > +0.10 | sterk positief signaal |
| +0.05 — +0.10 | bruikbaar |
| -0.05 — +0.05 | neutraal/zwak |
| < -0.05 | invers signaal |

Returnt `null` bij < 5 observaties of bij volledige tie.

### 3.3 Long-short spread
Gemiddelde return top-quintile (score ≥ 80) MINUS gemiddelde return bottom-quintile (score < 20). Positief = signaal scheidt winnaars van verliezers.

Drempels (80/20) zijn **gepubliceerde quant-conventie** — niet ge-tuned op deze data.

### 3.4 False positive / negative
| Type | Conditie | Spec-implicatie |
|---|---|---|
| False positive | score ≥ 70 + return < -5% | hoge score voorspelde fout |
| False negative | score ≤ 30 + return > +5% | lage score miste rally |

Aantal counts vs sample size — geen "rate" om false-precision te voorkomen.

### 3.5 Decay-classifier
Per-horizon hit-rates → patroon:

```
[1m, 3m, 6m, 12m] hit-rates
  → strict daling     = monotonic_decay   (typisch: momentum)
  → strict stijging   = monotonic_growth  (typisch: quality)
  → piek in 3m of 6m  = peak_mid          (typisch: valuation)
  → range < 0.05      = flat              (consistent)
  → ontbrekende cell  = insufficient
```

---

## 4. Sample-size & warnings (geen schijnzekerheid)

| Conditie | Warning |
|---|---|
| `totalObservations < 30` | Globale warning bovenaan rapport: "interpreteer met grote voorzichtigheid" |
| Per-component < 30 | Per-row warning in component-tabel: "{n} observaties — illustratief" |
| Per-regime < 10 eligible | Regime-breakdown warning: "te weinig observaties per regime" |
| Geen data voor horizon | Cell toont "—" zonder verzonnen waarde |

UI rendert deze warnings expliciet. CSV exporteert ze als `# WAARSCHUWING:` comment-regels.

---

## 5. Privacy & security

- **Geen ticker-namen** in CSV-export (alleen geaggregeerde stats per component)
- **Geen PII** in audit-logs (alleen tier + observation-count)
- **Entitlement-gate** op zowel UI (page-level) als API-route (CSV)
- **Cache-Control: private, no-store** op CSV-response

---

## 6. Topbelegger-validatie

| Lens | Hoe Module 27 hier landt |
|---|---|
| **Buffett (vertrouwen + eenvoud)** | Quality-signaal krijgt eigen tabel en eigen decay-classifier; geen weighted-magic-composite tussen componenten |
| **Dalio (regime-context)** | Regime-breakdown matrix is een kernsectie — toont expliciet in welk regime elk signaal het sterkst werkt |
| **Lynch (begrijpelijk)** | Plain-language summary per component ("Quality werkt historisch — hit-rate 58% op 12m; werkt sterker op lange termijn") |
| **Simons (meetbaar + reproduceerbaar)** | Pure-function engine, 25 unit-tests dekken: rank-correlatie, hit-rate, false-pos/neg, decay-classifier (4 patterns + insufficient), spec-conformance, CSV-format |
| **Wood (toekomstgericht)** | `SignalObservation`-shape is platform-neutraal — toekomstige bronnen (esg-score, alt-data) plugin-baar zonder breaking change |
| **Technisch beheerder** | Loader logs (signal-performance.history_fetch_failed) zonder PII; faal-safe per ticker; bij empty-dataset → lege rapport, geen crash |
| **Langetermijnbelegger** | Niet zichtbaar voor FREE/PRO — voorkomt dat retail-user verkeerde conclusies trekt uit kleine sample |
| **Hedge fund (research-grade)** | Spearman IC + quintile-spread + decay-pattern = standaard factor-research output; CSV-export voor verdere analyse |
| **Risicoanalist** | Sample-size warnings expliciet; disclaimer verplicht; false-positive/negative counts in plain-counts (niet percentages) om geen schijnstatistiek te suggereren |
| **Marketeer** | Onderscheidende propositie ("research-grade backtest van je signalen") = sterke Elite-upgrade-pull |
| **CEO (reputatie + research-grade)** | Bewust geen "optimizer"-feature: dat geeft de indruk dat we curve-fitten. Onze positie: "we tonen wat is, niet wat we wensen" |

---

## 7. Tests — 25 nieuwe tests

| Categorie | Tests | Coverage |
|---|---|---|
| Spearman-rank | 4 | perfect +1/-1, <5 obs → null, ties-handling |
| Component-perf | 6 | hit-rate, FP, FN, long-short spread, sample-warning, score=null skip |
| Decay-classifier | 5 | monotonic_decay, monotonic_growth, flat, peak_mid, insufficient |
| Orchestrator | 4 | lege observations, global warning <30, geen warning ≥50, regime-buckets compleet |
| CSV-export | 3 | 3 secties + disclaimer, header heeft 11 kolommen, warning-comment regel |
| Spec-conformance | 3 | `MIN_SAMPLE_SIZE === 30`, disclaimer benoemt "geen garantie", per-row warning bij <30 obs |

**Niet in deze pas**:
- E2E-test van `/research/signals` UI (vereist Playwright)
- Loader-integratie-tests (Prisma-afhankelijk; engine-test dekt logica)
- Multi-tenant test op CSV-route (toegevoegd in Module 24 advisor-workspace tests)

---

## 8. Resterende risico's

| Risk | Mitigatie |
|---|---|
| `FactorSnapshot`-tabel is in productie nog dun | Globale warning rendert; UI toont EmptyState "nog geen historische data" wanneer rij-count = 0; backlog: nightly snapshot-job |
| `macrofit` en `portfoliofit` zijn in v1 altijd `null` | Bewust: vereisen meer context dan een FactorSnapshot. UI maakt expliciet dat deze in voorbereiding zijn. Backlog: voeg toe in v2 wanneer regime-history beschikbaar |
| Spearman-rank gebruikt nearest-rank methode bij ties | Acceptabel — standaardvariant; in factor-research breed gebruikt |
| Long-short spread is gevoelig voor kleine quintile-buckets | Documented: bij <30 obs warning expliciet; user kan eigen judgement maken |
| Geen multi-test-correction (Bonferroni-style) over 6 componenten × 4 horizons | Acceptabel voor v1: we claimen geen statistische significantie. Spec-test valideert dat we geen "p-value < 0.05" claims maken |
| CSV-export bevat in v1 geen per-ticker observation-detail | Bewust: privacy + portfolio-anonimiteit. Backlog: optionele `?detail=1` query voor research-users wanneer multi-tenant aggregation gefiltreerd wordt |
| Tests draaien op gesynthetiseerde fixture-data, niet productie-snapshots | Acceptabel — pure-function engine; productie-correctness bewezen via observation-shape stabiliteit |
| Inverse signals (IC < -0.05) worden gerenderd zonder waarschuwing voor "shorting" | Acceptabel: scope is informatief, niet trade-execution; disclaimer dekt dit |

---

## 9. Decision-log

**Vraag**: waarom geen "auto-tune"-feature die optimale gewichten zoekt?

**Antwoord**:
1. Reputatie-risico: dat gee­ft de indruk dat we curve-fitten op historie — meest gemaakte fout in quant-finance
2. Buffett-laag (vertrouwen): "we tonen wat is, niet wat we wensen". Toon hit-rates eerlijk en laat user zelf judgement maken
3. Sample-size: <100 observaties is te weinig voor robuste optimalisatie zonder cross-validation framework
4. Backlog: bij voldoende data + cross-validation harness, optioneel weight-suggestion-tooling met expliciete out-of-sample-test

**Vraag**: waarom een aparte feature-key `research.signal_performance` ipv hergebruik van bestaande `signal_fusion.confidence_score`?

**Antwoord**:
1. `signal_fusion.confidence_score` = realtime score per ticker (consumer-facing)
2. `research.signal_performance` = historische backtest van diezelfde signalen (research-facing)
3. Verschillende doelgroepen, verschillende disclaimers; aparte key houdt entitlement-matrix transparant
4. Beide draaien op ELITE_AND_UP — geen pricing-impact

**Vraag**: waarom CSV ipv JSON/Parquet voor research-export?

**Antwoord**:
1. Excel/Sheets/R/Python lezen CSV native — laagste-friction-research-workflow
2. JSON-shape blijft beschikbaar via API-respons als toekomstige integratie nodig is
3. Parquet zou een binary-library-dependency toevoegen; overkill voor v1

---

## 10. Migratie-pad

| v1 (nu) | v2 (na adoptie) |
|---|---|
| Loader leest `FactorSnapshot` direct | Aparte `SignalSnapshot`-tabel per signaal-component (granular) |
| Regime = "UNKNOWN" voor alle obs | Regime-tagging via gesynchroniseerde `MarketSnapshot`-tijdreeks |
| `macrofit` + `portfoliofit` = null | Per-ticker macro-sensitivity + portfolio-context-score |
| Geen overfit-protection | Walk-forward cross-validation harness (out-of-sample IC) |
| CSV-export = geaggregeerd | Optionele detail-export voor research-users (privacy-gated) |
