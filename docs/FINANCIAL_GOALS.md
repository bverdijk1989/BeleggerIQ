# Financial Goals — Module 4 + Module 5

Een dashboard waar de gebruiker zijn portefeuille koppelt aan **levensdoelen**: pensioen, FIRE, dividendinkomen, vermogensgroei, huis, studie, buffer, of een eigen doel. Per doel rekent de engine drie scenario's door (pessimistisch / verwacht / optimistisch) en geeft een **feasibility-tier** met concrete bijstuur-suggesties.

> **UX-norm**: de gebruiker ziet niet alleen aandelen, maar snapt hoe de portefeuille bijdraagt aan zijn leven.

---

## 1. Architectuur

```
src/lib/analytics/goals/
├── types.ts              # GoalType, FinancialGoal, scenarios, feasibility
├── projection.ts         # FV-formule + bisection-solvers
├── engine.ts             # orchestrator (scenarios + feasibility)
├── loader.ts             # server-side fetch + projectie-batch
├── actions.ts            # server actions (create/update/delete)
├── projection.test.ts    # 17 tests — pure math
├── engine.test.ts        # 12 tests — engine + scenarios + tiers
└── index.ts

src/lib/data/
└── goal-repository.ts    # Prisma CRUD (soft-delete via isActive)

prisma/
├── schema.prisma         # +FinancialGoal + GoalType enum
└── migrations/20260510160000_add_financial_goals/

src/components/goals/
├── feasibility-badge.tsx # tier-pill (ON_TRACK/ACHIEVABLE/AT_RISK/UNLIKELY)
├── goal-card.tsx         # één doel met progress + scenario-pills
├── goals-summary-card.tsx# dashboard-widget (top-3 doelen)
├── goal-form.tsx         # client-form (create/edit/delete)
└── projection-chart.tsx  # SVG 3-scenario chart, geen library

src/app/(app)/doelen/
├── page.tsx              # lijst + CTA
├── nieuw/page.tsx        # create
└── [id]/page.tsx         # detail + edit + chart
```

---

## 2. Datamodel

```prisma
model FinancialGoal {
  id, userId
  type                    GoalType
  name                    String
  targetAmount            Decimal(20,2)
  targetDate              DateTime
  monthlyContribution     Decimal(14,2)  default 0
  currentAmount           Decimal(20,2)  default 0
  expectedAnnualReturn    Decimal(6,4)   // fractie 0.06 = 6%
  riskProfile             RiskTolerance  default BALANCED
  baseCurrency            String         default "EUR"
  description             String?
  portfolioId             String?        // Module 5 — optionele koppeling
  portfolio               Portfolio?     @relation(onDelete: SetNull)
  isActive                Boolean        default true   // soft-delete
}
```

Soft-delete (`isActive=false`) bewaart historiek voor audit. CRUD via `goalRepository`.

`portfolioId` is **nullable**: een doel kan vrijstaand zijn (bv. een cash-buffer-doel) of expliciet gekoppeld worden aan één van de portefeuilles van de gebruiker. `onDelete: SetNull` zorgt dat het doel niet verloren gaat als de portefeuille verwijderd wordt — de koppeling vervalt, maar de horizon/inleg/projectie blijven bestaan.

---

## 3. Math — projection.ts

**Future-value-formule** (gewone annuity):
```
FV = P × (1+r_m)^n  +  M × ((1+r_m)^n − 1) / r_m
r_m = (1+r)^(1/12) − 1
n   = horizon in maanden
```

Inverse-solvers:
- `solveRequiredMonthlyContribution(T,P,r,n)` — algebraïsch
- `solveRequiredAnnualReturn(T,P,M,n)` — bisection over [0, 30%], 80 iter

Helpers:
- `projectFutureValue(...)` → `{finalValue, totalInvested, growthComponent}`
- `buildProjectionSeries(...)` → jaar-stappen voor de chart
- `annualToMonthly(r)`, `monthsBetween(a,b)`, `yearsBetween(a,b)`

Edge cases:
- `r=0` → lineair (geen division-by-zero)
- `n≤0` → finalValue = initialAmount
- Negatieve initialAmount → clamp naar 0

---

## 4. Scenarios + feasibility

| Scenario | Annual return | Wanneer |
|---|---|---|
| Pessimistisch | `expectedReturn − spread` | Bear-case, wereldindex onder gemiddelde |
| Neutraal | `expectedReturn` | Historisch lange-termijn-gemiddelde |
| Optimistisch | `expectedReturn + spread` | Bull-case, gunstige sequence-of-returns |

Spread per risk-profile:
- CONSERVATIVE: ±2pt
- BALANCED: ±3pt
- GROWTH: ±3.5pt
- AGGRESSIVE: ±4.5pt

(Dalio-laag — het risico-bandbreedte schaalt met het profiel.)

**Feasibility-tiers**:

| Tier | Voorwaarde | UI |
|---|---|---|
| `ON_TRACK` | Pessimistic-scenario haalt het doel | Groen, "comfortabel" |
| `ACHIEVABLE` | Neutraal haalt het, pessimistisch niet | Groen, "verwacht haalbaar" |
| `AT_RISK` | Alleen optimistisch haalt het | Amber, "onder druk" |
| `UNLIKELY` | Zelfs optimistisch haalt het niet | Rood, "onwaarschijnlijk" |

Feedback-velden:
- `requiredMonthlyContribution` — wat is er nodig met huidig rendement?
- `contributionGap` — verschil met huidige inleg
- `requiredAnnualReturn` — alternatief: hoger rendement nodig?

---

## 5. Default-rendement per risico-profiel

| Profile | Default | Bron |
|---|---|---|
| CONSERVATIVE | 4.0%/jr | Lange-termijn obligaties + dividenden |
| BALANCED | 6.0%/jr | 60/40 wereld-mix, reëel rendement na inflatie |
| GROWTH | 7.5%/jr | 80/20 equity-zware mix |
| AGGRESSIVE | 9.0%/jr | 100% equity, langetermijn-S&P 500 nominaal |

User kan handmatig overschrijven via `expectedAnnualReturn`.

---

## 6. Topbelegger-validatie

| Lens | Waar het zit |
|---|---|
| **Buffett** (lange-termijn boven ruis) | Projectie toont compound growth over decennia. Geen dagschommelingen, geen daghandel-context — focus op de eindwaarde. |
| **Dalio** (scenario's + risico) | Drie-scenario design met risk-profile-afhankelijke spread. Elk scenario toont expliciet of het doel gehaald wordt. |
| **Lynch** (begrijpelijk + persoonlijk) | "Pensioen", "Huis kopen", "Studie kinderen" — labels in mensentaal. NL-zinnen als "Met €X/mnd extra zou het doel ook in een neutraal scenario haalbaar zijn." |
| **Wood** (toekomstgericht + motiverend) | UI focust op de eindstaat ("over 30 jaar staat hier €X"), niet op de korte termijn. Scenario-chart toont compound-curve als motivatie. |

---

## 7. Tests — 29 in totaal

**`projection.test.ts`** (17 tests):
- `annualToMonthly` correctness + round-trip
- `projectFutureValue`: zero-horizon, 0%-rendement, 30-jaars-DCA met €500/mnd, negatieve clamps
- `buildProjectionSeries`: aantal punten, monotonie
- `solveRequiredMonthlyContribution`: doel-al-gehaald, 0%-rendement, substitutie-check
- `solveRequiredAnnualReturn`: zero-needed, substitutie, onhaalbaar → null
- `monthsBetween`: 12mnd, 0mnd

**`engine.test.ts`** (12 tests):
- 3 scenario-keys, monotone ordering (pess < neutral < optim)
- Voortgang-clamping
- yearsToTarget berekening
- 4 feasibility-tier transities (ON_TRACK / ACHIEVABLE / AT_RISK / UNLIKELY)
- Contribution-gap > 0 bij AT_RISK
- Determinisme (zelfde input → identieke output)
- Series start altijd op `currentAmount`
- Risk-profile spread (AGGRESSIVE > CONSERVATIVE)

---

## 8. UX-flows

**Dashboard** (`GoalsSummaryCard`):
- 0 doelen → motiverende empty-state met CTA
- 1+ doelen → top-3 met progress-bar + feasibility-tier; link naar `/doelen`
- Worst-tier kleurt de hele kaart (groen/amber/rood)

**Lijst** (`/doelen`):
- Grid van GoalCard's met sparkline-style progress, mini-meta (horizon/inleg/rendement), 3-pill scenario-eindwaarden
- "Nieuw doel" CTA bovenaan

**Create** (`/doelen/nieuw`):
- 8 type-presets in dropdown met beschrijving
- Risk-profile dropdown stelt automatisch verwacht rendement in (user kan overschrijven)
- Server-side validatie + redirect naar detail

**Detail** (`/doelen/[id]`):
- 3 stat-kaarten (doelbedrag / streefdatum / voortgang)
- Projectie-chart (SVG, 3 lijnen + doel-lijn)
- 3 scenario-boxen met "Doel gehaald / Tekort"-pill
- Bijstuur-suggesties: required monthly + required return
- Edit-form onderaan met verwijder-knop

---

## 9. Module 5 — Portfolio-koppeling (mei 2026)

**Spec-eis** (Module 5): *"Per doel ... gekoppelde portefeuille indien mogelijk."*

**Implementatie** (additief, geen rewrite):
- `FinancialGoal.portfolioId` (nullable) + `Portfolio.financialGoals` reverse-relation.
- Migration: [`prisma/migrations/20260517190000_add_goal_portfolio_link`](../prisma/migrations/20260517190000_add_goal_portfolio_link/migration.sql) — single nullable column + FK met `ON DELETE SET NULL` + index.
- Server actions (`createGoalAction` / `updateGoalAction`) accepteren `portfolioId?: string | null` en valideren ownership: alleen portefeuilles van de huidige user mogen gekoppeld worden. Bij delete van de portfolio valt het veld terug op `null` zonder dat het doel verloren gaat.
- UI:
  - `GoalForm`: extra `<select>` "Gekoppelde portefeuille (optioneel)" dat alleen verschijnt als de user 1+ portefeuilles heeft.
  - `GoalCard`: subtiele "🔗 Gekoppeld aan …"-regel onder de meta-rij wanneer `portfolioId` gezet is.
  - Detail-pagina: portfolio-naam in de page-header description.

**Waarom nullable + SetNull**: een cash-buffer- of studiedoel staat vaak los van een beleggings-portefeuille. De koppeling moet optioneel zijn zodat het doel zelfstandig blijft bestaan ook als de gebruiker portefeuilles herstructureert.

**Wat de koppeling doet**:

1. **Organisatie + context-display**. Een gekoppeld doel wordt op zowel `/doelen` als `/doelen/[id]` zichtbaar als "bij die portefeuille", met een `— live waarde`-badge.

2. **Live-sync van `currentAmount`** (uitgebreid mei 2026 — fix voor [issue: /doelen toonde €30.576 i.p.v. portfolio-totaal €80.874](../src/lib/analytics/goals/loader.test.ts)). De goal-loader haalt voor elk gelinkt doel de huidige portfolio-`totalValue` via `buildPortfolioView` en overschrijft `currentAmount` daarmee. Het handmatige veld in de form blijft als fallback voor doelen zonder koppeling, of als de market-data fetch faalt. Zie [`applyLivePortfolioValues`](../src/lib/analytics/goals/loader.ts) en [`loader.test.ts`](../src/lib/analytics/goals/loader.test.ts).

De projectie-engine zelf blijft puur — `portfolioId` is geen input voor de berekening (zie test `portfolioId beïnvloedt projectie niet`). De live-sync gebeurt in de loader-laag, niet in de engine.

---

## 10. Toekomstige uitbreidingen

| Idee | Waarom |
|---|---|
| **Portfolio-link → goal-fractie** | Live-waarde-koppeling is er sinds mei 2026 (§9.2). Vervolgstap: koppel niet de hele portefeuille maar een **fractie** ervan aan een doel (bv. 60% naar pensioen, 40% naar huis kopen) |
| **Inflatie-reëel** vs nominaal | Optie om doel + projectie in koopkracht-equivalent te tonen |
| **Monte Carlo per goal** | Probability-of-success in plaats van 3 vaste scenario's; kan reuse maken van M18 |
| **Tussendoelen** (milestones) | "10% bereikt → notify" / 25% / 50% — gamification + motivatie |
| **Combine-view**: hoeveel maandinleg verdeel je over alle doelen? | Optimaler dan los doel-voor-doel rekenen |
| **Timeline-chart** met alle doelen samen | Wood-laag: zie je hele leven op één tijdlijn |
| **Notification-trigger** bij feasibility-flip (ACHIEVABLE → AT_RISK) | Vroege waarschuwing zonder dat user actief moet checken |
| **AI-suggestie via briefing** | "Je pensioen-doel staat op AT_RISK — verhoog inleg of horizon" als bullet in de Daily Briefing |
