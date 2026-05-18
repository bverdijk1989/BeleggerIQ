# Dividend Calendar & DRIP Simulator — Module 22

`/dividend` pagina voor dividendbeleggers met **maandelijkse kalender**, **jaarprojectie**, **groei-analyse** en een **DRIP-simulator** over 5/10/20 jaar × 3 rendementsscenarios.

> **Buffett-laag**: kwaliteit boven yield-chasing. Yield > 7% triggert een expliciete yield-trap-warning. DRIP-simulator toont compound-effect zonder yield-claim te maken die niet door data wordt gedragen.

---

## 1. Module 22-spec mapping — 6 deliverables

| # | Spec | Implementatie | Locatie |
|---|---|---|---|
| 1 | Dividend-kalender (12 maanden + onzekerheid + dataQuality) | `MonthlyCalendar`-grid + per-rij `DividendDataQuality`-badge | `/dividend` |
| 2 | Jaarlijkse dividendprojectie | `AnnualDividendProjection` (annualGross + weightedYield + coverage-counts) | `engine.ts` |
| 3 | Dividendgroei-analyse | `DividendGrowthAnalysis` (gewogen 5y-CAGR + summary) | `engine.ts` |
| 4 | DRIP-simulator 5/10/20 + 3 scenarios | `simulateDrip` met `withDrip` vs `withoutDrip` per scenario | `engine.ts` |
| 5 | Waarschuwing bij lage dividenddatakwaliteit | `report.warnings[]` (4 trigger-cases) | `engine.ts` |
| 6 | Premium entitlement: DRIP in Pro/Elite | `dividend.calendar` (FREE) + `dividend.drip` (ALL_PAID) | `entitlements/catalog.ts` |

---

## 2. Architectuur

```
src/lib/analytics/dividend/
├── types.ts              # DividendReport + 5 sub-card-types + DIVIDEND_DISCLAIMER
├── engine.ts             # Pure functies: classifyFrequency, buildCalendarRow,
│                          # buildAnnualProjection, buildGrowthAnalysis,
│                          # simulateDrip, buildDividendReport
├── loader.ts             # Server-side hydratie via portfolio-view +
│                          # getFundamentals + risk-profile-scenarios
├── engine.test.ts        # 22 tests
└── index.ts              # Public API

src/app/(app)/dividend/
└── page.tsx              # /dividend — entitlement-gated DRIP, vrije kalender

src/lib/entitlements/
├── types.ts              # +2 keys: dividend.calendar, dividend.drip
└── catalog.ts            # +2 catalog entries (ALL_TIERS resp. ALL_PAID)
```

**Geen Prisma-migratie**. Geen externe API-keys. Dividend-data komt uit bestaande `getFundamentals()` (Yahoo) — `dividendYield` + `dividendGrowth5y`.

---

## 3. Frequentie-heuristiek (Module 22 datakwaliteit-eis)

We hebben **geen** feed met actuele ex-dividend dates v1. Distributie-patroon wordt geschat via `classifyFrequency()`:

| Ticker-patroon | Frequentie | Maanden | Bron |
|---|---|---|---|
| Suffix `.AS` / `.PA` / `.DE` / `.BR` / `.LS` (Euronext / Xetra) | SEMIANNUAL | Mei + Nov | EU-AGM-conventie |
| Suffix `.L` (LSE) | QUARTERLY | Mar / Jun / Sep / Dec | UK-conventie |
| Asset-class REIT of ticker met "REIT" | QUARTERLY | Mar / Jun / Sep / Dec | Bewust niet "MONTHLY" als default (te agressief) |
| Default (geen suffix → US-listed NYSE/NASDAQ) | QUARTERLY | Mar / Jun / Sep / Dec | US-conventie |
| yield = null of ≤ 0 | ZERO | — | Geen dividend |

Elke geschatte rij krijgt `dataQuality: "estimated"`. Zodra er een ex-dividend-feed beschikbaar komt, kan `nextExDividendDate` worden gevuld → `dataQuality: "actual"`.

---

## 4. DRIP-simulator — pure compounding

```ts
simulateDrip({
  initialValue,
  annualDividendGross,
  monthlyContribution,
  scenarios: { conservative, neutral, optimistic },  // annual returns
  horizonYears: 5 | 10 | 20,
})
```

Per-maand iteratie:
1. Cap-gain compound: `value *= 1 + monthlyRate`
2. Monthly contribution: `value += monthlyContribution`
3. Dividend (alleen bij DRIP=true): `value += monthlyDividend`

`withDrip` vs `withoutDrip` voor elke scenario. UI toont **delta tussen beide** om compound-effect expliciet te maken.

### Aannames (Module 22 transparantie-eis)

1. Verwachte jaarlijkse dividend-bruto is `marketValue × yield` (huidige snapshot)
2. Maandelijkse inleg is constant — geen indexatie
3. Dividenden zijn nominaal (geen belasting-correctie)
4. Sequence-of-returns wordt NIET gemodelleerd (linear compound)
5. **Dividend-bedrag groeit niet over de horizon** (conservatief; growth-card toont separaat de historische 5y-CAGR)
6. DRIP-aan: dividend wordt 100% herbelegd in dezelfde portefeuille
7. DRIP-uit: dividend valt buiten compound (verlaat de portefeuille als cash)

Collapsible `<details>`-block onder DRIP-cards.

---

## 5. Warnings — 4 triggers

| Trigger | Voorbeeld-message |
|---|---|
| `coveredPositions === 0 && zeroPositions > 0` | "Geen van je posities heeft een gepubliceerde dividend-yield — projectie is leeg." |
| `estimatedCount > 0 && actualCount === 0` | "Alle N dividend-rijen zijn ESTIMATED (geen actuele ex-dividend-feed). Bedragen zijn indicatief." |
| `growth.weighted5yGrowth === null` | "Geen 5-jaars dividend-groei-data — groei-projectie wordt conservatief gemodelleerd (geen groei)." |
| `weightedYield > 0.07` | "Gewogen yield X% — controleer of de payout-ratios duurzaam zijn (yield-trap-risico)." |

---

## 6. Entitlements (Module 22 spec-mapping)

| Feature | Tier | Wat krijgt de gebruiker |
|---|---|---|
| `dividend.calendar` | ALL_TIERS | Maandelijkse kalender + per-positie rij + projectie + groei + warnings |
| `dividend.drip` | ALL_PAID (PRO+) | DRIP-simulator 5/10/20 jaar × 3 scenarios + aannames-block |

FREE-tier ziet de calendar; DRIP-sectie toont `PaywallCard` met bonus-copy:
> "DRIP-aan compound je dividend mee — over 20 jaar kan dit het verschil zijn van 30%+ extra portfolio-waarde."

---

## 7. Topbelegger-validatie (Module 22 perspectieven)

| Lens | Hoe Module 22 hier landt |
|---|---|
| **Buffett (kwaliteit > yield-chasing)** | Yield-trap-warning bij >7%; growth-card toont CAGR; UI noemt expliciet "geen yield-chasing-aanmoediging" in disclaimer |
| **Lynch (inkomen begrijpelijk)** | Maandelijkse kalender-grid maakt timing concreet; per-positie rij toont yield + frequentie + dataQuality in plain text |
| **Risicoanalist (waarschuw bij onstabiele data)** | 4 warning-triggers expliciet; `DividendDataQuality`-badge per rij (actual/estimated/low/missing) |
| **Marketeer (Pro-feature?)** | DRIP-simulator achter `dividend.drip` (ALL_PAID); calendar als FREE-teaser; sterke conversie-aanker voor dividend-personae |
| **Simons (reproduceerbaar)** | Pure-function engine + 22 unit-tests; drempels als `const`; classifyFrequency-heuristiek deterministisch |
| **CEO (omzet)** | Sterke premium-pull voor dividend-investor-niche; geen externe API-cost (gebruikt bestaande Yahoo-fundamentals) |

---

## 8. Tests — 22 in totaal

| Categorie | Tests | Coverage |
|---|---|---|
| `classifyFrequency` | 4 | ZERO bij yield=null/0, EU-suffix → SEMIANNUAL, US-default → QUARTERLY, REIT → QUARTERLY (niet MONTHLY) |
| `buildCalendarRow` | 3 | yield=null → ZERO + missing, US-stock QUARTERLY met 4 maand-bedragen, ex-dividend-feed → actual |
| `buildAnnualProjection` | 1 | aggregaat over rows + tellen covered/zero/actual/estimated + weighted yield |
| `buildGrowthAnalysis` | 3 | null-data, positieve groei, negatieve groei (cuts-warning) |
| `simulateDrip` | 4 | met-DRIP > zonder-DRIP, reinvestedDividend correct, zonder-DRIP = 0, aannames-niet-leeg |
| `buildDividendReport` | 5 | lege rows, yield-trap-warning, ESTIMATED-only-warning, 5/10/20 horizons, disclaimer-taal |
| Spec-conformance | 2 | Drie horizons aanwezig, 3 scenarios per simulatie |

---

## 9. Resterende risico's

| Risk | Mitigatie |
|---|---|
| Geen ex-dividend feed; alle bedragen estimated | `dataQuality: "estimated"`-badge per rij + warning bovenaan. Roadmap: koppel EOD Historical Data of Yahoo Earnings Calendar |
| Frequentie-heuristiek per ticker-suffix kan fout zijn voor exotische listings | Fallback: QUARTERLY (US-default); spec-conform; UI toont `frequency`-veld per rij zodat user kan corrigeren bij twijfel |
| DRIP-simulator modelleert dividend-bedrag als constant (geen groei over horizon) | Conservatief by design; growth-card laat historische 5y-CAGR apart zien zodat user zelf interpoleert |
| Geen belasting-correctie (bruto = netto in simulatie) | Aannames-block benoemt dit expliciet; v2 zou een DRIP-met-15%-Nederlandse-dividendbelasting-flag kunnen toevoegen |
| Yield > 7% triggert warning maar blokkeert niet | Bewust — info > friction; gebruiker beslist zelf |
| Geen entitlement-test in test-suite | Kan toegevoegd worden via `canUseFeature("dividend.drip", "FREE")` assert; backlog v2 |
