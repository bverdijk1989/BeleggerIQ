# Stress-tests & Scenario-analyse — Module 11

9 vooraf-gedefinieerde scenarios + een builder voor je eigen worst-case, met per-positie impact, top-3 losers/winners, defensieve-sterkte-meter en AI-uitleg in spreektaal. **ELITE-feature** (entitlement: `scenario.analysis`).

> **UX-norm**: een stress-test is geen voorspelling — het is een referentie-bewerking. Het modelleert "wat als X gebeurt" met expliciete aannames, zodat je zonder voorspelling-pretentie risico's expliciet maakt.

---

## 1. Module 11-spec mapping — 10 scenarios

| # | Spec | ID | Severity | Probability | Hoofd-impact |
|---|---|---|---|---|---|
| 1 | Marktcrash -20% | `MARKET_CRASH_20` | severe | medium | brede markt -20%, beta-gewogen |
| 2 | Rente stijgt sterk | `RATES_UP_SHARP` | severe | medium | tech -18%, REIT -20%, financials +3% |
| 3 | Recessie | `RECESSION` | severe | medium | cyclisch -25-30%, defensief -5-8% |
| 4 | Inflatie blijft hoog | `STAGFLATION` | severe | medium | tech -20%, energy +10%, bonds -12% |
| 5 | Tech sell-off | `TECH_SELLOFF` | severe | medium | tech -35%, growth -38%, rest -5% |
| 6 | Energiecrisis | `ENERGY_CRISIS` | severe | low | energy +30%, industrials -15% |
| 7 | Dollar/euro-schok | `USD_EUR_SHOCK` | moderate | medium | non-base posities -10% via FX |
| 8 | Sectorrotatie | `SECTOR_ROTATION` | moderate | high | growth -16%, value +10% |
| 9 | Liquiditeitscrisis | `LIQUIDITY_CRISIS` | extreme | low | financials -30%, REIT -25% |
| 10 | Eigen scenario | `CUSTOM` | user-bepaald | n.v.t. | builder via [`buildCustomScenario`](../src/lib/analytics/stress-tests/custom.ts) |

Elk scenario heeft een expliciete `assumptions[]`-lijst (Simons-laag) — getoond in de UI onder elke kaart, zodat de gebruiker ziet wát we modelleren. Plus `baselineProbability` + `severity` voor onzekerheidsdeclaratie.

Het 10e scenario is **CUSTOM**: gebouwd door de gebruiker met sector-shock-overrides + bonds/currency/cash-shocks + severity.

---

## 2. Architectuur

```
src/lib/analytics/stress-tests/
├── types.ts        # StressScenarioId, StressTestResult, StressTestReport, STRESS_DISCLAIMER
├── catalog.ts      # 9 scenarios met sector-shock-tables + assumptions
├── engine.ts       # runStressTest — pure function, deterministisch
├── custom.ts       # buildCustomScenario — clamping + defaults
├── loader.ts       # loadStressTestReport — primary portfolio + 9 scenarios
├── actions.ts      # runCustomStressTestAction — server action voor custom
├── engine.test.ts  # 22 tests (catalog + engine + custom)
└── index.ts        # public API

src/components/stress-tests/
├── impact-chart.tsx           # SVG horizontale staaf-chart, symmetrische schaal
├── scenario-card.tsx          # Per-scenario kaart met top losers/winners + assumptions
├── custom-scenario-form.tsx   # Client-form voor sector/bonds/currency/cash + severity
└── custom-scenario-runner.tsx # Wrapper met useTransition + ScenarioCard

src/app/(app)/stress-test/
└── page.tsx        # ELITE-gated detail-page met disclaimer + bandbreedte + chart + AI uitleg + grid + custom
```

---

## 3. Engine — `runStressTest({scenario, positions, cashBalance, baseCurrency, totalValue})`

Pure functie zonder I/O. Per positie:

1. **Sector-shock**: zoek `scenario.sectorShocks[sector]` (fallback: average van non-zero overrides).
2. **Beta-modulatie**: voor `MARKET_CRASH_20` en sector-breed shocks vermenigvuldigt beta het effect (clamp 0.3-1.8).
3. **Currency-shock**: positie-currency ≠ baseCurrency → shock × currencyShock.
4. **Asset-class-overrides**: bonds → `bondShock`; ETFs/funds → gemiddelde van sector-overrides.
5. **Per-positie impact**: `marketValueBase × (sectorShock × beta + currencyShock)`.

Cash krijgt `cashShock` (typisch 0, soms -0.04 bij stagflatie / -0.03 bij energiecrisis).

**Aggregatie**:
- `portfolioImpactPct = sum(positionImpact) / totalValue`
- Top-3 losers + top-3 winners gesorteerd op `impactPct`
- `defensiveStrength = clamp(100 + impact*200, 0, 100)` — een 0-100-meter waar 100 = volledig defensief

**Verdict** (Lynch-laag, hedged taal):
- impact <-25%: "kritieke schade"
- impact <-15%: "zware klap"
- impact <-8%: "merkbare correctie"
- impact <-2%: "lichte tegenwind"
- impact ≥-2%: "weinig impact"

**Data-quality warnings**: posities zonder sector → "Onbekende sector geschat"; posities zonder beta → "Geen beta — shock zonder beta-modulatie".

---

## 4. Custom scenario builder

`buildCustomScenario(input: CustomStressScenarioInput): StressScenarioDefinition`

Input-velden:
- `label` (string, fallback "Eigen scenario")
- `description` (string, fallback "Door gebruiker gedefinieerd")
- `sectorShocks: Partial<Record<SectorBucket, number>>` — alleen wat je wilt overschrijven
- `defaultShock` — fallback voor sectoren niet in overrides
- `bondShock`, `currencyShock`, `cashShock`
- `severity: "moderate" | "severe" | "extreme"`

**Clamping**: alle shocks worden geclampd naar `[-0.95, +1.0]` om absurde inputs (-200%, +500%) te neutraliseren.

**Niet gepersisteerd in v1** — custom scenarios zijn ad-hoc via `runCustomStressTestAction` server action. Bewuste keuze: lichtgewicht, geen DB-druk, geen schema-creep.

---

## 5. Visuele weergave

### Impact-chart (`impact-chart.tsx`)
Horizontale staaf-vergelijking van alle 9 scenarios op portfolio-impact. Symmetrische schaal (max(|min|, |max|, 0.1) gerond op nearest 5%). Severity-coloring:
- impact <-15%: `destructive` rood
- impact <0%: amber
- impact ≥0%: emerald

X-as ticks op -50% / -25% / 0% / +25%.

### Scenario-card (`scenario-card.tsx`)
Per scenario: severity-tone-banner, headline impact + amount (mono font), defensiveStrength-meter, verdict, top-3 losers/winners als ImpactList sub-componenten, expandable assumptions (`<details>`-element), warnings-panel als data-quality issues bestaan.

### Bandbreedte-cards (page-level)
Worst (laagste impact, rood) + Best (hoogste impact, emerald) als referentie voor risicotolerantie. Topbelegger-laag: Buffett's "first rule of investing — don't lose money".

---

## 6. AI-uitleg (Module 7 hergebruik)

`/stress-test` roept `explainScenarios({baseCurrency, scenarios})` aan uit Module 7 (Explainability layer). Producent-domein "scenario" met one-shape ExplanationOutput (summary + bullets + actions + rationale + assumptions + meta).

Severity-mapping voor de explainability-call:
- `extreme` of `severe` → `"high"` impact
- anders → `"moderate"`

Output gerenderd via `ExplanationPanel` — zelfde component als alle andere AI-uitleg in BeleggerIQ. Lynch-laag: spreektaal, geen jargon.

---

## 7. Onzekerheidsdisclaimer

Elke pagina toont `STRESS_DISCLAIMER` als amber banner bovenaan:

> "Stress-tests zijn referentie-bewerkingen, geen voorspellingen. Sector-shocks zijn historisch geijkt op gebeurtenissen zoals Nasdaq 2000-2001 (-32%), Lehman 2008 (-37%) en COVID-2020 (-34%). Werkelijke uitkomsten kunnen substantieel afwijken."

Daarnaast op elke ScenarioCard: expandable `<details>` met de scenario-specifieke `assumptions[]`-lijst, zodat de gebruiker WAT we modelleren expliciet kan inspecteren.

---

## 8. Topbelegger-validatie

| Lens | Hoe Module 12 hier landt |
|---|---|
| **Buffett** | Downside protection centraal — worst-case bandbreedte + top-3 losers per scenario maken kwetsbaarheid expliciet |
| **Dalio** | Scenario-denken centraal — 9 macro-scenarios + de gebruiker kan zelf bouwen |
| **Lynch** | Verdict-tekst in spreektaal ("zware klap", "lichte tegenwind") en AI-uitleg via Module 7 |
| **Simons** | Aannames per scenario expliciet, deterministische pure functie, 22 tests, sector-shocks historisch geijkt |
| **Wood** | Custom-builder laat innovatieve portefeuilles testen tegen eigen worst-cases zonder DB-creep |

---

## 9. Tests

`engine.test.ts` (22 tests, allemaal groen):

**Catalog integriteit**:
- 9 scenarios in catalog, geen duplicaten
- Alle 13 sector-buckets gedekt in elke scenario
- `getStressScenario` round-trip
- STRESS_SCENARIO_ORDER bevat 10 entries (incl. CUSTOM)

**runStressTest basics**:
- Cash-only portfolio: cash-shock door
- Tech-heavy + TECH_SELLOFF: portfolio-impact ≤ -25%
- Energy-heavy + ENERGY_CRISIS: portfolio-impact > 0
- Rates-up + REIT-heavy: portfolio-impact ≤ -15%

**Currency-shock**:
- USD-positie + USD_EUR_SHOCK: krijgt -10% currency hit
- EUR-positie (base): currency-shock 0

**Bonds + cash**:
- Bond-positie + RATES_UP_SHARP: -10% bondShock
- Cash + STAGFLATION: -4% cashShock

**Warnings**:
- Positie zonder sector: warning gegenereerd
- Positie zonder beta: warning gegenereerd

**Determinisme**: 2× run, identieke output

**buildCustomScenario**:
- Clamping op extreme inputs (-200% → -95%)
- Defaults voor ontbrekende sectoren
- Fallback-tekst voor lege label/description
- Round-trip via runStressTest produceert StressTestResult met top losers

---

## 10. Toegang & UI-flow

1. Gebruiker met FREE/PRO tier → PaywallCard met feature-pitch
2. Gebruiker met ELITE/ADVISOR + portefeuille → volledige rapport
3. Geen portefeuille → EmptyState

Pagina-secties (in volgorde):
1. **Disclaimer-banner** (amber, altijd bovenaan)
2. **Bandbreedte** — worst + best als 2 grote cards
3. **Impact per scenario** — horizontale staaf-chart
4. **AI-uitleg** — spreektaal-samenvatting via Module 7
5. **Scenarios** — grid van 9 ScenarioCards (klik open voor assumptions)
6. **Eigen scenario** — CustomScenarioRunner (sectorshocks-form + run)

---

## 11. Niet in v1

Bewust uitgesteld:
- Persistentie van custom scenarios (DB-tabel, naam-bibliotheek)
- Multi-portfolio stress-test (alleen primary)
- Time-series Monte Carlo (we doen 1-shot impact, geen distributie)
- Macro-trigger-binding (scenario auto-getriggerd door regime-shift)
- Optie-Greek-modulering (puur equity/bond-perspectief)

Deze zijn redelijke v2-uitbreidingen wanneer gebruik blijkt.
