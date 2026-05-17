# Crypto Risk & Momentum Lab — Module 12

Aparte lab-sectie voor gebruikers met BTC/ETH-exposure. **Risico-laag**, geen casino: meetwaarden + waarschuwingen, géén koopadvies, géén leverage-promotie, géén pump/dump-signalen.

> **Positionering**: BeleggerIQ is een risico-intelligentieplatform. Deze module bedient crypto-gebruikers zonder dat crypto de hoofdidentiteit van het platform wordt — vandaar de aparte `/crypto-lab`-route en de verplichte risico-banner bovenaan.

---

## 1. Module 12-spec mapping — 10 functionele aspecten

| # | Spec | Implementatie |
|---|---|---|
| 1 | BTC/ETH focus v1 | `CryptoAssetKey = "BTC" \| "ETH"` — alt/memecoins bewust buiten scope |
| 2 | Crypto-allocatie | `report.allocationFraction` + `allocationTier` (none/small/moderate/high/very_high) |
| 3 | Volatiliteitsrisico | `metrics.annualizedVolatility` — std-dev × √252 |
| 4 | Drawdown-risico | `metrics.maxDrawdown` — peak-to-trough in 1y window |
| 5 | Momentum-score | `metrics.momentumScore` 0..100 = 70% × 12m-return + 30% × 30d-return |
| 6 | Trendsterkte | `metrics.trendStrength` (% van afgelopen 60d boven 200d MA) + `trendDirection` |
| 7 | Speculatieve exposure-score | `report.speculationScore` 0..100 = 50% allocatie + 30% vol + 20% drawdown |
| 8 | Position-sizing waarschuwing | `report.sizing.tier` (comfortable/watch/warning/critical) per zwaarste positie |
| 9 | Behavioral FOMO-integratie | Reuse van bestaande `detectSpeculativeOverallocation` (Module 3, CRYPTO+COMMODITY) en `detectFomoBuying` |
| 10 | Coinbase/manueel-pad voorbereid | Manueel werkt via `/portfolio/add-position` met `assetClass=CRYPTO`. Coinbase-import is een toekomstige loader-uitbreiding |

---

## 2. Architectuur

```
src/lib/analytics/crypto-lab/
├── types.ts                 # CryptoAssetKey, CryptoRiskReport, tiers, disclaimer
├── metrics.ts               # Pure metric-helpers (momentum, vol, drawdown, trend)
├── engine.ts                # buildCryptoRiskReport orchestrator + classifyCryptoTicker
├── loader.ts                # Server-side: portfolio → BTC/ETH history → report
├── metrics.test.ts          # 9 tests — shape + edge cases + determinisme
├── engine.test.ts           # 13 tests — allocation/sizing/speculation/classifier
├── spec-conformance.test.ts # 16 tests — Module 12 spec-eisen
└── index.ts                 # Public API

src/app/(app)/crypto-lab/
└── page.tsx                 # Aparte lab-pagina, NIET in hoofd-nav (bewust)
```

---

## 3. Engine pipeline

```
                ┌────────────────────────────┐
                │  Portfolio.holdings        │  filter assetClass=CRYPTO
                └────────────┬───────────────┘
                             │
                             ▼
                ┌────────────────────────────┐
                │  classifyCryptoTicker      │  BTC-USD → BTC, anders null
                └────────────┬───────────────┘
                             │
                             ▼
                ┌────────────────────────────┐
                │  getHistory(BTC-USD, 1y)   │  Yahoo daily closes
                └────────────┬───────────────┘
                             │
                             ▼
                ┌────────────────────────────┐
                │  computeCryptoMetrics      │  pure function
                │  - momentum / vol / DD     │
                │  - trend / dataQuality     │
                └────────────┬───────────────┘
                             │
                             ▼
                ┌────────────────────────────┐
                │  buildCryptoRiskReport     │  allocatie + sizing + spec-score
                │  - allocationTier           │
                │  - speculationScore         │
                │  - warnings[]               │
                └────────────────────────────┘
```

**Faal-safe**: market-data fetch faalt → `closes=[]` → metrics `dataQuality=missing` → engine produceert nog steeds een rapport, alleen met "geen data"-meldingen in warnings.

---

## 4. Drempels (Buffett-laag — streng)

### Allocation-tier

| Tier | Drempel |
|---|---|
| `very_high` | >30% |
| `high` | 15-30% |
| `moderate` | 5-15% |
| `small` | 0-5% |
| `none` | 0% |

### Sizing-tier (zwaarste positie)

| Tier | Drempel | Reden |
|---|---|---|
| `critical` | ≥30% | 60-80% drawdown is realistisch → directe hoofdsom-impact |
| `warning` | 15-30% | 50% drawdown raakt 7.5%+ van portefeuille |
| `watch` | 5-15% | Substantieel maar beheersbaar |
| `comfortable` | <5% | Speculatie-impact beheersbaar |

### Volatility-referenties

- `VOL_REFERENCE_LOW` = 40%/yr — bescheiden voor crypto
- `VOL_REFERENCE_HIGH` = 80%/yr — historisch BTC-niveau

---

## 5. Speculation-score (composite)

```
speculationScore =
    0.5 × scaleAllocation(allocFraction)
  + 0.3 × scaleVolatility(avgVol)
  + 0.2 × scaleDrawdown(worstDD)
```

Geschaald naar 0..100 met expliciete drempels. Bij ontbrekende vol/DD: default → 60 (verhoogd) — bewust geen 0, zodat geen valse veiligheid wordt gesuggereerd.

---

## 6. UX-eisen + positionering

| Eis | Implementatie |
|---|---|
| Aparte lab-sectie | `/crypto-lab` is een eigen route; NIET in de hoofd-nav. Discoverable via direct link / pricing-page. |
| Risico-waarschuwing verplicht | Eerste Section op de pagina is "Risico-waarschuwing" met `CRYPTO_LAB_DISCLAIMER` + amber-banner. |
| "Hoog risico"-uitleg | PageHeader description toont allocation-tier + speculation-score. |
| Géén koop-trigger | Geen knoppen voor "Koop nu", geen quote-streamer, geen leverage-sliders. |
| Crypto ≠ hoofd-identiteit | Lab-eyebrow expliciet "Lab", page-title "Crypto Risk & Momentum Lab" — risico-framing dominant. |

---

## 7. Behavioral integratie

Module 12 leunt op **bestaande** behavioral detectors zonder nieuwe te schrijven:

- **`detectSpeculativeOverallocation`** (Module 3) gebruikt al `SPECULATIVE_ASSET_CLASSES = {CRYPTO, COMMODITY}` met tiers:
  - `≥30% weight → high severity`
  - `≥15% → elevated`
  - `≥8% → moderate`
- **`detectFomoBuying`** detecteert recent-buy-after-rally patronen — werkt op alle asset-classes incl. CRYPTO.

In productie zien gebruikers deze signalen in `/coach` zodra hun crypto-positie de drempels raakt.

---

## 8. Topbelegger-validatie

| Lens | Hoe het zit |
|---|---|
| **Buffett** (waarschuw voor speculatie) | Verplichte amber risk-banner; per-tier expliciete drawdown-uitleg in warnings; `CRYPTO_LAB_DISCLAIMER` benoemt expliciet "geen leverage / geen aankoop-trigger / geen pump-dump". |
| **Dalio** (alternatieve asset met scenario-risico) | Crypto staat náást Module 11 stress-tests; allocation-tier raakt aan portfolio-impact-laag. |
| **Lynch** (simpele waarschuwingen) | NL-rationales met concrete getallen ("ETH max-drawdown -65% — vergelijkbare daling kan opnieuw"). |
| **Simons** (meetbaar) | 9 pure-functie metric-helpers + drempels als `const`. 38 unit-tests bevriezen output. |
| **Wood** (ruimte voor innovatie) | Provider-abstractie via `getHistory(ticker)` laat een toekomstige Coinbase- of CoinGecko-loader drop-in toe; nieuwe `CryptoAssetKey`-waarden volstaan voor uitbreiding (al schrappen we dat in v1 expres voor scope-bewaking). |

---

## 9. Tests — 38 in totaal

| File | Tests | Coverage |
|---|---|---|
| `metrics.test.ts` | 9 | shape + edge cases (lege/single-point) + uptrend/downtrend momentum + vol/DD + determinisme |
| `engine.test.ts` | 13 | 3 allocation-tiers + 3 sizing-tiers + 2 speculation-score cases + classifyCryptoTicker (5 vormen) |
| `spec-conformance.test.ts` | 16 | v1-scope BTC/ETH only, 10 functionele aspecten zichtbaar in rapport, geen koop/leverage/pump-taal in warnings, behavioral-hook-contract |

---

## 10. Wat (nog) niet in scope

| Feature | Reden |
|---|---|
| Coinbase-API import | Loader-stub kan via `loadCryptoRiskReport` worden uitgebreid met een Coinbase-fetcher; OAuth + rate-limit-strategy zijn out-of-scope v1 |
| Alt/memecoins | Bewust — anders suggereren we "dekking" die we niet kunnen leveren |
| Leverage / margin | Bewust niet — Module 12 spec verbiedt expliciet |
| Pump/dump signalen | Bewust niet — strijdig met platform-positionering |
| On-chain analytics | Toekomstige uitbreiding; niet voor v1 |

---

## 11. Toekomstige uitbreidingen

- **Coinbase OAuth-loader** die holdings en transacties pulled.
- **CryptoAssetKey-uitbreiding** naar SOL/ADA na user-feedback (alleen na expliciete review).
- **Regime-aware speculation-scoring**: in DEFLATION/STAGFLATION ruimer waarschuwen.
- **Sequence-of-returns simulatie** specifiek voor crypto (lange droogteperiodes).
- **AI-narrative**: hook into `explainScenarios`-laag (Module 8) voor "wat zou een 50%-drawdown betekenen voor mij" uitleg.
