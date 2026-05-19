# Data Quality & Provider Health Center — Module 26

Twee complementaire lagen die de **vertrouwbaarheid** van de data zichtbaar maken:

1. **Gebruikerslaag** — per asset + per portefeuille datadekking voor live-koers, fundamentals, dividend, macro en history. Plain-language uitleg; geen technische foutcodes.
2. **Beheerlaag** — provider-metrics-store met success/failure/latency/percentielen + fallback-invocaties + stale-detectie.

> **Buffett-laag**: eerlijke onzekerheid > schijnzekerheid. Gebruikers zien een tier-badge ("Goed" / "Beperkt") + gewogen-coverage per dimensie; admins zien per-provider p50/p95 latency en exacte failure-counts.

---

## 1. Module 26-spec mapping

### Gebruikerslaag (4 deliverables)

| # | Spec | Implementatie | Locatie |
|---|---|---|---|
| 1 | Data quality badge per asset | `DataDepthBadge` (tier + score) | `src/components/common/data-depth-badge.tsx` |
| 2 | Coverage score per portefeuille | `assessPortfolioCoverage` → tier + weightedScore | `src/lib/analytics/data-depth/engine.ts` |
| 3 | Waarschuwing bij ontbrekende fundamentele/macro/dividend-data | `coverage.warnings[]` (max 5) | `engine.ts` |
| 4 | Uitleg wat lage datakwaliteit betekent | `TIER_EXPLANATIONS[tier]` + `coverage.summary` | `types.ts` |

### Beheerlaag (5 deliverables)

| # | Spec | Implementatie | Locatie |
|---|---|---|---|
| 5 | Provider health dashboard | `ProviderHealthDetail`-component op `/admin` | `app/(app)/admin/page.tsx` |
| 6 | Laatste succesvolle update | `lastSuccessAt` + `lastFailureAt` (ISO-timestamps) | `provider-health/store.ts` |
| 7 | Failure count | `failureCount` + `fallbackInvocationCount` | `store.ts` |
| 8 | Stale-indicator | `stale` flag (geen activity in 1u) | `store.ts` (`DEFAULT_PROVIDER_HEALTH_CONFIG.staleWindowMs`) |
| 9 | Gemiddelde latency | `avgLatencyMs` + `p50` + `p95` | `store.ts` |

---

## 2. Architectuur

```
src/lib/analytics/data-depth/
├── types.ts          # DataDepthDimension + Tier + DIMENSION_WEIGHTS + TIER_EXPLANATIONS
├── engine.ts         # computeAssetDataDepth, assessPortfolioCoverage, applyDataDepthToConfidence
├── loader.ts         # buildPortfolioDepth — server-side hydratie
├── engine.test.ts    # 17 tests
└── index.ts

src/lib/provider-health/
├── types.ts          # ProviderHealthStats + ProviderCallEvent + config
├── store.ts          # in-memory aggregator + withProviderHealth wrapper
├── store.test.ts     # 12 tests
└── index.ts

src/components/common/
├── data-depth-banner.tsx   # portfolio-niveau banner (tier + 5 dimensies + warnings)
└── data-depth-badge.tsx    # per-asset compact-badge

src/app/(app)/portfolio/page.tsx
                              # Section "Datadekking" tussen Holdings en
                              # Metadata-kwaliteit (bestaande DataQualityPanel
                              # blijft naast staan)

src/lib/admin/
├── dashboard.ts             # +loadProviderHealthDetail (snapshot read)
└── types.ts                 # +ProviderHealthDetailSummary

src/app/(app)/admin/page.tsx
                              # Section "Provider health-detail" met
                              # tabel — Callsite voor admin-rol
```

**Geen Prisma-migratie**. Geen wijzigingen aan bestaande `data-quality.ts` (Module 15). Beide systemen draaien naast elkaar:
- `data-quality.ts` = metadata-coverage (sector/region/asset-class)
- `data-depth/` = signal-coverage (live-price/fundamentals/dividend/macro/history)

---

## 3. Gebruikerslaag — 5 dimensies + tier-logica

```
DIMENSION_WEIGHTS:
  live_price   30%   → priceSource === "market"
  fundamentals 25%   → fundamentals.pe || .roic || .pb gevuld
  dividend     10%   → fundamentals.dividendYield gevuld
  macro        15%   → regime-engine actief (boolean global)
  history      20%   → ≥ 60 close-prijs-punten beschikbaar
                       (≈ 3 maanden trading days)
```

**Tier-drempels** (`tierFromScore`):

| Tier | Score | Tone | Plain-language |
|---|---|---|---|
| Excellent | ≥ 85 | groen | "Alle belangrijke databronnen aanwezig — scores betrouwbaar." |
| Good | 70-85 | groen | "Bijna alle data aanwezig — solide analyses." |
| Fair | 50-70 | grijs | "Basis-analyses voldoende; sommige geavanceerde signalen incompleet." |
| Limited | 25-50 | geel | "Beperkte data — gebruik als richting, niet als beslissingsbasis." |
| Poor | < 25 | rood | "Onvoldoende data — scores indicatief en kunnen wijzigen." |

**Warnings (max 5)** triggeren bij:
- `<50% live-price-coverage` → "Meer dan helft mist actuele koersen — scores indicatief."
- `<50% fundamentals` → "Kwaliteit-signalen incompleet."
- `<30% dividend` → "Dividend-projectie onvolledig."
- `<50% macro` → "Regime-aligned scores beperkt."
- `<50% history` → "Volatiliteit/drawdown-analyse beperkt."

---

## 4. Beheerlaag — provider-metrics

### `withProviderHealth` wrapper

```ts
import { withProviderHealth } from "@/lib/provider-health";

const quote = await withProviderHealth(
  { provider: "yahoo", kind: "market-data", operation: "quote" },
  () => yahoo.getQuote("MSFT"),
);
```

Meet duration, logt success/failure, gooit origineel-error opnieuw. Volledig transparant — geen control-flow-wijziging.

### In-memory aggregator

| Veld | Beschrijving |
|---|---|
| `callCount` | totaal aantal calls binnen window |
| `successCount` / `failureCount` | per-result tellers |
| `fallbackInvocationCount` | hoeveel calls liepen via fallback-chain |
| `avgLatencyMs` | gemiddelde over alle calls (cumulatief) |
| `latencyP50Ms` / `latencyP95Ms` | percentielen via nearest-rank (uit max-500 buffer) |
| `lastSuccessAt` / `lastFailureAt` | ISO-timestamps |
| `lastError` | gesnetterde error-naam (cap 80 chars) |
| `healthy` | true wanneer succes binnen 5 min |
| `stale` | true wanneer geen activity binnen 1 uur |

**Privacy/security**: geen tickers, geen request-bodies, geen secrets bewaard. Alleen geaggregeerde counters + provider-naam + operatie-categorie.

---

## 5. Privacy & taal

**Geen technische foutcodes naar normale gebruikers**:
- UI gebruikt alleen tier-labels (NL spreektaal) + plain-language warnings
- Tests valideren expliciet: `explanation` mag geen `api|provider|status|http|json|\d{1,3}%` bevatten
- HTTP-statuscodes blijven in server-logs

**Wel transparant over onzekerheid**:
- `weakestAssets` toont top-3 zwakste posities (Lynch: "verbeter eerst dit")
- Per-dimensie gewogen-coverage = expliciet zichtbaar
- Disclaimer in tier-explanation: "scores kunnen wijzigen zodra meer bekend"

---

## 6. Confidence-multiplier (opt-in)

```ts
import { applyDataDepthToConfidence } from "@/lib/analytics/data-depth";

const adjusted = applyDataDepthToConfidence(rawConfidence, depthScore);
// depth=100 → 1.0× (geen straf)
// depth=50  → 0.75×
// depth=0   → 0.5× (minimum — nooit naar 0)
```

**Niet automatisch geïntegreerd** in alle engines. Caller-side integratie zodat een engine bewust kiest wanneer data-depth zijn confidence eroderen mag. Tests dekken alle 4 hoeken (clamp 0/1, monotone interpolatie).

**Backlog**: hook in signal-fusion-engine zodat per-ticker confidence-scores automatisch worden gemultipliceerd met asset-depth. Vereist één regel in `confidence-aggregator.ts` — niet in deze pas om side-effects op bestaande scoring te voorkomen.

---

## 7. Topbelegger-validatie

| Lens | Hoe Module 26 hier landt |
|---|---|
| **Buffett (vertrouwen + eenvoud)** | Tier-badge "Goed" / "Beperkt" zegt direct wat het is; geen percentage-spelletjes |
| **Dalio (risico expliciet)** | `weakestAssets[]` + 5 warnings = onzekerheid expliciet boven kapotte zekerheid |
| **Lynch (begrijpelijk)** | Plain-language uitleg; geen jargon; per dimensie één-zin betekenis |
| **Simons (meetbaar)** | Deterministische `DIMENSION_WEIGHTS` (som=1.0, spec-test); 29 unit-tests; reproduceerbaar |
| **Wood (toekomstgericht)** | Provider-health-metrics zijn een fundament voor v2 SLA-monitoring + paging |
| **Technisch beheerder** | Per-provider p50/p95 latency + stale-flag + fallback-counter — operationeel inzicht zonder externe monitoring-stack |
| **Risicoanalist** | Lage data-depth eroderert confidence (multiplier) — risico van overconfidence vooraf zichtbaar |
| **Marketeer** | "Datadekking 86/100 — Goed" op portfolio-page = trust-signaal richting prospects |
| **CEO (reputatierisico)** | Geen verzonnen scores: bij missing data tonen we "Beperkt" met uitleg i.p.v. fake-data; reputatie-risico bij prospect-demo's beperkt |

---

## 8. Tests — 29 nieuwe tests

| File | Tests | Coverage |
|---|---|---|
| `data-depth/engine.test.ts` | 17 | tier-drempels (5), computeAssetDataDepth (6), assessPortfolioCoverage (5), confidence-multiplier (5), spec-conformance (2) — geen jargon + weights sommeren tot 1.0 |
| `provider-health/store.test.ts` | 12 | event-telling (3), healthy/stale-flags (3), wrapper (2), privacy (4) — error-truncatie, geen call-detail in snapshot, alfabetische sortering |

Totaal: **2503/2503 tests** (209 files). Geen regressie.

---

## 9. Resterende risico's

| Risk | Mitigatie |
|---|---|
| Provider-metrics zijn in-memory → reset bij process-restart | Acceptabel voor v1 (zelfde patroon als `cost-meter.ts`); v2 = Prometheus-export of nightly-snapshot-naar-audit |
| Multi-instance deploy → elke instance heeft eigen tellers | Documented in store.ts; v2 = shared Redis/KV-store |
| `withProviderHealth` is opt-in — bestaande call-sites moeten worden gemigreerd | Backlog: wrap Yahoo + Alpha + getFundamentals + getHistory in fallback-chain; in deze pas alleen interface aangeleverd om backwards-compat te garanderen |
| `hasMacroRegime` is hardcoded `true` in portfolio-loader | Pragmatisch: regime-engine draait altijd. Backlog: hook in `fetchRegimeInputs` om dynamic te bepalen |
| Tests dekken pure engine; geen e2e van banner/badge UI | Pure-function-tests zijn dekkend voor businesslogica; UI is presentationeel |
| `applyDataDepthToConfidence` is niet auto-toegepast | Bewust — caller-side opt-in voorkomt onverwachte score-shifts; backlog: signal-fusion-integratie |
| Stale-window is 1u hardcoded | Configurable via `DEFAULT_PROVIDER_HEALTH_CONFIG`; aanpasbaar per deployment |

---

## 10. Decision-log

**Vraag**: waarom een nieuwe `data-depth/`-module naast bestaande `data-quality.ts`?

**Antwoord**:
- `data-quality.ts` (M15) meet **metadata** (sector/region/asset-class) — generiek voor allocation/factor-attribution
- `data-depth/` (M26) meet **signal-availability** (live-price/fundamentals/dividend/macro/history) — generiek voor confidence-erosie
- Beide assen zijn orthogonaal: een asset met perfecte metadata kan nog steeds onvoldoende fundamentals hebben, en vice versa
- Rewriten van `data-quality.ts` had backward-compat-risico met bestaande UI + tests (Module 15+ stack)

**Vraag**: waarom in-memory store i.p.v. Prisma-tabel voor provider-metrics?

**Antwoord**:
1. Volume: ~1000-10000 call-events/dag — Prisma-write per event is overkill
2. Read-pattern: alleen admin-UI, niet-kritisch
3. Resetten bij restart is acceptabel (zelfde als `cost-meter.ts`)
4. Migratie naar Redis-counters of Prometheus-scrape is een v2-sprint zonder API-rewrite (zelfde `snapshotProviderHealth()`-interface blijft staan)
