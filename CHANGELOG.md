# Changelog

Alle noemenswaardige wijzigingen aan BeleggerIQ 2.0. Formaat volgt [Keep a Changelog](https://keepachangelog.com/nl/1.1.0/).

## [Unreleased] - 2026-04-25 · Tax Engine: cash + debt + TWR + fiscaal partner

### Added
- [`src/lib/analytics/tax/twr.ts`](src/lib/analytics/tax/twr.ts) — `computeTwrYear` Time-Weighted-Return over trailing 12-maand venster uit `PortfolioSnapshotRow[]`. Filtert cashflows uit (`totalCost`-delta per periode); compoundend over alle holding-period returns. `null` bij <2 snapshots in venster — caller valt terug op proxy.
- [`src/lib/analytics/tax/twr.test.ts`](src/lib/analytics/tax/twr.test.ts) — **6 nieuwe tests**: null-paden, simpele +10%, contributies-filtering (10k bijgestort op 100k → 0% return), compound over 4 kwartalen, determinisme, buiten-venster filter.
- 5 nieuwe **box3-tests** voor cash + debt + partner-drempel: spaargeld onder vrijstelling, gecombineerde grondslag (60k bel + 40k cash → ~640 EUR), schulden boven drempel verlagen belasting, schulden onder drempel tellen niet, partner heeft hogere drempel én vrijstelling.

### Changed
- [`src/lib/analytics/tax/box3.ts`](src/lib/analytics/tax/box3.ts) — `Box3Rates` uitgebreid met `notionalReturnCash` (1.44%), `notionalReturnDebt` (-2.62%), `debtThresholdSingle` (€3.800), `debtThresholdPartners` (€7.600). `computeBox3` ondersteunt nu drie categorieën:
  - **Beleggingen** × 6.04% + **Spaargeld** × 1.44% + **Schulden boven drempel** × -2.62%
  - Forfait wordt naar rato van belastbaar deel toegerekend (conform Belastingdienst-overgangsregeling)
  - Rationale-bullets vermelden alle aanwezige categorieën expliciet
- [`src/lib/analytics/tax/net-return.ts`](src/lib/analytics/tax/net-return.ts) — `ComputeNetReturnInput` heeft nieuwe optionele velden `cashWealth` en `debtWealth` (default 0); doorgegeven aan `computeBox3`.
- [`src/lib/analytics/tax/index.ts`](src/lib/analytics/tax/index.ts) — `computeTwrYear` re-exported.
- [`src/types/profile.ts`](src/types/profile.ts) — `UserProfile` uitgebreid met optionele `hasFiscalPartner`, `cashWealthEur`, `debtWealthEur` velden. Doc-strings linken expliciet naar de Tax Engine zodat downstream code weet waar deze velden vandaan komen.
- [`src/app/(app)/dashboard/page.tsx`](src/app/(app)/dashboard/page.tsx):
  - Bruto-return is nu **TWR over trailing 12 maanden** uit `snapshots`. Bij <2 snapshots fallback naar oude `unrealizedPnl/totalValue`-proxy.
  - `hasFiscalPartner`, `cashWealth`, `debtWealth` worden uit `context.profile` doorgegeven (geen hardcoded false meer).
  - Source-attribution (`TWR_12M` / `UNREALIZED_PROXY` / `ZERO`) doorgegeven naar de UI-card.
- [`src/app/(app)/dashboard/components/net-return-card.tsx`](src/app/(app)/dashboard/components/net-return-card.tsx) — toont nu de bron van het bruto-return-cijfer onderin (TWR vs proxy vs zero) zodat de gebruiker ziet hoe het cijfer is opgebouwd.

### Design-regels
- **TWR is contributions-aware**. Cashflows worden gemeten als `totalCost`-delta tussen snapshots en afgetrokken voor de periode-return berekend wordt. Voorkomt dat bijstortingen als rendement worden geteld.
- **Floor 1+r ≥ 0**. Bij wipe-out clampen we de holding-period factor; voorkomt negatieve product over compounding.
- **Fallback-keten transparant**. UI toont expliciet waar bruto-return vandaan komt (TWR / proxy / zero).
- **Drempelschuld komt vóór vrijstelling**. Conform Belastingdienst: eerst schulden boven drempel aftrekken van grondslag, dán de heffingsvrije voet.
- **Forfait naar rato** wanneer er meerdere categorieën zijn. We berekenen het brutoforfait over de hele grondslag en schalen 'm naar het belastbare deel — anders zou een gebruiker met €100k cash + €1m beleggingen onevenredig veel of weinig belasting krijgen toegerekend.
- **Profile-velden optioneel + safe defaults**. `hasFiscalPartner ?? false`, `cashWealth ?? 0`, `debtWealth ?? 0`. Bestaande gebruikers zonder deze velden in DB zien dezelfde uitkomsten als voorheen.

### Aannames
- **Categorisatie van vermogen blijft user-input**. We leiden cash/debt niet automatisch af; de gebruiker geeft 'm op via profile. Vraag voor verbetering: wil je een UI-flow op `/profiel` om deze in te vullen? (Voor nu blijven ze op 0 totdat de profile-pagina de inputs krijgt.)
- **Custom WHT-overrides per ticker: NIET geïmplementeerd**. Defaults zijn al verdragstarieven en de extra UI-input zou complexiteit toevoegen zonder duidelijke meerwaarde voor het mainstream-geval. Wel makkelijk later toe te voegen via `domicileOverrides`-Map (al ondersteund door de engine).
- **TWR-venster is 12 maanden** met `asOf = now`. Configureerbaar via `windowMonths` (bv. 36m voor een 3-jaar-blik).
- **Drempelschuld eerst aftrekken van schulden**, dan rest meegeven aan box 3. Overeenkomstig Belastingdienst-werkwijze.

### Validatie
- `npm test` → **883/883 tests groen** (+11 vs vorige tax-batch: 6 TWR + 5 box3-cash/debt).
- `npx tsc --noEmit` → schoon.
- `npm run build` → slaagt; `/dashboard` bundelt de uitgebreide NetReturnCard met source-label.

## [Unreleased] - 2026-04-25 · Nederlandse Tax Engine

### Added
- [`src/lib/analytics/tax/types.ts`](src/lib/analytics/tax/types.ts) — types `TaxDomicile` (NL/DE/FR/GB/CH/US/IE/LU/OTHER), `Box3Bracket`, `Box3Calculation`, `DividendTaxBreakdown`, `DividendTaxPerHolding`, `NetReturnResult`, `TaxReport`. Alle ratio's als fracties.
- [`src/lib/analytics/tax/box3.ts`](src/lib/analytics/tax/box3.ts) — `computeBox3` met `BOX3_RATES_2025`-tarieven (forfait beleggingen 6.04%, tarief 36%, vrijstelling €57.684 alleenstaand / €115.368 partners). Pure functie. Heeft `exemptionOverride` en `rates`-override voor toekomstige belastingjaren.
- [`src/lib/analytics/tax/dividend-tax.ts`](src/lib/analytics/tax/dividend-tax.ts) — `computeDividendTax` per holding. WHT-tabel per domicilie via `WHT_RULES`: NL 15% credit, DE/FR/CH/US verdragstarief 15% credit, GB 0%, IE/LU UCITS impliciete lekkage ~10% (niet verrekenbaar). `detectDomicile` mapt ISIN-prefix (eerste 2 chars) of ticker-suffix (`.AS`/`.DE`/`.PA`/`.L`/`.SW`) naar `TaxDomicile`; bare-ticker fallback = US.
- [`src/lib/analytics/tax/net-return.ts`](src/lib/analytics/tax/net-return.ts) — `computeNetReturn` orkestrator. Combineert box 3 + dividend-tax tot `{ grossReturn, taxImpact, netReturn, amounts, box3, dividend, warnings, confidence }`. Schat dividend-bedragen uit `marketValueByTicker × estimatedDividendYield` (default 2%). `buildTaxReport` wrapper voegt `taxYear`, `baseCurrency` en timestamp toe. Warnings:
  - IE/LU UCITS → "interne WHT-lekkage, niet verrekenbaar".
  - US-domicile ETF → "fiscaal minder efficiënt voor NL-belegger".
  - Box 3 > bruto rendement → "netto rendement is negatief".
  - Niet-verrekenbare WHT > 0 → expliciet bedrag in EUR.
  - Crypto → "fiscale behandeling kan wijzigen".
- [`src/lib/analytics/tax/index.ts`](src/lib/analytics/tax/index.ts) — barrel.
- [`src/lib/analytics/tax/*.test.ts`](src/lib/analytics/tax) — **26 nieuwe tests**: box3 (8: vrijstelling, partner, schaal, edge), dividend-tax (10: ISIN-detectie, ticker-suffix, NL/US/IE/GB/0-paden, override, edge), net-return (8: tax < gross, exact box3-bedrag, amounts-consistency, IE-warning, crypto, determinisme, taxReport-wrap).
- [`src/app/(app)/dashboard/components/net-return-card.tsx`](src/app/(app)/dashboard/components/net-return-card.tsx) — UI-card "Netto rendement". Drie tegels (bruto / belasting / netto) met %-en bedrag, drie detail-tegels (Box 3, NL dividendbelasting, buitenlandse WHT), warnings-lijst, en disclaimer "geen fiscaal advies".

### Changed
- [`src/lib/analytics/index.ts`](src/lib/analytics/index.ts) — `export * from "./tax"`.
- [`src/app/(app)/dashboard/page.tsx`](src/app/(app)/dashboard/page.tsx) — server-side `buildTaxReport` op basis van `view.summary.unrealizedPnl / totalValue` als bruto-return-proxy. Nieuwe sectie "Netto rendement" rendert de card.

### Design-regels
- **Indicatief, geen fiscaal advies.** Disclaimer in UI én in module-doc. Tarieven gepind op publiek aangekondigde 2025-cijfers (belastingdienst.nl); jaarlijkse update via `BOX3_RATES`.
- **Pure functions.** Geen I/O in engine; alle WHT-tarieven, vrijstellingen en domicilie-regels staan als constants. Identieke input → identieke output (test gepind).
- **Verrekenbaarheid expliciet gemodelleerd.** NL-dividendbelasting + EU-WHT (verdrag) zijn 100% verrekenbaar; IE/LU UCITS-lekkage is 0% verrekenbaar. UI toont beide bedragen apart zodat de gebruiker ziet welk deel terugkomt via aangifte.
- **`taxImpact` reflecteert alleen niet-verrekenbare lekkage + box 3.** Verrekenbare WHT verlaagt netto-rendement niet (komt terug via aangifte). Voorkomt dubbeltelling.
- **Default dividend-yield 2%.** Configureerbaar via `estimatedDividendYield`. Conservatief en in lijn met huidige MSCI World ~1.7%.
- **Tax-confidence (0..1)** stijgt met aanwezigheid van holdings, ISIN's, gross-return-input en explicit dividend-yield. UI kan dit later renderen.

### Aannames
- **Box 3 alleen beleggingen-categorie**. We modelleren geen spaargeld of schulden — portfolio-data heeft daar geen veld voor. Vraag voor verbetering: wil je een aparte input voor cash-spaarrekening en hypotheekschuld?
- **Verdragstarieven post-formulier** (W-8BEN voor US, dividend-formulier voor CH). Realistisch voor NL-broker-flows; conservatief in andere gevallen.
- **UCITS-lekkage 10%** is een simplificatie. Echte lekkage hangt af van onderliggend universum (US-aandelen WHT 15% × 100% allocatie = max 15%; IE-fonds claimt vaak ~5% terug). 10% is een redelijk gemiddelde voor MSCI-World achtige fondsen.
- **Domicilie-detectie via ISIN-prefix + ticker-suffix**. Geen externe registry. Bare US-tickers (zonder dot) worden als US gemarkeerd — kan in randgevallen verkeerd zijn.
- **Bruto-return uit `unrealizedPnl/totalValue`** als proxy. Alternatieven: TWR uit snapshots, periode-specifieke benchmark-return. Vraag: welke periode-definitie wil je standaard?
- **Engine-keuze.** Opus 4.7 (1M context) — drie modules + types + UI moesten consistent samenwerken met holdings/classifier en met juiste 2025-tarieven. Voor latere updates per belastingjaar (alleen tarief-constants) volstaat Sonnet 4.6.

### Verbeter-vragen
1. **Spaargeld + schulden** als aparte inputs voor box 3? Nu alleen beleggingen.
2. **Bruto-return periode**: huidige unrealized-PnL is sinds aankoop. Wil je TWR-jaar of YTD?
3. **Custom WHT-tarieven** per ticker (sommige NL-brokers verrekenen anders)?
4. **`fiscalPartner`-flag** uit user-profile in plaats van hardcoded `false`?

### Validatie
- `npm test` → **872/872 tests groen** (+26 tax: 8 box3, 10 dividend, 8 net-return).
- `npx tsc --noEmit` → schoon.
- `npm run build` → slaagt; dashboard bundlet de nieuwe NetReturnCard.

## [Unreleased] - 2026-04-25 · Macro & Scenario Engine

### Added
- [`src/lib/analytics/macro/types.ts`](src/lib/analytics/macro/types.ts) — types `MacroScenarioId` (4 scenario's: RATES_UP_2 / MARKET_CRASH / USD_UP_10 / RECESSION), `PositionImpact`, `MacroScenarioResult`, `MacroScenarioReport`. Alle returns als fracties; `defensiveStrength` als 0..100 score.
- [`src/lib/analytics/macro/regime.ts`](src/lib/analytics/macro/regime.ts) — pure helpers. `classifySector` mapt sector-strings naar 13 buckets (tech / staples / financials / energy / healthcare / real-estate / utilities / etc. via regex-tabel); `isDefensiveSector` (staples + healthcare + utilities); `assetClassShockMultiplier` per scenario × asset-class (BOND krijgt 1.5× rates-multiplier, CASH = 0 alles, CRYPTO = 1.8× crash, etc.); `isForeignCurrency` voor FX-detectie.
- [`src/lib/analytics/macro/scenarios.ts`](src/lib/analytics/macro/scenarios.ts) — `runMacroScenarios` orkestrator. Vier shock-tabellen per scenario (sector-bucket → fractie); per positie wordt `weight × shock` bijdrage berekend en gesommeerd tot `portfolioImpact`. Top-N losers + winners gesorteerd op contributie. `defensiveStrength` per scenario:
  - **RATES_UP_2**: gemiddelde |shock| → score (lage duration = hoog).
  - **MARKET_CRASH / RECESSION**: portfolio-impact vs verwachte floor → score.
  - **USD_UP_10**: positief netto → hoog.
  - Verdict-zin per scenario gegenereerd uit deterministische templates.
- [`src/lib/analytics/macro/index.ts`](src/lib/analytics/macro/index.ts) — barrel.
- [`src/lib/analytics/macro/*.test.ts`](src/lib/analytics/macro) — **24 nieuwe tests**: regime (12: sector-classificatie, defensieve check, asset-class-multipliers, FX), scenarios (12: 4 scenario-paden, biggestLosers sortering, topN, edge-cases, determinisme).
- [`src/app/(app)/risico/components/macro-scenarios-card.tsx`](src/app/(app)/risico/components/macro-scenarios-card.tsx) — pure presentationele card. 2×2 grid van scenario-tegels: label + impact-badge (% en bedrag), defensieve sterkte, top-3 hardst geraakt + beste positie, NL-verdict, warnings. Disclaimer onderaan dat dit *geen* economisch model is.

### Changed
- [`src/lib/analytics/index.ts`](src/lib/analytics/index.ts) — `export * from "./macro"`.
- [`src/app/(app)/risico/page.tsx`](src/app/(app)/risico/page.tsx) — nieuwe sectie "Wat als…" boven de bestaande "Concrete afbouwadviezen". Pure rendering — engine-call gebeurt op page-niveau (server). Bestaande `ScenarioPanel` blijft staan; macro-card vult elkaar aan.

### Design-regels
- **Bewust simpel.** Geen DCF-, factor-VaR- of correlation-matrix model. Vaste sector- en asset-class shock-tabellen. Disclaimer in UI: "geen voorspelling, alleen gevoeligheid".
- **Pure functions.** `runMacroScenarios` is volledig deterministisch; identieke input → identieke output (test gepind). `now` configureerbaar.
- **Reproduceerbare drempels.** Alle shock-fracties staan als constants bovenin `scenarios.ts`. Tests pinnen de tech-crash-shock op -28%, REIT op -22% etc.
- **Asset-class multipliers** bovenop sector-shocks: BOND minder gevoelig voor crash, REIT extra gevoelig voor rates, CRYPTO extra gevoelig voor crash. CASH altijd 0.
- **`defensiveStrength` per scenario** in plaats van één globale score — verschillende scenario's vragen om verschillende dempers (bonds bij crash, korte duration bij rates, EUR-assets bij sterke USD).
- **FX-effect alleen op niet-base-currency**. EUR-investeerder met EUR-aandelen voelt geen FX-effect; USD-aandelen krijgen `+10% × fx-multiplier`.
- **Cyclische sectoren extra geraakt in recessie**, defensieve veel zachter (-5% utilities, -6% staples vs -28% industrials).

### Aannames
- **Vaste shock-tabellen, geen historische regressie.** Cijfers zijn pragmatisch gekozen op basis van publieke crisis-perioden (2008, 2020, 2022) — niet wetenschappelijk geijkt. Reproduceerbaar door constants. Vraag voor verbetering: wil je dat we deze in een aparte config-file zetten zodat ze per release tunbaar zijn zonder code-deploy?
- **Geen second-order effecten.** We modelleren niet dat een crash + rate-cut elkaar deels compenseren. Elk scenario staat op zichzelf.
- **USD-shock 10% default** (= +10% USD vs base). Configureerbaar via `usdAppreciation` per call. Voor sterkere/zwakkere stress-tests trivial aanpasbaar.
- **Sector-classificatie via regex-tabel** in `regime.ts`. Houdt het simpel; er is geen externe sector-mapping-tabel of GICS-koppeling. 13 buckets is voldoende voor een EU/US-portefeuille.
- **`defensiveStrength`-formule per scenario verschillend** omdat "defensief" anders betekent in elk scenario. RATES: lage duration. CRASH/RECESSION: lage neerwaartse impact. USD: positief netto.
- **Engine-keuze**. Opus 4.7 (1M context) — vier scenario's met sector × asset-class shocks moesten consistent met elkaar én met `isCyclical` uit rebalance-engine zijn. Voor latere uitbreidingen (extra scenario's, custom shocks) volstaat Sonnet 4.6.

### Verbeter-vragen
1. **Wil je dat de shock-tabellen in een aparte JSON/config-file komen** zodat ze per release tunbaar zijn zonder TS-deploy?
2. **Custom scenario builder** voor de gebruiker (slider voor rate-shock-magnitude, sector-tilt)?
3. **Combinatie-scenarios** (bv. recessie + USD up tegelijk) voor stress-test van extreme tail events?

### Validatie
- `npm test` → **846/846 tests groen** (+24 macro: 12 regime, 12 scenarios).
- `npx tsc --noEmit` → schoon.
- `npm run build` → slaagt; `/risico` bundlet de nieuwe MacroScenariosCard.

## [Unreleased] - 2026-04-25 · Business Quality Layer

### Added
- [`src/lib/analytics/business/types.ts`](src/lib/analytics/business/types.ts) — types `BusinessLabel` (COMPOUNDER / CYCLICAL / SPECULATIVE), `BusinessSubScore`, `BusinessQualityResult`. Constants `BUSINESS_WEIGHTS` (moat 40% / earnings 35% / capital 25%), `BUSINESS_THRESHOLDS` (compounderMin 70, speculativeMax 40, longTerm per-score ≥ 60, min confidence 0.5).
- [`src/lib/analytics/business/moat.ts`](src/lib/analytics/business/moat.ts) — `scoreMoat` (0..100). Drie pillars: gross margin (40%), ROIC (40%), operating margin (20%). Drempels expliciet als constants. Bevat shared helpers `scaleStrength`, `aggregate`, `Component` voor de andere submodules.
- [`src/lib/analytics/business/earnings-quality.ts`](src/lib/analytics/business/earnings-quality.ts) — `scoreEarningsQuality`. Pillars: revenue 5y growth, EPS 5y growth, revenue TTM growth, net margin (allemaal afzonderlijk geschaald). Detecteert disconnect tussen 5y- en TTM-groei en voegt expliciete waarschuwing toe in rationale.
- [`src/lib/analytics/business/capital-efficiency.ts`](src/lib/analytics/business/capital-efficiency.ts) — `scoreCapitalEfficiency`. Pillars: ROIC, ROE, debt/equity (inverse: lager = beter), interest coverage. Inverse-scaling helper voor debt/equity.
- [`src/lib/analytics/business/business-score.ts`](src/lib/analytics/business/business-score.ts) — `computeBusinessQuality` orchestrator. Aggregeert deelscores tot composite, leidt label af (COMPOUNDER vereist composite ≥ 70 én niet-cyclische sector — gebruikt `isCyclical` uit rebalance-engine), berekent `canHoldLongTerm` (label = COMPOUNDER + alle deelscores ≥ 60 + confidence ≥ 0.5). `computeBusinessQualityBatch` retourneert ranked + lookup-map.
- [`src/lib/analytics/business/index.ts`](src/lib/analytics/business/index.ts) — barrel.
- [`src/lib/analytics/business/*.test.ts`](src/lib/analytics/business) — **21 nieuwe tests**: moat (5: hoog/laag/partial/rationale), earnings-quality (4: groei + krimp + disconnect-warning), capital-efficiency (5: ROIC + debt-inverse + interest coverage), business-score (7: compounder/cyclical/speculative paths, neutral fallback, low-confidence, determinisme, batch-sortering).
- [`src/app/(app)/dashboard/load-business-quality.ts`](src/app/(app)/dashboard/load-business-quality.ts) — server-only loader. Parallel fetch van fundamentals (cache dedupliceert) → batch-engine → `{ byTicker, ranked }`. Faal-safe per ticker.
- [`src/app/(app)/dashboard/components/business-quality-cards.tsx`](src/app/(app)/dashboard/components/business-quality-cards.tsx) — "Sterkste bedrijven" + "Zwakste bedrijven" naast elkaar. Toont per rij: ticker, composite score, label-badge (COMPOUNDER/CYCLICAL/SPECULATIVE), 10y-hold sparkles-badge wanneer indicator true, confidence %, en pills met de drie deelscores. Pure presentatie.

### Changed
- [`src/lib/analytics/index.ts`](src/lib/analytics/index.ts) — `export * from "./business"`.
- [`src/app/(app)/dashboard/page.tsx`](src/app/(app)/dashboard/page.tsx) — parallel-load van `loadBusinessQualityBatch` toegevoegd; nieuwe sectie "Business quality" rendert zodra de batch resultaten heeft.

### Design-regels
- **Geen AI, alleen heuristics.** Drempels zijn expliciete constants in elke submodule; identieke fundamentals → identiek resultaat.
- **Pure functies overal.** `computeBusinessQuality` heeft geen I/O; loader is een aparte file zodat tests de engine zonder Prisma/cache kunnen draaien.
- **Coverage proportioneel.** Wanneer een veld ontbreekt valt 'ie uit de gewogen aggregatie; coverage = som-van-aanwezige-gewichten. Composite-score komt zo eerlijk uit ook bij gedeeltelijke data.
- **Label-downgrade bij cyclische sector.** Een bedrijf in Energy/Materials/Industrials etc. krijgt nooit COMPOUNDER — zelfs bij hoge composite. Voorkomt false-positives door piek-marges.
- **10-year hold conservatief.** Alleen COMPOUNDER + alle 3 deelscores ≥ 60 + confidence ≥ 0.5. Drempels staan in `BUSINESS_THRESHOLDS`.
- **Inverse-scaling voor leverage.** Debt/equity gebruikt `inverse` (lager = hogere score) — andere capital-efficiency pillars zijn directe scaling. Reflecteert de werkelijkheid dat leverage een risk-multiplier is.
- **Disconnect-detectie in earnings.** Wanneer 5y growth > 5% maar TTM < -2%, voegt de engine een expliciete rationale-bullet toe ("Disconnect: kantelpunt"). Score blijft op de gewogen aggregatie — we voegen geen ad-hoc penalty toe om reproduceerbaarheid te bewaren.

### Aannames
- **Heuristieke drempels, geen academische standaarden.** Gross margin ≥ 50% = top, ROIC ≥ 20% = top, etc. Conservatief en in lijn met long-term-quality literatuur (Buffett/Munger heuristieken). Aanpasbaar per release zonder API-breuk.
- **Geen tijdreeks-data nodig.** We gebruiken `revenueGrowth5y` (CAGR) en `netMargin` (point-in-time) i.p.v. een vol-curve. Reden: `FundamentalsSnapshot` levert alleen point-in-time. Volledige earnings-stabiliteit (σ over kwartalen) zou een aparte data-feed vereisen — vraag voor verbetering.
- **Sector-cyclicity via bestaande `isCyclical`-helper** uit rebalance-engine. Eén canonieke bron voor cyclische sector-classificatie.
- **Composite-gewichten 40/35/25** voor moat/earnings/capital. Moat krijgt grootste gewicht omdat duurzaam concurrentievoordeel het meest betekenisvol is voor lange-termijn houden.
- **`canHoldLongTerm` is binair**, niet per-ticker. Voor een meer gedifferentieerde "10y-conviction-score" kunnen we later een numerieke variant toevoegen.
- **Engine-keuze.** Opus 4.7 (1M context) — vier modules + types + UI moest in één keer consistent worden, en de heuristieke drempels moesten gekozen worden in afstemming met bestaande `factor`-engine (anders krijgt de gebruiker tegenstrijdige signalen). Voor latere uitbreidingen (extra pillars, regime-aware drempels) volstaat Sonnet 4.6.

### Verbeter-vragen
1. **Moeten earnings-stabiliteit op een echte vol-σ over historische kwartalen?** Vereist een aparte data-feed (huidige `FundamentalsSnapshot` is point-in-time). Wel nuttig voor "hoe glad zijn de winsten?" claim.
2. **Holdings-table kolom**: het verzoek vraagt een kolom op `/portfolio`. Ik heb 'm nog **niet** toegevoegd omdat de holdings-table al 12 kolommen heeft en breaking de mobile-view; suggestie is een tooltip op een nieuwe kolom of een uitklap-detail. Wil je dat ik 'm gewoon toevoeg, of als opklap?
3. **Custom drempels per profiel?** Bv. risk-averse profile = strengere COMPOUNDER-drempel (composite ≥ 80). Nu hardcoded.

### Validatie
- `npm test` → **822/822 tests groen** (+21 business: 5 moat, 4 earnings, 5 capital, 7 score).
- `npx tsc --noEmit` → schoon.
- `npm run build` → slaagt; dashboard bundlet de nieuwe BusinessQualityCards.

## [Unreleased] - 2026-04-25 · Opportunity Radar adapter (5-signaal publieke API)

### Added
- [`src/lib/analytics/opportunity/types.ts`](src/lib/analytics/opportunity/types.ts) — types voor de adapter: `OpportunityType` (5 publieke types: QUALITY_PULLBACK / VALUE_MISPRICING / MOMENTUM_REVERSAL / UNDERWEIGHT_HIGH_CONVICTION / ETF_REBALANCE_OPPORTUNITY), `OpportunityRiskLevel`, `OpportunityResult`. Constants `OPPORTUNITY_HORIZON` (vaste NL-horizon-strings per type), `CONFIDENCE_TIER_TO_NUMBER` (HIGH=0.85, MEDIUM=0.6, LOW=0.35), `OPPORTUNITY_TYPE_LABELS`.
- [`src/lib/analytics/opportunity/signals.ts`](src/lib/analytics/opportunity/signals.ts) — pure mapping. `mapSignalType` vertaalt 5 van de 8 radar-signaaltypes naar `OpportunityType`; `filterPublicSignals` filtert; `pickPrimarySignal` kiest het sterkste publiek signaal (deterministische tie-break op alfabet).
- [`src/lib/analytics/opportunity/scoring.ts`](src/lib/analytics/opportunity/scoring.ts) — pure helpers. `deriveConfidence` neemt het max numerieke confidence-tier over publieke signalen; `deriveRiskLevel` leidt LOW/MEDIUM/HIGH af uit type + confidence (MOMENTUM_REVERSAL minimaal MEDIUM); `buildRationale` pakt eerste rationale-bullet als compacte NL-zin.
- [`src/lib/analytics/opportunity/engine.ts`](src/lib/analytics/opportunity/engine.ts) — `scanOpportunityRadar` adapter. Roept de bestaande `scanOpportunities` aan, filtert kandidaten op publiek signaal, mapt naar `OpportunityResult`, sorteert aflopend op score (tie-break confidence + symbol), respecteert `limit` en optionele `includeTypes`. Levert `{ generatedAt, results, countByType, underlying }`.
- [`src/lib/analytics/opportunity/index.ts`](src/lib/analytics/opportunity/index.ts) — barrel.
- [`src/lib/analytics/opportunity/*.test.ts`](src/lib/analytics/opportunity) — **28 nieuwe tests**: signals (8: mapping + filter + tie-break + null-paden), scoring (11: confidence-tier-conversie, risk-level per pad, rationale-fallback), engine (9: shape-transformatie, watchlist filter-out, sortering, limit, includeTypes, determinisme, horizon-consistency).

### Changed
- [`src/lib/analytics/index.ts`](src/lib/analytics/index.ts) — selectief re-export van de nieuwe `opportunity`-module om collisions met `opportunity-radar` (die `OpportunitySignalType` etc. al exporteert) te voorkomen.

### Behouden
- **`/kansen`-pagina + dashboard widget "Top kansen"** bestaan al sinds een eerdere ronde en blijven ongewijzigd; ze gebruiken de bestaande `opportunity-radar` engine met 8 signalen (incl. defensive-bargain en watchlist-target). De nieuwe adapter is een *aanvullende* publieke API met 5 signalen — geen dubbele UI of code-paden.

### Design-regels
- **Adapter-laag, geen tweede engine.** Alle businesslogica blijft in `opportunity-radar`. De nieuwe module doet uitsluitend filter + shape-transformatie. Geen tweede beslislaag, geen drift-risico.
- **Pure functies.** Adapter heeft geen I/O; identieke input → identieke output (test gepind).
- **Reproduceerbaar `expectedHorizon`.** Hardcoded NL-strings per type (`OPPORTUNITY_HORIZON`) — geen AI, geen marktdata-afhankelijkheid.
- **`riskLevel` = type + confidence**, deterministische functie. Momentum-reversal is structureel fragiel → minimaal MEDIUM, ongeacht confidence.
- **Source-attribution behouden.** `OpportunityResult.source` (`portfolio` / `screener` / `watchlist`) komt 1:1 uit de onderliggende kandidaat.
- **Geen trading bot, geen leverage.** Adapter exposeert alleen observaties — geen order-velden, geen execution.

### Aannames
- **5-signaal selectie.** Alleen quality-pullback, value-dislocation, momentum-reversal, underweight-high-conviction, etf-core-rebalance worden gepubliceerd. `defensive-bargain`, `watchlist-target` en `earnings-sentiment-placeholder` blijven beschikbaar via de bestaande radar voor `/kansen`-UI maar tellen niet mee in `OpportunityResult`. Vraag bij twijfel: wil je dat de nieuwe `/kansen` UI uitsluitend de 5 publieke types toont (= breuk met huidige UI) of behouden we de bredere coverage?
- **`expectedHorizon` als string-range.** Spec voorbeeld toont "6-24 maanden"; ik kies per type een eigen range gebaseerd op de typische mean-reversion-snelheid (zie comments in `types.ts`). Aanpasbaar per release.
- **`confidence` = max tier-getal** over publieke signalen. Optimistische maat — als één HIGH-tier signaal triggert is de hele kandidaat HIGH. Alternatief (gemiddelde) zou in zeldzame multi-signaal cases lager uitkomen; we kiezen voor max omdat de gebruiker primair geïnformeerd wil zijn over het sterkste element.
- **`rationale` = eerste bullet uit primair signaal.** Voor compactere weergave dan de volledige bullet-lijst van de radar.
- **`MOMENTUM_REVERSAL` minimaal MEDIUM risk.** Trend-keerpunten zijn statistisch fragiel; we kunnen niet via confidence alleen een LOW-risk-claim ondersteunen.
- **Engine-keuze.** Opus 4.7 (1M context) — adapter-design, types, mapping en tests moesten consistent blijven met de bestaande `opportunity-radar` shape én met de spec. Voor latere uitbreidingen (bv. extra publieke types) zou Sonnet 4.6 volstaan.

### Verbeter-vragen aan jou
- Wil je dat de huidige `/kansen` pagina ook gefilterd wordt op de 5 publieke signaaltypes? Of behouden we de 8-signaal coverage (incl. defensive-bargain + watchlist-target) op de bestaande UI en bouwen we de adapter alleen voor toekomstige call-sites (bv. een API-route, of een mobile-versie)?
- De `expectedHorizon`-strings zijn nu statisch per type. Wil je dat ze in de toekomst regime-afhankelijk worden (bv. langere horizon in DEFENSIVE regime)?
- Moet er een `/api/analytics/opportunity` route komen analoog aan `/api/analytics/mispricing`, met dezelfde auth + cache-headers? Dat past bij het patroon en is ~1 bestand werk — laat het me weten.

### Validatie
- `npm test` → **801/801 tests groen** (+28 opportunity adapter: 8 signals, 11 scoring, 9 engine).
- `npx tsc --noEmit` → schoon.
- `npm run build` → slaagt; geen UI-wijzigingen, dus geen route-impact.

## [Unreleased] - 2026-04-25 · Action & Rebalance Engine

### Added
- [`src/lib/analytics/actions/types.ts`](src/lib/analytics/actions/types.ts) — types `ActionDecision` (BUY/HOLD/TRIM/SELL/DO_NOTHING), `ActionUrgency` (LOW/MEDIUM/HIGH), `PositionAction`, `GlobalActionAdvice` (BUY_MORE/HOLD/DE_RISK/INSUFFICIENT_DATA), `ActionPlan`, `ActionPositionInput`, `DecisionEngineInput`.
- [`src/lib/analytics/actions/action-classifier.ts`](src/lib/analytics/actions/action-classifier.ts) — pure beslisregels per positie. Volgorde (eerste match wint): SELL → TRIM → BUY → HOLD → DO_NOTHING. Drempels in `DECISION_THRESHOLDS` constant zodat ze pinbaar zijn in tests. Triggers per pad:
  - **SELL**: composite ≤ 25, OF gewicht > cap × 1.2, OF risk-class high/critical, OF rebalance-engine RECONSIDER.
  - **TRIM**: gewicht > cap, OF zwakke factor + boven target × 1.05, OF risk-class elevated, OF rebalance-engine TRIM_LIGHT/HEAVY.
  - **BUY**: composite ≥ 70 + confidence ≥ 0.4 + ruimte onder cap + cash > 0; defensief regime cap't BUY achter composite ≥ 80.
  - **HOLD vs DO_NOTHING**: HOLD bij score in midden; DO_NOTHING wanneer factor ontbreekt + lage confidence.
- [`src/lib/analytics/actions/rebalance-quantity.ts`](src/lib/analytics/actions/rebalance-quantity.ts) — pure quantity-resolver. Voor TRIM/SELL hergebruikt 'ie de bestaande `RebalanceQuantityPlan` (zelfde getallen als /risico). Voor BUY: `desiredAmount = min(monthlyContribution × 1.5, cash × 0.5, target_gap × totalValue)`, `sharesToBuy = floor(desiredAmount / unitPrice)` (of `round(4)` bij fractional). Faal-safe: `insufficientData = true` wanneer koers/cash ontbreekt.
- [`src/lib/analytics/actions/decision-engine.ts`](src/lib/analytics/actions/decision-engine.ts) — orchestrator `runDecisionEngine`. Roept classifier + quantity-resolver per positie aan; sorteert op urgency desc → action-priority → ticker; bouwt globaal advies + warnings. Global rules:
  - **DE_RISK**: bij `risk.overallSeverity ∈ {high, critical}` of `(SELL+TRIM)/n ≥ 40%`.
  - **BUY_MORE**: ≥ 1 BUY-kandidaat + cash ≥ 5% portefeuille + niet defensief regime.
  - **HOLD**: default.
  - **INSUFFICIENT_DATA**: lege portefeuille.
- [`src/lib/analytics/actions/index.ts`](src/lib/analytics/actions/index.ts) — barrel.
- [`src/lib/analytics/actions/*.test.ts`](src/lib/analytics/actions) — **41 nieuwe tests**: action-classifier (18), rebalance-quantity (10), decision-engine (13). Inclusief deterministisme-test, alle SELL-paden, BUY met defensief regime cap, fallback-quantity zonder plan.
- [`src/app/(app)/dashboard/components/action-engine-card.tsx`](src/app/(app)/dashboard/components/action-engine-card.tsx) — UI-card "Wat moet ik NU doen?". Toont global advice met urgency-tone, distribution-strip per actie-type, top-3 acties met aantallen, bedrag, rationale en risico-impact, plus warnings. Pure presentatie — geen rekenwerk.

### Changed
- [`src/lib/analytics/index.ts`](src/lib/analytics/index.ts) — selective re-export van actions-module. `ACTION_THRESHOLDS` (in `holding-action.ts`) bestond al; daarom heet de constant in actions/-module **`DECISION_THRESHOLDS`**.
- [`src/app/(app)/dashboard/page.tsx`](src/app/(app)/dashboard/page.tsx) — nieuwe sectie "Wat moet ik NU doen?" boven het bestaande NextActionCard. De engine hergebruikt `view.rebalance.recommendations[*].quantityPlan` zodat afbouw-aantallen exact matchen met /risico — geen dubbele rekenpaden.

### Design-regels
- **GEEN AI.** Alle beslissingen lopen via rule-based functies; classifier + quantity-resolver zijn puur. Verdict-strings zijn templates over getelde inputs.
- **Deterministic.** Identieke input → identieke output (test gepind). `now` configureerbaar voor reproduceerbare runs.
- **Source-attribution per actie.** `sources[]` lijst de engines die hebben bijgedragen (factor / risk / rebalance / policy / market-regime). UI kan dit later tonen als audit-trail.
- **Hergebruik bestaande engines.** Quantities voor TRIM/SELL komen 1:1 uit de rebalance-engine; we voegen alleen BUY-quantity toe. Geen duplicate truth.
- **Eerste match wint.** Beslis-volgorde is expliciet (SELL → TRIM → BUY → HOLD → DO_NOTHING) zodat een ticker met meerdere triggers toch één duidelijke actie krijgt.
- **Confidence reflecteert data-coverage.** `confidence` daalt automatisch bij `insufficientData` (geen koers, geen factor, etc.).
- **Conservatief default-target = 1/n.** Wanneer geen policy-target is gegeven gebruiken we uniform target — past bij hoe opportunity-radar / hunting-list al werken.

### Aannames
- **Cap-default 10%.** Wanneer policy ontbreekt nemen we `defaultMaxPositionWeight = 0.1` (zelfde als `holding-action.ts`).
- **BUY-bedrag = `min(1.5 × monthly, 50% × cash, target_gap)`**. Conservatief — voorkomt dat één BUY de cash leegtrekt en respecteert de natuurlijke maandelijkse cadence.
- **Defensief regime onderdrukt zwakke BUY.** Bij `regime.stance === "DEFENSIVE"` triggert BUY pas vanaf composite ≥ 80.
- **DECISION_THRESHOLDS i.p.v. ACTION_THRESHOLDS.** `holding-action.ts` exporteerde al `ACTION_THRESHOLDS`; om collision in de barrel te vermijden hernoemen we de actions/-versie.
- **`existingPlan.targetWeight` is in percent (0..100).** De rebalance-engine slaat `targetWeight` op in percent, niet als fractie; we delen door 100 wanneer we 'm doorgeven aan de quantity-resolver.
- **DO_NOTHING ≠ HOLD.** DO_NOTHING is "onvoldoende data", HOLD is "data ondersteunt aanhouden". Dashboard verbergt beide standaard.
- **Engine-keuze.** Opus 4.7 (1M context) — drie modules + types + UI-card moesten consistent samen werken met `holding-action.ts`, `rebalance-engine` en `policy-engine`.

### Validatie
- `npm test` → **773/773 tests groen** (+41 actions: 18 classifier, 10 quantity, 13 engine).
- `npx tsc --noEmit` → schoon.
- `npm run build` → slaagt; dashboard bundlet de nieuwe ActionEngineCard.

## [Unreleased] - 2026-04-25 · Benchmark & Performance Attribution

### Added
- [`src/lib/analytics/benchmark/types.ts`](src/lib/analytics/benchmark/types.ts) — typedefs voor `BenchmarkPerformance`, `AttributionBreakdown`, `AttributionBucket`, `BenchmarkReport` + statische `BENCHMARK_CATALOG` met drie benchmarks (MSCI World / S&P 500 / VWCE) inclusief fallback-tickers per benchmark.
- [`src/lib/analytics/benchmark/benchmark-fetcher.ts`](src/lib/analytics/benchmark/benchmark-fetcher.ts) — `fetchBenchmark(id)` met automatische fallback naar alternatieve tickers wanneer de primary geen data oplevert; `resampleMonthly` voor maandelijkse cadence-alignment.
- [`src/lib/analytics/benchmark/performance.ts`](src/lib/analytics/benchmark/performance.ts) — `computeBenchmarkPerformance` berekent portfolio-return, benchmark-return, alpha, tracking-error, information ratio + genormaliseerde reeksen voor de chart. Trekt contributions/withdrawals **af** zodat extra inleg geen rendement is.
- [`src/lib/analytics/benchmark/tracking-error.ts`](src/lib/analytics/benchmark/tracking-error.ts) — `excessReturns`, `annualizedTrackingError` (× √12), `informationRatio` met null-fallback bij ontbrekende variantie.
- [`src/lib/analytics/benchmark/attribution.ts`](src/lib/analytics/benchmark/attribution.ts) — `computeAttribution` splitst alpha op in drie lenzen: sectoren (groepering op `holding.sector`), factoren (`quality-high/low`, `value-high/low`, `momentum-high/low` op tertile-drempels 65/35), en single-stock alpha (top-N op |contributie|).
- [`src/lib/analytics/benchmark/engine.ts`](src/lib/analytics/benchmark/engine.ts) — `buildBenchmarkReport` orchestrator + deterministische NL-verdict (geen AI; templates over alpha + top/bottom sector).
- [`src/lib/analytics/benchmark/index.ts`](src/lib/analytics/benchmark/index.ts) — barrel.
- [`src/lib/analytics/benchmark/*.test.ts`](src/lib/analytics/benchmark) — **32 nieuwe tests**: tracking-error (9), performance (6), attribution (6), engine (5), benchmark-fetcher (6).
- [`src/app/(app)/dashboard/load-benchmark.ts`](src/app/(app)/dashboard/load-benchmark.ts) — server-only loader. Pipeline: portfolio-snapshots → benchmark-history (fallback-aware) → resample → performance → per-positie history fetch → attribution → report. Faal-safe op alle externe calls.
- [`src/app/(app)/dashboard/components/benchmark-card.tsx`](src/app/(app)/dashboard/components/benchmark-card.tsx) — pure presentationele kaart "Presteer ik beter dan de markt?" met inline SVG-chart (portfolio vs benchmark, beide genormaliseerd op 100), key-metrics-grid, attribution-strips (sectoren / factoren / top-stocks) en warning-list. Geen client deps voor de chart — pure SVG.

### Changed
- [`src/lib/analytics/index.ts`](src/lib/analytics/index.ts) — `export * from "./benchmark"`.
- [`src/app/(app)/dashboard/page.tsx`](src/app/(app)/dashboard/page.tsx) — `loadBenchmarkReport` parallel met opportunity-data; nieuwe sectie "Benchmark & Attribution" rendert de kaart wanneer er een report is.

### Design-regels
- **Geen AI.** Alle berekeningen zijn pure functies; verdict-zin is een template over getelde inputs.
- **Fallback bij missende data.** `fetchBenchmark` probeert primary + 3 fallback-tickers; bij volledige uitval levert 'ie een rapport met warnings + lege series ipv exception. Performance retourneert nullen + warning bij < 2 overlappende maanden. Attribution skipt posities zonder bruikbare history.
- **Contributions ≠ rendement.** De portfolio-return-berekening trekt cumulatieve inleg-deltas af voordat 'ie de maandelijkse return bepaalt — voorkomt dat een DCA-bijstort als out-performance verschijnt.
- **Attribution is optelbaar.** Sector-contributies sommeren tot ongeveer alpha (binnen afrondings-ruis); `residualAlpha` toont expliciet wat niet aan sectoren toegerekend kon worden.
- **Tracking-error eerlijk geannualiseerd.** Stdev × √12, conform industry-standaard.
- **Pure SVG-chart.** Geen recharts/chart.js dependency voor deze widget — minder bundle-bloat, server-rendered.

### Aannames
- **Drie benchmarks**: MSCI World (default, primary `IWDA.AS`), S&P 500 (primary `^GSPC`), VWCE (primary `VWCE.DE`). Fallback-lijsten zijn **regio-divers** (US-listed + EU-listed varianten) zodat de provider niet aan één markt vastzit.
- **Maandelijkse cadence.** Portfolio-snapshots zijn typisch maandelijks; we resamplen benchmark-history op de laatste handelsdag per maand om gelijke cadences te garanderen.
- **Cumulative contribution proxy = `totalCost`-delta.** We hebben geen aparte cashflow-tabel; we gebruiken stijging in `totalCost` sinds de eerste snapshot als proxy voor extra inleg. Bij verkopen met realisatie zou dit licht onderschatten — acceptabel voor portefeuille-vergelijking.
- **Factor-thresholds 65/35.** Consistent met `deriveStrengthsWeaknesses` (screener) — een holding telt als "quality hoog" bij sub-score ≥ 65, "quality laag" bij ≤ 35. Mid-bucket (35–65) doet niet mee aan factor-attribution.
- **Sector "Onbekend"-fallback.** Holdings zonder sector-veld worden niet weggelaten maar krijgen het sector-label "Onbekend" zodat ze in attribution blijven verschijnen.
- **Engine-keuze.** Opus 4.7 (1M context) — vier engines + types + UI + tests + dashboard-integratie moesten consistent samen werken met bestaande `PortfolioView` en `getHistory`-cache. Voor latere uitbreidingen (extra benchmarks, custom benchmark via ETF-lookthrough) zou Sonnet 4.6 volstaan.

### Validatie
- `npm test` → **732/732 tests groen** (+32 benchmark: 9 tracking-error, 6 performance, 6 attribution, 5 engine, 6 fetcher).
- `npx tsc --noEmit` → schoon.
- `npm run build` → slaagt; `/dashboard` bundlet de nieuwe `BenchmarkCard` + chart.

## [Unreleased] - 2026-04-25 · AI Research Dossiers

### Added
- [`src/lib/ai/research-dossier.ts`](src/lib/ai/research-dossier.ts) — twee-laagse engine voor research-dossiers:
  - **`buildResearchContext`** — pure data-extractor. Verzamelt key-metrics (composite, sub-scores, P/E, FCF-yield, ROIC, debt/equity, dividend-yield, koers, mispricing-score, opportunity-score) als **pre-formatted strings** in `keyMetrics[]`. Bull/bear/risk-points komen letterlijk uit engine-rationales (factor-engine `deriveStrengthsWeaknesses`, opportunity-radar signals, mispricing-scanner signals + risk-flag-codes, rebalance-engine reasons, classifier-warnings).
  - **`renderResearchDossier`** — deterministische renderer. Bouwt `thesis` (composite + grade + bull/bear-counts + onzekerheid), `bullCase[]`, `bearCase[]`, `risks[]`, `keyNumbers[]`, `missingData[]`, `decisionChecklist[]`, `uncertaintyNote`, `confidence`. Geen LLM-call, geen `Math.round` op bestaande engine-waarden.
  - **`buildResearchDossier`** — one-shot helper voor de API-route.
  - **`buildResearchDossierPrompt`** + **`RESEARCH_DOSSIER_SYSTEM_PROMPT`** — prompt-payload klaar voor toekomstige LLM-swap. System prompt verbiedt expliciet: nieuwe scores verzinnen, factor-/mispricing-/opportunity-scores aanpassen, koop-/verkoopadvies geven.
  - **`validateAiOutputAgainstContext`** — sanity-check helper die elk numeric mention in een (theoretisch) AI-gegenereerde tekst vergelijkt met `context.keyMetrics` + rationale-getallen. Wordt nog niet runtime gebruikt (renderer is puur), staat klaar voor de LLM-swap.
- [`src/lib/ai/research-dossier-loader.ts`](src/lib/ai/research-dossier-loader.ts) — server-only loader. Fetcht parallel: portfolio (Prisma), fundamentals, 400d daily history. Roept `scoreFactors` aan (factor-engine) wanneer ten minste één van fundamentals/history aanwezig is. Geeft `dossier` + `diagnostics` (foundHolding, fundamentalsAvailable, factorScored, historyDays) terug.
- [`src/app/api/ai/research-dossier/route.ts`](src/app/api/ai/research-dossier/route.ts) — `POST /api/ai/research-dossier`. Body: `{ ticker }`. Auth via `resolveUser` (cookie of dev-header). Validatie via bestaande `parseTickerStrict`. Cache-Control `private, max-age=60, stale-while-revalidate=300`. Errors via `jsonError`/`jsonServerError` voor consistente API-shape met de andere AI-routes.
- [`src/app/(app)/portfolio/components/research-dossier-button.tsx`](src/app/(app)/portfolio/components/research-dossier-button.tsx) — client-component "Maak research dossier" knop + Sheet die het dossier rendert. Pure presentatie: fetcht de API, ontvangt het dossier en toont:
  - Header met ticker + naam + timestamp
  - Thesis (1–3 zinnen)
  - Confidence-strip (%) met source-engine-lijst
  - Belangrijkste cijfers (grid uit `keyNumbers` met source-label per cijfer)
  - Bull case / Bear case / Risico's (bullets)
  - Besluitchecklist (icon-list)
  - Ontbrekende data (warning-strip)
  Loading-state (`Loader2` spinner) en error-state met expliciete fout-melding.
- [`src/lib/ai/research-dossier.test.ts`](src/lib/ai/research-dossier.test.ts) — **16 nieuwe tests** over context-extractor (5: key-metrics collectie, bull/bear-points, dedup, missing-data, leeg keyMetrics), renderer (5: thesis-cijfers, decisionChecklist-defaults, value-trap-vraag, low-confidence-vraag, missingData/sourceEngines pass-through), one-shot determinisme, prompt-payload (system + user), en `validateAiOutputAgainstContext` (geen cijfers / matchende cijfers / verzonnen cijfers).

### Changed
- [`src/lib/ai/index.ts`](src/lib/ai/index.ts) — `export * from "./research-dossier"`.
- [`src/app/(app)/portfolio/components/holdings-table.tsx`](src/app/(app)/portfolio/components/holdings-table.tsx) — `<ResearchDossierButton ticker={row.ticker} label={row.name} />` toegevoegd in de actie-kolom, naast de bestaande `<ActionBadge>`. Geen layout-breaking change; de actie-kolom is een flex-stack.

### Design-regels (guardrails)
- **Geen LLM in productie-pad.** De renderer is volledig deterministisch — door constructie kan er geen verzonnen score/cijfer in de output sluipen. De prompt-payload is klaar voor een latere LLM-swap, met expliciete system-prompt-regels die het LLM precies dezelfde guardrails opleggen.
- **AI past geen engine-scores aan.** De composite, sub-scores, mispricing-score en opportunity-score worden 1:1 uit de engine overgenomen (`Math.round` op composite is alleen een display-helper). De renderer kent geen pad om "score: X" zelf te bepalen.
- **Cijfers komen uit één bron: `keyMetrics`.** Elke `value` is al pre-formatted als string ("P/E 14.2", "ROIC 31.0%", "72/100"). De renderer plaatst ze 1:1 in `keyNumbers`. Geen herformattering, geen herberekening.
- **Onzekerheid is verplicht.** `missingData[]` lijst alle ontbrekende inputs (factor-scores, fundamentals, mispricing, opportunity-radar, holding-context). `confidence` (0..1) bouwt op vanaf 0.3 met +0.2/+0.1/+0.15 per beschikbare bron. UI rendert deze in een gekleurde strip + warning-list.
- **AI mag alleen structureren.** De prozza-zinnen die de renderer maakt (thesis, checklist-vragen) gebruiken de getallen uit `keyMetrics` of zijn template-vragen zonder cijfers. Engines bepalen de feiten; de renderer zet ze in NL-zinnen.
- **Source-attribution.** Elke `ResearchMetric` en `ResearchEvidencePoint` draagt een `source` veld (`factor-engine` / `fundamentals` / `mispricing-scanner` / `opportunity-radar` / `rebalance-engine` / `classifier`). UI toont dit als audit-trail; gebruikers kunnen zien waar elke claim vandaan komt.
- **Decision-checklist is template + context-aware.** Vaste reflectie-vragen (profiel, positiegrootte, exit-trigger) altijd aanwezig; aanvullende vragen verschijnen alleen wanneer een specifieke conditie geldt (value < 50 + lage quality, hoge value + lage momentum = value-trap-vraag, lowVol < 40, mispricing-signaal aanwezig, etc.). Geen LLM-driven personalisatie.

### Aannames
- **Holding-context is optioneel.** Een dossier kan ook gemaakt worden voor een ticker die *niet* in de portefeuille zit — dan ontbreekt `holding`/`valuation`/`rebalance` en verschijnt "portefeuille-context" in `missingData`. Maakt de tool ook bruikbaar voor screener-/watchlist-onderzoek (later uitbreidbaar via API-call vanaf `/screener`).
- **Mispricing- en opportunity-radar input is optioneel.** De huidige API-loader passeert ze als `null`. Toekomstige uitbreiding kan deze in dezelfde call meefetchen — de context-builder accepteert ze al via `BuildResearchContextInput`. Daardoor breekt de UI niet wanneer ze later aangeschakeld worden.
- **Factor-score wordt server-side berekend.** De loader roept `scoreFactors` aan zelfs voor portefeuille-tickers, want de holding-row in de UI heeft de score wel maar de loader krijgt alleen een ticker-string. Cache (fundamentals + history) maakt dit goedkoop.
- **Renderer is puur, geen `now`-fallback.** De `generatedAt` komt uit `buildResearchContext` (default `new Date().toISOString()`, override via `now`). Tests gebruiken vaste `now` en krijgen bit-identieke output.
- **Prompt-payload niet bekijkbaar via API.** De huidige route geeft alleen `{ dossier, diagnostics }` terug, geen prompt-payload (anders dan `/api/ai/explain` waar `includePrompt` debug-flag bestaat). Kan later toegevoegd worden zodra de LLM-swap landt.
- **Engine-keuze.** Opus 4.7 (1M context) voor deze module: 7 engines (factor / fundamentals / classifier / rebalance / mispricing / opportunity / valuation) moesten consistent worden samengevoegd in één type-schoon dossier-shape, plus prompt-payload-design en sheet-UI. Voor latere toevoeging van LLM-driven polishing zou Sonnet 4.6 of Haiku 4.5 volstaan, met de bestaande validator (`validateAiOutputAgainstContext`) als guardrail.

### Validatie
- `npm test` → **700/700 tests groen** (+16 research-dossier: 5 context, 5 renderer, 1 determinisme, 2 prompt, 3 validator).
- `npx tsc --noEmit` → schoon.
- `npm run build` → slaagt; nieuwe route `/api/ai/research-dossier` (dynamic) staat in de route-tabel; `/portfolio` bundlet de nieuwe knop + sheet.

## [Unreleased] - 2026-04-25 · Strategy Evidence (/backtest tab "Bewijs")

### Added
- [`src/lib/analytics/backtest/evidence/types.ts`](src/lib/analytics/backtest/evidence/types.ts) — centrale typedefs: `RegimeBreakdownRow`, `RollingWindowEntry`, `RollingWindowSummary`, `UnderperformancePeriod`, `DcaContributionSimulation`, `BenchmarkRegretScore`, `DrawdownRecoveryEntry`, `DrawdownRecoverySummary`, `EvidenceVerdict`, `StrategyEvidenceReport`. Alle metrics zijn fracties (0.08 = 8%); periodes zijn ISO-datums.
- [`src/lib/analytics/backtest/evidence/shared.ts`](src/lib/analytics/backtest/evidence/shared.ts) — gedeelde pure helpers: `clamp`, `totalReturnOverValues`, `annualiseReturn`, `monthlyReturns`, `extractStrategyValues`, `extractBenchmarkValues`, `hasCompleteBenchmark`, `toIsoDateOnly`, `sum`, `average`, `round2`, `round4`.
- [`src/lib/analytics/backtest/evidence/rolling-windows.ts`](src/lib/analytics/backtest/evidence/rolling-windows.ts) — `computeRollingReturns({ points, windowMonths })`. Genereert overlappende N-maands vensters met strategie- en benchmark-return + excess. Bepaalt `worst`, `best`, `negativeCount` en `negativeShare` voor de UI.
- [`src/lib/analytics/backtest/evidence/regime-breakdown.ts`](src/lib/analytics/backtest/evidence/regime-breakdown.ts) — groepeert maand-op-maand returns per `MarketRegimeState` en levert per regime: total + annualised return strategie, idem voor benchmark (indien volledig aanwezig), excess. Vaste sortering (expansion → recovery → slowdown → recession → unknown) voor consistente UI.
- [`src/lib/analytics/backtest/evidence/underperformance.ts`](src/lib/analytics/backtest/evidence/underperformance.ts) — `detectUnderperformancePeriods` detecteert aaneengesloten maanden waarin de strategie achter benchmark liep. Drempels: `minMonths` (default 3), `minShortfall` (default 2%). Sortering op excess-return asc (slechtste eerst).
- [`src/lib/analytics/backtest/evidence/dca-simulation.ts`](src/lib/analytics/backtest/evidence/dca-simulation.ts) — `computeDcaSimulation` simuleert maandelijkse inleg op de strategie-returns én benchmark-returns. Money-weighted return berekend via bisection-IRR over alle cashflows (annualised). Levert `totalContributed`, `finalValue`, `profit` voor zowel strategie als benchmark.
- [`src/lib/analytics/backtest/evidence/benchmark-regret.ts`](src/lib/analytics/backtest/evidence/benchmark-regret.ts) — composite regret-score (0..100) op basis van: 0.4 × frequentie van underperformance-maanden + 0.3 × gemiddelde maandelijkse shortfall (gecapt op 5%) + 0.3 × max cumulatieve achterstand (log-space, gecapt op 30%). Retourneert `null` zonder complete benchmark.
- [`src/lib/analytics/backtest/evidence/drawdown-recovery.ts`](src/lib/analytics/backtest/evidence/drawdown-recovery.ts) — peak → trough → recovery cyclus-detector. Drempel `minDepth` (default -5%). Levert per cyclus: `peakDate`, `troughDate`, `recoveryDate` (null = nog open), `depth`, `monthsToTrough`, `monthsToRecovery`. Summary-velden: `longestRecoveryMonths`, `averageRecoveryMonths`, `inProgress`.
- [`src/lib/analytics/backtest/evidence/verdict.ts`](src/lib/analytics/backtest/evidence/verdict.ts) — pure `buildEvidenceVerdict` genereert NL-headline + highlights + limitations + numerieke `confidence` uit getelde inputs. **Geen LLM-calls**: alle zinnen zijn string-templates. Limitations triggeren automatisch bij sample < 36m, sample < 120m, ontbrekende benchmark, < 12 rolling-windows.
- [`src/lib/analytics/backtest/evidence/engine.ts`](src/lib/analytics/backtest/evidence/engine.ts) — `buildEvidenceReport({ result, strategyLabel, benchmarkLabel, config })` orkestrator. Pure functie over een `BacktestResult`. Aanvaardt config-overrides voor TTL, drempels en DCA-parameters; default DCA gebruikt `result.config.monthlyContribution`.
- [`src/lib/analytics/backtest/evidence/index.ts`](src/lib/analytics/backtest/evidence/index.ts) — barrel-export.
- [`src/lib/analytics/backtest/evidence/*.test.ts`](src/lib/analytics/backtest/evidence) — **35 nieuwe tests** verdeeld over rolling-windows (5), regime-breakdown (5), underperformance (5), DCA (6), regret (4), drawdown-recovery (5), engine-orkestrator (5). Inclusief deterministisme-test, null-paden, drempel-edge-cases.
- [`src/app/(app)/backtest/components/evidence-tab.tsx`](src/app/(app)/backtest/components/evidence-tab.tsx) — pure presentationele tab. Volgorde: kernconclusie + beperkingen → worst/best 12m → rolling-distributie → regime-breakdown → underperformance-lijst → drawdown recovery → benchmark regret → DCA-simulatie. Alle cijfers uit de engine; UI doet geen rekenwerk.
- [`src/app/(app)/backtest/components/tab-nav.tsx`](src/app/(app)/backtest/components/tab-nav.tsx) — server-component tab-navigatie via Next `<Link>`. Tabs: `Headline` en `Bewijs`. Behoudt alle bestaande searchParams (strategy, years, benchmark, cost) bij tab-switches.

### Changed
- [`src/lib/analytics/backtest/index.ts`](src/lib/analytics/backtest/index.ts) — `export * from "./evidence"`.
- [`src/lib/analytics/index.ts`](src/lib/analytics/index.ts) — selectief geëxporteerd: `buildEvidenceReport`, `buildEvidenceVerdict`, `computeRollingReturns`, `computeRegimeBreakdown`, `detectUnderperformancePeriods`, `computeDcaSimulation`, `computeBenchmarkRegret`, `computeDrawdownRecovery`, plus alle types. (Aansluiten bij bestaande selective re-export-stijl van de backtest-module.)
- [`src/app/(app)/backtest/page.tsx`](src/app/(app)/backtest/page.tsx) — leest nu `tab` uit searchParams, rendert `<TabNav>`, en switcht tussen de bestaande "Headline" tab (metrics + equity-chart) en de nieuwe "Bewijs" tab. Het evidence-report wordt **altijd** berekend wanneer er een equity-curve is, zodat tab-switches geen extra fetches kosten.

### Design-regels
- **Engine is volledig puur.** `buildEvidenceReport` heeft geen `new Date()` fallback in de berekeningen — alleen voor `generatedAt` (en die is via `config.now` overridable). Tests draaien met vaste `now` en krijgen bit-identieke output.
- **Geen LLM, geen verzonnen cijfers.** De NL-headline en highlights worden gegenereerd uit getelde inputs (CAGR, regret-score, langste recovery, slechtste 12m). AI mag deze zinnen later samenvatten/herformuleren, maar mag geen cijfers verzinnen.
- **Beperkingen expliciet.** `verdict.limitations[]` is verplicht ingevuld bij kleine sample (< 36m / < 120m), ontbrekende benchmark of onvoldoende rolling-windows. UI toont deze als amber-flagged lijst onder de headline.
- **Onzekerheid in confidence.** Numerieke `verdict.confidence` (0..1) bouwt op vanaf 0.5 met +0.15 voor ≥ 60m sample, +0.15 voor ≥ 120m, +0.1 bij benchmark, +0.1 bij ≥ 24 rolling-windows. UI toont dit als percentage.
- **Underperformance toont waarom.** Periodes worden niet alleen geteld; elk item toont strategie-return, benchmark-return en excess zodat de gebruiker direct ziet hoe groot de achterstand was en in welke periode.
- **Regret is een composite met expliciete formule.** Drie componenten met vaste gewichten (0.4 / 0.3 / 0.3) en explicit caps. Reproduceerbaar uit dezelfde equity-curve.
- **DCA als IRR-benadering.** Money-weighted return via bisection over een [-99%/jaar, 12×/jaar] interval, 80 iteraties, tolerance 1e-6. Genoeg precisie voor realistische DCA-scenario's. Maandelijkse cashflows (-contributie) + final lift-out van eindwaarde.
- **UI doet geen businesslogica.** Geen drempel-checks, geen severity-berekeningen, geen tweet-generatie in `evidence-tab.tsx`. Alle waarden komen direct uit de engine.

### Aannames
- **12-maands venster default.** Rolling-window = 12 maanden — match met hoe particuliere beleggers hun jaarrendement evalueren. Configureerbaar via `config.rollingWindowMonths` in de orchestrator.
- **Underperformance-drempels conservatief.** Default `minMonths = 3` en `minShortfall = 2%` — kleinere wiebels worden weggelaten zodat de UI geen ruis toont. Aanpasbaar vanuit de aanroepende code.
- **Drawdown-min-depth 5%.** Cycli kleiner dan 5% zijn typisch maandelijkse ruis; we tonen alleen serieuzere bewegingen. Verstelbaar via `config.drawdownMinDepth`.
- **DCA-default = `monthlyContribution` uit BacktestConfig.** Wanneer de gebruiker geen aparte DCA-bedragen opgeeft, simuleert het report exact de cashflow die ook al in de equity-curve zit. Voorkomt dat tab-switches verschillende verhalen vertellen.
- **Regret-formule is een keuze, geen academische standaard.** De gewichten 40/30/30 zijn pragmatisch: frequentie (psychologisch zwaar), magnitude (per-maand pijn), depth (cumulatieve achterstand). Caps op 5% maandelijkse shortfall en 30% cumulatieve achterstand zorgen dat de score in een realistisch bereik blijft.
- **Tab-switching herberekent niet.** Het evidence-report is een pure functie over de equity-curve die *toch al* gemaakt werd; serveren we 'm voor beide tabs. Goedkoper dan client-side state of een extra round-trip.
- **Engine-keuze.** Opus 4.7 (1M context) voor deze module: 7 deelanalyses + types + UI + barrel-exports + tests moeten consistent blijven met bestaande backtest- en regime-types. Voor latere uitbreiding van een enkele analytic (bv. nieuwe Sortino-tabel) zou Sonnet 4.6 volstaan.

### Validatie
- `npm test` → **684/684 tests groen** (+35 evidence: 5 rolling, 5 regime, 5 underperformance, 6 DCA, 4 regret, 5 drawdown-recovery, 5 engine).
- `npx tsc --noEmit` → schoon.
- `npm run build` → slaagt; `/backtest` (dynamic) bundlet de nieuwe Bewijs-tab + EvidenceTab component.

## [Unreleased] - 2026-04-25 · Hunting List (watchlist → actieve kansenlijst)

### Database (Prisma schema)
- [`prisma/schema.prisma`](prisma/schema.prisma) — `WatchlistItem` uitgebreid met optionele config-velden: `targetPriceHigh` (Decimal), `buyZoneTolerance` (Float), `valuationMaxPE` (Float), `valuationMinFcfYield` (Float). Alle bestaande rijen blijven werken omdat elk nieuw veld nullable is. Nieuw: `signalLogs` back-relation naar `HuntingSignalLog`.
- [`prisma/schema.prisma`](prisma/schema.prisma) — nieuwe append-only `HuntingSignalLog` model voor opportunity-history. Fields: `id`, `userId`, `watchlistItemId`, `ticker`, `triggerType`, `severity`, `price`, `currency`, `pe`, `fcfYield`, `rationale` (JSON-string), `note`, `firedAt`, `expiresAt`. Indexes op `(userId, ticker, firedAt)`, `(userId, firedAt)` en `expiresAt` zodat de UI snel kan pullen. User-relation toegevoegd (`huntingSignalLogs`).
- **Migratie vereist**: draai `npm run prisma:migrate` (dev) of `npx prisma db push` op de server om de nieuwe kolommen + tabel te provisionen. De app compileert en typecheckt onafhankelijk (na `prisma generate`), maar persistentie werkt pas na de DB-migratie.

### Added
- [`src/lib/analytics/hunting-list/types.ts`](src/lib/analytics/hunting-list/types.ts) — centrale typedefs: `HuntingStatus` (`watching` / `near-target` / `signal-active` / `expired`), `HuntingTriggerType` (`target-zone-reached` / `target-zone-near` / `valuation-band-reached`), `HuntingAlertSeverity` (`NONE` / `LOW` / `MEDIUM` / `HIGH`). NL-labels + descriptions mee-geëxporteerd zodat UI en eventuele API consistent blijven. `resolveHuntingConfig` normaliseert nullable Prisma-decimals naar typed config.
- [`src/lib/analytics/hunting-list/expiry.ts`](src/lib/analytics/hunting-list/expiry.ts) — pure helpers: `isTriggerExpired`, `partitionTriggers`, `computeExpiresAt`. Losgetrokken zodat UI-componenten rechtstreeks kunnen filteren op "verlopen" zonder de engine aan te roepen.
- [`src/lib/analytics/hunting-list/target-zone.ts`](src/lib/analytics/hunting-list/target-zone.ts) — detector met twee modi: (1) expliciete band `[targetPrice, targetPriceHigh]` → HIGH binnen de band, HIGH onder de ondergrens, MEDIUM binnen tolerantie boven de bovenzijde; (2) enkele `targetPrice` + tolerantie-marge → HIGH ≤ target, LOW (`target-zone-near`) binnen `target × (1 + tolerance)`. Default TTL 14 dagen.
- [`src/lib/analytics/hunting-list/valuation-band.ts`](src/lib/analytics/hunting-list/valuation-band.ts) — detector voor user-gedefinieerde fundamentals-drempels (`valuationMaxPE`, `valuationMinFcfYield`). Severity: HIGH wanneer beide drempels geconfigureerd én doorbroken, MEDIUM bij ≥ 10% marge boven/onder drempel, LOW precies op drempel. Default TTL 30 dagen. Half-signalen (één doorbroken, andere nog niet) krijgen een explicit rationale-regel.
- [`src/lib/analytics/hunting-list/engine.ts`](src/lib/analytics/hunting-list/engine.ts) — pure orkestrator `evaluateHuntingList(input)`. Per-item status-priority: (1) actieve MEDIUM/HIGH trigger → `signal-active`; (2) actieve LOW trigger → `near-target`; (3) verlopen triggers of history-entries → `expired`; (4) default → `watching`. Severity-aggregatie via `maxSeverity`-helper. Data-quality warnings voor ontbrekende quote, ontbrekende fundamentals bij valuation-config, of volledig ontbrekende config. Sorteert op severity desc, dan alfabetisch.
- [`src/lib/analytics/hunting-list/index.ts`](src/lib/analytics/hunting-list/index.ts) — barrel-export.
- [`src/lib/analytics/hunting-list/*.test.ts`](src/lib/analytics/hunting-list) — **36 nieuwe tests** over de detectoren + engine: target-zone (alle 3 severities en null-paden), valuation-band (alle severity-drempels, half-signalen), engine (status-afleiding, trigger-bundeling, history-interactie met expired status, data-quality warnings, distributies, sortering, determinisme).
- [`src/lib/data/hunting-list-repository.ts`](src/lib/data/hunting-list-repository.ts) — Prisma-gebaseerde repository. `listItemsByEmail` mapt `WatchlistItem` rows met Decimal-coercion naar typed TS shape. `listRecentHistoryForUser` bundelt `HuntingSignalLog` rows per ticker (sorted desc). **Idempotent `upsertActiveSignal`**: schrijft alleen een nieuw log-record wanneer er nog geen niet-verlopen row bestaat van hetzelfde `(userId, ticker, triggerType)` — dit voorkomt tick-stream-vervuiling en maakt opportunity-history betekenisvol.
- [`src/app/(app)/kansen/load-hunting-list.ts`](src/app/(app)/kansen/load-hunting-list.ts) — server-only data-loader. Parallel-fetch: watchlist-items + quotes + fundamentals + recent history; daarna pure engine-call; daarna best-effort persist van actieve triggers in `HuntingSignalLog`. Graceful degradation: DB-fouten worden gelogd via `log.warn` zonder de UI te breken.
- [`src/app/(app)/kansen/components/hunting-list-card.tsx`](src/app/(app)/kansen/components/hunting-list-card.tsx) — UI-kaart op `/kansen`. Per item: status-badge (met Binoculars/Target/Crosshair/Timer icoon), severity-badge, status-uitleg, metrics-grid (koers / target-zone / valuation-drempel / actieve triggers), per-trigger sub-card met label + rationale-bullets + **verplichte keerzijde-regel** + snapshot van prijs/P/E/FCF, data-quality warnings, en een opportunity-history strip met de laatste 5 firing-moments. Empty-state wanneer de user geen watchlist-items heeft. Status-summary (grid van 4 tellers) bovenaan.

### Changed
- [`src/types/watchlist.ts`](src/types/watchlist.ts) — uitgebreid met optionele `targetPriceHigh`, `buyZoneTolerance`, `valuationMaxPE`, `valuationMinFcfYield`. Backwards-compatible — alle nieuwe velden zijn `?: number | null`.
- [`src/lib/analytics/index.ts`](src/lib/analytics/index.ts) — `export * from "./hunting-list"`.
- [`src/lib/data/index.ts`](src/lib/data/index.ts) — `export { huntingListRepository }`.
- [`src/app/(app)/kansen/page.tsx`](src/app/(app)/kansen/page.tsx) — nieuwe sectie "Hunting list" bovenaan (boven de Mispricing Scanner sectie). De hunting-list-call doet mee in de bestaande parallel-`Promise.all` samen met opportunity-radar + mispricing-scanner, faal-safe met `.catch(() => null)`.

### Design-regels
- **Engine is puur.** `evaluateHuntingList` heeft geen `new Date()` fallback behalve via de expliciete `config.now` override. Tests draaien met een vaste `now` en krijgen bit-identieke output. Expiry-logica (`computeExpiresAt`, `isTriggerExpired`) is een aparte helper zodat UI én engine dezelfde regels volgen.
- **Business-logic buiten UI.** De `HuntingListCard` leest alleen velden uit `HuntingListReport`. Geen if/else over thresholds, geen eigen severity-berekening, geen eigen status-string.
- **Idempotente persistentie.** De loader schrijft maximaal één log-row per actieve trigger per TTL-window. Een target-zone-hit die 10 dagen onafgebroken aanstaat produceert **één** log-entry, geen 10 keer per page-refresh.
- **Explainability verplicht.** Elke trigger draagt `rationale[]` (wat exact werd gemeten) én `riskNote` (wat kan misgaan, kort NL). UI toont beide onder elkaar in elke trigger-card.
- **Onzekerheid zichtbaar.** Status-uitleg staat altijd onder de badge. `dataQuality.warnings` toont expliciet wanneer een quote of fundamentals-fetch is mislukt, of wanneer de user helemaal geen config heeft ingesteld (→ item blijft op `watching`).
- **Auto-expiry hardcoded in engine.** Target-zone triggers: 14 dagen TTL. Valuation-band triggers: 30 dagen. Overridebaar via `config.targetSignalTtlDays` / `config.valuationSignalTtlDays` in de engine-aanroep, maar de defaults zijn bewust kort zodat een signaal dat weken aanstaat niet verzilt in een permanent koopsignaal.
- **Geen leverage, geen auto-execution.** Het type-systeem bevat geen order-velden. De UI toont alleen observaties en de `riskNote` spreekt expliciet uit: "controleer risico, allocatie en kwaliteit voordat je instapt".
- **AI mag alleen uitleggen.** De rationale-zinnen zijn string-templates over gemeten cijfers. Geen LLM-calls in detectoren of engine.

### Aannames
- **Watchlist blijft naamgeving in de DB.** De tabelnaam `WatchlistItem` blijft staan (minder breekbare migratie); de TS-laag en UI gebruiken "Hunting list" als productnaam. Bestaande code die `prisma.watchlistItem` aanroept blijft werken, nieuwe velden zijn optioneel.
- **History is event-driven, niet periodic.** Een nieuwe log-row verschijnt zodra een trigger van `inactive → active` gaat (of een vorige TTL-window verlopen is). Dit is het juiste niveau voor "opportunity history": een gebruiker wil weten *wanneer* een trigger is afgegaan, niet tick-voor-tick.
- **Status-prioriteit.** `signal-active > near-target > expired > watching`. Een item met zowel een actieve HIGH-trigger als een verlopen LOW-trigger telt als `signal-active`. Een item zonder actieve triggers maar met history-entries toont `expired` (niet `watching`) zodat de gebruiker ziet dat er iets gebeurd is.
- **Fundamentals-refresh is extern.** De valuation-band detector vertrouwt op `getFundamentals(ticker)` (zelfde provider als screener); als de provider-cache stale is blijft de engine consistent op de cached ratio. Voor échte real-time triggers moet de cache-TTL daar gerespecteerd worden.
- **Buy-zone tolerance default 5%.** Wanneer de user geen expliciete tolerantie of `targetPriceHigh` opgeeft, interpreteert de engine "binnen 5% boven target" als `near-target`. Configureerbaar per item via `buyZoneTolerance` (0..1) of een expliciete band.
- **Engine-keuze.** Opus 4.7 (1M context) voor deze module: raakt Prisma schema + engine + repository + loader + UI + CHANGELOG tegelijk, en moet consistent blijven met bestaande radar/mispricing-design. Voor latere uitbreidingen (extra trigger-types) zou Sonnet 4.6 volstaan.

### Validatie
- `npm test` → **649/649 tests groen** (+36 hunting-list: 12 target-zone, 10 valuation-band, 14 engine).
- `npx prisma generate` → succesvol (nieuwe types voor `WatchlistItem.targetPriceHigh`/`buyZoneTolerance`/`valuationMaxPE`/`valuationMinFcfYield` + `HuntingSignalLog` model).
- `npx tsc --noEmit` → schoon.
- `npm run build` → slaagt; `/kansen` bundled met de nieuwe hunting-list-sectie.
- `npm run prisma:migrate` moet op de server draaien om de nieuwe kolommen + `HuntingSignalLog` tabel aan te maken voordat persistentie activeert.

## [Unreleased] - 2026-04-25 · Mispricing Scanner

### Added
- [`src/lib/analytics/mispricing/types.ts`](src/lib/analytics/mispricing/types.ts) — centrale typedefs voor de scanner: `MispricingSignal`, `MispricingCandidate`, `MispricingReport`, `MispricingDataQualityAssessment` + 9 stabiele `MispricingRiskFlagCode` waarden met NL-labels (`value-trap`, `earnings-deterioration-unknown`, `thin-peer-basket`, `small-sample-volatility`, `short-history`, `single-source-fundamentals`, `sentiment-proxy-only`, `quality-degradation-unknown`, `momentum-reversal-fragile`). Elk signaal draagt `mispricingScore` (0..100), numerieke `confidence` (0..1), afgeleide `confidenceTier` (HIGH/MEDIUM/LOW), `expectedHoldingPeriodDays`, verplichte `riskFlags[]`, `rationale[]`, `riskNote`, `detectedAt` én **`expiresAt`** zodat signalen automatisch vervallen.
- [`src/lib/analytics/mispricing/shared.ts`](src/lib/analytics/mispricing/shared.ts) — gedeelde pure helpers (`clamp`, `scaleStrength`, `pctChange`, `trailingReturn`, `logReturns`, `stdev`, `annualizedVol`, `realizedVolOverWindow`, `median`, `computeExpiresAt`). Alles numeriek en deterministisch.
- [`src/lib/analytics/mispricing/valuation-gap.ts`](src/lib/analytics/mispricing/valuation-gap.ts) — detector 1/4. Triggert bij P/E-discount ≥ 25% t.o.v. sector-mediaan, eigen 5y-mediaan, of FCF-yield premium ≥ 20%. Default holding-periode: 365 dagen. Plakt `value-trap` + (bij onbekende quality) `earnings-deterioration-unknown` flags.
- [`src/lib/analytics/mispricing/peer-dislocation.ts`](src/lib/analytics/mispricing/peer-dislocation.ts) — detector 2/4. Vergelijkt 12m-return met sector-peer-basket (min. 3 peers, safe ≥ 6). Triggert bij ≥ 10% achterstand op peer-mediaan. Default holding-periode: 180 dagen. Accepteert optionele `fundamentalsStable` boolean; zonder die input: lagere confidence + `earnings-deterioration-unknown` flag.
- [`src/lib/analytics/mispricing/quality-price-divergence.ts`](src/lib/analytics/mispricing/quality-price-divergence.ts) — detector 3/4. Quality ≥ 70 én 12m-return ≤ -10%. Accepteert optionele `priorFactorScore`: als quality meetbaar is gedaald (-10pt of meer) retourneert detector `null` i.p.v. een signaal te triggeren op een echte degradatie. Default holding-periode: 270 dagen.
- [`src/lib/analytics/mispricing/sentiment-price-divergence.ts`](src/lib/analytics/mispricing/sentiment-price-divergence.ts) — detector 4/4. Twee routes: (1) expliciete `sentimentScore ≥ 0.7` gecombineerd met 20d-return ≤ -5%; (2) volatility-proxy wanneer geen sentiment-feed: lowVol ≥ 65 + 20d/200d vol-ratio ≥ 1.5. Proxy-route krijgt verplicht `sentiment-proxy-only` flag en cap op confidence (≤ 0.6). Default holding-periode: 90 dagen.
- [`src/lib/analytics/mispricing/scanner.ts`](src/lib/analytics/mispricing/scanner.ts) — pure orkestrator `scanMispricing(input)`. Draait alle 4 detectoren per ticker, bundelt signalen, berekent `aggregateScore = max(strength) × diversity-bonus` (cap 1.2), strength-gewogen `aggregateConfidence`, mediane holding-periode en `earliestExpiresAt` (kandidaat vervalt zodra éérste signaal verloopt). Sorteert op score → #signalen → confidence → alfabetisch. `config.signalTtlDays` wordt geclampt naar ≥ 1.
- [`src/lib/analytics/mispricing/load.ts`](src/lib/analytics/mispricing/load.ts) — server-only I/O-loader. Gebruikt `runScreen` voor een brede pool (default 40), groepeert op sector voor peer-baskets, berekent sector-mediane P/E + FCF-yield als benchmark, fetcht 400d history per ticker parallel. Levert diagnostics (`missingHistory`, `missingFundamentals`, `sectorsRepresented`) zodat de UI transparant is over data-dekking. Heuristische `deriveFundamentalsStable`: positief operating-margin + ROE én TTM-revenue-growth ≥ -10%.
- [`src/lib/analytics/mispricing/index.ts`](src/lib/analytics/mispricing/index.ts) — barrel-export.
- [`src/lib/analytics/mispricing/*.test.ts`](src/lib/analytics/mispricing) — **47 nieuwe tests** over de 4 detectoren + scanner: happy-paths per threshold, null-paden, risk-flag emissies, strength-orderingen, expiry-berekening, determinisme en TTL-clamping.
- [`src/app/api/analytics/mispricing/route.ts`](src/app/api/analytics/mispricing/route.ts) — `GET /api/analytics/mispricing` API-route. Auth via bestaande `resolveUser` (cookie of dev-header). Query-params (optioneel): `limit` (1..50), `minScore` (0..100), `ttl` (1..180), `universeLimit` (1..80). Response: `{ report, diagnostics }`. Response-cache: `private, max-age=60, stale-while-revalidate=300` zodat herhaalde page-refreshes niet elke keer 40 tickers her-fetchen.
- [`src/app/(app)/kansen/components/mispricing-card.tsx`](src/app/(app)/kansen/components/mispricing-card.tsx) — presentationele card op /kansen. Toont per kandidaat: aggregate-score, confidence-tier + numerieke %, samenvatting, metrics (holding-periode, vervaldatum + resterende dagen, #signalen), per-signaal sub-card met label + score + confidence + holding, rationale-bullets, expliciete `Keerzijde:` regel en risk-flag badges. Empty-state wanneer de scan niks oplevert. Alle cijfers komen kant-en-klaar uit de engine; UI doet geen rekenwerk.

### Changed
- [`src/lib/analytics/index.ts`](src/lib/analytics/index.ts) — `export * from "./mispricing"`.
- [`src/app/(app)/kansen/page.tsx`](src/app/(app)/kansen/page.tsx) — parallelle fetch van opportunity-radar + mispricing-scanner via `Promise.all`. `MispricingCard` wordt onder de radar-sectie gerenderd (alleen wanneer de scan slaagt; faal-safe op null). Geen impact op bestaande radar-sectie of dashboard-widget.

### Design-regels
- **Geen koopadvies zonder risico-uitleg.** Elk signaal draagt verplicht `riskNote` (wat kan misgaan) + `riskFlags[]` (gestructureerd) + `rationale[]` (wat triggerde het). UI toont alle drie onder elke signaal-card.
- **Geen leverage, geen auto-execution.** Het type-systeem heeft bewust geen `orderSize`, `leverage`, `executionVenue` of vergelijkbare velden. API retourneert alleen observaties, geen actieverzoeken.
- **Signal auto-expiry.** Elk signaal krijgt `expiresAt = detectedAt + signalTtlDays`. Kandidaat-niveau exposet `earliestExpiresAt` — zodra één signaal verloopt valt de kandidaat buiten de scan. UI toont resterende dagen.
- **Reproduceerbaar.** Alle detectoren zijn pure functies met expliciete drempels als `const` bovenaan het bestand. Identieke input → identieke output, getest via het `determinisme`-testblok.
- **Onzekerheid zichtbaar.** Numerieke confidence (0..1) én tier-label; risk-flags voor elke onzekere datapunt (thin basket, proxy-only, unknown degradation). Bij `dataQuality.met === false` krijgt de UI een amber warning onder de signaal-card.
- **Engine buiten UI.** UI-component (`mispricing-card.tsx`) bevat geen thresholds, percentages of tellers — alles komt uit `scanMispricing`.
- **AI mag alleen uitleggen.** De detectoren bevatten geen LLM-calls. De geschreven NL-rationale-zinnen zijn string-templates over de gemeten cijfers. Toekomstige `/chat`-integratie mag samenvatten maar niet scores verzinnen.

### Aannames
- **Sector-mediaan als P/E-benchmark.** We hebben geen externe sector-index feed; de mediaan wordt per scan berekend uit de screener-pool (min. 3 tickers per sector). Dit is intern-consistent maar kan afwijken van brede industrie-benchmarks.
- **5-jaar historische mediaan P/E niet beschikbaar.** De loader zet `historicalMedianPE: null`; alleen de sector-discount + FCF-premium routes triggeren in productie. Zodra we fundamentals-snapshots historiseren, kan de historische route ingeschakeld worden zonder detector-wijziging.
- **`fundamentalsStable` heuristiek is conservatief.** Positief operating-margin + ROE én TTM-revenue-growth ≥ -10%. Dit voorkomt dat de scanner kandidaten met duidelijk verslechterende cijfers als "dislocatie" bestempelt — maar blijft defensief: bij missende data retourneert hij `null` en krijgt het signaal een `earnings-deterioration-unknown` flag.
- **Sentiment = volatility-proxy tot er een feed is.** Zonder news/flow feed gebruikt de sentiment-detector 20d/200d realized-vol ratio + lowVol factor als indirect sentiment-proxy. Deze route cap't confidence bij 0.6 en flag't altijd `sentiment-proxy-only`. Expliciete sentiment-scores (0..1) uit een toekomstige provider worden direct geaccepteerd.
- **Signal-TTL default 30 dagen.** Fundamentals worden typisch per kwartaal gepubliceerd; signalen gebaseerd op drie maanden oude inputs vervallen voordat nieuwe cijfers uit zijn. Configureerbaar via API (`ttl`) of loader-argument.
- **Diversity-bonus cap 1.2 (vs. 1.25 in opportunity-radar).** Mispricing-signalen correleren sterker (valuation + peer-dislocation gaan vaak samen bij uitverkochte namen). Conservatievere cap voorkomt scores >100 voor 2 correlated drivers.
- **Scanner gebruikt de bestaande screener-pool.** Geen tweede universum-definitie. Dit houdt één canonieke bron voor "welke tickers scoren we" en laat filter-tuning op `screener.ts` ook mispricing-coverage sturen.
- **Engine-keuze.** Deze module draait op Opus 4.7 (1M context) omdat het type-systeem én de scoring-regels gelijktijdig consistent moeten blijven over vijf bestanden + UI + API. Voor routine-detector-uitbreidingen (bv. nieuwe risk-flag codes) volstaat Sonnet 4.6.

### Validatie
- `npm test` → **613/613 tests groen** (+47 mispricing tests: 10 valuation-gap, 7 peer-dislocation, 9 quality-divergence, 9 sentiment, 12 scanner).
- `npx tsc --noEmit` → schoon.
- `npm run build` → slaagt; nieuwe route `/api/analytics/mispricing` (dynamic) staat in de route-tabel; `/kansen` bundelt de MispricingCard.

## [Unreleased] - 2026-04-24 · Opportunity Radar + /kansen

### Added
- [`src/lib/analytics/opportunity-radar/types.ts`](src/lib/analytics/opportunity-radar/types.ts) — `OpportunitySignal` / `OpportunityCandidate` / `OpportunityReport` types met 8 signaaltypes (quality-pullback, value-dislocation, momentum-reversal, watchlist-target, underweight-high-conviction, etf-core-rebalance, defensive-bargain, earnings-sentiment-placeholder). Elke signal draagt verplicht `rationale[]` + `riskNote`. Labels en tone-map zijn mee-geëxporteerd zodat page + dashboard widget dezelfde strings gebruiken.
- [`src/lib/analytics/opportunity-radar/signals.ts`](src/lib/analytics/opportunity-radar/signals.ts) — 8 pure detector-functies, elk `(input) => OpportunitySignal | null`. Geen AI, geen gokwerk: als een threshold niet gehaald is of history ontbreekt → `null`. Expliciete drempels in comments, strength op 0..100 geschaald met gedeelde helpers (`scaleStrength`, `pctChange`, `highInWindow`).
- [`src/lib/analytics/opportunity-radar/scoring.ts`](src/lib/analytics/opportunity-radar/scoring.ts) — `buildCandidate` aggregeert N signalen: composite = max(strength) × diversity-bonus (1 + 0.08 × (n−1), cap 1.25). Confidence weighted aggregation (HIGH=1.0, MEDIUM=0.6, LOW=0.3). NL-summary builder kiest het sterkste signaal als hoofdregel en hangt `+X ander(e) signa(l)(en)` achteraan. Filtert signalen onder `minSignalStrength` (default 40).
- [`src/lib/analytics/opportunity-radar/engine.ts`](src/lib/analytics/opportunity-radar/engine.ts) — `scanOpportunities({ portfolio, screener, watchlist, regime, config })` orkestrator. Dedupliceert op ticker (portfolio > watchlist > screener als bron-prioriteit). Sorteert op score desc, tie-break op signaal-count en dan alfabetisch. Cap op `maxCandidates` (default 20). Retourneert `OpportunityReport` met `signalDistribution` over de getoonde kandidaten en `sourcesScanned` audit-trail.
- [`src/lib/analytics/opportunity-radar/{signals,scoring,engine}.test.ts`](src/lib/analytics/opportunity-radar) — **51 nieuwe tests**: 28 signal-detectoren (triggers, null-paden, regime-interacties), 11 scoring (confidence-aggregatie, diversity-bonus, summary-pluralisatie), 12 engine (dedup, source-priority, filtering, signalDistribution).
- [`src/app/(app)/kansen/load-opportunity-data.ts`](src/app/(app)/kansen/load-opportunity-data.ts) — server-only loader die de drie bronnen samenbrengt: portfolio-holdings (met parallel-fetch van 400d daily history, weight uit `view.valuations`, target = 1/n default, broad-market-ETF-flag via `classifyInstrument`), screener-universum (top-40 via `runScreen`, histories + quotes parallel, portfolio-dubbelen gefilterd), watchlist-items (uit Prisma met `targetPrice` decimal → number). Faal-safe op provider-uitval.
- [`src/app/(app)/kansen/page.tsx`](src/app/(app)/kansen/page.tsx) — `/kansen` server-component. Hero-stats (candidates / totaal signalen / bron-telling), `OpportunityList` (main), `SignalDistributionCard` + `SourcesScannedCard` (sidebar), en een uitlegsectie "Hoe lees je deze pagina" met drie kern-principes (signalen ≠ adviezen, keerzijde verplicht, geen orderadvies).
- [`src/app/(app)/kansen/loading.tsx`](src/app/(app)/kansen/loading.tsx) — skeleton die de page-layout weerspiegelt (stats-rij + main+sidebar + signaalverdeling).
- [`src/app/(app)/kansen/components/opportunity-list.tsx`](src/app/(app)/kansen/components/opportunity-list.tsx) — lijst-wrapper met empty-state.
- [`src/app/(app)/kansen/components/opportunity-row.tsx`](src/app/(app)/kansen/components/opportunity-row.tsx) — per-kandidaat card: ticker + naam + bron-badge (portfolio/screener/watchlist), composite score block (3 kleur-tiers), confidence-badge, summary-regel, koers, per-signaal sub-cards met rationale-bullets én een verplichte **"Keerzijde: …"** regel, warnings-lijst bij data-lacunes.
- [`src/app/(app)/kansen/components/signal-distribution-card.tsx`](src/app/(app)/kansen/components/signal-distribution-card.tsx) — 8 rijen met count + horizontale balk, kleur via `SIGNAL_TONE` map.
- [`src/app/(app)/kansen/components/sources-scanned-card.tsx`](src/app/(app)/kansen/components/sources-scanned-card.tsx) — audit-trail card (3 tellers + timestamp).
- [`src/app/(app)/dashboard/components/top-kansen-card.tsx`](src/app/(app)/dashboard/components/top-kansen-card.tsx) — compacte dashboard-widget "Top kansen" met top-3 kandidaten (score, bron-badge, confidence-tier, top-signaal-label + "+X ander(e)"). Link naar `/kansen` via ArrowRight-CTA.

### Changed
- [`src/lib/analytics/index.ts`](src/lib/analytics/index.ts) — `export * from "./opportunity-radar"`.
- [`src/lib/navigation.ts`](src/lib/navigation.ts) — nieuwe nav-item `Kansen` (Sparkles-icoon) in groep `onderzoek`, gepositioneerd vóór `Screener`.
- [`src/app/(app)/dashboard/page.tsx`](src/app/(app)/dashboard/page.tsx) — vervangt de screener-gebaseerde `TopOpportunitiesCard` (top-3 factor-composite) door de nieuwe `TopKansenCard` (radar met portfolio + screener + watchlist signalen). `runScreen`-call voor het dashboard verwijderd; in plaats daarvan `loadOpportunityData({ maxCandidates: 3 })` na `buildPortfolioView`. Fallback op lege lijst bij provider-uitval zodat de rest van het dashboard intact blijft.

### Design-regels
- **Geen trade-beslissing, geen AI als decider.** Elk signaal is een pure functie van holding-data / factor-scores / history. Ontbreekt input → `null`, geen gok.
- **Explainability is verplicht.** Elke signal draagt `rationale` (wat triggerde het) én `riskNote` (wat kan misgaan: value trap, momentum fade, earnings surprise, …). Die keerzijde staat altijd op de UI-card onder de rationale.
- **Composable scoring.** Meerdere signalen op dezelfde ticker geven een diversity-bonus (max +25%) maar de basis is de sterkste enkele hit — we claimen niet dat 3 correlated signalen 3× zo sterk zijn.
- **Source-priority.** Portefeuille-positie > watchlist > screener: als een ticker in je portefeuille zit weegt de portefeuille-context (weight vs target, 12m return) zwaarder dan z'n plek in het universe.
- **Deduplicatie expliciet.** Ticker kan in meerdere bronnen voorkomen; engine bundelt alle signalen op één kandidaat en kiest de hoogste-prio source voor display.
- **Pure engine + I/O-loader split.** `scanOpportunities` is een pure functie, volledig test-baar met in-memory fixtures. Alle I/O (Prisma, quotes, history, regime) leeft in `load-opportunity-data.ts` zodat de engine deterministisch blijft.
- **UI doet geen rekenwerk.** Strength-scores, composite, confidence-tier, summary-zin, warnings — alles komt kant-en-klaar uit `buildCandidate`. UI kiest alleen kleur-klassen en formatters.
- **Keerzijde op elke card.** Elke rationale krijgt automatisch een Info-icoon met "Keerzijde: X". Dit dwingt de gebruiker om niet alleen de opportunity te zien maar ook waar het mis kan.

### Aannames
- **`targetWeight = 1/n` als default.** Portfolio-positie heeft geen expliciet target-gewicht (dat komt pas uit een custom policy). Uniforme target als baseline is voldoende om underweight-conviction en ETF-core-rebalance iets te geven om tegen af te zetten. Gebruikers met een policy-engine-plan krijgen straks betere targets door die door te geven aan de loader.
- **Screener-universum top-40.** Genoeg dekking voor de pool zonder de quote/history-fetch te laten exploderen. Configurabel via `config.screenerLimit`.
- **400 dagen history per ticker.** Genoeg voor 12m + 3m berekeningen plus buffer voor weekends/holidays. Cache (30 min TTL) dedupliceert herhaalde hits.
- **`minSignalStrength = 40`** als ondergrens voor "tonen waard". Signalen onder 40 zijn te zwak om ruis te zijn. Op het dashboard (3 slots) gebruiken we dezelfde drempel maar slice op `maxCandidates: 3`.
- **Earnings/sentiment is placeholder.** Detector retourneert altijd `null` tot er een earnings-feed is. Het type blijft in de distributie-tellers staan (= 0) zodat de UI niet hoeft te vertakken als we 'm later aanzetten.
- **Diversity-bonus conservatief (cap 25%).** Signalen correleren vaak (value + momentum-reversal gaan samen bij uitverkochte namen). Een lineaire bonus zou overweging van drie correlated hits belonen; we kiezen voor een plafond.
- **Geen watchlist-isin.** Prisma `WatchlistItem` heeft geen `isin` kolom; candidate krijgt `isin: null` tot de schema uitbreidt.

### Validatie
- `npm test` → **566/566 tests groen** (+51 nieuwe opportunity-radar tests, +0 regressies).
- `npx tsc --noEmit` → schoon.
- `npm run build` → slaagt, `/kansen` (dynamic) bundled, dashboard bundled zonder `runScreen`-import.

## [Unreleased] - 2026-04-24 · /risico · concrete afbouwadviezen

### Added
- [`src/app/(app)/risico/components/rebalance-quantity-card.tsx`](src/app/(app)/risico/components/rebalance-quantity-card.tsx) — nieuwe presentationele component "Concrete afbouwadviezen". Rendert per positie (action ≠ `NO_ACTION`):
  - Positie-naam + ticker + `actionLabel`-badge (`geen actie` / `licht afbouwen` / `stevig afbouwen` / `heroverwegen`).
  - Confidence-badge (`Hoge zekerheid` / `Matige zekerheid` / `Onvoldoende data`) direct uit `RebalanceQuantityPlan.confidence`.
  - Grid met 6-7 metrics: huidige weging, targetweging, aantal af te bouwen stuks, indicatief verkoopbedrag, weging na verkoop, excess t.o.v. target, (indien beschikbaar) huidige koers.
  - Unit-label adaptief per asset class: `aandeel`/`aandelen` voor EQUITY/REIT, `unit`/`units` voor ETF, `stuks` voor fractionele shares of overige.
  - Warnings-lijst onder de reason-regel wanneer de quantity-engine data-lacunes meldde (bv. last-known-prijs).
  - Disclaimer: *"Indicatief, geen orderadvies; controleer altijd actuele brokerkoers."*
  - `Geen posities boven de policy-cap`-empty-state wanneer er niks af te bouwen is.

### Changed
- [`src/lib/analytics/attention.ts`](src/lib/analytics/attention.ts) — `AttentionItem` krijgt optioneel `quantityPlan?: RebalanceQuantityPlan`. De `fromRebalance` builder zet 'm door vanuit de recommendation zonder rekenwerk en gebruikt `quantityPlan.reason` (indien aanwezig) als primaire message; anders valt 'ie terug op `rec.reasons[0]` of de default-tekst. `NO_ACTION` wordt nog steeds gefilterd.
- [`src/lib/analytics/attention.test.ts`](src/lib/analytics/attention.test.ts) — 2 nieuwe tests: quantityPlan wordt doorgepompt (message bevat "verkoop 4 aandelen"), zonder quantityPlan valt message terug op reasons.
- [`src/app/(app)/risico/components/attention-summary.tsx`](src/app/(app)/risico/components/attention-summary.tsx) — accepteert nu `baseCurrency` prop en toont een subregel onder de attention-message: *"Indicatief: verkoop 4 eenheden voor circa €7.000 — nieuwe weging ca. 10,53%."*. Bij ontbrekende koers: *"Onvoldoende koersdata — aantal niet te bepalen."*. Bij excess < 1 eenheid: *"Overschrijding kleiner dan één eenheid — geen concrete order nodig."*. Geen rekenwerk in UI; alle getallen komen uit `quantityPlan`.
- [`src/app/(app)/risico/page.tsx`](src/app/(app)/risico/page.tsx):
  - Nieuwe sectie "Concrete afbouwadviezen" boven "Wat vraagt aandacht" met `<RebalanceQuantityCard>`.
  - Server-side `assetClassByTicker` map opgebouwd uit `portfolio.holdings` zodat de unit-labeling klopt zonder de holdings individueel door te geven.
  - `AttentionSummary` krijgt `baseCurrency` mee voor de quantity-regel.

### Design-regels
- **UI doet geen rekenwerk**. Alle getallen (sharesToSell, amountToSell, postSellWeight, excessValue, reason) komen kant-en-klaar uit `RebalanceQuantityPlan`. De component kiest alleen kleur-klassen, labels en formatters.
- **Nederlandse notatie overal**: `formatCurrency(value, baseCurrency)` en `formatNumber(value, fractionDigits)` uit [`src/lib/utils.ts`](src/lib/utils.ts) gebruiken `nl-NL` locale — `€ 7.000` i.p.v. `€7,000`. Percentages met komma via `.toFixed(2)` in string-templates.
- **Onzekerheid zichtbaar**: `Onvoldoende data`-badge op LOW confidence, warning-regels met `AlertTriangle`-icoon, "—" in metric-velden zonder koers. Gebruikers zien expliciet wanneer een advies op dunne data rust.
- **Disclaimer op de kaart, niet op elke rij**: vermijden van ruis. Disclaimer verwijst naar de broker omdat dit geen order-platform is.
- **Niet-invasief voor bestaande UI**: alleen `AttentionSummary` signature wijzigt (extra `baseCurrency` prop, required). Het dashboard gebruikt deze component niet, dus geen ripple-effect.
- **Filter op `action !== NO_ACTION` + `quantityPlan !== undefined`**: oude snapshots of recommendations zonder quantity-plan (bv. uit een oude backtest-run) crashen de UI niet — ze worden gewoon niet getoond in deze kaart.

### Aannames
- **Asset-class mapping per ticker** is voldoende voor unit-labeling. In multi-portfolio scenario's met dezelfde ticker in verschillende asset classes is dit niet volledig — maar dat komt nauwelijks voor (één ISIN = één asset class). Wanneer portfolios later gescheiden worden blijft dit werken omdat de map op page-niveau wordt opgebouwd.
- **"Eenheden" als neutraal meervoud** in de AttentionSummary-regel: we hebben daar geen asset class map beschikbaar. De `RebalanceQuantityCard` gebruikt wél de specifieke labels ("aandelen"/"units"). Consistentie tussen beide is een potentiële UX-verbetering, niet nu nodig.
- **Percentages afgerond op 2 decimalen** (`17,53%`). De voorbeeld-spec toont 17.53 dus we volgen dat. `postSellWeight` idem.
- **Bedragen afgerond op hele euro's** in de quantity-regel (`maximumFractionDigits: 0`). Detailpagina had ook decimalen kunnen tonen maar ronde bedragen zijn leesbaarder bij een grove indicatie.
- **Disclaimer-tekst** is bewust conservatief en juridisch-safe ("indicatief, geen orderadvies"). Wanneer we ooit directe broker-koppelingen toevoegen moet deze tekst naar een juristenronde.

### Validatie
- `npm test` → **515/515 tests groen** (+2 nieuwe attention-tests).
- `npx tsc --noEmit` → schoon.
- `npx next build` → slaagt, `/risico` bundled.

## [Unreleased] - 2026-04-24 · Rebalance Quantity Engine

### Added
- [`src/lib/analytics/rebalance/rebalance-quantity.ts`](src/lib/analytics/rebalance/rebalance-quantity.ts) — pure `computeRebalanceQuantity(input)` functie die per positie het concrete afbouwplan berekent:
  - `excessValue = max(0, currentValue - targetWeight × totalPortfolioValue)`
  - `sharesToSell = floor(excessValue / currentPrice)` (of `round(4)` bij fractional shares)
  - `amountToSell = sharesToSell × currentPrice`
  - `postSellWeight = ((currentValue - amountToSell) / totalPortfolioValue) × 100`
  - NL `actionLabel` mapping van `RebalanceAction`: `NO_ACTION → "geen actie"`, `TRIM_LIGHT → "licht afbouwen"`, `TRIM_HEAVY → "stevig afbouwen"`, `RECONSIDER → "heroverwegen"`.
  - `RECONSIDER` plant afbouw van de volledige positie, niet alleen de excess.
  - Reason-builder met pluralisatie ("1 aandeel" vs "meerdere aandelen"), fractional units ("stuks") en specifieke meldingen wanneer excess < 1 aandeel of koers ontbreekt.
  - Confidence: `HIGH` bij volle data, `MEDIUM` bij last-known-koers of classifier-confidence < 0.5, `LOW` bij ontbrekende koers.
  - `sharesToSell` nooit negatief, `targetWeight` geclampt naar [0..1], totalValue=0 geeft geen crash (alle weights 0).
- [`src/lib/analytics/rebalance/index.ts`](src/lib/analytics/rebalance/index.ts) — barrel met publieke API.
- [`src/lib/analytics/rebalance/rebalance-quantity.test.ts`](src/lib/analytics/rebalance/rebalance-quantity.test.ts) — 21 cases: het spec-voorbeeld (RHM, 1 aandeel bij €1750 excess €2266), alle NL action labels, RECONSIDER volledige afbouw, ontbrekende koers + lastKnownPrice fallback, koers ≤ 0, sharesToSell-niet-negatief, excess < 1 aandeel, fractional-shares mode, totalValue=0, targetWeight clamping, NaN sanitisatie, confidence-tiers, enkelvoud/meervoud pluralisatie.

### Changed
- [`src/types/rebalance.ts`](src/types/rebalance.ts):
  - Nieuwe types `RebalanceActionLabel` (NL string union), `RebalanceQuantityConfidence` (HIGH/MEDIUM/LOW), `RebalanceQuantityPlan` (volledige output-shape met `symbol`, `actionLabel`, `currentWeight`, `targetWeight`, `currentValue`, `targetValue`, `excessValue`, `currentPrice`, `sharesToSell`, `amountToSell`, `postSellWeight`, `reason`, `confidence`, `warnings`). Percentages zijn 0..100 conform voorbeeld-spec.
  - `RebalanceRecommendation` krijgt optioneel `quantityPlan?: RebalanceQuantityPlan` veld.
- [`src/lib/analytics/rebalance-engine/engine.ts`](src/lib/analytics/rebalance-engine/engine.ts) — `recommendFor` vult nu automatisch `quantityPlan` via `computeRebalanceQuantity` met `marketValueBase` als currentValue, `unitPriceBase` (afgeleid uit `valuation.marketValueBase / quantity`) als currentPrice, en `factor?.confidence` als classifier-hint. Target weight komt uit de engine-beslissing (dus geconsolideerd met de bestaande concentratie-classifier + policy-overrides).
- [`src/lib/analytics/index.ts`](src/lib/analytics/index.ts) — re-export van `./rebalance`.

### Design-regels
- **Een afbouw-engine, geen koop-engine**: deze module berekent alleen verkoopvolumes. Negatieve excess (positie onder target) produceert `sharesToSell=0`. Koop-volumes horen bij de allocation-engine; we kruisen de scope niet.
- **Floor-by-default**: brokers (DEGIRO, IBKR op standaard-accounts) ondersteunen geen fractional shares. Default is `Math.floor` zodat gegenereerde orders uitvoerbaar zijn. Callers die bij DEGIRO Fractional of Trading 212 zitten zetten `allowFractionalShares: true`.
- **Geen verzonnen quantities**: zonder koers → `sharesToSell = 0`, `amountToSell = 0`, `currentPrice = null`, warning in `warnings[]`. De UI moet dat als LOW confidence tonen (geen knop "Verkoop 0 stuks").
- **RECONSIDER = volledige afbouw**: de bestaande engine markeert `RECONSIDER` als "heroverweeg de thesis" (target weight 0). De quantity engine concretiseert dat door de hele positie als af-te-bouwen te berekenen. Callers die alleen de excess willen tonen kunnen 't zelf filteren — maar de consistentie tussen engine en quantity is zo behouden.
- **Percentages 0..100 in output** (niet fracties 0..1) omdat dit user-facing is. Interne engines blijven op fracties werken — conversie gebeurt in de quantity-engine.
- **Niet-invasief voor bestaande engines**: `quantityPlan` is een *optioneel* veld op `RebalanceRecommendation`. De 13 bestaande rebalance-engine tests blijven unchanged — ze checken de hoofdvelden (action, weight, reasons). De nieuwe quantity-logica wordt apart getest.

### Validatie
- `npm test` → **513/513 tests groen** (+21 nieuwe quantity-tests).
- `npx tsc --noEmit` → schoon.
- `npx next build` → slaagt.

### Aannassen
- **Unit-prijs komt uit `valuation.marketValueBase / holding.quantity`**. Dat is de post-FX prijs per share in base currency, exact zoals de bestaande engine 'm al gebruikt voor `deltaShares`. Dit houdt FX-conversie consistent met de rest van de stack.
- **Target weight uit de bestaande rebalance-engine output** — die leunt op `thresholds.maxPositionWeight` (uit `PolicySettings` of default). In een volgende ronde kan de quantity-engine ook direct uit `resolvePositionLimitByAssetType` (policy-engine) lezen voor instrument-type-specifieke caps, maar dat vraagt integration-werk in `buildRebalancePlan` dat we bewust uitstellen.
- **`HIGH` confidence-drempel**: classifier-confidence ≥ 0.5. Lager → MEDIUM. Reden: bij lage coverage is de target-weight (die uit factor-informed rebalance regels komt) minder betrouwbaar, dus moet de UI dat laten zien.
- **Severity-logica blijft in de bestaande rebalance-engine**: de quantity-engine doet geen eigen classificatie van "hoe erg" de overschrijding is — dat is al afgehandeld door `concentration-classifier` + `deriveAction`. De quantity-engine vertaalt de actie alleen naar concrete stuks.
- **Fractional-shares-mode**: minimal-invasive als input-flag i.p.v. een nieuwe `PolicySettings`-veld. Callers geven 'm expliciet mee bij de `computeRebalanceQuantity` call. Wanneer we later user-instellingen willen persistent maken, kan een `PolicySettings.allowFractionalShares` boolean worden toegevoegd en doorgezet door `buildRebalancePlan`.

## [Unreleased] - 2026-04-24 · Portfolio Policy Engine

### Added
- [`src/lib/analytics/policy-engine/types.ts`](src/lib/analytics/policy-engine/types.ts) — `InstrumentRiskLevel` (LOW/MODERATE/ELEVATED/HIGH), `ViolationSeverity` (ok/minor/major/critical), `PositionLimit` (allowedMaxWeight + basis + reason), `PolicyViolation` (holdingId, ticker, instrumentType, currentWeight, allowedMaxWeight, excessWeight, violationSeverity, policyReason, riskLevel, notes), `PolicyReport` (totalValue, violations, counts per severity, overallSeverity), `PolicyContext` (overrides + userMaxSinglePositionWeight). `DEFAULT_LIMITS_BY_TYPE` tabel en `RISK_ADJUSTMENT_MULTIPLIER` exporterend zodat UI + engines dezelfde constanten consumeren.
- [`src/lib/analytics/policy-engine/classify-risk.ts`](src/lib/analytics/policy-engine/classify-risk.ts) — `classifyInstrumentRisk({ holding, classification })` pure functie. Beslissingsvolgorde: LEVERAGED/CRYPTO/isSpeculative → HIGH; volatility ≥ 0.40 → HIGH; 0.30-0.40 → ELEVATED; CASH/BOND/broad-market → LOW; single stock → MODERATE; sector/commodity → ELEVATED; theme → HIGH; income/factor → MODERATE; unknown → ELEVATED (voorzichtige fallback). Retourneert level + NL rationale.
- [`src/lib/analytics/policy-engine/position-limits.ts`](src/lib/analytics/policy-engine/position-limits.ts) — `resolvePositionLimitByAssetType({ classification, risk, context? })` pure functie. Stapt door: default cap → per-type override → globale tightening → risk-adjustment (HIGH ×0.5, ELEVATED ×0.75) → user single-stock hard-cap (mag alleen verlagen). `null` override = cap uit; CASH altijd Infinity. Retourneert `PositionLimit` met basis + reason voor UI-traceability.
- [`src/lib/analytics/policy-engine/violations.ts`](src/lib/analytics/policy-engine/violations.ts) — `detectPolicyViolations({ holdings, totalValue, context? })` orchestrator die risk + limit per positie berekent en een `PolicyReport` oplevert. Severity-ladder is *relatief* aan de cap (ratio current/cap): ok (≤1), minor (≤1.25), major (≤2), critical (>2). Defensief tegen `totalValue <= 0` (alle weights 0 → ok).
- [`src/lib/analytics/policy-engine/index.ts`](src/lib/analytics/policy-engine/index.ts) — barrel met publieke API.
- Tests:
  - [`classify-risk.test.ts`](src/lib/analytics/policy-engine/classify-risk.test.ts) — 15 cases: leveraged/crypto/speculative/volatility-drempels/cash/bond/broad-market/single stock baseline/sector & commodity/theme/income/factor/unknown/NaN-volatility.
  - [`position-limits.test.ts`](src/lib/analytics/policy-engine/position-limits.test.ts) — 18 cases: defaults per type incl. LEVERAGED met HIGH-halvering, CASH=Infinity, UNKNOWN=5%, risk-adjustment HIGH/ELEVATED/LOW, user-overrides (per-type incl. null=cap uit, globalTightening, userMaxSinglePositionWeight mag alleen verlagen en raakt ETFs niet), sanity-asserts op DEFAULT_LIMITS_BY_TYPE volgorde (broad > sector > theme, leveraged < crypto < single stock).
  - [`violations.test.ts`](src/lib/analytics/policy-engine/violations.test.ts) — 16 cases: severity-ladder op alle grenzen, differentiatie per type (broad-market 35%→ok, sector 20%→major na ELEVATED-adjust, JEPI 22%→ok, TQQQ 4%→critical), cash altijd ok (Infinity cap), report-counts + overallSeverity, policyReason vermeldt %pt-over-cap, notes bevatten risk + limit rationale, lege portefeuille + totalValue=0 geen crash, user-context overrides voeden door tot severity.

### Changed
- [`src/lib/analytics/index.ts`](src/lib/analytics/index.ts) — re-export van `./policy-engine`.

### Design-regels
- **Strikt data-driven**: caps en risk-thresholds zijn expliciete tabellen (`DEFAULT_LIMITS_BY_TYPE`, `RISK_ADJUSTMENT_MULTIPLIER`). Geen "magic numbers" in code — elke waarde heeft een comment met de rationale.
- **User kan strenger, niet losser** (per design): `userMaxSinglePositionWeight` wordt alleen toegepast als 'ie *lager* is dan de huidige cap. Dit voorkomt dat een naïeve override concentration-risico verstopt.
- **Severity is relatief, niet absoluut**: een 30% sector-ETF (ratio 2× cap) en een 12% single stock (ratio 1.2× cap) vragen om andere interventies. De relatieve ladder maakt dat expliciet.
- **Engine-ready, niet-invasief**: de `PolicyReport` output is een drop-in voor risk- en rebalance-engines (elke `PolicyViolation` heeft ticker, weight, excess, severity, reason en riskLevel). De bestaande engines zijn *niet* gewijzigd; dat is een volgende ronde.
- **Pure functies**: geen I/O, geen async. Geen verzonnen data — elk veld in `PolicyViolation` is herleidbaar tot holding-input of een expliciete regel in `classifyInstrumentRisk` / `resolvePositionLimitByAssetType`.
- **Type-safety over praktisch**: `PolicyContext.overrides.limitsByType` accepteert `number | null | undefined` per type. `null` is expliciet "cap uit"; `undefined` betekent "gebruik default". Callers kunnen niet per ongeluk de verkeerde semantiek oppakken.

### Aannames
- **Default caps (`DEFAULT_LIMITS_BY_TYPE`)** zijn gebaseerd op algemene langetermijn-principes (Kelly-diversificatie voor single stocks = 10%; IWDA als "ruggengraat" tot 40%; leveraged compounding-drift = 3%). Dit zijn richtlijnen, niet bestuursregels — productie-users kunnen alles overrulen via `PolicyContext`.
- **Relatieve severity-drempels**: 1.0× / 1.25× / 2× gekozen om zowel licht-boven-cap (minor) als fors-boven-cap (major) duidelijk onderscheid te geven. 2× als kritische grens komt overeen met "echt onacceptabel, altijd rebalance".
- **Volatility-drempels** (0.30 / 0.40) komen uit de factor-engine baseline waar ze ook worden gebruikt. Blijven consistent met LowVol-scoring.
- **Geen sector/regio caps** in deze ronde: `PolicySettings.maxSectorWeight` en `maxRegionWeight` worden door de bestaande rebalance-engine al gelezen. Deze policy-engine focust op *per-positie* caps, niet op aggregaat-concentratie. Een toekomstige uitbreiding kan beide combineren in één portfolio-brede `PolicyReport`.
- **Engines blijven ongewijzigd**: `PolicyReport` is leverbaar, risk/rebalance/allocation wirings zijn een aparte taak. Door dit expliciet niet mee te nemen blijven de 443 bestaande tests unchanged én houden we de review-scope kort.

### Validatie
- `npm test` → **492/492 tests groen** (+49 nieuwe policy-engine tests).
- `npx tsc --noEmit` → schoon.
- `npx next build` → slaagt.

## [Unreleased] - 2026-04-24 · Instrument Classification

### Added
- [`src/lib/analytics/instruments/types.ts`](src/lib/analytics/instruments/types.ts) — `InstrumentType` string-literal union (`SINGLE_STOCK`, `BROAD_MARKET_ETF`, `SECTOR_ETF`, `FACTOR_ETF`, `THEME_ETF`, `INCOME_ETF`, `BOND_ETF`, `COMMODITY_ETF`, `CRYPTO`, `CASH`, `LEVERAGED_OR_INVERSE`, `UNKNOWN_ETF`, `UNKNOWN`), `IncomeStrategy` (`covered-call` / `high-dividend` / `bond-heavy` / `other`), `ClassificationConfidence` (HIGH/MEDIUM/LOW), `InstrumentMetadata` (isBroadMarket, sectorFocus, isIncomeFocused, incomeStrategy, isSpeculative, supportsFactorScoring, eligibleForWinnerRule), `InstrumentClassification`, `defaultMetadata()` helper.
- [`src/lib/analytics/instruments/etf-lookthrough.ts`](src/lib/analytics/instruments/etf-lookthrough.ts) — pure naam-pattern classifier voor ETFs. Herkent leveraged/inverse (voorrang), covered-call (JEPI/QYLD/XYLD + keywords), bond + income bond, high-dividend (SCHD + keywords), commodity (goud/zilver/olie), broad-market (S&P 500 / MSCI World / FTSE All-World / IWDA / VWCE / VUSA / CSPX / ...), sector-ETF (Technology/Healthcare/Financials/Energy/Utilities/Real Estate/Consumer/Industrials/Materials/Communication Services, waaronder Biotech als GICS sub-sector van Healthcare), factor-ETF (Quality/Momentum/Value/MinVol/Small-Mid Cap), theme-ETF (AI/Robotics/Cybersecurity/Cannabis/Space/Blockchain/Battery/Solar/ESG/Sustainability). Fallback: Yahoo-sector uit enrichment als hint, anders `UNKNOWN_ETF`.
- [`src/lib/analytics/instruments/classifier.ts`](src/lib/analytics/instruments/classifier.ts) — pure `classifyInstrument({ holding, enrichment? })` die beslissingsvolgorde toepast: CASH (assetClass of keyword "money market" / "treasury bill") → CRYPTO → ETF/mutualfund lookthrough → SINGLE_STOCK (EQUITY) → REIT (als SINGLE_STOCK met real-estate focus + income) → BOND (als BOND_ETF voor engines) → COMMODITY (als COMMODITY_ETF) → UNKNOWN. Metadata per subtype reproduceerbaar via `buildEtfMetadata` — `eligibleForWinnerRule` is `false` voor sector/theme/income/leveraged (concentration-risico) en `true` voor broad-market, factor en single stocks. `supportsFactorScoring` is alleen `true` voor single stocks en REITs. `classifyInstruments(items[])` bulk-helper.
- [`src/lib/analytics/instruments/index.ts`](src/lib/analytics/instruments/index.ts) — barrel met publieke API.
- Tests:
  - [`src/lib/analytics/instruments/etf-lookthrough.test.ts`](src/lib/analytics/instruments/etf-lookthrough.test.ts) — 19 cases: leveraged-voorrang, covered-call (expliciet + ticker-match + specificiteit vs high-dividend), bond (aggregate/treasury + bond-income → bond-heavy), high-dividend, broad-market (IWDA/VWCE/VUSA + "S&P 500 Technology" → sector-ETF), sector-mapping (10 sectors), factor-ETF, theme-ETF, commodity, fallback naar Yahoo-sector als hint, biotech explicitly als Healthcare sub-sector.
  - [`src/lib/analytics/instruments/classifier.test.ts`](src/lib/analytics/instruments/classifier.test.ts) — 16 cases: single stocks met/zonder enrichment, IWDA → broad-market, JEPI → covered-call, XLK → sector-ETF, AGG → bond-ETF, BOTZ → theme+speculatief, TQQQ → leveraged, IBB → Healthcare sector (niet theme), unknown-ETF met LOW confidence, CASH + money-market keyword, CRYPTO speculatief, REIT als SINGLE_STOCK + income, BOND + COMMODITY fallbacks, UNKNOWN fallback, bulk-helper.

### Changed
- [`src/types/portfolio.ts`](src/types/portfolio.ts) — `Holding` krijgt een optioneel `classification?: HoldingClassificationMeta`-veld. De shape is bewust forward-declared (instrumentType als string) zodat types geen cycle hebben met de analytics-laag; canonieke definitie blijft in `@/lib/analytics/instruments/types`.
- [`src/lib/analytics/index.ts`](src/lib/analytics/index.ts) — re-export van `./instruments` zodat `classifyInstrument`, `InstrumentType` etc. direct beschikbaar zijn via `@/lib/analytics`.

### Design-regels
- **Geen verzonnen data**: elke classificatie leunt op (a) een exacte enum-match uit enrichment's `quoteType`, (b) een regex-match op naam, of (c) een documenteerbare fallback. Onbekend → `UNKNOWN_ETF` of `UNKNOWN` met `confidence: "LOW"` — nooit een gok die als HIGH presenteert.
- **Specificiteit wint**: leveraged heeft voorrang op sector (een "3x Technology" is eerst speculatief, dan pas sector). Covered-call voor high-dividend. Biotech als Healthcare sector (GICS), niet theme.
- **Metadata is engine-klaar**: risk-engine kan `isSpeculative` en `isBroadMarket` direct lezen voor concentratie-scoring. Rebalance-engine kan `eligibleForWinnerRule` gebruiken om sector/theme/covered-call ETFs *niet* als winners-to-run te behandelen. Allocation/policy-engine kan `supportsFactorScoring` gebruiken om factor-drempels alleen op single stocks toe te passen. Deze wiring is **nog niet gedaan** in de engines — de data is beschikbaar, de engines blijven ongewijzigd tot er expliciete integratie-eisen komen.
- **Pure functies**: geen I/O, geen async. Classificeren is synchroon zodra enrichment is geladen. Cache-strategie is dus onnodig; hergebruik volgt uit de enrichment-cache die al bestaat.
- **Confidence-drempels**:
  - `HIGH`: exact quoteType-match én naam bevestigt (bv. EQUITY-ticker met bekende sector, of ETF met duidelijke broad-market keyword).
  - `MEDIUM`: assetClass bekend maar geen enrichment, of ETF-type duidelijk uit naam maar geen Yahoo-provenance.
  - `LOW`: `UNKNOWN` of `UNKNOWN_ETF` — callers moeten UI tonen dat de positie niet automatisch kan worden geëvalueerd.

### Validatie
- `npm test` → **443/443 tests groen** (+36 nieuwe).
- `npx tsc --noEmit` → schoon.
- `npx next build` → slaagt.

### Aannames
- **GICS-taxonomie** wordt gevolgd voor sector-toekenning (Biotech onder Healthcare, REITs als Real Estate sector wanneer in een ETF, individuele REIT-aandelen blijven SINGLE_STOCK).
- **Covered-call ETF-detectie** gebruikt naam-patronen en bekende tickers (JEPI/JEPQ/QYLD/XYLD/RYLD/YMAX/QDTE). Nieuwe producten landen initieel in INCOME_ETF (high-dividend) zolang ze geen matching keyword/ticker hebben — dat is acceptabel want de metadata (`isIncomeFocused`, `eligibleForWinnerRule=false`) is identiek.
- **Leveraged/inverse** krijgt voorrang op elke andere classificatie omdat het gedrag (geen winner-rule, speculatief, capped factor-inzicht) domineert over sector/theme/broad-market. Dat voorkomt dat een "3x Technology Bull" als gewone Tech-ETF wordt getrimd.
- **Engines blijven ongewijzigd**: deze ronde levert alleen de classifier + metadata. Integratie in risk/policy/rebalance is een vervolgtaak — expliciet houden zodat bestaande testen en gedrag niet verschuift.
- **`UNKNOWN`-volume**: voor een zuivere DEGIRO-import met ISIN's + Yahoo enrichment is `UNKNOWN` zeldzaam. Voor portefeuilles met exotische producten (SPACs, private markets, niet-Yahoo-tickers) is `UNKNOWN` verwacht gedrag. UI moet dit als LOW-confidence tonen.

## [Unreleased] - 2026-04-24 · Data Quality & Enrichment

### Added
- [`src/lib/data/instrument-enrichment.ts`](src/lib/data/instrument-enrichment.ts) — nieuwe laag die ticker+ISIN (+ optioneel naam) verrijkt naar een volledig `EnrichedInstrument`-record (normalizedTicker, assetClass, sector, industry, region, country, currency, exchange, confidence, sources, warnings). Gebruikt Yahoo's `quoteSummary` met `assetProfile` / `price` / `fundProfile` modules. 6u TTL-cache via `marketDataCache`, defensief bij throws/timeouts.
- [`src/lib/analytics/data-quality.ts`](src/lib/analytics/data-quality.ts) — pure analytics: `assessHoldingQuality` per positie + `assessPortfolioQuality` weight-gewogen op portfolio. Levert `HoldingQuality` (severity ok/minor/major, missing fields, notes) en `PortfolioQualityReport` (overallScore, unknown-sector/region/assetClass weight, distributionBySource). Helpers: `SEVERITY_LABELS`, `MISSING_FIELD_LABELS`, `portfolioQualityVerdict`.
- [`src/components/common/data-quality-panel.tsx`](src/components/common/data-quality-panel.tsx) — presentationele UI: verdict-badge, metrics-grid, sorteerbare holdings-tabel (major eerst, dan weight desc), provenance-bar met bron-verdeling. Geen businesslogica; consumeert een pre-built `PortfolioQualityReport`.
- [`src/app/(app)/portfolio/page.tsx`](src/app/(app)/portfolio/page.tsx) — wires de enrichment-call + quality-assessment server-side, rendert `<DataQualityPanel>` in een nieuwe "Data-kwaliteit" sectie.
- Tests:
  - [`src/lib/data/instrument-enrichment.test.ts`](src/lib/data/instrument-enrichment.test.ts) — 7 cases: EQUITY happy path, ETF-classificatie, volledige Yahoo-miss fallback, naam-heuristiek voor assetClass, GBp→GBP normalisatie, cache-gedrag, profile-throw met graceful degrade.
  - [`src/lib/analytics/data-quality.test.ts`](src/lib/analytics/data-quality.test.ts) — 13 cases: volledig record → ok, EQUITY zonder sector → notitie, ETF zonder sector = OK (verwacht), geen enrichment → warning + lage completeness, weight clamping, severity thresholds, portfolio weight-weighted overallScore, unknown-sector alleen voor EQUITY, distributionBySource telt over alle holdings, lege portfolio geen crash, verdict-labels, NL severity-labels.
  - Uitgebreid [`src/lib/data/symbol-resolver.test.ts`](src/lib/data/symbol-resolver.test.ts) met 15 extra cases voor `resolveYahooMatch`, `detectAssetClassFromQuoteType`, `detectAssetClassFromName`, `detectRegionFromExchange`, `normalizeTickerForExchange`.

### Changed
- [`src/lib/data/symbol-resolver.ts`](src/lib/data/symbol-resolver.ts) — uitgebreid van "ticker → symbol-string" naar een volwaardige resolver:
  - Nieuwe publieke API: `resolveYahooMatch(ticker, isin?)` → `ResolvedSymbol` met `symbol`, `exchange`, `quoteType`, `shortName`, `matched`-flag.
  - Back-compat: `resolveYahooSymbol` blijft bestaan als thin wrapper.
  - Nieuwe pure helpers: `detectAssetClassFromQuoteType` (Yahoo quoteType → `AssetClass`), `detectAssetClassFromName` (naam-heuristiek), `detectRegionFromExchange` (beurs-code → region), `normalizeTickerForExchange` (voegt .AS / .DE / .L / … suffix toe). Allemaal getest.

### Design-regels
- **Geen verzonnen data**: elke field is óf provider-backed, óf afgeleid via expliciete heuristiek. Missing → `null`. Confidence = fractie gevulde velden; callers bepalen drempels.
- **ETFs worden gedetecteerd, niet geraden**: `quoteType === "ETF"`, `MUTUALFUND`, of `fundProfile` aanwezig → `ETF`. Fallback: UCITS/TRACKER/INDEX FUND keyword in naam. Sector/industry ontbrekend voor ETFs telt **niet** als "missing" — dat is verwacht gedrag voor fondsen.
- **Multi-source provenance**: elke `EnrichedInstrument` documenteert welke bronnen hebben bijgedragen (`yahoo-search`, `yahoo-profile`, `ticker-heuristic`, `input`) zodat de UI in de Provenance-bar audit-context kan tonen.
- **Geen businesslogica in UI**: `DataQualityPanel` neemt een kant-en-klaar `PortfolioQualityReport` en rendert opmaak + NL-labels. Bouwen van het report gebeurt server-side in de page.
- **Weight-weging op portfolio-niveau**: een onbekende sector op een 0,3%-positie is minder erg dan op een 25%-positie. `overallScore`, `unknownSectorWeight` etc. zijn allemaal weight-weighted.
- **Defensief zonder stilzwijgen**: bij Yahoo-throw geen crash — fallback naar search-data + warning in `warnings[]`. UI toont lagere confidence zodat de user weet dat data incompleet is.

### Validatie
- `npm test` → **400/400 tests groen** (+37 nieuwe).
- `npx tsc --noEmit` → schoon.
- `npx next build` → slaagt.

### Aannames
- Yahoo's `quoteSummary` met modules `assetProfile/summaryProfile/price/fundProfile` is de canonieke bron. Bij provider-wissel (Alpha Vantage, Finnhub) moet elk die vier velden in hetzelfde shape mappen via dezelfde interface.
- Cache TTL van 6 uur: sector/industrie/country wijzigen zelden en een miss kost weinig.
- Enrichment gebeurt alleen wanneer `MARKET_DATA_PROVIDER=yahoo`. Voor `stub`/`none` zou een vaste ticker → enrichment-lookup tabel nog toegevoegd kunnen worden (niet in deze ronde, niet in scope).
- `AssetClass` enum wordt niet uitgebreid — `ETF`, `EQUITY`, `OTHER` volstaan. `MUTUALFUND` valt onder `ETF` (beide gepoolde fondsen, functioneel equivalent voor onze scoring).

## [Unreleased] - 2026-04-24 · Auth + resilience + module-sweep

### Added
- [`src/lib/auth/session.ts`](src/lib/auth/session.ts) — auth resolver met 3 paden: signed HMAC-cookie (`biq_session`, via `BIQ_SESSION_SECRET`), `x-beleggeriq-user` dev-header (non-prod), `DEMO_USER_EMAIL` fallback (opt-in via `BIQ_ALLOW_DEMO_AUTH=true`). Inclusief `signSessionCookie` / `verifySessionCookie` (timing-safe HMAC-SHA256) en `matchesSessionUser` authorization-helper.
- [`src/lib/auth/server.ts`](src/lib/auth/server.ts) — `resolveUserFromServer()` voor RSC pages/layouts; wrapt Next.js `cookies()` + `headers()`.
- [`src/lib/auth/session.test.ts`](src/lib/auth/session.test.ts) — 17 tests: round-trip signing, verkeerd secret, getamperd payload, dev-header pad (incl. productie-block), demo-fallback met opt-in, cross-user authorization.
- [`src/lib/data/resilience.ts`](src/lib/data/resilience.ts) — `withTimeout`, `withRetry` (exponential backoff + jitter), `fetchWithResilience`, `TimeoutError`, `isTransientError` (TimeoutError / netwerk-glitches / 5xx = transient; 4xx = permanent).
- [`src/lib/data/resilience.test.ts`](src/lib/data/resilience.test.ts) — 13 tests: timeout fire + rejection propagatie, transient classification, retry-with-backoff, niet-transient early exit, custom classifier.
- [`src/lib/analytics/enrichment.test.ts`](src/lib/analytics/enrichment.test.ts) — 9 tests tegen de deterministische stub-provider: empty input, FX identity + cross-currency, dedup van tickers, optioneel fundamentals/factors, automatisch fundamentals bij includeFactorScores, bounds 0..100 op composites, geen NaN in valuations.
- Nieuwe repository-methode [`portfolioRepository.findOwnerEmailById`](src/lib/data/portfolio-repository.ts) — enkel-call ownership-check voor de auth-guards in API routes en server actions.

### Changed
- **Auth wiring** — alle entry points gebruiken nu `resolveUser` / `resolveUserFromServer`:
  - API routes: [`/api/snapshots/portfolio`](src/app/api/snapshots/portfolio/route.ts) (authz op `portfolioId`, expliciet verboden `userEmail` in body), [`/api/snapshots/factors`](src/app/api/snapshots/factors/route.ts), [`/api/chat`](src/app/api/chat/route.ts).
  - Server pages: [`/dashboard`](src/app/(app)/dashboard/page.tsx), [`/portfolio`](src/app/(app)/portfolio/page.tsx), [`/risico`](src/app/(app)/risico/page.tsx), [`/chat`](src/app/(app)/chat/page.tsx), [`/maandbeslissing`](src/app/(app)/maandbeslissing/page.tsx), [`/strategy-lab`](src/app/(app)/strategy-lab/page.tsx) — elke page rendert een `ShieldAlert`-EmptyState bij 401/403.
  - Server actions: [`portfolio/actions`](src/app/(app)/portfolio/actions.ts) (DEGIRO import controleert ownership op `portfolioId`), [`strategy-lab/actions`](src/app/(app)/strategy-lab/actions.ts), [`screener/actions`](src/app/(app)/screener/actions.ts) — de sessie-user is altijd de owner; cross-user writes zijn structureel onmogelijk.
- **Resilience wiring** — alle provider calls (`quotes`, `fx`, `fundamentals`, `history`) draaien nu via `withRetry(withTimeout(...))`: 2 retries met exponential backoff (150-200ms basis, 1-1.5s max) en per-call timeouts (5s quotes/fx, 8s fundamentals, 12s history). Transient errors retryen, 4xx en domain errors gaan meteen door.
- Structured logging uitgebreid naar [`enrichment.ts`](src/lib/analytics/enrichment.ts), [`snapshot-service.ts`](src/lib/services/snapshot-service.ts), [`strategy-lab/actions.ts`](src/app/(app)/strategy-lab/actions.ts), [`screener/actions.ts`](src/app/(app)/screener/actions.ts) — alle ad-hoc `console.warn('[mod] msg', err)` regels vervangen door `log.<level>(scope, msg, fields)`.
- [`.env.example`](.env.example) — documenteert `BIQ_SESSION_SECRET` (≥ 32 tekens) en `BIQ_ALLOW_DEMO_AUTH` opt-in-flag.
- [`src/lib/navigation.ts`](src/lib/navigation.ts) — `NavItem.href` is nu typed als `Route` (Next.js typed-routes) zodat sidebar-links type-safe zijn.

### Fixed (12 pre-existing testfouten gefixt tijdens module-sweep)
- [`lib/http/validate.ts`](src/lib/http/validate.ts) — `toFiniteNumber([])` retourneerde 0 i.p.v. null (Array heeft `toString() === ""`). Arrays en `"[object Object]"`-strings zijn expliciet gefilterd.
- [`lib/analytics/factors/shared.ts`](src/lib/analytics/factors/shared.ts) — `buildSignal` rondt de score nu af (voorkomt IEEE-754 ruis zoals `75.00000000000001`). `scoreFromSignals` sorteert rationales op `weight × |score - 50|` zodat hoog-gewogen drivers (bv. ROIC in quality) altijd surfacen.
- [`lib/analytics/rebalance-engine/concentration-classifier.ts`](src/lib/analytics/rebalance-engine/concentration-classifier.ts) — quality-ondergrens verruimd naar `< 60`, momentum naar `< 50` zodat posities met echt gemiddelde signalen (55/45/55) niet onterecht als HEALTHY landen.
- [`lib/analytics/rebalance-engine/engine.ts`](src/lib/analytics/rebalance-engine/engine.ts) — `FRAGILE + weight > fragileHeavyMultiplier × cap` produceert nu `TRIM_HEAVY` vóór `RECONSIDER` wordt overwogen. Een 20%-positie krijgt een rightsize naar 7,5% i.p.v. een "sell all"-signaal.
- [`lib/parsers/degiro.ts`](src/lib/parsers/degiro.ts) — NL-duizendtalpatroon (`1.000`) wordt nu correct als 1000 geparsed dankzij een `\d{1,3}\.\d{3}`-heuristiek.
- [`lib/ai/chat.ts`](src/lib/ai/chat.ts) — intent-regex voor `portfolio_risks` herkent ook het Engelse meervoud "risks".
- [`lib/ai/explainers.ts`](src/lib/ai/explainers.ts) — HEALTHY-winner narrative gebruikt geen woord "verkopen" meer (test guardrail).
- [`lib/analytics/backtest/engine.ts`](src/lib/analytics/backtest/engine.ts) — `finalValue` gebruikt de onafgeronde eindwaarde zodat kleine commission-effecten zichtbaar blijven; points.value blijft afgerond voor UI.
- [`types/backtest.ts`](src/types/backtest.ts) — `tradesCount` is required (engine zet hem altijd). Test dependency op `toBeGreaterThanOrEqual(noCost.tradesCount)` compileert weer.
- [`lib/analytics/valuation.test.ts`](src/lib/analytics/valuation.test.ts) — `makeHolding`-factory gebruikt `{...base, ...overrides}` i.p.v. `??`, zodat tests expliciet `null` kunnen forceren op `currentPrice` en `sector`.

### Fixed (11 TypeScript errors na auth wiring)
- `history-charts.tsx` Recharts Tooltip formatter → narrowing via `typeof value === "number"`.
- `chat.ts` — `HoldingValuation` geïmporteerd uit `@/lib/analytics/valuation` (juiste bron).
- `momentum.ts`, `degiro.ts` — `Object is possibly undefined` guards toegevoegd.
- `snapshot.test.ts` — `AllocationPlan`-fixture volgt nu de juiste shape (`budget` + `cashAvailable` + `monthlyContribution`, géén `totalBudget`/`reservedCash`).
- `portfolio-repository.ts` / `snapshot-repository.ts` — Prisma JSON-bridges krijgen `as unknown as X` om de strictere Prisma JsonValue-typing te passeren.

### Fixed (ESLint/build errors voor productie-build)
- Vijf bestanden met kapotte apostrofe in JSX-tekst (`'s`) — alle vervangen door `&apos;s`.
- `allocation-engine/engine.ts` — `let residual` → `const residual` (prefer-const).

### Design regels
- **Auth is een gatekeeper, geen toegang** — de resolver retourneert een typed `AuthResolution`; elke entry point beslist zelf hoe hij omgaat met 401/403 (page → EmptyState, API → JSON-error, action → error-result). Geen silent fallthroughs.
- **Demo-auth is opt-in per deployment** — productie zet `BIQ_ALLOW_DEMO_AUTH` niet, dus een geforgeteen session-cookie is de enige weg. In dev/staging mag het wel; scheelt een login-flow tijdens bouw.
- **Cross-user requests zijn geblokkeerd bij de bron**: `userEmail` uit de body wordt expliciet afgewezen op `/api/snapshots/portfolio`; DEGIRO import controleert eigenaarschap op `portfolioId`; Strategy Lab laat alleen de sessie-user presets saven/deleten.
- **Resilience is per-call, niet globaal** — elke provider-call krijgt eigen timeout + retry-profiel. Snel bewegende endpoints (quote, fx) zijn korter getuned dan trage (history). Cache-layer blijft producerend; een throw in de producer wordt nog steeds door cache.ts correct opgeruimd.
- **Fix-the-root, not-the-test** — geen testfouten gedempt; elke failure is in productie-code rechtgezet. Waar test-fixtures verkeerd waren (bv. `??` vs spread in valuation.test.ts), is de fixture gerepareerd met een korte uitleg waarom.

### Aannames
- `BIQ_SESSION_SECRET` ≥ 32 bytes is de verantwoordelijkheid van de deployer — de resolver weigert de cookie pad als het secret ontbreekt of te kort is (403).
- `DEMO_USER_EMAIL` zonder `BIQ_ALLOW_DEMO_AUTH=true` doet niets. Een ontwikkelaar die lokaal werkt zet beide.
- De stub-provider is deterministisch, dus tests draaien zonder mocking tegen `quotes/fx/fundamentals/history`. Zodra er live providers landen, worden de tests van `enrichment.ts` mock-based gemaakt.
- Prisma-query retries staan expliciet *niet* rond DB-calls — het connection-pool van Prisma doet dat zelf op infra-niveau.

### Validatie
- `npm test` → **331/331 tests groen** (40 test-bestanden).
- `npx tsc --noEmit` → **schoon**, geen errors.
- `npx next build` → **succesvol**, alle 9 routes compileren, server bundle ~100KB shared.

## [Unreleased] - 2026-04-24 · Hardening & validatie

### Added
- [`src/lib/http/validate.ts`](src/lib/http/validate.ts) — lichtgewicht runtime-validator zonder externe dependency. Helpers: `safeJson`, `expectObject`, `parseString`, `parseStringArray`, `parseIsoDate`, `parseBoundedNumber`, `parseEnum`, `parseTickerStrict`, `toFiniteNumber`. Alle helpers retourneren een typed `ValidationResult<T>`.
- [`src/lib/http/errors.ts`](src/lib/http/errors.ts) — `jsonError(msg, status, code?)` en `jsonServerError(scope, err, msg)` voor uniforme `{ error, code? }` shape op alle API routes.
- [`src/lib/http/client.ts`](src/lib/http/client.ts) — client-safe `postJson<T>(url, body)` die response-body maximaal één keer parse't, netwerkfouten opvangt en een typed `ApiResult | ApiFailure` retourneert.
- [`src/lib/http/index.ts`](src/lib/http/index.ts) — server-only barrel (client componenten importeren `@/lib/http/client` direct; errors.ts leunt op `next/server`).
- [`src/lib/log.ts`](src/lib/log.ts) — gestructureerde logger met `{ scope, level, msg, ...fields }` output; `Error`-objecten worden gereduceerd tot `{ name, message }`.
- [`src/components/common/empty-chart.tsx`](src/components/common/empty-chart.tsx) — compacte placeholder voor chart-containers zonder data, matcht container-afmetingen.
- [`docs/HARDENING_AUDIT.md`](docs/HARDENING_AUDIT.md) — volledig auditrapport: type safety, runtime validatie, API routes, error handling, empty/loading states, provider resilience, test coverage, component structuur, import hygiene + resterende risico's per categorie.
- Nieuwe tests:
  - [`src/lib/http/validate.test.ts`](src/lib/http/validate.test.ts) — 12 suites voor elke helper (pattern, bounds, NaN→null, optional, fallback).
  - [`src/lib/log.test.ts`](src/lib/log.test.ts) — payload-shape + Error serialisatie.
  - [`src/lib/analytics/attention.test.ts`](src/lib/analytics/attention.test.ts) — priority-sortering, NO_ACTION/`low`-severity filter, limit, default message.
  - [`src/lib/analytics/allocation-engine/priority.test.ts`](src/lib/analytics/allocation-engine/priority.test.ts) — hard-blocks (cap + objective minRequirements), RISK_ON momentum boost, DEFENSIVE core-ETF boost, breakdown bounds.
  - [`src/lib/data/cache.test.ts`](src/lib/data/cache.test.ts) — extra cases voor inflight cleanup bij throw, shared rejected promise bij concurrent callers, `clear()` reset.
  - [`src/lib/data/market.test.ts`](src/lib/data/market.test.ts) — extra cases voor invalid date/ticker, endDate<startDate, unknown interval-fallback.

### Changed
- Alle 9 API routes (`/api/ai/explain`, `/api/chat`, `/api/market/*`, `/api/snapshots/*`) gebruiken nu de validator-pipeline (`safeJson` + `expectObject` + typed parsers) en retourneren `jsonError`/`jsonServerError`. Silent body-swallow vervangen door expliciete 400. `GET /api/market/quote` en `GET /api/market/history` valideren nu strict (max tickers, regex-tickers, strikte ISO-dates, `from<=to`, interval whitelist). `POST /api/snapshots/factors` is gecapped op 100 tickers.
- [`src/app/api/market/_shared.ts`](src/app/api/market/_shared.ts) leunt op `parseTickerStrict`; `parseTickers` retourneert nu een `ParsedTickers` resultaat (i.p.v. een array) zodat validatiefouten niet verdwijnen.
- [`src/app/(app)/chat/components/chat-room.tsx`](src/app/(app)/chat/components/chat-room.tsx) en [`src/app/(app)/dashboard/components/snapshot-button.tsx`](src/app/(app)/dashboard/components/snapshot-button.tsx) gebruiken `postJson` i.p.v. inline `fetch`.
- [`src/app/(app)/portfolio/components/import-degiro-dialog.tsx`](src/app/(app)/portfolio/components/import-degiro-dialog.tsx) — max-size 5MB en extension-guard toegevoegd op CSV upload (voorkomt dat een gigabyte- of non-text bestand de browser-tab blokkeert via `file.text()`).
- [`src/app/(app)/backtest/components/equity-chart.tsx`](src/app/(app)/backtest/components/equity-chart.tsx) gebruikt `EmptyChart`.
- [`src/lib/data/regime.ts`](src/lib/data/regime.ts) en [`src/lib/data/strategy-preset-repository.ts`](src/lib/data/strategy-preset-repository.ts) — lokale `toNumber` helpers vervangen door canonieke `toFiniteNumber` uit `@/lib/http/validate`. Eén bron voor NaN/Infinity/Decimal handling.
- Structured logging geïntroduceerd in: [`src/lib/data/quotes.ts`](src/lib/data/quotes.ts), [`src/lib/data/fx.ts`](src/lib/data/fx.ts), [`src/lib/data/history.ts`](src/lib/data/history.ts), [`src/lib/data/regime.ts`](src/lib/data/regime.ts). Raw `console.warn('[mod]', err)` vervangen door `log.warn(scope, msg, fields)`.

### Design regels
- **Runtime-validatie is ondubbelzinnig**: elke POST route decodeert via `safeJson → expectObject → parseX`. Bij elke fout valt de route op een 400 met een specifieke foutboodschap; nergens wordt een malformed body silently als `{}` geïnterpreteerd.
- **Eén error-shape**: `{ error: string, code?: string }` voor elke API route. Client helpers (`postJson`) mappen dit uniform naar `ApiFailure`. UI-componenten tonen direct `result.error`.
- **NaN is altijd null of een 400**: `toFiniteNumber` én `parseBoundedNumber` garanderen dat geen `NaN`/`Infinity` stroomafwaarts in berekeningen of DB-writes terechtkomt.
- **Geen zod in deze ronde**: bundle-overhead + onze inbound surface is klein. Helpers zijn trivial testbaar en pure TS; wél makkelijk te vervangen als schema-sharing met forms nodig wordt.
- **Server/client barrel split**: `@/lib/http/index.ts` is server-only (leunt op `next/server`). Client componenten importeren `@/lib/http/client` direct om geen server-bundle in de browser te krijgen.

### Aannames
- Authenticatie blijft in deze ronde de demo-user shortcut. De routes zijn gehard tegen malformed input maar nog niet tegen cross-user forgery; dat is een grotere auth-beslissing die separaat hoort.
- De stub-provider is deterministisch; tests kunnen hem zonder mock aanroepen. Zodra we op een live provider switchen, moeten we `AbortController` + timeout toevoegen — niet in scope nu.
- `MAX_TICKERS_PER_REQUEST = 50` (market routes) en `MAX_TICKERS_PER_RUN = 100` (factor snapshots) zijn conservatieve defaults; snel aan te passen via een policy-constante.

## [Unreleased] - 2026-04-24 · Snapshotting & historiek

### Added
- `src/lib/analytics/snapshot.ts` — pure builders die engine-output omzetten naar platte snapshot-rijen:
  - `buildPortfolioSnapshotData({view, regime, plan, capturedAt})` → `PortfolioSnapshotData` met typed headline-kolommen (`totalValue`, `volatility`, `drawdown`, `regimeLabel`, `healthGrade`) + flexibele `metrics` Json (avg factor composite, largest position, allocation by currency, risk score, plan deployment).
  - `buildFactorSnapshotData({ticker, factorScore, fundamentals, source, capturedAt})` → `FactorSnapshotData` voor de `(ticker, capturedAt, model)` unique-key.
  - `mapRegimeToLabel` / `mapRegimeStateToLabel` — mapt `MarketRegimeStance` én de legacy `MarketRegimeState` naar de Prisma `RegimeLabel` enum.
- `src/lib/data/snapshot-repository.ts` — `portfolioSnapshotRepository` (`create`, `listForPortfolio`, `latest`) en `factorSnapshotRepository` (`upsertMany` via `$transaction` op de composite key, `listForTicker`). Maps Prisma Decimal → number.
- `src/lib/services/snapshot-service.ts` — orchestrator met drie exports:
  - `snapshotPortfolio({portfolioId, at?})` — draait `buildPortfolioView` + `fetchRegimeInputs` + `computeRegimeScore` + `generateAllocationPlan` in parallel en persisteert één snapshot.
  - `snapshotFactors({tickers?, at?, model?})` — default = `DEFAULT_SCREENER_UNIVERSE`, parallel fundamentals+history per ticker, idempotent upsert.
  - `runScheduledSnapshots({userEmail, at?})` — bundelt portfolio- + factor-snapshots per user zodat een toekomstige cron-handler 'm rechtstreeks kan aanroepen.
- `src/app/api/snapshots/portfolio/route.ts` — `POST /api/snapshots/portfolio` met optionele body `{portfolioId?, userEmail?}`, valt terug op de primary portfolio van de demo-user en triggert `revalidatePath('/dashboard')` + `/portfolio`.
- `src/app/api/snapshots/factors/route.ts` — `POST /api/snapshots/factors` met optionele `{tickers?, model?}`, retourneert `{written, skipped}`.
- `src/app/(app)/dashboard/components/history-charts.tsx` — vijf Recharts in een 2-koloms grid: portefeuille-waarde, drawdown, valuta-exposure (stacked area), gemiddelde factor-composite en grootste positie (met ticker in de tooltip). Empty-state bij nul snapshots.
- `src/app/(app)/dashboard/components/snapshot-button.tsx` — client-actie (`useTransition` + `router.refresh()`) die `/api/snapshots/portfolio` aanroept en UI-feedback geeft (loading / ok / error).
- `src/lib/analytics/snapshot.test.ts` — tests voor afronding, null-fallbacks, factor-data mapping en beide regime-mappings.

### Changed
- `src/lib/analytics/index.ts` — re-exporteert `./snapshot`.
- `src/lib/data/index.ts` — re-exporteert `portfolioSnapshotRepository`, `factorSnapshotRepository` + bijbehorende row-types.
- `src/app/(app)/dashboard/page.tsx` — laadt snapshots parallel met view/regime/screener en rendert een nieuwe `Historiek`-sectie met `HistoryCharts` + `SnapshotButton`.

### Design regels
- **Engine-output is de enige bron**: snapshot-builders rekenen zelf niets opnieuw uit; ze lezen wat `buildPortfolioView`, `computeRegimeScore` en `generateAllocationPlan` al hebben uitgerekend. Geen parallelle berekening van drawdown of volatility.
- **Idempotent & job-vriendelijk**: factor-upserts draaien in één `$transaction` op `(ticker, capturedAt, model)` zodat een scheduled run nooit dubbele rijen produceert. `runScheduledSnapshots` is klaar voor een Vercel Cron / GitHub Actions trigger zonder extra refactor.
- **Typed kolommen + flexibele metrics**: headline-velden blijven direct queryable (handig voor SQL-rapporten), signalen met hogere bewegingsvrijheid (largest position, allocation by currency, plan deployment) zitten in `metrics` Json zodat het schema niet per ronde hoeft te migreren.
- **Stance → label mapping is één plek**: de UI gebruikt `MarketRegimeStance` (RISK_ON/NEUTRAL/DEFENSIVE), de database gebruikt `RegimeLabel` (EXPANSION/SLOWDOWN/RECESSION/…). De mapping leeft uitsluitend in `snapshot.ts` zodat time-series-views consistent blijven.
- **Charts delen één dataset**: `HistoryCharts` transformeert de snapshot-rijen één keer naar een gemeenschappelijke dataset; per chart alleen een select op de juiste key. Goedkoop om later een 6e chart toe te voegen.

### API voorbeelden
`POST /api/snapshots/portfolio` (leeg body = primary portfolio van demo-user):
```json
{ "snapshotId": "ck…", "portfolioId": "p1" }
```
`POST /api/snapshots/factors` (optioneel `{ "tickers": ["ASML.AS", "MSFT"], "model": "beleggeriq.v1" }`):
```json
{ "written": 12, "skipped": 0 }
```

## [Unreleased] - 2026-04-24 · Chat v2

### Added
- `src/types/chat.ts` — `ChatMessage`, `ChatContext`, `ChatRequestBody`, `ChatResponseBody` + `ChatRole` en `ChatIntent` types.
- `src/lib/ai/chat.ts` — intent-detection (5 use cases + fallback), ticker-extractie, `buildAssistantResponse` dispatcher (leunt op `explain()` uit de AI layer), `buildWelcomeMessage` en een `fallback` builder die uitlegt wat wél ondersteund wordt.
- `src/lib/ai/chat.test.ts` — tests voor alle intents, ticker-extractie, out-of-scope fallback en welcome-message shape.
- `src/app/api/chat/route.ts` — `POST /api/chat` met runtime validatie en consistente error-shape; laadt context opnieuw per call zodat chips altijd verse snapshot tonen.
- `src/app/(app)/chat/build-chat-context.ts` — `loadChatContext(email)` bundelt `buildPortfolioView` + `fetchRegimeInputs` + `computeRegimeScore` + `generateAllocationPlan` in één async call en retourneert een compacte `ChatContext`.
- Chat UI componenten (`src/app/(app)/chat/components/`):
  - `context-chips.tsx` — 5–6 chips met portfolio value, regime stance, risk severity, health grade, maandplan en grootste positie.
  - `quick-prompts.tsx` — 5 preset-prompts die 1-op-1 mappen naar use cases, direct verzenden bij klik.
  - `chat-room.tsx` (client) — message history, typing indicator, input + send knop, quick prompts, ContextChips die ververst met elke response.
- `src/app/(app)/chat/page.tsx` — server component, laadt context + welcome message, rendert `ChatRoom`. Empty state bij geen portefeuille.
- `src/app/(app)/chat/loading.tsx` — skeleton.

### Changed
- `src/types/index.ts` + `src/lib/ai/index.ts` — re-exporteren de nieuwe chat types en chat module.

### Design regels
- **Engine-first**: Chat is een natuurlijke-taal front voor de `explain()` layer uit de vorige ronde. Intents zijn deterministisch keyword-matched; het antwoord komt letterlijk uit de engines. Geen LLM-inferentie → nul kans op verzonnen stocks of cijfers.
- **Fallback maakt scope expliciet**: "kan ik niet beantwoorden" antwoord somt op wat wél kan. UI leidt de gebruiker niet het moeras in.
- **Context ververst per antwoord**: `/api/chat` geeft elke keer een nieuwe `ChatContext`-snapshot terug; chips reflecteren altijd de meest recente engine-staat.
- **Ticker-extractie**: uit vrije tekst pikken we een ticker (bv. "ASML" of "ASML.AS") en gebruiken die als target voor holding_score / fragile_concentration. Als geen ticker wordt genoemd, valt de engine terug op de grootste positie.
- **Typing indicator** (drie dots) simuleert reaction tijd zonder echte LLM streaming; houdt UX rustig.

## [Unreleased] - 2026-04-24 · AI explain layer

### Added
- `src/types/ai.ts` — discriminated-union types voor de explain layer: `ExplainUseCase`, `ExplainConfidence`, `ExplainContext` (5 varianten), `ExplainResponse` met `usedContextKeys` voor audit.
- `src/lib/ai/prompts.ts` — shared `EXPLAIN_SYSTEM_PROMPT` met strikte guardrails + `buildExplainPrompt(context)` dat per use-case een user prompt bouwt met engine-output als JSON-block. Pad voor LLM-upgrade.
- `src/lib/ai/explainers.ts` — deterministische `explain(context)` + 5 use-case specifieke functies (`explainHoldingScore`, `explainFragileConcentration`, `explainBuyPlan`, `explainMarketRegime`, `explainPortfolioRisks`). Template-based zodat er per constructie geen nieuwe cijfers verzonnen kunnen worden; rangorde wordt letterlijk uit de engine overgenomen.
- `src/app/api/ai/explain/route.ts` — `POST /api/ai/explain` met runtime validatie per use-case (zonder extra dependency), optionele `includePrompt` voor debug/LLM-handoff.
- `src/lib/ai/explainers.test.ts` — tests voor alle 5 use cases: composite score weergave, confidence tiers, lege-plan cash-hold, HEALTHY-winner narrative, regime narrative pass-through, portfolio risks top-3 flags + cijfer-integriteit.

### Changed
- `src/types/index.ts` + `src/lib/ai/index.ts` — re-exporteren de nieuwe AI-types en modules.

### Guardrails
- **Engine-first**: elke explain-response is gebouwd over `ExplainContext` die exact één-op-één engine-output bevat. Geen externe LLM call in deze ronde → nul kans op verzonnen cijfers of vervangen rangorde.
- **`usedContextKeys`** in response maakt expliciet welke engine-velden zijn gelezen — directe audit trail.
- **Confidence-tier** wordt afgeleid uit coverage/aantal datapunten; lage confidence triggert een `disclaimer`.
- **Prompts zijn klaar voor LLM-upgrade**: zodra een `LlmClient` bolt-on komt, raakt het de bestaande API-shape niet.

### API voorbeeld
`POST /api/ai/explain` met body:
```json
{
  "context": {
    "useCase": "holding_score",
    "ticker": "ASML.AS",
    "name": "ASML Holding",
    "factorScore": {
      "ticker": "ASML.AS",
      "asOf": "2024-04-01T00:00:00.000Z",
      "subScores": { "quality": 85, "value": 40, "momentum": 65, "lowVol": 60 },
      "composite": 72,
      "confidence": 0.8,
      "rationales": {
        "quality": ["Sterke ROIC (22%)."],
        "value": ["P/E 22 — marktconform."],
        "momentum": ["12m rendement +28%."],
        "lowVol": ["Beta 0.9 — rond markt."]
      }
    }
  }
}
```
Levert:
```json
{
  "useCase": "holding_score",
  "headline": "ASML Holding (ASML.AS) · composite 72/100 — bovengemiddeld",
  "narrative": "Composite 72/100 — bovengemiddeld profiel volgens de factor engine. Quality (85) trekt de score omhoog. Value (40) drukt de score.",
  "bullets": [
    "Quality 85/100 — Sterke ROIC (22%).",
    "Momentum 65/100 — 12m rendement +28%.",
    "Value 40/100 — P/E 22 — marktconform."
  ],
  "confidence": "high",
  "usedContextKeys": [
    "factorScore.composite",
    "factorScore.subScores",
    "factorScore.rationales",
    "factorScore.confidence"
  ]
}
```

## [Unreleased] - 2026-04-24 · Strategy Lab

### Added
- `src/lib/analytics/backtest/custom-strategy.ts` — `buildCustomStrategy(config)` factory met `CustomStrategyConfig`. Scoring volgt de factor-gewichten (quality/value/momentum/lowVol), filtert optioneel op dividend-signaal, kan dynamisch 12m-momentum gebruiken en respecteert maxSectorWeight + maxPositionWeight greedy. `defensiveOverlay` reserveert 20% cash door alle position-weights te schalen.
- `src/lib/analytics/backtest/custom-strategy.test.ts` — unit tests voor dividend-filter, defensive overlay, sector-cap enforcement en ontbrekende factor scores.
- `src/lib/data/strategy-preset-repository.ts` — Prisma CRUD wrapper met `listForUserEmail`, `findBySlug`, `save`, `deleteById` + `presetToCustomConfig` helper. Factor weights gaan in `factorWeights` Json; toggles en `maxSectorWeight` in `universeFilter.toggles` / `universeFilter.limits`.
- `src/app/(app)/strategy-lab/actions.ts` — server actions `savePreset` en `deletePreset`. Upsert op slug; `revalidatePath('/strategy-lab')` + `/backtest`.
- Strategy Lab componenten:
  - `components/config-form.tsx` (client) — volledige instellingenform met weight-sliders, toggle-pillen, number fields voor limits, rebalance select, toast feedback en "Opslaan/Opslaan als nieuw/Backtest" knoppen.
  - `components/preset-list.tsx` (client) — sidebar met eigen en publieke presets, delete-knop voor eigen items, link-based activering via `?preset=<slug>`.
- `src/app/(app)/strategy-lab/page.tsx` — server orchestrator: parse `?preset=<slug>`, fetch presets + actieve preset parallel, render 2-koloms layout.
- `src/app/(app)/strategy-lab/loading.tsx` — skeleton.

### Changed
- `src/lib/analytics/backtest/index.ts` — re-exporteert `./custom-strategy`.
- `src/lib/analytics/index.ts` — re-exporteert `buildCustomStrategy` + config-types.
- `src/lib/data/index.ts` — re-exporteert `strategyPresetRepository` + `presetToCustomConfig` + types.
- `src/app/(app)/backtest/prepare-inputs.ts` — strategy resolution uitgebreid naar DB: als slug niet in `STRATEGIES` zit, wordt `strategyPresetRepository.findBySlug` geraadpleegd en via `buildCustomStrategy` in een `StrategyFn` gewrapt. Rebalance frequentie, maxPositions en maxPositionWeight worden uit de preset overgenomen.

### Design regels
- **URL `?preset=<slug>`** als bron van waarheid — elke preset is shareable en cache-vriendelijk.
- **Strikte eigenaarsregels**: publieke presets zijn read-only, alleen de demo-eigenaar kan zijn eigen presets verwijderen.
- **Weight-som hoeft niet 1 te zijn**: de engine normaliseert intern. UI toont alleen de som zodat de gebruiker proporties begrijpt.
- **Config-form = serialiseerbare payload**: de `SavePresetActionInput` map exact 1-op-1 op `CustomStrategyConfig` + metadata, zodat de server action geen extra transformaties hoeft.

## [Unreleased] - 2026-04-24 · Backtest pagina

### Added
- `src/app/(app)/backtest/filters-serde.ts` — URL-serde met `parseBacktestFilters`, `filtersToSearchParams`, `periodRangeFromYears` en `DEFAULT_BACKTEST_FILTERS`. Ondersteunt 4 parameters (strategy / benchmark / years / cost) met expliciete defaults en supported-lijsten voor periode en benchmark.
- `src/app/(app)/backtest/prepare-inputs.ts` — server-side data prep: parallel `getHistory` + `getFundamentals` voor elk universum-lid, downsample naar maandelijkse close, compute factor score via `scoreFactors`, wrap in `BacktestUniverseEntry`. Benchmark wordt apart geladen.
- `src/app/(app)/backtest/components/filters-form.tsx` (client) — URL-driven config form met 4 velden: strategie-dropdown (feed vanuit `STRATEGIES`), benchmark-dropdown (IWDA/VWCE/none), periode-dropdown (1/2/3/5 jaar), commissionBps input. "Backtest draaien" knop pusht naar URL.
- `src/app/(app)/backtest/components/metrics-cards.tsx` — 5 MetricCards: CAGR, volatility, max drawdown, Sharpe (+ Sortino helper), Strategie vs Benchmark delta.
- `src/app/(app)/backtest/components/equity-chart.tsx` (client) — Recharts `LineChart` met strategie-lijn (solid, primary hue) en benchmark-lijn (dashed, muted hue). Responsive container, dark-theme tooltip, X-axis toont YYYY-MM labels.
- `src/app/(app)/backtest/components/disclaimer.tsx` — feitelijke historische-simulatie disclaimer.
- `src/app/(app)/backtest/loading.tsx` — skeleton voor form + 5 cards + chart + disclaimer.
- `src/app/(app)/backtest/page.tsx` — server component orchestrator: parse filters → prepare inputs → `runBacktest` → render. Gracefully afhandelt geen-data en te-weinig-observaties cases met eigen `EmptyState`.

### Design principes
- **URL als bron van waarheid** zodat backtests shareable en cache-vriendelijk zijn.
- **Rustige Recharts styling** — geen animaties of glow, dunne grid, muted labels, dashed benchmark-lijn voor visuele hierarchie.
- **Feitelijke disclaimer** onderaan — "gereedschap, geen advies" — in lijn met de rest van de app.
- **No-logic components**: `MetricsCards` en `EquityChart` krijgen enkel serialisable data uit het `BacktestResult` object. Alle engine- en prep-logica zit in de server files.

## [Unreleased] - 2026-04-24 · Backtest engine

### Added
- `src/lib/analytics/backtest/metrics.ts` — pure metric-wiskunde: `monthlyReturnsFromValues`, `computeTotalReturn`, `computeCagrFromValues`, `computeCagrFromReturns`, `computeAnnualizedVolatility`, `computeMaxDrawdown`, `computeSharpeRatio`, `computeSortinoRatio`, `computeCalmarRatio`, `computeWinRate`, `computeBacktestMetrics` (orchestrator). Maandelijkse basis, annualisatie via √12.
- `src/lib/analytics/backtest/strategies.ts` — strategie-abstractie (`StrategyContext`, `StrategyFn`, `StrategyDefinition`) + vijf concrete implementaties:
  - `equalWeightStrategy`
  - `qualityStrategy`
  - `qualityValueStrategy`
  - `qualityMomentumStrategy` (momentum dynamisch uit prijsreeks)
  - `regimeAwareStrategy` (DEFENSIVE → quality+lowVol met 20% cash buffer; RISK_ON → quality+momentum; NEUTRAL → composite)
  - `STRATEGIES` registry + `getStrategyBySlug` + helpers `topNEqualWeight`, `computeMomentum12m`.
- `src/lib/analytics/backtest/engine.ts` — `runBacktest` orchestrator. Maandelijkse loop: mark-to-market → return opslag (contribution-vrij) → contribution → rebalance (bij frequentie) → equity point. Transactiekosten = commissionBps × turnover. Benchmark wordt genormaliseerd naar initialCapital en per-maand op `EquityPoint.benchmark` gezet; `benchmark` output bevat `BenchmarkComparison` metrics.
- `src/lib/analytics/backtest/index.ts` — barrel.
- Tests: `metrics.test.ts` (alle 9 metrics + integration) en `engine.test.ts` (equal-weight groeit met prijs, quality pikt top-scorers, kosten drukken eindwaarde, regime-tag doorvoer, benchmark comparison, lege input).

### Changed
- `src/lib/analytics/index.ts` — selectieve re-export van `./backtest` om collision op `computeMaxDrawdown` met risk-engine te vermijden. Callers die dat specifiek nodig hebben importeren direct uit `@/lib/analytics/backtest/metrics`.

### Aannames
- **Maandelijkse data**: één observatie per ticker per maand. Engine leest de prijsreeks en valt terug op laatst-bekende prijs als een maand ontbreekt.
- **Fractional shares** toegestaan — geen integer-ronding. Rebalance levert altijd precies de target weight.
- **Transactiekosten** uitsluitend via `commissionBps` × |trade value|. Geen bid/ask spread, geen taxes.
- **Static fundamentals**: quality/value/lowVol sub-scores zijn een snapshot; alleen momentum wordt per rebalance opnieuw uit de prijsreeks gehaald. Documented in `strategies.ts`.
- **Time-weighted returns** voor metrics: returns worden vóór contributie geregistreerd, zodat CAGR/Sharpe niet worden opgepompt door maandelijkse inleg.
- **Benchmark**: rebased naar `initialCapital`. `totalReturn`, `cagr`, `volatility`, `maxDrawdown` worden voor de benchmark zelf herberekend.

## [Unreleased] - 2026-04-24 · Dashboard v2

### Added
- `src/lib/analytics/attention.ts` — `buildAttentionItems` + `countAttentionBySeverity` + types verhuisd uit `/risico` naar de gedeelde analytics-laag zodat dashboard en risicopagina dezelfde prioritering gebruiken.
- Dashboard componenten onder `src/app/(app)/dashboard/components/`:
  - `top-stats.tsx` — 4 metric cards (totale waarde, health grade, marktregime, grootste positie).
  - `next-action-card.tsx` — "Wat nu doen" hoofdactieblok met top-4 geprioriteerde attention-items, gedifferentieerde empty state en link naar /risico.
  - `allocation-cards.tsx` — `HoldingsAllocationCard` (top posities met gewichts-bars) en `CurrencyAllocationCard` (base-highlight + bars).
  - `risks-and-opportunities.tsx` — `TopRisksCard` (top-3 risk flags) en `TopOpportunitiesCard` (top-3 uit screener, leidt naar /screener).
  - `buy-plan-preview-card.tsx` — mini maandbeslissing met deployment total, top-3 recommendations en CTA naar /maandbeslissing; aparte kalme staat bij cash-hold.
- `src/app/(app)/dashboard/loading.tsx` — skeleton die de 5-row layout spiegelt.

### Changed
- `src/app/(app)/dashboard/page.tsx` — volledig herschreven als cockpit:
  - Parallel fetch van `buildPortfolioView`, `fetchRegimeInputs` en `runScreen({ limit: 3 })`.
  - `generateAllocationPlan` synchroon daarna met policy + objective uit `findUserContextByEmail`.
  - Layout: 4 metric cards → next action → regime + holdings → currency + risks → opportunities + buy plan → duiding.
- `src/app/(app)/risico/build-attention.ts` is nu een BC-shim die re-exporteert uit `@/lib/analytics/attention`.
- `src/lib/analytics/index.ts` — re-exporteert `./attention`.

### Design principes
- **Cockpit boven executive summary**: 5 rijen met eigen focus — gebruiker ziet direct waar risico en kansen zitten plus wat deze maand te doen.
- **Consistente deep-link pattern**: elke card met rijkere context heeft een "→ Meer / Open / Risicocentrum" knop naar de volledige pagina.
- **Rustig kleurenpalet**: destructive rood alleen voor high/critical, primary blauw voor neutraal-informatief, success groen voor positief.
- **Stack-veilig**: analytics-modules worden ongewijzigd ingezet — dashboard is puur composition over bestaande engines.

## [Unreleased] - 2026-04-24 · Maandbeslissing pagina

### Added
- `src/app/(app)/maandbeslissing/build-plan-input.ts` — URL-serde voor budget + bias + core-ETF, plus `biasBudgetMultiplier` die defensieve voorkeur (×0.85) op het budget toepast bovenop de engine-adjustments.
- `src/app/(app)/maandbeslissing/components/plan-hero.tsx` — hero met budget, deployed amount, recommendations-teller en stance-badge.
- `src/app/(app)/maandbeslissing/components/inputs-form.tsx` (client) — URL-driven form: budget-input in base currency, 3-way bias toggle, core-ETF switch. Push naar searchParams triggert server re-render.
- `src/app/(app)/maandbeslissing/components/recommendations-grid.tsx` — 1–5 recommendation cards met rank, actie-badge (Nieuwe positie / Bijkopen), bedrag + ~stuks, target weight, ScorePill, conviction + priority.
- `src/app/(app)/maandbeslissing/components/simulation-compare.tsx` — before/after tabel met delta-richting (groen/rood/neutraal) voor totale waarde, cash, aantal posities, grootste positie, vreemde valuta en top-sector.
- `src/app/(app)/maandbeslissing/components/warnings-banner.tsx` — niet-alarmistische banner met warnings of expliciete cash-hold uitleg als er geen recommendations zijn.
- `src/app/(app)/maandbeslissing/loading.tsx` — skeleton die hero + form + 3 cards + simulation spiegelt.
- `src/app/(app)/maandbeslissing/page.tsx` — server component die `findUserContextByEmail` + `buildPortfolioView` + `fetchRegimeInputs` + `generateAllocationPlan` combineert tot het volledige maandplan.

### Changed
- `src/lib/data/portfolio-repository.ts` — nieuwe helper `findUserContextByEmail` die user + primary portfolio + UserProfile (inclusief policy en objective) in één query ophaalt. Voegt `mapProfile` helper toe die de Prisma-row naar het domeintype converteert.

### Design regels
- **Eén hoofdactie**: "Plan genereren" knop in de InputsForm. Gereset = terug naar schone URL.
- **URL als bron van waarheid** voor inputs (`budget`, `bias`, `coreEtf`) — shareable en reproducible tussen sessies.
- **Niet-alarmistisch**: cash-hold + warnings in dezelfde rustige tone als andere pages. Geen waarschuwings-icons die de pagina domineren.
- **Premium + leeg**: hero + form + grid + simulation + optionele signalen. Iedere sectie heeft witruimte; geen dashboards met 8 widgets tegelijk.

## [Unreleased] - 2026-04-24 · Monthly buy engine

### Added
- `src/lib/analytics/allocation-engine/thresholds.ts` — `AllocationThresholds` (minOrderAmount, maxRecommendations, cashBuffer, caps, defensiveHoldback, …) + `DEFAULT_ALLOCATION_THRESHOLDS` en `thresholdsFromPolicy` die `PolicySettings` (`maxPositionWeight`, `maxSectorWeight`, `cashBufferPct`, `minFactorComposite`) doorzet.
- `src/lib/analytics/allocation-engine/context.ts` — `regimeAdjustment(MarketRegimeScore)` (budget-multiplier, factor-biases, core-ETF voorkeur, warnings) en `objectiveTilt(InvestmentObjective)` (factor-weights, minimum sub-score eisen, dividend-vereiste, max-vol cap).
- `src/lib/analytics/allocation-engine/candidates.ts` — `determineBuyCandidates` + `DEFAULT_CORE_ETF`. Filtert excluded tickers, asset-class restricties, positions op cap, onder composite-drempel, zonder dividend-signaal voor INCOME en sector-caps. Core-ETF fallback bij dunne spreiding of alle candidates op cap.
- `src/lib/analytics/allocation-engine/priority.ts` — `scoreAllocationPriority` met 5 componenten (factor 40%, underweight 20%, regime 20%, objective 10%, concentration 10%). Hard-blocks op policy/profile min-requirements. Rationale builder voor UI/explain.
- `src/lib/analytics/allocation-engine/simulate.ts` — `simulatePostBuyPortfolio` projecteert totaal, cash, positie-count, largest weight, foreign exposure en top-sector na uitvoering van de recommendations.
- `src/lib/analytics/allocation-engine/engine.ts` — `generateAllocationPlan` orchestrator. Berekent budget (contribution + cash boven buffer, regime-multiplier, defensieve holdback), filtert + scored candidates, verdeelt budget met headroom-caps en min-order, simuleert, en bouwt `AllocationPlan` met warnings + summary + coreEtfUsed.
- `src/lib/analytics/allocation-engine/engine.test.ts` dekt happy path, hold-cash warning bij posities op cap, DEFENSIVE budget-reductie, policy maxPositionWeight, INCOME dividend-filter, en post-buy simulation.

### Changed
- `src/types/allocation.ts` — nieuwe `PostBuySimulation` + extra optionele velden op `AllocationPlan` (`budget`, `deployedAmount`, `cashReserved`, `warnings`, `simulation`, `regimeScore`, `objective`, `coreEtfUsed`). Non-breaking.
- `src/lib/analytics/index.ts` — selectieve re-export van allocation-engine (voorkomt `thresholdsFromPolicy`-collision met risk- en rebalance-engine).

### Design regels
- **Budget = contribution + max(0, cash − buffer)** waarop regime-multiplier (DEFENSIVE 0.7) en extra holdback (25%) pas toegepast worden. Dat maakt het gedrag expliciet uitlegbaar.
- **Caps respecteren**: elke recommendation wordt afgetopt op `headroom × totalValue`. Residual wordt pas in tweede pass herverdeeld over uncapped candidates.
- **Let winners run**: bestaande positie gaat op "add", nieuwe positie op "buy". Heavy-concentration TRIM logica blijft in de rebalance engine; deze engine trimt niet.
- **Defensieve stance** verhoogt de relatieve waarde van de core-ETF via een bias in de regime-component (+15 punten) en het budget wordt geknipt.
- **Explainability first**: `AllocationRecommendation.rationale` + `factorScore` + `priority` geven de AI/UI alles om de beslissing uit te leggen.

## [Unreleased] - 2026-04-23 · Market regime score

### Added
- `src/lib/analytics/regime/scoring.ts` — per-driver scorers voor waardering, trend/breadth, volatiliteit, rente en credit-spread. Elk driver levert score 0..100 (hoger = meer risk-on) of `null` bij ontbrekende data. Transparante thresholds per driver.
- `src/lib/analytics/regime/engine.ts` — `computeRegimeScore` orchestrator en `stanceFromScore` helper. Herverdelt gewichten over actieve drivers bij ontbrekende data, berekent `confidence`, bouwt Nederlandse narrative met supportive + drag drivers.
- `src/lib/analytics/regime/index.ts` — barrel.
- `src/lib/analytics/regime/engine.test.ts` — stance-mapping, individuele driver-randgevallen, orchestrator flows (risk-on, defensief, partieel, narrative).
- `src/lib/data/regime.ts` — `fetchRegimeInputs` die de laatste `MarketSnapshot` uit Prisma leest, headline-kolommen gebruikt en extra velden uit de flexibele `indicators` Json. Gecached met 5-min TTL.
- `src/app/api/market/regime/route.ts` — `GET /api/market/regime` retourneert `{ regime, inputs, source }` met short-cache headers.
- `src/app/(app)/dashboard/components/market-regime-card.tsx` — dashboard-widget met stance/icoon, score, confidence, narrative en per-driver progress bars.

### Changed
- `src/types/regime.ts` — nieuwe types `MarketRegimeStance` (`RISK_ON`/`NEUTRAL`/`DEFENSIVE`), `RegimeSubScore` en `MarketRegimeScore`.
- `src/lib/analytics/index.ts` — re-export `./regime`.
- `src/lib/data/index.ts` — exporteert `fetchRegimeInputs` + type.
- `src/app/(app)/dashboard/page.tsx` — fetch `regime` parallel met `buildPortfolioView`, toont `MarketRegimeCard` naast de top-posities (2-col grid op lg).

### Design regels
- **Higher = risk-on** als consistent: waardering goedkoop, lage vol, lage rente, tight spreads → hoger cijfer. Stance-drempels: ≤ 35 = DEFENSIVE, ≥ 65 = RISK_ON, anders NEUTRAL.
- **Confidence ≠ zekerheid**: uitsluitend fractie van driver-gewicht waarvoor data aanwezig was. UI toont "Coverage X%".
- **Narrative blijft feitelijk**: één zin per supportive + drag driver, geen alarmisme.
- **Partiële data veilig**: engine levert NEUTRAL 50 met confidence 0 als geen enkele driver data heeft; alloctor kan hierop schakelen.

## [Unreleased] - 2026-04-23 · Risicopagina /risico

### Added
- `src/lib/analytics/scenario.ts` — pure scenario-engine. `applyFxShock`, `applyMarketShock`, `applySectorShock` als bouwstenen plus `runDefaultScenarios` die ~5 scenario's produceert (base +/-10%, markt -20% en +15%, top-sector −30%). `ScenarioResult` bevat projectedValue, delta en deltaPct.
- `src/lib/analytics/scenario.test.ts` met dekking voor FX-shocks (base vs. vreemde posities), market-shocks (cash blijft flat), sector-shocks (alleen doelsector) en de default-set.
- `src/app/(app)/risico/severity.ts` — gedeelde `toneForSeverity`, tone-classes en Nederlandse labels.
- `src/app/(app)/risico/build-attention.ts` — `buildAttentionItems(risk, rebalance)` die RECONSIDER/TRIM_HEAVY-recommendations en high/critical risk flags combineert tot een geprioriteerde lijst (max 6).
- Risicopagina componenten (server):
  - `components/risk-top-summary.tsx` — hero card met severity-icoon, overall score en 3 mini-stats.
  - `components/top-risk-flags.tsx` — top 5 flags met rustige severity-badges.
  - `components/exposure-cards.tsx` — `ConcentrationOverviewCard`, `CurrencyExposureCard`, `SectorExposureCard` met allocation-bars.
  - `components/risk-positions-table.tsx` — sorteert op risk score, toont concentratie/volatility klassen en FX-bijdrage.
  - `components/scenario-panel.tsx` — tabel met 4–5 stress-scenario's en delta-kleuring.
  - `components/attention-summary.tsx` — eindsamenvatting "wat vraagt aandacht".
- `src/app/(app)/risico/loading.tsx` — skeleton die het 5-block layout spiegelt.
- `src/app/(app)/risico/page.tsx` — nieuwe server component die `buildPortfolioView` + `runDefaultScenarios` + `buildAttentionItems` combineert tot het risicocentrum.

### Changed
- `src/lib/analytics/index.ts` — re-export van `./scenario`.

### Design principes
- Toon blijft rustig: alleen `high`/`critical` krijgen destructive rood, `moderate`/`elevated` warning-geel, rest muted.
- Scenario-panel eindigt met "Illustratief — geen voorspelling" om alarmistische framing te vermijden.
- Layout respondent: hero full-width, exposure 3-col → 1-col onder `lg`, positions + flags 2-col → 1-col onder `xl`.

## [Unreleased] - 2026-04-23 · Rebalance engine

### Added
- `src/types/rebalance.ts` — domeintypes: `ConcentrationType` (HEALTHY/NEUTRAL/FRAGILE), `CyclicalityLevel`, `RebalanceAction` (NO_ACTION/TRIM_LIGHT/TRIM_HEAVY/RECONSIDER), `ConcentrationAssessment`, `RebalanceFactorSnapshot`, `RebalanceRecommendation`, `RebalancePlan`.
- `src/lib/analytics/rebalance-engine/sector-cyclicality.ts` — statische mapping sector → cyclicality level en `isCyclical` helper.
- `src/lib/analytics/rebalance-engine/thresholds.ts` — `RebalanceThresholds`, `DEFAULT_REBALANCE_THRESHOLDS` (maxPositionWeight 10%, healthyRunMultiplier 2.0, fragileHeavyMultiplier 1.5, reconsider-score 80) en `thresholdsFromPolicy`.
- `src/lib/analytics/rebalance-engine/concentration-classifier.ts` — `classifyConcentrationType(input)` met fragility-scoring. Verwerkt positionWeight, quality, momentum, composite, volatility/lowVolScore, sector-cyclicality. Levert `ConcentrationClassification` incl. reasons en cyclicality.
- `src/lib/analytics/rebalance-engine/engine.ts` — `buildRebalancePlan` orchestrator. Per-holding: classify + action rules ("let winners run") + target weight + delta amount + indicatief aantal stuks + reasons + confidence. Plan sort: significante acties bovenaan.
- `src/lib/analytics/rebalance-engine/concentration-classifier.test.ts` en `engine.test.ts` dekken healthy-winner, fragile-boven-cap, RECONSIDER, NEUTRAL, sort-volgorde en policy override.

### Changed
- `src/lib/analytics/portfolio-view.ts` — `PortfolioView.rebalance: RebalancePlan` toegevoegd. `BuildPortfolioViewOptions` accepteert `policy` (PolicySettings) en `rebalanceThresholds`.
- `src/lib/analytics/index.ts` — selectieve re-export van rebalance-engine (alleen publieke API; voorkomt naming-collision op `thresholdsFromPolicy` met risk-engine).
- `src/types/index.ts` — re-export van `rebalance`.

### Design regels
- **Winners niet blind verkopen**: HEALTHY positie boven policy-cap → NO_ACTION; pas TRIM_LIGHT vanaf 2× cap (richting 1.7× cap). FRAGILE posities volgen conservatieve regels en TRIM_HEAVY triggert vanaf 1.5× cap naar 0.75× cap.
- **RECONSIDER** triggert bij fragility ≥ 80 (zeer zwak profiel), ongeacht positiegewicht — deze positie past simpelweg niet bij het beleggersprofiel.
- **Uitlegbaarheid**: elke recommendation bevat `factorSnapshot` (quality/value/momentum/composite/volatility/sector/cyclicality) plus een gecombineerde `reasons[]` lijst (action-reasons eerst, dan classifier-reasons). Directe input voor de AI-explain layer.
- **Confidence cap**: maximaal 0.9, zodat UI altijd menselijke review aanmoedigt.

## [Unreleased] - 2026-04-23 · Risk engine

### Added
- `src/lib/analytics/risk-engine/thresholds.ts` — `RiskThresholds` type + `DEFAULT_RISK_THRESHOLDS` + `thresholdsFromPolicy(policySettings)` plus shared classifiers (`classify`, `classifyInverse`, `continuousRiskScore`, `classFromScore`, `CoreRiskClass`).
- `src/lib/analytics/risk-engine/concentration.ts` — `computeHhi`, `computeTop5Weight`, `classifyPositionWeight`, `classifyConcentrationHhi`, `classifyTop5Weight`, `positionConcentrationRiskScore`.
- `src/lib/analytics/risk-engine/volatility.ts` — `classifyVolatility`, `volatilityRiskScore`, `classifyBeta`.
- `src/lib/analytics/risk-engine/drawdown.ts` — `computeMaxDrawdown` (peak-to-trough proxy op historische closes), `classifyDrawdown`, `drawdownRiskScore`.
- `src/lib/analytics/risk-engine/currency.ts` — `computeForeignCurrencyExposure`, `computeCurrencyAllocation`, `currencyContribution` (per positie), `classifyForeignCurrencyExposure`, `currencyRiskScore`.
- `src/lib/analytics/risk-engine/sector.ts` — `computeSectorAllocation`, `topSector`, `classifyTopSectorWeight`, `sectorRiskScore`.
- `src/lib/analytics/risk-engine/warnings.ts` — `buildPortfolioWarnings` met gestandaardiseerde `RiskFlag`-codes (`concentration.position`, `concentration.top5`, `concentration.hhi`, `concentration.sector`, `exposure.currency`, `diversification.positions`) inclusief Nederlandstalige `message`.
- `src/lib/analytics/risk-engine/engine.ts` — `buildRiskReport(input)` orchestrator. Produceert `PortfolioRiskSummary` met per-holding `PositionRiskAnalysis` (concentrationClass, volatilityClass, currencyRiskContribution, riskScore 0..100, riskClass), top-5 weight, top-sector, foreign currency exposure en weighted portfolio `riskScore`/`overallSeverity`.
- Tests: `concentration.test.ts` (HHI + top5 + klassen), `drawdown.test.ts` (proxy + classifier) en `engine.test.ts` (gelijk verdeeld → low, single-position USD → high severity + warnings, top-5 en sector-bias flags, empty safe path).

### Changed
- `src/types/risk.ts` — `PositionRiskAnalysis` krijgt optionele `concentrationClass`, `volatilityClass`, `currencyRiskContribution`, `riskScore`, `riskClass`. `PortfolioRiskSummary` krijgt optionele `top5Weight`, `topSector`, `foreignCurrencyExposure`, `riskScore`. Allemaal non-breaking.
- `src/lib/analytics/portfolio-view.ts` — `PortfolioView.risk: PortfolioRiskSummary` toegevoegd en `buildPortfolioView` roept `buildRiskReport` aan met optionele `riskThresholds` override (kan uit `PolicySettings` komen).
- `src/lib/analytics/index.ts` — her-exporteert `./risk-engine` naast de bestaande simpele `./risk` helpers (geen naming-collisions).

### Design
- Klasse-conventie: engine narrowed `RiskSeverity` naar `"low" | "moderate" | "high"` (laag/gemiddeld/hoog). Positie-score én portfolio-score zijn 0..100 (hoger = meer risico) met continuous interpolatie tussen `low` en `high` thresholds.
- Gewichten: positie-score = 0.4·concentration + 0.4·volatility + 0.2·currency. Portfolio-score = 0.3·HHI + 0.2·top5 + 0.2·sector + 0.2·currency + 0.1·volatility.
- Thresholds zijn volledig overschrijfbaar via `RiskThresholds` of via `thresholdsFromPolicy(PolicySettings)`.

## [Unreleased] - 2026-04-23 · Screener 2.0

### Added
- `src/lib/data/screener-universe.ts` — statisch `DEFAULT_SCREENER_UNIVERSE` met 27 entries (NL/EU/UK/US + 2 wereld-ETF's) plus `SUPPORTED_REGIONS` en `SUPPORTED_SECTORS` als canonieke keuze-lijsten.
- `src/lib/analytics/screener.ts` — factor-first engine: `runScreen`, `preFilter`, `passesPostScoreFilters`, `deriveStrengthsWeaknesses`. Parallel fetch van fundamentals + price history per ticker; scoring via bestaande `scoreFactors`. Zonder AI, volledig reproducible.
- `src/lib/analytics/screener.test.ts` met dekking voor pre-filter combinaties, post-score drempels (factor, composite, debt/equity, market cap, dividendOnly) en strengths/weaknesses extraction.
- `src/components/common/score-pill.tsx` — de portfolio-specifieke ScorePill is verhuisd naar `common` zodat screener en portfolio dezelfde primitief delen.
- Screener-pagina componenten (`src/app/(app)/screener/components/`):
  - `screener-filters-form.tsx` (client) — pill-toggles voor regio/sector, sliders voor Quality/Value/Momentum, number fields voor dividend/debt/mcap, URL-driven `router.push` submit.
  - `screener-result-card.tsx` (client) — rank, ticker, sector, scores, sterk/zwak punten, watchlist- en uitleg-knop.
  - `screener-detail-drawer.tsx` (client) — Sheet met per-sub-factor rationales, composite-uitleg, fundamentals snapshot tabel en watchlist-commit.
  - `screener-results.tsx` (client) — container die selectie-state + watchlist-toasts beheert en één gedeelde `TooltipProvider` wrapt.
- `src/app/(app)/screener/filters-serde.ts` — URL ↔ `ScreenerFilters` serde (regio/sector/factor drempels/fundamentals), zodat filters shareable zijn.
- `src/app/(app)/screener/actions.ts` — `addToWatchlist` server action met `Watchlist(userId, ticker)` upsert en duplicate-detectie, triggert `revalidatePath('/portfolio')`.
- `src/app/(app)/screener/page.tsx` — herschreven server component die searchParams parst, `runScreen` draait en een 2-koloms layout rendert (filters sticky, resultaten grid).
- `src/app/(app)/screener/loading.tsx` — skeleton die het 2-koloms layout spiegelt.

### Changed
- `src/types/screener.ts` — `maxDebtToEquity?` toegevoegd.
- `src/lib/analytics/index.ts` — exporteert `screener`.
- `src/app/(app)/portfolio/components/holdings-table.tsx` — importeert ScorePill nu uit `@/components/common`.
- `src/app/(app)/portfolio/components/score-pill.tsx` verwijderd (verhuisd naar `common`).

### Design principe
- Ranking is factor-first: sort key is uitsluitend `FactorScore.composite`. AI mag signalen aanbieden; zij komen later als aparte "insight"-laag bovenop de ranking, niet als re-ordering.

## [Unreleased] - 2026-04-23 · Portfolio pagina v2

### Added
- `src/lib/analytics/holding-action.ts` — pure `deriveHoldingAction` die BUY CANDIDATE / HOLD / WATCH / TRIM / AVOID bepaalt uit composite score, coverage, huidige weight en target. Labels en beschrijvingen geëxporteerd voor UI.
- `src/lib/analytics/holding-action.test.ts` met dekking voor elke tak incl. onderweighting, insufficient confidence en ontbrekende score.
- Shadcn `src/components/ui/tooltip.tsx` primitief (Radix-based) voor hover-uitleg.
- Portfolio-pagina componenten onder `src/app/(app)/portfolio/components/`:
  - `score-pill.tsx` (client) — 0..100 pill met kleur-tone en optionele tooltip.
  - `action-badge.tsx` (client) — actie-badge met tooltip die default-beschrijving + per-row rationale toont.
  - `portfolio-summary-cards.tsx` (server) — 4 kaarten: totale waarde, aantal posities, grootste positie, valuta verdeling (met inline mini-bars).
  - `holdings-table.tsx` (client) — volledig tabel met symbool, aantal, koers, waarde, %, valuta, quality/value/momentum/composite scores en actie-badge; responsive kolom-hiding met `md:` en `lg:` breakpoints; één `TooltipProvider` wrapt alle score- en action-tooltips.
  - `score-legend.tsx` (server) — uitlegblok met score-bands en actie-legenda.
- `src/app/(app)/portfolio/loading.tsx` — skeleton mirror van de page-layout.
- `src/app/(app)/portfolio/build-rows.ts` — pure mapper van `PortfolioSummary` + `HoldingValuation[]` naar serialiseerbare `HoldingRow[]`.

### Changed
- `src/lib/analytics/enrichment.ts` — fetcht nu parallel price history (~400 dagen) wanneer `includeFactorScores` is; momentum-sub-score werkt daardoor echt in plaats van neutraal 50. `EnrichmentResult.priceHistories` toegevoegd.
- `src/lib/analytics/portfolio-view.ts` — `BuildPortfolioViewOptions` krijgt `includeFactorScores` + `factorWeights`; `PortfolioView.factorScores` toegevoegd en factor scores worden als denormalisatie op `HoldingValuation.holding.factorScore` gepropageerd.
- `src/lib/analytics/index.ts` — exporteert `holding-action`.
- `src/app/(app)/portfolio/page.tsx` — volledig herschreven: schakelt `includeFundamentals` + `includeFactorScores` in, bouwt rows via `buildHoldingRows`, rendert `PortfolioSummaryCards`, `HoldingsTable`, `ScoreLegend`, signals en eigen empty-states voor geen-portfolio en geen-holdings (met inline import-dialog).

### Responsive
- Tabel: horizontale scroll onder 960px, `Symbool / Aantal / Koers` verborgen onder `md`, `Valuta / Quality / Value / Momentum / Totaal` verborgen onder `lg`. Mobiele row toont ticker inline onder de naam.
- Summary cards: 1-col → 2-col → 4-col op `sm`/`lg`.

## [Unreleased] - 2026-04-23 · Factor scoring engine

### Added
- `src/lib/analytics/factors/shared.ts` — gedeelde primitieven: `rampUp`, `rampDown`, `clamp`, `buildSignal`, `scoreFromSignals` (missende-data tolerant, levert top-3 rationales), `formatPct`, `formatRatio`, `FactorSignal` type.
- `src/lib/analytics/factors/quality.ts` — `scoreQuality(fundamentals)` op basis van ROIC, ROE, debt/equity, FCF yield, bruto/operationele marge en rentedekking (hogere score = sterker bedrijf).
- `src/lib/analytics/factors/value.ts` — `scoreValue(fundamentals)` op basis van P/E, P/B, P/S, EV/EBITDA, FCF yield, dividendrendement en afgeleide PEG (P/E ÷ epsGrowth5y·100; skipt PEG bij groei ≤ 2%).
- `src/lib/analytics/factors/momentum.ts` — `scoreMomentum(history)` + `computeMomentumMetrics` + `scoreMomentumFromMetrics` voor 6m-, 12m-, 12-1m-trend en afstand tot 52w-high.
- `src/lib/analytics/factors/risk.ts` — `scoreRisk({ volatility, maxDrawdown, beta })` met absolute drawdown-afhandeling en "hoger = veiliger" conventie zodat composite één richting houdt.
- `src/lib/analytics/factors/composite.ts` — kern-API `scoreFactors(input, weights)`, `computeComposite`, `DEFAULT_FACTOR_WEIGHTS`, `weightsForObjective(objective)` presets per `InvestmentObjective`, holding-integratie `applyFactorScore` en batch `scoreHoldings`.
- `src/lib/analytics/factors/index.ts` — barrel voor de nieuwe module.
- Vitest suites: `shared.test.ts`, `quality.test.ts`, `value.test.ts`, `momentum.test.ts`, `risk.test.ts`, `composite.test.ts`.

### Changed
- `src/types/factor.ts`: `FactorSubScores`, `FactorScore.composite` docs rescaled naar **0..100** (0 = ongunstig, 50 = neutraal, 100 = sterk). `FactorScore` heeft nu optionele `weights` en `rationales` (typed via nieuwe `FactorRationales`).
- `src/lib/analytics/factor-scoring.ts` — legacy signature `scoreHoldings(holdings, weights): FactorScore[]` is nu een BC-shim die naar de nieuwe engine delegeert. Niet meer geëxporteerd vanuit de `@/lib/analytics` barrel om naming-collisions met de nieuwe `scoreHoldings` te vermijden.
- `src/lib/analytics/index.ts` — her-exporteert `./factors`.
- `src/lib/analytics/enrichment.ts` — `EnrichmentOptions` krijgt `includeFactorScores?` + `factorWeights?`. `EnrichmentResult.factorScores: Map<ticker, FactorScore>` wordt gevuld wanneer opt-in.

### Bekende beperkingen
- `enrichHoldings` voedt de factor engine (nog) zonder prijshistorie, dus momentum-sub-score blijft 50 tot de history-feed is aangesloten. Quality/value/risk werken wel meteen mits `includeFundamentals: true`.
- Prisma `FactorSnapshot.*Score` kolommen zijn `Decimal(6,4)` (oud bereik -1..1). Persistence vereist later schema-update naar `Decimal(6,2)` of rescaling bij schrijven (in-memory blijft 0..100 canoniek).

## [Unreleased] - 2026-04-23 · Holdings enrichment + basis portfolio-analyse

### Added
- `src/lib/analytics/valuation.ts` — pure valuation-laag:
  - `HoldingValuation`, `PriceSource`, `valueHolding` met prijsfallback (market → lastKnown → costBasis → 0).
  - `calculateHoldingValue`, `calculatePortfolioValue` (negatieve cash → 0), `calculateTopHoldings`, `calculateCurrencyAllocation`, `aggregateAllocation` (null-keys naar "Onbekend").
- `src/lib/analytics/enrichment.ts` — async enrichment service. Fetcht parallel quotes + FX (en optioneel fundamentals), faalt defensief (ontbrekende FX → rate 1 met warning), retourneert `{ valuations, quotes, fundamentals, fxRates, asOf }`.
- `src/lib/analytics/health.ts` — `computeBasicHealthSummary` met diversification/risk/quality/factor scoring en signals voor concentratie, spreiding, valuta-exposure en drawdowns. Quality + factor vallen terug op 0.5 als holdings nog geen scores dragen.
- `src/lib/analytics/portfolio-view.ts` — high-level orchestrator `buildPortfolioView(portfolio, opts)` die één call doet en `PortfolioView = { summary, health, valuations, lastUpdated }` retourneert.
- Tests: `src/lib/analytics/valuation.test.ts` en `src/lib/analytics/health.test.ts`.

### Changed
- `src/types/summary.ts` — `PortfolioSummary` heeft nu `largestPosition: PositionBreakdown | null` en `allocationByCurrency: AllocationSlice[]`.
- `src/lib/analytics/portfolio-summary.ts` — opgesplitst in een pure `computePortfolioSummaryFromValuations` (canoniek) en backward-compatible `computePortfolioSummary(portfolio, opts)` die onveranderd tests blijft slagen.
- `src/lib/analytics/index.ts` — barrel re-exporteert valuation, enrichment, health en portfolio-view.
- `src/app/(app)/portfolio/page.tsx` — server component gebruikt `buildPortfolioView`, toont 4 metric cards (totalValue, unrealized P&L, grootste positie, health grade), holdings-tabel met live koers + P&L en een lijst met health signals.
- `src/app/(app)/dashboard/page.tsx` — vervangt placeholders door echte nummers van de primary portfolio en een top-posities tabel.
- `src/lib/analytics/risk.test.ts` — test-fixture aangevuld met de nieuwe verplichte `PortfolioSummary` velden.

## [Unreleased] - 2026-04-23 · Server-side market data laag

### Added
- Genormaliseerde marktdata-types in `src/types/market.ts`: `Quote`, `FxRate`, `HistoricalPoint`, `HistoryInterval`, `HistoryRequest`.
- TTL-cache primitief `src/lib/data/cache.ts` met:
  - `TtlCache` class (lazy expiry, insertion-order eviction, inflight-deduplicatie in `getOrSet`, stats).
  - `marketDataCache` global-scoped singleton (overleeft HMR in dev).
  - `buildCacheKey(namespace, ...parts)` helper voor consistente keys.
- Provider-contract + stub-implementatie:
  - `src/lib/data/providers/types.ts` (`QuoteProvider`, `FxProvider`, `FundamentalsProvider`, `HistoryProvider`, `MarketDataProvider`).
  - `src/lib/data/providers/stub.ts` (`StubMarketDataProvider`) — deterministische pseudo-data op basis van ticker-hash, EUR-ankered FX-matrix, geometrische random walk history.
  - `src/lib/data/providers/index.ts` (`getMarketDataProvider`) met env-gebaseerde dispatch via `MARKET_DATA_PROVIDER`.
- Server-side services met cache + defensive error handling + graceful fallback:
  - `src/lib/data/quotes.ts` (`getQuote`, `getQuotes`, TTL 60s).
  - `src/lib/data/fx.ts` (`getFxRate`, `convertAmount`, TTL 5min, identity-shortcut).
  - `src/lib/data/fundamentals.ts` (`getFundamentals`, TTL 6h).
  - `src/lib/data/history.ts` (`getHistory`, TTL 30min, datum-validatie + sortering).
- API routes onder `src/app/api/market/`:
  - `quote/route.ts` (`?ticker=` of `?tickers=CSV`).
  - `fx/route.ts` (`?from=&to=`).
  - `fundamentals/route.ts` (`?ticker=`).
  - `history/route.ts` (`?ticker=&from=&to=&interval=1d|1wk|1mo`).
  - Gedeelde helpers in `_shared.ts` (param parsing, error responses, `Cache-Control` headers).
- Tests: `src/lib/data/cache.test.ts` (TTL, eviction, inflight-dedup, null-caching) en `src/lib/data/market.test.ts` (service shape, normalisatie, FX identity + conversion, history sort).
- `.env.example`: `MARKET_DATA_PROVIDER`, plus placeholders voor provider-secrets.

### Changed
- `src/lib/data/index.ts` exporteert nu ook de marktdata-services en -cache zodat consumers via `@/lib/data` importeren.
- `src/types/index.ts` re-exporteert `market`.

### Security
- Alle market-services draaien via de server (route handlers, server components, server actions). Geen `NEXT_PUBLIC_*` exposure van provider-secrets; `_shared.ts` zet `Cache-Control: private` zodat geen shared CDN per-user data cachet.

## [Unreleased] - 2026-04-23 · DEGIRO CSV-importmodule

### Added
- `src/lib/parsers/degiro.ts` — volledige fouttolerante DEGIRO-parser met:
  - `normalizeDutchNumber` (1.234,56 én 1,234.56, currency-prefix/-suffix, negatief met haakjes, percent-suffix)
  - `detectCurrency` (supported ISO-codes EUR/USD/GBP/CHF/JPY, andere retourneren null)
  - `safeString`, `parseOpenPositionRows`, `parseDegiroCsv`, `toHoldingDrafts`
  - CSV-tokenizer met `,` / `;` / `\t` auto-detect en support voor quoted fields met embedded newlines
  - Kolomaliassen voor NL én EN varianten
  - ISIN- en ticker-detectie met product-name fallback
  - Asset-class heuristiek (ETF/REIT/BOND/EQUITY)
  - Duplicaat-aggregatie binnen bestand met gewogen gemiddelde kostprijs
- `src/lib/parsers/degiro.test.ts` met dekking voor parser-helpers, CSV end-to-end (NL + EN), duplicates en foutpaden.
- Server action `src/app/(app)/portfolio/actions.ts` (`importDegiroCsv`) die serverside opnieuw parsed, upsert uitvoert en `revalidatePath` triggert op `/portfolio` + `/dashboard`.
- `ImportDegiroDialog` client component (`src/app/(app)/portfolio/components/import-degiro-dialog.tsx`) met file-picker, previewtabel, samengevouwen warnings/skipped en success/error notices.
- `portfolioRepository.findPrimaryByEmail` en `portfolioRepository.upsertHoldings` (bulk upsert in transactie, teller voor created/updated).

### Changed
- `src/app/(app)/portfolio/page.tsx` is nu een async server component die de primary portfolio ophaalt, de holdings als tabel toont en de DEGIRO-import dialog koppelt.
- `src/lib/parsers/csv-holdings-parser.ts` dispatcht nu naar `parseDegiroCsv` en normaliseert de output naar het legacy `CsvImportResult` contract.
- `src/lib/parsers/index.ts` exporteert DEGIRO parser + helpers expliciet.
- `.env.example` — `DEMO_USER_EMAIL` toegevoegd (tijdelijk totdat auth landt).

### Duplicate-guard
- Bestandsniveau: parser aggregeert duplicate regels op ISIN → ticker met weighted-average kostprijs.
- DB-niveau: Prisma unique `Holding(portfolioId, ticker)` met `upsert` semantiek; bestaande posities worden bijgewerkt, nieuwe toegevoegd.

## [Unreleased] - 2026-04-23 · State-architectuur refactor

### Added
- `src/store/usePortfolioStore.ts` – nieuwe portfolio store met watchlist, portfolio summary, portfolio risk summary, factor- en position-risk caches per ticker, allocation plan slot en `lastAnalyzedAt` timestamp. `hydrate` accepteert een bulk server-payload.
- `src/store/useProfileStore.ts` – profile store met canonieke `profile`, bewerkbare `policy` draft, `currentObjective`, client-`preferences` (region/sector tilts + dividend/momentum) en automatisch afgeleide `ProfileCompleteness`. `commitPolicyToProfile()` schrijft de draft terug naar het profiel.
- `src/store/useAppSettingsStore.ts` – uitgebreide settings store met `selectedBenchmarkTicker`, `defensivenessLevel`, `activeStrategyPresetSlug`, `screenerFilters` (+ patch/clear helpers), strak persisted via `partialize` en een v1 → v2 `migrate` voor de `displayCurrency` → `baseCurrency` rename.
- Selectors: `selectActivePortfolio`, `selectActiveHoldings`, `selectFactorScoreForTicker`, `selectPositionRiskForTicker`, `selectIsProfileComplete`.
- Type uitbreidingen in `src/types/profile.ts`: `InvestmentObjective`, `InvestorPreferences`, `ProfileCompleteness`, `ProfileCompletenessField`. `UserProfile.objective` is nu verplicht (alignt met Prisma).
- Nieuwe typebestanden: `src/types/screener.ts` (`ScreenerFilters`, `DefensivenessLevel`) en `src/types/watchlist.ts` (`WatchlistItem`).
- Vitest-suites voor alle drie de stores (`usePortfolioStore.test.ts`, `useProfileStore.test.ts`, `useAppSettingsStore.test.ts`).

### Changed
- Storebestanden volgen nu de `useXxxStore.ts` naming (was `xxx-store.ts`). Barrel `src/store/index.ts` geherstructureerd.
- `useAppSettingsStore` persistkey versie bump 1 → 2; oude `displayCurrency` wordt automatisch gemigreerd.
- `src/types/index.ts` re-exporteert `screener` en `watchlist`.

### Removed
- Legacy `src/store/portfolio-store.ts`, `profile-store.ts`, `app-settings-store.ts` (vervangen).

## [Unreleased] - 2026-04-23 · Datamodel uitbreiding

### Added
- Prisma-modellen `MarketSnapshot`, `FactorSnapshot`, `StrategyPreset`, `BacktestRun`, `WatchlistItem`.
- Prisma enums `InvestmentObjective`, `RegimeLabel`, `StrategyType`, `RebalanceFrequency`, `BacktestStatus`, `HealthGrade`.
- Optionele enrichment-kolommen op `Holding`: `beta`, `volatility`, `moatLikeScore`, `targetWeight`, `convictionScore`.
- `UserProfile.objective` en `UserProfile.policy` (Json) afgestemd op `PolicySettings` domeintype.
- Denormalisaties op `PortfolioSnapshot`: `unrealizedPnl`, `unrealizedPnlPct`, `volatility`, `drawdown`, `regimeLabel`, `healthGrade`, `healthScore`.
- Unique-constraints: `Holding(portfolioId, ticker)`, `WatchlistItem(userId, ticker)`, `FactorSnapshot(ticker, capturedAt, model)`.
- Tijdreeks-indexen op `MarketSnapshot(capturedAt)`, `FactorSnapshot(ticker, capturedAt)`, `PortfolioSnapshot(portfolioId, capturedAt)`, `BacktestRun(userId, startedAt)`.
- Idempotent seed-script `prisma/seed.ts` met demo-user, portefeuille, holdings, snapshots, watchlist, strategy presets en een voltooide backtest.
- `prisma.seed`-configuratie in `package.json`, plus scripts `prisma:seed` en `prisma:reset`.
- `tsx` als dev dependency voor het draaien van het TypeScript seed-script.

### Changed
- `portfolioRepository.mapHolding` mapt nu de nieuwe enrichment-kolommen naar het domeintype; `Decimal`-waarden worden defensief naar `number` of `undefined` genormaliseerd.
- README: aangescherpte database-sectie met migrate + seed + reset flow.

## [Unreleased] - 2026-04-23 · Domein-typesysteem

### Added
- `src/types/factor.ts`: `FactorKey`, `FactorSubScores`, `FactorWeights`, `FactorScore`, `FundamentalsSnapshot`.
- `src/types/regime.ts`: `MarketRegimeState`, `MarketTrend`, `VolatilityRegime`, `MarketRegimeIndicator`, `MarketRegime`.
- `src/types/allocation.ts`: `AllocationSlice` (nu canoniek hier), `AllocationAction`, `RebalanceFrequency`, `AllocationRecommendation`, `AllocationPlan`.
- `src/types/risk.ts`: `RiskSeverity`, `RiskFlag`, `PositionRiskAnalysis`, `PortfolioRiskSummary`.
- `src/types/backtest.ts`: `BacktestConfig`, `EquityPoint`, `RegimeBreakdown`, `BacktestResult`, `BenchmarkComparison`, `StrategyPreset`.
- `PortfolioHealthSummary`, `PortfolioHealthSignal`, `HealthGrade`, `HealthSignalSeverity` in `src/types/summary.ts`.
- `PolicySettings` en `EsgStance` in `src/types/profile.ts`; `UserProfile.policy?` toegevoegd.
- `Position` alias van `Holding` voor UI-leesbaarheid.
- Optionele verrijkingsvelden op `Holding`: `beta`, `volatility`, `moatLikeScore`, `targetWeight`, `convictionScore`, `factorScore`, `riskAnalysis`.
- Compile-time typetests in `src/types/types.test.ts`.

### Changed
- `src/types/summary.ts` importeert `AllocationSlice` nu uit `./allocation` (geen duplicatie meer).
- `src/types/index.ts` volgt de dependency-layering en re-exporteert alle domeintypes.
- `src/lib/analytics/factor-scoring.ts` consumeert `FactorScore` / `FactorWeights` uit `@/types/factor` (canoniek contract). `FactorScore.subScores` vervangt de oude `scores`-map; `asOf` toegevoegd.
- `src/lib/analytics/risk.ts`: `RiskSnapshot` vervangen door `ConcentrationMetrics` (subset van `PortfolioRiskSummary`). `computeConcentrationMetrics` is de nieuwe naam; `computeRiskSnapshot` blijft als alias voor backward compatibility.

## [Unreleased] - 2026-04-23

### Added
- Next.js 15 App Router foundation met TypeScript strict mode en premium dark theme.
- Route placeholders voor `/dashboard`, `/portfolio`, `/screener`, `/maandbeslissing`, `/risico`, `/strategy-lab`, `/backtest`, `/chat` en `/profiel` in de `(app)` route-group.
- AppShell met Sidebar, TopBar en responsieve MobileNav (Radix Dialog / Sheet).
- Herbruikbare UI-componenten: `Logo`, `PageHeader`, `MetricCard`, `EmptyState`, `Section` en shadcn primitives `Button`, `Card`, `Sheet`, `Separator`, `Badge`, `Skeleton`.
- Tailwind design tokens (premium dark first) met `surface`, `surface-elevated`, `success`, `warning` en `premium` shadow.
- Prisma schema met `User`, `UserProfile`, `Portfolio`, `Holding`, `PortfolioSnapshot` plus enums voor investor type, risicotolerantie en asset class; PostgreSQL als target.
- Type definities voor `Holding`, `Portfolio`, `PortfolioSnapshot`, `UserProfile`, `InvestorGoal`, `PortfolioSummary` en `AllocationSlice`.
- Analytics engines: `computePortfolioSummary`, `computeConcentration`, `computeRiskSnapshot`, plus een factor-scoring placeholder met gewichten.
- AI explainability placeholder (`DecisionTrace`, `createTrace`).
- CSV holdings parser placeholder voor broker-imports.
- Zustand stores: `usePortfolioStore`, `useProfileStore`, `useAppSettingsStore` (met `persist` middleware).
- Repository-laag `portfolioRepository` en singleton Prisma client.
- Vitest setup met unit tests voor `portfolio-summary` en `risk`.
- `.env.example`, ESLint config, README en deze CHANGELOG.
