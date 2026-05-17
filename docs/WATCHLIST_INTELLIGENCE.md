# Watchlist Intelligence — Module 9

Per ticker op de watchlist een rijk signaal-pakket: **11 signalen** (10 Module 9-spec + bonus sentiment), alternatieven uit jouw eigen universum, 1-zin uitleg waarom 'em interessant of risicovol is, en automatische alerts wanneer signalen omslaan.

> **UX-norm**: een watchlist-rij is niet "ticker + prijs + score" — het is een coachende mini-dossier dat in 5 seconden vertelt waarom je iets in de gaten houdt.

---

## 1. De 11 signalen (Module 9-mapping)

| # | Module 9-spec | Key | Wat het meet | Drempel |
|---|---|---|---|---|
| 1 | Waardering aantrekkelijker | `VALUATION_IMPROVED` | factor-engine value-score + delta | level ≥70 of Δ ≥ +5pt |
| 2 | Momentum verbetert/verslechtert | `MOMENTUM_CHANGED` | factor-engine momentum + delta | Δ ≥ +8pt of level ≥70 |
| 3 | Volatiliteit stijgt | `VOLATILITY_RISING` | annualized vol + delta | Δ ≥ +3pp = negatief |
| 4 | Dividendwijziging | `DIVIDEND_CHANGED` | yield-delta vs vorige meting | ±0.5pp = signaal |
| 5 | Earnings event | `EARNINGS_SOON` | dagen tot kwartaalcijfers (feed) | <14 dagen = aandacht |
| 6 | Macrogevoeligheid | `MACRO_FIT` | macro-regime × asset-class (Module 6) | tailwind = positief |
| 7 | Vergelijkbare alternatieven | `SIMILAR_ALTERNATIVE` | sector-peers met +8pt composite | gevonden = negatief |
| 8 | Lage datakwaliteit | `DATA_QUALITY` ⚙ | coverage-check van 4 kerngegevens | 2+ ontbrekend = negatief |
| 9 | Kansrijk maar risicovol | `OPPORTUNITY_VS_RISK` | composite/momentum × vol/beta | beide aanwezig = flag |
| 10 | Past wel/niet bij profiel | `PROFILE_FIT` | assetClass × riskTolerance × horizon | heuristische match |
| + | (bonus) sentiment | `SENTIMENT_SHIFT` | sentiment-score + delta (feed) | level >0.2 of Δ ≥0.3 |

⚙ = meta-signaal: `DATA_QUALITY` beïnvloedt de tier-derivation **niet** (voorkomt dat goede coverage een ticker fake-interessant maakt). Het wordt wel in de UI getoond als kwaliteits-pill.

Elk signaal heeft `direction` (positive/negative/neutral), `strength` (0-100), en een NL-rationale.

---

## 2. Architectuur

```
src/lib/watchlist-intelligence/
├── types.ts              # WatchlistSignal, WatchlistIntelligenceReport (11 keys)
├── input.ts              # Input shape + WatchlistUserProfile (PROFILE_FIT)
├── signals.ts            # 11 pure extractors + findSimilarAlternatives
├── engine.ts             # Orchestrator + tier + headline + whyInteresting
├── engine.test.ts        # 31 tests
├── spec-conformance.test.ts # 13 tests — Module 9 spec-eisen
└── index.ts

src/lib/alerts/
└── generators.ts         # generateWatchlistIntelligenceAlerts (Module 9)

src/app/(app)/watchlist/
├── load-watchlist.ts     # Server-side hydratatie
└── page.tsx              # IntelligenceCard-grid

src/components/watchlist/
└── intelligence-card.tsx # Per ticker: signal-pills + alternatives + whyInteresting
```

---

## 3. Engine pipeline

```
                ┌─────────────────────────┐
                │  WatchlistTickerContext │  factor-pair + fundamentals + sector
                └────────────┬────────────┘
                             │
                             ▼
                ┌─────────────────────────┐
                │  7 extractors           │  pure functions
                │  + findSimilarAlts      │
                └────────────┬────────────┘
                             │
                             ▼
                ┌─────────────────────────┐
                │  deriveTier(...)        │  STRONG_OPPORTUNITY / POSITIVE /
                │                         │  NEUTRAL / WAIT
                └────────────┬────────────┘
                             │
                             ▼
                  WatchlistIntelligenceReport
                  + signals[]
                  + alternatives[]
                  + headline
                  + whyInteresting
                  + sources[]
```

**Tier-derivation**: gewogen som van signal-strengths × direction (positive +1, negative -1) gedeeld door aantal active signals. Tiers:
- ≥60 → STRONG_OPPORTUNITY
- ≥25 → POSITIVE
- ≥-25 → NEUTRAL
- <-25 → WAIT

---

## 4. Universe voor alternatieven

`findSimilarAlternatives` zoekt tickers in dezelfde sector met **≥8 punt hogere composite-score** dan het huidige item. Bron is de combinatie van:
- **Portfolio-holdings** (uit `PortfolioView`)
- **Andere watchlist-items** (uit `huntingListRepository`)

Top-3 worden meegenomen, gesorteerd op composite desc. Wanneer er geen alternatieven gevonden worden → positief signaal ("jij bent de beste in je sector").

Wood-laag: dit helpt onbekende, sterk presterende tickers te ontdekken zonder zelf actief te screenen.

---

## 5. Loader-strategie

`loadEnrichedWatchlist(email)` doet **5 parallelle fetches**:
1. `getQuotes(tickers)` — live prijzen
2. `loadFactorPairsByTicker(tickers)` — huidig + ~30d eerder uit `FactorSnapshot`
3. `buildPortfolioView(portfolio)` — voor universe + sector-lookup
4. `loadMacroRegimeReport()` — voor macro-fit
5. `getFundamentals(ticker)` × N — dividend-yield + value

Faal-safe: elk fetch met `.catch(() => null/[])`. Ontbrekende data → signaal markeert zichzelf als `available: false` met een uitleg-zin.

---

## 6. Alerts-integratie

De dashboard alert-trigger (Module 10) krijgt watchlist-data uit twee onafhankelijke generators:

| Generator | Type | Trigger | Bron |
|---|---|---|---|
| `generateWatchlistAlerts` | `WATCHLIST_OPPORTUNITY` | quote in target-zone (`≤ targetPrice` of `≥ targetPriceHigh`) | price-hits |
| `generateWatchlistIntelligenceAlerts` | `WATCHLIST_OPPORTUNITY` | tier=STRONG_OPPORTUNITY OF mixed (sterk+ en sterk−) | intelligence-rapport |
| `generateValuationSignalAlerts` | `VALUATION_SIGNAL` | level ≥70 / FCF-yield ≥7% | factor-engine + fundamentals |

Alle drie gebruiken de bestaande `dedupeKey`-conventie (`<TYPE>:<userId>:<dag>:<ticker>:<variant>`) zodat dezelfde gebeurtenis niet 6× per dag een notificatie wordt. De Module 9-generator (`generateWatchlistIntelligenceAlerts`) onderscheidt expliciet `STRONG`-tier-alerts van `MIXED`-aandacht-alerts ("kans + risico samen").

---

## 7. UI-design

`IntelligenceCard` (lg-2-kolom grid op `/watchlist`):
- **Header**: ticker + naam + tier-pill + headline (1 zin)
- **Quote-rij**: prijs + Δ dag + target-zone
- **7 signal-pills**: kleine badges met direction-icon (▲ positief / ▼ negatief / − neutraal) + label + metric. Niet-beschikbare signalen zijn gedimd. Hover toont volledige rationale (`title`-attribute).
- **WhyInteresting-blok**: "Positief: ... Let op: ... Vergelijk eventueel met X, Y."
- **Alternatives-blok** (alleen wanneer aanwezig): max 3 alternatieven met `Portfolio`/`Watchlist`-source-pill en composite-score, klikbaar naar `/score/[ticker]`
- **Footer**: bronnen + link naar volledige Confidence-score-pagina

**Legacy-table** blijft beschikbaar in een tweede sectie voor batch-acties (delete, target update, snel scannen).

---

## 8. Topbelegger-validatie

| Lens | Hoe het zit |
|---|---|
| **Buffett** (kwaliteit + redelijke prijs) | VALUATION_IMPROVED kombineert level + delta — een 80/100 value-score is signaal genoeg, ook zonder beweging. Streng: pas vanaf level ≥70 of delta ≥+5 punt = positief. |
| **Dalio** (macro-fit) | MACRO_FIT-signaal trekt direct uit Module 5: tailwind/headwind/neutral met magnitude. Werkt voor de huidige regime-snapshot. |
| **Lynch** (begrijpelijk) | Alle rationales in spreektaal NL met cijfers ("value-score 75/100, P/E 18, FCF-yield 5.5%"). Geen jargon-eilanden. |
| **Simons** (meetbaar) | 7 pure-functie extractors, deterministisch. 31 unit tests dekken elke trigger en edge-case. |
| **Wood** (discovery) | SIMILAR_ALTERNATIVE haalt dieper-liggende kansen op vanuit het user-universe — een ticker waar je niet aan dacht maar die fundamenteel sterker is. |

---

## 9. Tests — 31 in totaal

| Categorie | Tests |
|---|---|
| `extractValuationSignal` | 3 (positief / negatief / no-data) |
| `extractMomentumSignal` | 3 (delta-positief / delta-negatief / level-only) |
| `extractEarningsSignal` | 3 (3d / 30d / no-feed) |
| `extractDividendSignal` | 3 (stijging / daling / no-yield) |
| `extractMacroFitSignal` | 3 (tailwind / headwind / no-macro) |
| `extractSentimentSignal` | 4 (level + dynamic + no-data) |
| `findSimilarAlternatives` + `extractAlternativesSignal` | 6 |
| `buildWatchlistIntelligenceReport` | 6 (volgorde, tiers, alternatives, determinisme, sources) |

---

## 10. Wat (nog) niet in scope

| Feature | Status | Reden |
|---|---|---|
| Earnings-feed integratie | Stub | Slot voorbereid; aansluiting op Yahoo/EDGAR vult vanzelf |
| Sentiment-feed integratie | Stub | Slot voorbereid; StockTwits/Reddit/News kan later |
| Factor-similarity (i.p.v. sector-only) | Niet | v1 doet sector-match; v2 kan compositie van quality+value+momentum vergelijken |
| Per-item AI-uitleg via Module 7 | Niet | Klikken naar `/score/[ticker]` levert al de volledige Explainability-paneel |
| Watchlist-ranking ("welke is meest interessant nu") | Niet | Tier helpt al; expliciete "top-3 deze week" kan later |

---

## 11. Toekomstige uitbreidingen

- **Earnings/sentiment feed-aansluiting** — slots staan klaar
- **Notification-bell digest** — wekelijks "5 watchlist-tickers verbeterd in waardering"
- **AI-narrative per item** — `explainConfidence(ticker)` (Module 7) gekoppeld aan een button in de card
- **Cross-watchlist-vergelijking** — "Welke tickers in jouw watchlist zijn meest aantrekkelijk vandaag?"
- **Themathische clusters** — automatische herkenning ("jij volgt 3 EV-leveranciers — vergelijk ze direct")
- **Smart-add suggesties** — wanneer user een ticker toevoegt, suggesteer 2 vergelijkbare alternatieven
