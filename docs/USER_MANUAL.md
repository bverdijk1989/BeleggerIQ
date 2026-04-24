# BeleggerIQ 2.0 — Gebruikershandleiding

> Versie: 2026-04-24  ·  URL: https://beleggeriq.aegiscore.nl  ·  Voor Nederlandse langetermijnbeleggers met een DEGIRO-portefeuille.

---

## Inhoud

1. [Wat is BeleggerIQ](#1-wat-is-beleggeriq)
2. [Filosofie — waarom het werkt zoals het werkt](#2-filosofie--waarom-het-werkt-zoals-het-werkt)
3. [Eerste setup](#3-eerste-setup)
4. [Hoofdconcepten — lezen van de cijfers](#4-hoofdconcepten--lezen-van-de-cijfers)
5. [Pagina per pagina](#5-pagina-per-pagina)
   - [5.1 Dashboard](#51-dashboard)
   - [5.2 Portefeuille](#52-portefeuille)
   - [5.3 Risico](#53-risico)
   - [5.4 Maandbeslissing](#54-maandbeslissing)
   - [5.5 Screener](#55-screener)
   - [5.6 Strategy Lab](#56-strategy-lab)
   - [5.7 Backtest](#57-backtest)
   - [5.8 Chat](#58-chat)
   - [5.9 Profiel](#59-profiel)
6. [Typische workflows](#6-typische-workflows)
7. [Interpretatie — wanneer vertrouw je een signaal](#7-interpretatie--wanneer-vertrouw-je-een-signaal)
8. [Troubleshooting](#8-troubleshooting)
9. [Glossarium](#9-glossarium)

---

## 1. Wat is BeleggerIQ

BeleggerIQ is een **portfolio-analyseapp voor langetermijnbeleggers**. Geen trading-dashboard, geen real-time chart-gazerij. De app beantwoordt elke maand één rustige vraag: *wat doe ik met mijn bijdrage?* — en de bijvragen daaromheen:

- Welke posities zijn stilletjes risico's geworden?
- Wat zegt de markt nu over risicobereidheid?
- Welke aandelen zijn koopwaardig volgens mijn strategie?
- Hoe had mijn strategie het historisch gedaan?

**Niet** voor: day-trading, turbo's/opties, short-term momentum-wedstrijdjes, crypto.

**Wel** voor: IWDA + kwaliteitsaandelen, maandelijkse bijkoop, jaarlijks rebalancen, "wat kies ik voor de lange termijn".

---

## 2. Filosofie — waarom het werkt zoals het werkt

Drie principes die overal in de app terugkomen:

### 2.1 Niets is een zwarte doos

Elke aanbeveling in BeleggerIQ is herleidbaar tot een concrete drempel. Krijg je een `BUY_CANDIDATE` naast NVIDIA? Dan zie je óók: *composite 78/100, quality 85, momentum 72, headroom 3%pt onder je policy-cap*. Geen "AI zegt koop NVDA" — er is geen LLM die cijfers verzint. De Chat-pagina leest uit dezelfde engines als de rest; hij herverpakt alleen de cijfers.

### 2.2 Let winners run, zelfs als ze boven je cap komen

De Rebalance Engine pakt een zware positie (bv. 15% terwijl je cap 10% is) **niet automatisch aan**. Als de factor-signalen sterk zijn (`HEALTHY` classificatie), blijft het signaal `NO_ACTION` tot de positie echt fors overwogen is (default: 2× de cap, dus 20%). Een zwakke overwogen positie (`FRAGILE`) krijgt wél een `TRIM_HEAVY`.

### 2.3 Signalen worden *gewogen* door coverage

Als de factor engine maar drie van de tien datapunten heeft, is de confidence laag en zal de actie `WATCH` zijn — zelfs als de drie beschikbare scores toevallig sterk zijn. Je krijgt nooit een BUY-signaal op dunne data.

---

## 3. Eerste setup

### 3.1 Inloggen

Open https://beleggeriq.aegiscore.nl — je komt direct op het Dashboard binnen als demo-user (zolang `BIQ_ALLOW_DEMO_AUTH=true` in de server-env staat). Een echte login-flow zit nog op de roadmap.

### 3.2 Je profiel invullen

Ga naar **Profiel** en vul minimaal in:

- **Investment objective**: `BALANCED` voor "brede kwaliteitsportefeuille", `INCOME` voor dividend-focus, `GROWTH` voor momentum-zwaar, `FIRE` voor retire-early (quality + momentum + min. score-eisen), `CAPITAL_PRESERVATION` voor defensief, `RETIREMENT` voor pensioenopbouw.
- **Policy — max positieweight**: de harde cap per aandeel, default 10%. Wees hier niet te soepel: 10-15% is gezond voor een portefeuille van 20+ posities.
- **Policy — cash buffer %**: fractie van je portefeuille die je altijd aanhoudt, default 5%.
- **Monthly contribution**: je maandelijkse inleg in EUR. Default €500 als leeg.

Deze instellingen bepalen hoe de Allocation Engine en Rebalance Engine scoren.

### 3.3 DEGIRO-export importeren

1. Log in op DEGIRO → Portefeuille → download CSV-export (volledig portefeuille-overzicht, niet transacties).
2. In BeleggerIQ: **Portefeuille** → knop **"DEGIRO import"**.
3. Sleep of selecteer de CSV. Maximaal 5MB, alleen `.csv` of text-formaten.
4. Je krijgt een preview. Bevestig met **"Importeren"**.

De parser doet:
- ISIN-extractie (essentieel voor live koersen — zonder ISIN kan de Symbol Resolver geen Yahoo-ticker vinden).
- Quantity + avgCostPrice + currentPrice (sluitkoers) per positie.
- Idempotent: dezelfde CSV tweemaal uploaden dedupliceert op ISIN.

Na import zie je je positions op **Portefeuille**. De **koersen** worden vervolgens live opgehaald via Yahoo Finance; duurt een paar seconden de eerste keer (Yahoo search per ISIN), daarna gecached.

---

## 4. Hoofdconcepten — lezen van de cijfers

### 4.1 Factor-scores (per aandeel)

Elke holding krijgt vier sub-scores op schaal **0..100**:

| Factor | Hoog = | Input (voornaamste) |
|---|---|---|
| **Quality** | Sterke balans, hoge marges, lage schulden | ROIC, ROE, debt/equity, grossMargin, operatingMargin, FCF yield |
| **Value** | Aantrekkelijk gewaardeerd | P/E, forward P/E, P/B, EV/EBITDA, dividendrendement |
| **Momentum** | Positieve trend | 6m return, 12m return, 12m-1m, afstand van 52w high |
| **LowVol** | Minder volatiliteit | geannualiseerde volatility, drawdown, beta |

Ze rollen op tot een **composite** (gewogen gemiddelde, weights instelbaar via Profile/Strategy Lab) en een **confidence** (0..1 — fractie bruikbare signalen). ETFs krijgen vaak confidence 0 omdat Yahoo geen company-fundamentals levert voor fondsen.

### 4.2 Actie-badge (per aandeel)

Op basis van composite + confidence + weight:

| Badge | Betekent |
|---|---|
| `BUY_CANDIDATE` | Composite ≥ 75 én voldoende coverage. Kandidaat voor bijkoop. |
| `HOLD` | Composite ≥ 60, gewicht binnen cap. Niets doen. |
| `WATCH` | Onvoldoende data (coverage < 30%) óf score 35-60. Monitor. |
| `TRIM` | Composite < 50 én overweight vs target. Overweeg afbouwen. |
| `AVOID` | Composite ≤ 35. Verkoop overwegen. |

Zie [`src/lib/analytics/holding-action.ts`](../src/lib/analytics/holding-action.ts) voor de exacte drempels.

### 4.3 Risk severity (per positie + portefeuille)

Vijf niveaus: `low` / `moderate` / `elevated` / `high` / `critical`. Portfolio-severity is de slechtste van de posities, met minimaal de sector- en currency-exposure-scores erbij gewogen.

### 4.4 Concentration type (rebalance-engine)

| Type | Betekent |
|---|---|
| `HEALTHY` | Zware positie met sterk factor-profiel — "let winners run". |
| `NEUTRAL` | Gemengd profiel. Gezonde bandbreedte. |
| `FRAGILE` | Zwakke factor-signalen bij een significante positie. Kwetsbaar. |

Fragility-score 0..100 onderliggend. Drempels: ≥60 → FRAGILE, ≥35 → NEUTRAL, anders HEALTHY.

### 4.5 Market regime score

Score 0..100 + stance:

| Stance | Score | Betekent |
|---|---|---|
| `RISK_ON` | ≥ 65 | Breed positief sentiment. Momentum bias kan hoger, lowVol bias lager. |
| `NEUTRAL` | 35-65 | Geen duidelijk signaal. |
| `DEFENSIVE` | ≤ 35 | Spreads uit, breadth beperkt, quality bias hoger, budget multiplier lager. |

De score telt valuation percentile, VIX, 10y-yield, breadth en credit spreads bij elkaar. Het effect: in RISK_ON koopt de Monthly Buy Engine iets agressiever; in DEFENSIVE houdt 'ie bewust meer cash vast en voorkeur naar core-ETF fallback.

### 4.6 Health-grade (A..F)

Portfolio-level samenvatting op schaal A/B/C/D/F. Combineert diversificatie, gemiddelde quality, risico-alignment met je policy, factor-alignment met je objective, en (optioneel) regime-alignment. Handig voor in één oogopslag weten of je op koers ligt.

---

## 5. Pagina per pagina

### 5.1 Dashboard

**Doel**: één blik per maand om je stand te zien.

**Wat je ziet (van boven naar beneden)**:

1. **TopStats** — 4 kaarten: portefeuille-waarde (+ PnL), risk severity, health grade, regime stance.
2. **NextAction** — de #1 aandacht-item uit de combinatie van risk flags + rebalance recommendations.
3. **Market Regime Card** — stance + score + narrative + sub-drivers.
4. **Holdings Allocation** — top 5 posities als gewichtsstaaf.
5. **Currency Allocation** — EUR vs vreemde valuta.
6. **Top Risks** — drie hoogste risk-flags.
7. **Top Opportunities** — drie beste screener-resultaten (factor-score gesorteerd).
8. **Buy Plan Preview** — 3-regel samenvatting van je maandbeslissing.
9. **Historiek** — 5 time-series grafieken van snapshots: waarde, drawdown, valuta-exposure, gemiddelde composite, grootste positie.

**Actie-knop**: "Snapshot nu" — legt huidige staat vast in historiek.

**Tip**: refresh Dashboard maandelijks voor je bijkoop-besluit. De app cachet quotes 60s, FX 5min; state blijft consistent binnen een sessie.

### 5.2 Portefeuille

**Doel**: alle posities beheren + inhoudelijk analyseren.

**Bovenkant**:
- Totale waarde, aantal posities, grootste positie, valuta-verdeling
- Knoppen: **DEGIRO import** + **Positie toevoegen** (handmatig)

**Holdings-tabel**:
- Naam + symbool
- Aantal + koers + waarde + %
- Valuta
- Quality / Value / Momentum / Totaal (composite)
- Actie-badge met dubbel-klik voor rationale

**Score-legend** onderaan: welke kleur = welke drempel.

**Workflow**:
1. Na elke DEGIRO-export → importeer opnieuw (idempotent).
2. Sorteer op `Totaal desc` om kwaliteit-zwakste posities boven te krijgen.
3. Klik op een rij voor detailweergave met breakdown per sub-score.

**ETFs en factor-scores**: Yahoo levert voor ETFs geen company-level fundamentals. ETFs zullen daarom vaak `Quality`, `Value` etc. op 50 houden en actie = `WATCH`. Dat is correct gedrag: kwaliteit-op-holding-level is niet van toepassing op een gespreid fonds.

### 5.3 Risico

**Doel**: zien waar je kwetsbaar bent.

**Secties**:

1. **Risk Top Summary** — overall severity + drie kernmetrics (top5 weight, largest position, foreign currency %).
2. **Attention Summary** — top flags die aandacht vragen, gesorteerd op severity.
3. **Concentration Overview** — HHI (Herfindahl), top5-weight, sector-HHI, region-HHI.
4. **Sector Exposure** — staafgrafiek met cyclische (rood) vs defensieve (groen) sectors.
5. **Currency Exposure** — foreign currency risk.
6. **Top Risk Flags** — volledige lijst van flags met message en metric.
7. **Risk Positions Table** — per positie: beta, vol, risk score.
8. **Scenario Panel** — wat zou je portefeuille doen bij: -20% markt, +10% markt, rente +1%, energie +50%, etc. Toont delta in EUR per scenario.

**Actiegerichte tip**: als `foreignCurrencyExposure > 0.40` en je tijdshorizon is <5 jaar, overweeg hedging of herbalanceren richting EUR-genoteerde assets.

### 5.4 Maandbeslissing

**Doel**: "wat koop ik deze maand met mijn bijdrage".

**Inputs-form** bovenaan:
- **Budget** — default uit je profiel, override mogelijk.
- **Objective** — override mogelijk (bv. tijdelijk FIRE).
- **Bias** — extra momentum/quality/lowVol bias sliders.
- **Regime override** — simuleer RISK_ON of DEFENSIVE.

**Output-secties**:

1. **PlanHero** — totaal deployable, aantal recommendations, cash reservation reden.
2. **Warnings banner** — bv. "regime is defensief, extra cash-holdback van 25%".
3. **Recommendations grid** — per kandidaat:
   - Ticker + naam
   - Bedrag in EUR
   - Priority-score 0..100
   - Breakdown: factor / underweight / regime / objective / concentration
   - Rationale-bullets (max 4)
4. **Simulation compare** — je post-buy portefeuille: nieuwe top-5 weights, nieuwe composite, regime alignment.

**Workflow**:
1. Begin van de maand: open Maandbeslissing.
2. Check je budget en objective (staan meestal goed vanuit profile).
3. Bekijk de 3-5 aanbevolen kandidaten.
4. Lees bij elke recommendation de rationale — komt 'ie overeen met je eigen view?
5. Bij twijfel: klik door naar `/portfolio` voor de factor-scores, of gebruik de Chat ("waarom krijg ik dit advies voor X?").
6. Plaats de orders zelf in DEGIRO.
7. Na een paar dagen: importeer DEGIRO-CSV opnieuw zodat BeleggerIQ je nieuwe posities kent.

**Interpretatie tip**: een kandidaat met priority >80 is een duidelijk signaal. Tussen 50-80 is "redelijk". Onder 50 wordt 'ie gefilterd tenzij je weinig alternatieven hebt.

### 5.5 Screener

**Doel**: aandelen zoeken buiten je huidige portefeuille die passen bij je factor-voorkeuren.

**Filters**:
- Sector, region, market cap
- Minimale Quality / Value / Momentum score
- Dividend yield minimum
- Composite minimum

**Tabel**: gesorteerd op composite desc. Per rij: ticker, naam, sector, sub-scores, composite, beleidsstatus.

**Detail-drawer** (klik op een rij):
- Volledige fundamentals (ROIC, P/E, margins, ...)
- Factor rationales
- "Toevoegen aan watchlist" button
- Vergelijking met sector-gemiddelde

**Use case**: je kijkt naar je maandbeslissing en denkt *"ik heb alleen maar tech — wat is de beste quality-positie in healthcare?"* → Screener → filter sector = Healthcare, sorteer op Quality desc.

Universe: `DEFAULT_SCREENER_UNIVERSE` (momenteel ~50 blue-chip tickers verspreid over sectoren/regio's; uitbreidbaar).

### 5.6 Strategy Lab

**Doel**: eigen factor-strategieën bouwen + opslaan voor backtest.

**Config-form**:
- **Naam + beschrijving**
- **Rebalance frequency**: monthly / quarterly / semiannual / annual
- **Max positions** en **max position weight**
- **Factor weights**: slider per factor (Quality/Value/Momentum/LowVol), totaal hoeft geen 1 te zijn — engine normaliseert.
- **Toggles**:
  - `requireDividend`: alleen posities met dividend >0 zijn kandidaat
  - `defensiveOverlay`: zwaarder gewicht naar lowVol in volatiele periodes
  - `useMomentum`: schakel momentum uit voor pure kwaliteits-strategie
- **Limits**:
  - `maxSectorWeight`: harde sector-cap

**Presets**: de seed-data bevat een paar publieke templates (Quality Global, High Dividend EU, Momentum Core). Jouw eigen presets zijn privé.

**Workflow**:
1. Bouw een strategie (bv. "Kwaliteit NL", 70% quality + 30% lowVol, monthly, max 10 posities).
2. Opslaan.
3. Ga naar Backtest, selecteer je preset, draai 'm.
4. Vergelijk CAGR/Sharpe met bv. VWCE (default benchmark).
5. Als het bevalt: gebruik de preset als referentie bij je Maandbeslissing (manuele interpretatie).

### 5.7 Backtest

**Doel**: historische simulatie van een strategie.

**Inputs**:
- Strategy (preset of built-in)
- Start date + end date
- Initial capital
- Monthly contribution
- Commission (in bps, default 25 = 0.25%)
- Benchmark ticker (default: IWDA)

**Outputs**:

1. **MetricsCards** — CAGR, Sharpe, Sortino, Calmar, max drawdown, win rate, total return, turnover, trades count.
2. **EquityChart** — strategy vs benchmark vs 60/40 gestandaardiseerd.
3. **Disclaimer** — past performance ≠ future results, slippage niet gemodelleerd, etc.

**Tips**:
- 10-jaars window geeft het meest robuuste beeld.
- Commission van 25 bps is realistisch voor DEGIRO gross-orders.
- Monthly rebalance is het zwaarste regime; quarterly of semiannual geeft hogere na-kosten returns in de meeste backtests.
- Vergelijk altijd met benchmark — een CAGR van 8% is niet sterk als de benchmark 10% deed.

### 5.8 Chat

**Doel**: natuurlijke taal front voor de explain-layer.

**Hoe het werkt**: je typt een vraag → intent-detectie → juiste engine wordt aangeroepen → deterministische tekst-renderer produceert antwoord. **Geen LLM**: er worden geen nieuwe cijfers verzonnen.

**5 intents die worden herkend**:

| Intent | Voorbeeld-vraag |
|---|---|
| `holding_score` | "Waarom scoort ASML 72?" |
| `fragile_concentration` | "Welke positie is kwetsbaar?" |
| `buy_plan` | "Wat zou ik deze maand kopen?" |
| `market_regime` | "Wat is het regime?" |
| `portfolio_risks` | "Waar zit mijn grootste risico?" |

**Fallback**: als de intent niet herkend wordt, antwoordt Chat met uitleg wat 'ie wél kan. Nooit gokken.

**Context-chips** bovenaan tonen realtime: portfolio-waarde, regime, risk-severity, health-grade, plan-preview.

### 5.9 Profiel

**Doel**: instellingen die alle engines voeden.

**Secties**:

- **Beleggersprofiel**: objective, risicotolerantie, time horizon
- **Policy**: caps en limits (max position weight, min dividend yield, etc.)
- **Preferences**: UI-opties (bv. EUR vs USD als base currency)
- **Goals**: vrije tekst voor persoonlijke doelen

**Wijzigingen hier** hebben direct effect op /maandbeslissing en /risico. Ze hebben géén directe invloed op /portfolio (posities blijven zoals ze zijn), maar wel op de acties-badges.

---

## 6. Typische workflows

### 6.1 Maandelijks (5 minuten)

```
1. Open /dashboard — check TopStats (groen?)
2. Lees NextAction — is er iets urgents?
3. Open /maandbeslissing
4. Lees top-3 recommendations + rationales
5. (Als je doorgaat) plaats orders in DEGIRO
6. Binnen een week: upload nieuwe DEGIRO-CSV naar /portfolio
7. Snapshot-knop op Dashboard → historiek update
```

### 6.2 Bij markt-turbulentie (15-30 min)

```
1. /dashboard → Market Regime card: is het DEFENSIVE?
2. /risico → Scenario Panel: wat gebeurt bij -20%?
3. /risico → Top Risk Flags: iets nieuws?
4. /portfolio → sorteer op Totaal asc — welke posities zijn verzwakt?
5. Overweeg: TRIM op FRAGILE posities die ook nog overweight zijn.
6. /maandbeslissing → budget-multiplier is automatisch verlaagd als regime DEFENSIVE is.
```

### 6.3 Strategie-experiment (30-60 min)

```
1. /strategy-lab → bouw een variant op je huidige strategie.
2. /backtest → draai 10 jaar.
3. Vergelijk metrics.
4. Als beter: neem de principes manueel over in je maandbeslissing-interpretatie.
   (De engine ranked automatisch met jouw profile; je kan geen preset als "default" instellen — dat is een toekomstig feature.)
```

### 6.4 Jaarlijks (1-2 uur)

```
1. Review /profiel — is je objective/horizon nog hetzelfde?
2. Review /risico → Scenario Panel met grotere schok (bv. -35%).
3. /backtest → draai je favoriete strategie nogmaals met de laatste 12m erbij — drift?
4. Historiek op /dashboard — hoe is je 12m gegaan vs benchmark?
5. Eventueel policy-caps aanpassen (bv. maxPositionWeight 10% → 8% voor meer spreiding).
```

---

## 7. Interpretatie — wanneer vertrouw je een signaal

### 7.1 "Moet ik deze BUY_CANDIDATE nu kopen?"

**Ja, als**:
- Composite ≥ 75 én confidence ≥ 0.6
- Priority-score in /maandbeslissing > 70
- De rationale-bullets in lijn zijn met je eigen view

**Twijfel, als**:
- Confidence < 0.5 (beperkte data)
- Alleen één sub-score trekt de composite omhoog (bv. momentum 90 maar quality 45)
- Regime is DEFENSIVE én het aandeel is cyclisch

**Nee, als**:
- Rationale noemt een éénmalig event (dividend-uitkering, overname-rumor)
- De positie brengt je sector-exposure boven je policy-cap

### 7.2 "Moet ik deze TRIM uitvoeren?"

**Ja**: als zowel factor-profile zwak is (`FRAGILE`) én gewicht > 1.5× je cap. Dan is het een `TRIM_HEAVY`.

**Nee**: als het een `HEALTHY`-winner is die simpelweg groot is geworden. "Let winners run" is design-principe. Pas ingrijpen boven 2× cap.

### 7.3 "Het regime is DEFENSIVE — moet ik verkopen?"

**Bijna nooit**. Regime beïnvloedt vooral *nieuwe bijkoop* (hoeveel van je bijdrage wordt gedeployed vs in cash gehouden). Bestaande posities met sterk factor-profiel blijven bij voorkeur staan.

### 7.4 "Een positie heeft WATCH — moet ik iets doen?"

`WATCH` betekent: **onvoldoende data om een oordeel te geven**. Dat is anders dan "zwak". Meestal:
- ETFs hebben per definitie WATCH (geen company fundamentals).
- Small-caps buiten US/EU krijgen soms WATCH door missing Yahoo data.

Niet acuut doen. Kijk over 1-2 maanden of de scores verbeteren zodra provider-data kompleet is.

---

## 8. Troubleshooting

### 8.1 "Totale waarde klopt niet met DEGIRO"

**Oorzaak**: meestal **FX-rates**. Als Yahoo geen FX levert, valt de app terug op hardcoded rates in de None-provider, of 1:1. Check /portfolio → bovenaan valuta-verdeling — als je USD posities hebt en FX staat op 1, zie je ze te hoog.

**Fix**: zorg dat `MARKET_DATA_PROVIDER=yahoo` in de server-env staat en dat de Yahoo-adapter werkt (geen errors in logs).

### 8.2 "Alle factor-scores zijn 50"

**Oorzaak**: de symbol-resolver kan je tickers niet matchen met Yahoo. DEGIRO gebruikt vaak de eerste-woord-van-naam (VANGUARD, NVIDIA) wat geen Yahoo-symbool is.

**Fix**: 
1. Check dat je holdings een ISIN hebben (`SELECT ticker, isin FROM "Holding";` in psql).
2. Als ISIN leeg is: import opnieuw uit DEGIRO — hun CSV-export heeft de ISIN meestal mee.
3. Als ISIN er wel is maar resolver faalt: check de logs op `yahoo:resolve` regels voor specifieke tickers.

### 8.3 "Acties blijven allemaal WATCH"

Zie 7.4 — meestal normaal voor ETFs. Voor individuele aandelen: controleer of Yahoo fundamentals levert voor die ticker (Chat: *"waarom is coverage van X laag?"*).

### 8.4 "Maandbeslissing toont 0 aanbevelingen"

**Oorzaken**:
- Budget is 0 (profile niet ingevuld)
- Alle kandidaten hebben composite < minCandidateComposite (default 45)
- Alle kandidaten halen objective minimum niet (bv. FIRE vereist quality ≥ 50)

**Fix**: check /maandbeslissing → warnings banner. De engine logt altijd waarom 'ie geen recommendations kon maken.

### 8.5 "Ik krijg 404 in de browser"

Zie `docs/HARDENING_AUDIT.md` → sectie "Current state". Meestal is het een server-probleem, niet de app. Check:
```bash
sudo systemctl status beleggeriq
curl -I https://beleggeriq.aegiscore.nl/dashboard
sudo journalctl -u beleggeriq -n 50
```

---

## 9. Glossarium

| Term | Definitie |
|---|---|
| **Composite score** | Gewogen gemiddelde van factor sub-scores, 0..100. |
| **Confidence** | 0..1 fractie, hoeveel van de factor-signalen data hadden. <0.3 triggert WATCH. |
| **DEGIRO import** | CSV-upload met portefeuille-overzicht → upsert in BeleggerIQ. |
| **Drawdown** | Fractie daling vanaf piek, negatief getal (-0.15 = -15%). |
| **Factor** | Quality / Value / Momentum / LowVol. Elke factor heeft sub-scores die erbij optellen. |
| **Fragility-score** | 0..100, hoe kwetsbaar een zware positie is. ≥60 = FRAGILE. |
| **HHI** | Herfindahl-Hirschman Index — som van gekwadrateerde gewichten. 1 = alles in één positie, 1/n = gelijk verdeeld. |
| **Holding** | Één positie in je portefeuille. |
| **ISIN** | International Securities Identification Number. Uniek voor elke gelistete effect. |
| **Market Regime** | RISK_ON / NEUTRAL / DEFENSIVE — stance van de markt. Score 0..100. |
| **Monthly Buy Engine** | De allocation-engine die je /maandbeslissing produceert. |
| **PolicySettings** | Jouw harde caps en drempels uit /profiel. |
| **Priority** | 0..100 score van een bijkoop-kandidaat, combineert factor + underweight + regime + objective + concentratie. |
| **Rebalance action** | NO_ACTION / TRIM_LIGHT / TRIM_HEAVY / RECONSIDER. |
| **Regime stance** | RISK_ON / NEUTRAL / DEFENSIVE. |
| **Severity** | low/moderate/elevated/high/critical — schaal voor risico-flags. |
| **Snapshot** | Vastlegging van portefeuille-staat op een moment. Drijft de historiek-grafieken. |
| **Sub-score** | Eén van Quality/Value/Momentum/LowVol, 0..100. |
| **Symbol resolver** | Module die ticker+ISIN → Yahoo-symbool vertaalt. |
| **Target weight** | Gewenst gewicht van een positie volgens je strategie of policy. |
| **Turnover** | Jaarlijkse fractie portefeuille die wordt omgewisseld. |

---

**Vragen, bugs, suggesties**: bewaar ze in GitHub issues of vraag via de Chat-pagina.

*Laatste update: 2026-04-24 · Versie 2.0.*
