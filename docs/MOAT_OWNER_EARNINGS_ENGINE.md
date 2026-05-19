# Moat & Owner Earnings Engine — Module 32

Buffett-perspectief: beoordeel of een aandeel kwalitatief sterk genoeg is voor langetermijnbezit. **10 sub-componenten**, elk apart gemeten met **conservatieve defaults** — bij ontbrekende fundamentals krijgt een component `score: null`, **niet** een nep-score 50.

> **Risicoanalist-laag**: zwakke balanskwaliteit, negatieve owner-earnings en lage FCF triggeren expliciete warnings boven het rapport.
> **Buffett-laag**: return-on-capital + FCF-quality + owner-earnings samen 50% gewicht — kwaliteit boven valuation.

---

## 1. Module 32-spec mapping — 10 componenten

| # | Spec | Implementatie | Gewicht |
|---|---|---|---|
| 1 | Free cash flow kwaliteit | `fcf_quality` op `fundamentals.fcfYield` | 15% |
| 2 | ROIC/ROE stabiliteit | `return_on_capital` — ROIC primary, ROE fallback met disclaimer | 20% |
| 3 | Schuldhoudbaarheid | `debt_sustainability` op D/E + interestCoverage | 10% |
| 4 | Margestabiliteit | `margin_stability` op grossMargin + operatingMargin | 10% |
| 5 | Winstgroei kwaliteit | `earnings_growth_quality` op epsGrowth5y + revenueGrowth5y | 10% |
| 6 | Dividendveiligheid | `dividend_safety` op payoutRatio + dividendGrowth5y (skipt bij geen dividend) | 5% |
| 7 | Pricing power proxy | `pricing_power` op marge-niveau | 5% |
| 8 | Owner earnings proxy | `owner_earnings` op FCF-yield × netMargin bonus | 15% |
| 9 | Moat confidence | `moat_confidence` op 4-conditie-pattern (ROIC + low D/E + grossMargin + FCF) | 5% |
| 10 | Data coverage | `data_coverage` op 12-veld-coverage | 5% |

**Gewichten sommen tot 1.0** — spec-test valideert.

---

## 2. Architectuur

```
src/lib/analytics/moat-owner-earnings/
├── types.ts          # MoatReport + 10 MoatComponentKey + gewichten +
│                       gradeFromScore + MOAT_DISCLAIMER
├── engine.ts         # pure-function builders per component +
│                       composite weighted (alleen scored components) +
│                       grade-mapping + warnings-aggregator
├── engine.test.ts    # 27 tests
└── index.ts

src/components/moat/moat-card.tsx
                      # Composite-card (score/100 + grade-badge +
                      # coverage% + confidence) + 10 component-cards
                      # met inputsMissing-display + disclaimer-footer

src/app/(app)/score/[ticker]/page.tsx
                      # Nieuwe Section "Moat & Owner Earnings"
                      # naast bestaande "Stock Story" (M31) en
                      # bestaande "Uitleg"-sectie
```

**Geen rewrite** van bestaande `factors/quality.ts` — die geeft `score: 50` bij missing fundamentals (kies-bewuste fallback voor signal-fusion-composite). Module 32 levert een aparte, strikter conservatieve engine voor de moat-perspectief.

---

## 3. Geen nep-score — kerneis

**Spec eist expliciet "Als fundamentele data ontbreekt, geen nep-score geven"**:

```ts
function missingComponent(...): MoatComponent {
  return {
    ...,
    score: null,  // NIET 50
    rationale: `Geen score: ${requiredFields.join(", ")} ontbreekt`,
    inputsMissing: [...requiredFields],
  };
}
```

**Composite-policy**:
```
scored components = filter(score !== null)
weight-genormaliseerd over alleen scored
coverage = totalWeight / availableWeight

composite = scored.length > 0 && coverage >= 0.4 ? weighted-avg : null
grade = composite === null ? "unknown" : threshold-mapping
```

Spec-test valideert:
- `null fundamentals → alle scoring-componenten score=null`
- `composite null + grade='unknown' bij coverage < 0.4`
- `partial fundamentals (alleen ROIC) → andere componenten null, geen 50-fake`

---

## 4. Owner Earnings (Buffett 1986)

Buffett's klassieke definitie:
```
Owner Earnings = Net Income
               + Depreciation & Amortization
               - Maintenance CapEx
               - Working Capital Change
```

Yahoo's `FundamentalsSnapshot` heeft **geen cashflow-statement detail** (D&A, maint vs growth CapEx). **Conservatieve proxy**:
```
score = lineair(fcfYield) + bonus/malus(netMargin)
  fcf > 0.08 + netMargin > 0.15 → 88+ (sterke owner-earnings)
  fcf > 0.02 + netMargin > 0.15 → 50-70
  fcf < 0                       → 25 (kritieke rode flag)
  fcf > 0 + netMargin < 0.05    → score - 8 (winsten kwetsbaar)
```

**Test valideert**: negatieve FCF triggert expliciete "rode flag voor moat"-rationale + warning in report.

---

## 5. Moat-grade mapping

```
score 80-100 + coverage ≥0.4 → wide   ("Brede moat")
score 65-80  + coverage ≥0.4 → narrow ("Smalle moat")
score 45-65  + coverage ≥0.4 → neutral
score <45    + coverage ≥0.4 → weak
coverage <0.4 OR score null → unknown
```

UI rendert per grade een aparte rand-kleur (emerald/emerald/border/rose/muted) + badge-tone.

---

## 6. Confidence-tier

```
coverage ≥ 0.75 → high
coverage ≥ 0.50 → medium
coverage ≥ 0.25 → low
coverage <0.25  → insufficient
```

Gebruiker ziet expliciet: bij low/insufficient is composite indicatief; bij insufficient is grade "unknown" + composite null.

---

## 7. Warnings — risicoanalist-laag

```
coverage < 0.4 → "Datadekking te laag voor betrouwbaar moat-oordeel"
coverage < 0.6 → "Datadekking beperkt — composite is indicatief"
debt_sustainability score ≤ 40 → "Balanskwaliteit zwak — rente-stijging is directe bedreiging"
fcf_quality score ≤ 35 → "Free cash flow zwak — winsten mogelijk niet duurzaam"
owner_earnings score ≤ 30 → "Owner-earnings proxy negatief — kritiek signaal voor langetermijn"
```

**Test valideert**: zwakke balans + negatieve FCF → respectieve warnings expliciet aanwezig.

---

## 8. Privacy & security

- **Geen entitlement-gate**: kwaliteit-perspectief is core voor langetermijnbelegger; alle tiers zien dit
- **Geen PII in logs**: pure-function engine logt niet
- **Auth-gate** via `resolveUserFromServer` op `/score/[ticker]`
- **Cache-Control**: server-rendered + `force-dynamic`

---

## 9. Topbelegger-validatie

| Lens | Hoe Module 32 hier landt |
|---|---|
| **Buffett (kwaliteit + langetermijn)** | Return-on-capital + FCF + owner-earnings = 50% gewicht; Buffett's kernfilosofie expliciet meetbaar |
| **Dalio (risico expliciet)** | Debt-sustainability + Owner-earnings warnings → asymmetric downside-signalen |
| **Lynch (begrijpelijk)** | Per component plain-language rationale met concrete % ; geen jargon zonder uitleg |
| **Simons (meetbaar + reproduceerbaar)** | Pure-function engine; 27 unit-tests; gewichten als `const`; deterministisch |
| **Wood (toekomstgericht)** | `MoatComponentKey` is uitbreidbaar — nieuwe metrics (R&D-yield, intangibles) zonder breaking change |
| **Technisch beheerder** | Source-attribution per component (`inputsUsed` + `inputsMissing`); audit-trail mogelijk |
| **Langetermijnbelegger** | Wide/narrow/neutral/weak-grade = directe go/no-go-categorie voor lange horizon |
| **Hedge fund** | Per-component inputsUsed → reproduceerbare research; conservatieve defaults voorkomen overfit |
| **Risicoanalist** | Zwakke balans + negatieve FCF + lage coverage → 3 expliciete warnings boven rapport |
| **Marketeer** | Buffett-naam-anker ("Owner Earnings") onderscheidende propositie t.o.v. concurrenten |
| **CEO (reputatie)** | Geen nep-scores = geen demo-risico bij prospect met dunne data |

---

## 10. Tests — 27 nieuwe tests

| Categorie | Tests | Coverage |
|---|---|---|
| Shape | 3 | 10 componenten in vaste volgorde, disclaimer, weights = 1.0 |
| Geen nep-score | 3 | null fundamentals → alle null (behalve data_coverage), composite null bij coverage <0.4, partial input alleen scored geeft score |
| return_on_capital | 3 | ROIC 22% → strong, ROIC 3% → weak, ROE fallback met disclaimer |
| owner_earnings | 3 | negatieve FCF → score 25 + rode flag, FCF 8% + sterke marges → ≥75, FCF + zwakke marges → malus |
| debt_sustainability | 2 | low D/E + high IC → solid, hoge schuld → score ≤40 + warning |
| dividend_safety | 3 | geen dividend → null (niet 0), hoge payout → ≤40, lage payout + groei → >65 |
| Composite + grade + confidence | 4 | Buffett-stijl → wide+ ≥75 + high-confidence, zwakke fundamentals → weak + warnings, partial coverage → unknown, confidence-tier-mapping |
| data_coverage | 2 | null fundamentals → score <15 + warning, volledige fundamentals → ≥80 |
| Risicoanalist + spec-conformance | 4 | disclaimer noemt "geen verkoop-signaal", owner-earnings negatief → warning, zwakke balanskwaliteit → warning, inputsUsed/inputsMissing als arrays |

Totaal nu **2655+ tests** (één pre-existing flakey timing-test in `opportunity` solo-groen). Geen regressie.

---

## 11. Resterende risico's

| Risk | Mitigatie |
|---|---|
| Owner-earnings is proxy via FCF; Buffett's klassieke formule eist D&A + maint-CapEx splits | Documented; backlog: integreer Yahoo `cashflowStatementHistory` voor exacte D&A + CapEx splits |
| Margestabiliteit gemeten op snapshot, niet op tijdreeks | Yahoo levert geen historische marges per quartaal in `FundamentalsSnapshot`; proxy via niveau. Backlog: tijdreeks via separate fetch |
| Pricing-power = pure margin-proxy (geen prijs-index time-series) | Documented; conservatief — alleen bij grossMargin ≥30% een positief signaal |
| Moat-confidence is heuristisch 4-conditie pass/fail | Bewust conservatief; geen statistische test. Backlog: vergelijk met Morningstar-moat-rating als externe validatie |
| Component-gewichten zijn vast — niet per-sector | Buffett-bias is universeel; backlog: sector-specifieke weight-overrides (banken hebben andere D/E-benchmarks) |
| Geen entitlement-gate — alle tiers zien dit | Bewuste keuze: kwaliteit-perspectief is core, geen premium-pull |
| Bestaande `scoreQuality` geeft nog wel score=50 bij missing | Bestaande engine is signal-fusion-input; behoudt fallback voor composite-stabiliteit. Moat-engine is striktere alternatief |
| Verschillende fundamentals-bronnen (Yahoo vs Alpha) kunnen verschillende waardes geven voor dezelfde ticker | Loader gebruikt single-source (`getFundamentals` cached); verschillende runs op zelfde dag zijn consistent |

---

## 12. Decision-log

**Vraag**: waarom een nieuwe engine ipv uitbreiden van `factors/quality.ts`?

**Antwoord**:
1. `quality.ts` geeft `score: 50` bij missing fundamentals — werkt voor signal-fusion (renormalisatie), maar **strijdig met M32-spec**: "geen nep-score"
2. Aparte engine = duidelijke separation: quality-factor (signal-fusion input) vs moat-engine (long-term-quality assessment)
3. Geen breaking change op M9 Signal Fusion

**Vraag**: waarom owner-earnings proxy via FCF + margins, niet exacte D&A + CapEx?

**Antwoord**:
1. Yahoo's `FundamentalsSnapshot` heeft geen cashflow-statement-detail
2. FCF = CFO − CapEx is al de "echte" cashflow-output van het bedrijf; voor moat-perspectief volstaat dat als eerste-orde proxy
3. Verfijning naar exacte Buffett-formule is een v2-werk wanneer cashflow-stream beschikbaar komt

**Vraag**: waarom géén integratie met M9 Signal Fusion composite?

**Antwoord**:
1. Signal Fusion is een **realtime score** voor allocation-beslissingen (10 signalen, regime-aware)
2. Moat-engine is een **lange-termijn-kwaliteits-oordeel** (10 fundamentele kenmerken, geen timing)
3. Beide kunnen apart bestaan; voor verschillende beslissings-momenten
4. Backlog: optioneel `moatGrade` aanhaken in `signal_fusion.fundamental_quality` rationale als extra context
