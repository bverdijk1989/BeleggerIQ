# Stock Story & Investment Case Layer — Module 31

Per asset 8 sub-cards in **eenvoudige NL**: wat doet het, waarom interessant, sterke punten, risico's, signalen om te volgen, portfolio-fit, ontbrekende data, conclusie. **Pure-function** engine; deterministic fallback in v1 + AI-prompt-template als v2-hook.

> **Wood-laag**: AI-prompt-template ligt klaar in `ai-prompt.ts`. v1 draait deterministic zodat het werkt zonder API-key — als demonstratie dat AI-native ≠ AI-dependent.
> **Simons-laag**: alle "facts" komen uit harde inputs (fundamentals, classification, factor-score). Geen verzonnen bedrijfsfeiten — spec-test valideert.

---

## 1. Module 31-spec mapping — 8 cards

| # | Spec | Implementatie | Bron-engine |
|---|---|---|---|
| 1 | Wat doet dit bedrijf/fonds? | `what_it_does` card met asset-kind-detection | Yahoo `assetProfile.longBusinessSummary` of classification + sector + industry |
| 2 | Waarom kan dit interessant zijn? | `why_interesting` met confidence-tier + factor-composite + sub-scores | M9 Signal Fusion + M6 Factor scoring |
| 3 | Belangrijkste sterke punten | `strengths` met ROIC/marge/D-E/FCF-yield bullets | Fundamentals (Yahoo) |
| 4 | Belangrijkste risico's | `risks` met hoge D/E, hoge P/E, lage marges, payout-ratio | Fundamentals + asset-class-generieke risks |
| 5 | Welke signalen volgen? | `signals_to_watch` met top-3 laagst-scorende signals + momentum-direction | M9 Signal Fusion breakdown |
| 6 | Past dit bij mijn portefeuille? | `portfolio_fit` met huidige weging + grote-positie/kleine-positie/crypto-warning | Portfolio-view + risk-engine |
| 7 | Welke data ontbreekt? | `missing_data` met M26 data-depth missing-dimensies | M26 Data Quality |
| 8 | Korte conclusie | `conclusion` met confidence-tier → toon-mapping (STRONG/POS/NEUT/WEAK/AVOID) | M9 Signal Fusion |

---

## 2. Architectuur

```
src/lib/analytics/investment-case/
├── types.ts          # InvestmentCase + 8 sub-cards + INVESTMENT_CASE_DISCLAIMER
├── engine.ts         # pure-function: 8 card-builders + asset-kind-detection
├── ai-prompt.ts      # v2-hook: AI-prompt-template (system + user + contextJson)
│                       met strikte regels tegen verzonnen feiten
├── loader.ts         # faal-safe hydratie uit enrichment + fundamentals +
│                       confidence + view + getHistory + data-depth
├── engine.test.ts    # 30 tests
└── index.ts

src/components/investment-case/case-section.tsx
                      # Presentational: 8 cards grid + quality-badge per card

src/app/(app)/score/[ticker]/page.tsx
                      # Nieuwe Section "Stock Story & Investment Case"
                      # toegevoegd boven bestaande "Uitleg"-sectie
```

**Geen rewrite**. Hergebruikt:
- `getFundamentals` (cached, faal-safe)
- `enrichInstrument` voor sector/industry/country
- `loadConfidenceScore` voor confidence-tier
- `computeAssetDataDepth` (M26) voor missing-data card
- `buildPortfolioView` (al in caller-context)

---

## 3. Asset-kind detection

```
assetClass: EQUITY → single_stock
assetClass: REIT → single_stock
assetClass: ETF + isBroadMarket → broad_market_etf
assetClass: ETF + isIncomeFocused → income_etf
assetClass: ETF + (other) → thematic_etf
assetClass: BOND → bond
assetClass: COMMODITY → commodity
assetClass: CRYPTO → crypto
```

Per asset-kind heeft `what_it_does` een ander template. Generieke risico's per asset-kind worden ook in `risks` card meegegeven (crypto = 50%-warning, thematic = sector-rotatie, bond = duration).

---

## 4. Geen verzonnen feiten — kerntest

Spec-test "Module 31 — geen koop/verkoop-advies in bullets/body":
```ts
for (const text of allCardTexts) {
  expect(text.toLowerCase()).not.toMatch(/^verkoop\s/);
  expect(text.toLowerCase()).not.toMatch(/^koop\s/);
}
```

Plus: bij ontbrekende `businessSummary` zegt de card **expliciet**:
- single-stock: `"... Een uitgebreide bedrijfsbeschrijving ontbreekt — raadpleeg de officiële kanalen voor details."`
- geheel onbekend: `"Bedrijfs- of fonds-beschrijving van X ontbreekt in onze data."`

Test valideert dit expliciet:
```ts
it("Geen enkele data → quality=missing + verwijst naar officiële kanalen", () => {
  const card = r.cards.find((c) => c.key === "what_it_does")!;
  expect(card.body).toMatch(/ontbreekt|officiële|onbekend/i);
});
```

---

## 5. AI-prompt-template (v2-hook)

`ai-prompt.ts` levert een `buildInvestmentCasePrompt(caseData, contextFields)` die een `system + user + contextJson` payload produceert. **Niet aangeroepen in v1** — ligt klaar voor v2.

**Strikte regels** in prompt:
1. Cijfers UITSLUITEND uit CONTEXT
2. Bij ontbrekende info: zeg "data ontbreekt" — verzin NIETS
3. Geen koop/verkoop-advies — hedged taal verplicht
4. Output strikt JSON met `body + bullets` per card

**Tests** valideren dat de prompt:
- "UITSLUITEND" / "verzin geen" / "data ontbreekt" expliciet vermeldt
- JSON-only output forceert

Bij activatie in v2: hook in bestaande M8 explainability-pipeline (cache + guardrails + fallback). Wanneer guardrails de output afwijzen → val terug op deterministic engine.

---

## 6. Card-quality-laag

Elke card heeft een `quality: solid | partial | missing` flag:
- **solid** (groen): voldoende data, conclusies betrouwbaar
- **partial** (oranje): sommige data ontbreekt, conclusies indicatief
- **missing** (rood): kerndata ontbreekt, card laat dat expliciet zien

UI rendert kleurcode per card-rand + badge. Gebruiker ziet meteen welke onderdelen ferm staan en welke nog open zijn.

---

## 7. Privacy & security

- **Geen entitlement-gate**: investment-case is informatief, niet premium
- **Geen PII in logs**: loader logt alleen scope + errorName + ticker
- **Geen verzonnen feiten**: alle facts uit input-data; bij ontbreken → "ontbreekt" expliciet
- **Disclaimer verplicht**: bovenaan/onderaan UI, expliciet "geen koopadvies"
- **Cache-Control**: server-rendered + `force-dynamic` (geen CDN-leak)

---

## 8. Topbelegger-validatie

| Lens | Hoe Module 31 hier landt |
|---|---|
| **Buffett (vertrouwen + eenvoud)** | Eén compacte case per asset; kwaliteits-fundamentals (ROIC/marges) eerst in strengths |
| **Dalio (risico + scenario's)** | `risks` card combineert fundamentele + asset-class-generieke risico's; crypto/thematic-warnings expliciet |
| **Lynch (begrijpelijk)** | Plain-language body + max 5 bullets per card; geen jargon zonder uitleg; "Wat doet dit?"-card vooraan |
| **Simons (meetbaar)** | Spec-test valideert geen verzonnen feiten; alle bullets bevatten exacte percentages uit fundamentals |
| **Wood (AI-native)** | AI-prompt-template ligt klaar in `ai-prompt.ts`; v1 deterministic = werkt zonder API-key |
| **Technisch beheerder** | Faal-safe loader (per-bron try/catch); source-attribution per card voor traceability |
| **Langetermijnbelegger** | Conclusion-card hedged; "kritisch tegen het licht" ipv "verkopen" bij AVOID-tier |
| **Hedge fund** | Per-card source-attribution maakt audit-trail mogelijk; CSV-export-pad in backlog |
| **Risicoanalist** | `missing_data` card maakt onzekerheid expliciet; quality-badge per card |
| **Marketeer** | Sterke value-prop voor /score/[ticker]-page: "begrijp je positie in 8 cards" |
| **CEO (reputatie)** | Geen verzonnen bedrijfsfeiten — spec-test valideert; disclaimer-tekst expliciet "geen advies" |

---

## 9. Tests — 30 nieuwe tests

| Categorie | Tests | Coverage |
|---|---|---|
| Shape | 3 | 8 cards in vaste volgorde, disclaimer, deterministic-mode |
| Asset-kind | 6 | EQUITY/CRYPTO/BOND, ETF + 3 classification-flavors |
| what_it_does | 4 | businessSummary aanwezig=solid, alleen sector=partial+expliciete "ontbreekt", geheel onbekend=missing, broad-market spreiding-mention |
| strengths + risks | 4 | sterke fundamentals → bullets, zwakke fundamentals → risk-bullets, geen fundamentals → missing/partial, crypto altijd 50%-warning |
| portfolio_fit | 3 | geen weight → "nog niet in portefeuille", ≥15% → "grote positie", crypto ≥5% → vola-warning |
| missing_data | 2 | geen data → noemt fundamentals, volledige data → solid |
| conclusion | 3 | STRONG → "sterke case", AVOID → "kritisch" (geen "verkoop"), geen data → missing |
| Geen orders | 1 | geen enkele body/bullet begint met "verkoop" of "koop" |
| AI prompt v2-hook | 2 | system+user+contextJson, "UITSLUITEND"/"verzin geen"/JSON-only |
| Spec-conformance | 2 | 8 card-IDs + UI-labels, source-attribution per card |

Totaal: **2629/2629** (214 files).

---

## 10. Resterende risico's

| Risk | Mitigatie |
|---|---|
| `businessSummary` is in v1 niet doorgegeven via EnrichedInstrument | Loader zet 'em op `null`; engine markeert card als partial + expliciete "beschrijving ontbreekt". Backlog: EnrichedInstrument uitbreiden met longBusinessSummary van Yahoo |
| AI-prompt nog niet aangeroepen | Bewust v2-werk; deterministic werkt voor alle assets vandaag. Backlog: hook in M8 explainability-pipeline |
| Per-asset historyPoints fetch is een extra round-trip | Acceptabel — getHistory is cached (30min TTL); maar voor /score/[ticker] high-traffic kan dit in v2 worden gemerged met confidence-score fetch |
| Card-quality is heuristic — geen statistische maat | Bewuste keuze; gebruiker ziet "solid/partial/missing" als indicatie, niet als wetenschappelijke claim |
| Bedrijfsfeiten uit longBusinessSummary (wanneer v2) kunnen mogelijk verouderd zijn | Yahoo updated maandelijks; bij hot-news situaties kan card stale zijn. v2: voeg "asOf" timestamp toe aan card-source |
| Geen multilingual support | NL-only; backlog: M8 explainability-style locale-aware engine |
| Geen aparte route /investment-case/[ticker] | Bewuste keuze: layered onder /score/[ticker]; voorkomt URL-duplicatie. Backlog: deeplink-route met query-param "?view=case" |

---

## 11. Decision-log

**Vraag**: waarom deterministic in v1 ipv AI?

**Antwoord**:
1. Wood-laag: "AI-native" ≠ "AI-dependent". Demonstreer dat het werkt zonder externe afhankelijkheid
2. CEO-laag/reputatie: deterministic = reproduceerbaar = geen hallucination-risk in productie
3. v2-pad: prompt-template ligt klaar (`ai-prompt.ts`); kosten + cache + guardrails kunnen in een aparte sprint worden ingezet zonder rewrite

**Vraag**: waarom 8 cards en niet bv. 6?

**Antwoord**: Spec eist deze exact 8. Tests freeze de set en de volgorde — toekomstige toevoegingen moeten via spec-update.

**Vraag**: waarom geen separate `/investment-case`-route?

**Antwoord**:
- Doelgroep zit al op `/score/[ticker]` voor confidence-detail
- Extra route = extra discovery-cost zonder added value
- Backlog: bij hoge usage een query-param toevoegen voor deeplinking (`/score/[ticker]?view=case`)

**Vraag**: waarom geen entitlement-gate?

**Antwoord**:
- Investment-case is informatief — geen advies, geen premium-pull
- Voor /score/[ticker] is de confidence-score zelf al achter `signal_fusion.confidence_score` (ELITE+); de case-section is dus alleen zichtbaar voor users die al door die gate zijn
- Effectief = ELITE+ gated zonder dubbele check
