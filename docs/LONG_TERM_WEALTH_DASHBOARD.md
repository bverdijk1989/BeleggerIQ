# Long-Term Wealth Dashboard — Module 21

Eén pagina (`/wealth`) waar een langetermijn-belegger ziet of hij/zij op koers ligt richting zijn financiële doelen. Aggregeert bestaande engines (goals + portfolio-view + transactions + fundamentals) zonder nieuwe Prisma-tabellen.

> **UX-norm**: Buffett-vertrouwen — geen schijnzekerheid. Aannames staan EXPLICIET in een collapsible block onder de projectie-cards.

---

## 1. Module 21-spec mapping — 8 cards

| # | Spec | Implementatie | Bron-engine |
|---|---|---|---|
| 1 | "Ben ik op koers?"-kaart | `WealthCourseSummary` met 5 status-niveaus | `goal.feasibility.tier`-aggregatie |
| 2 | 10-jaars projectie | `DecadeProjection` met 3 scenarios (pess/neutral/optim) | `projectFutureValue` + `buildProjectionSeries` (Module 5) |
| 3 | Drift t.o.v. doelallocatie | `AllocationDriftSummary` (top-3 + alignment-score) | `view.rebalance.recommendations` |
| 4 | Maandelijkse discipline | `MonthlyDiscipline` (ingelegd / gepland / delta / onTrack) | `transactionRepository.list` type=CASH |
| 5 | Verwachte dividend-stroom | `ExpectedDividendIncome` (gewogen yield + coverage) | `getFundamentals().dividendYield` |
| 6 | 3 scenarios | Bovenstaande projection-cards | `DEFAULT_EXPECTED_RETURN` + `SCENARIO_SPREAD` (per risicoprofiel) |
| 7 | AI/fallback-uitleg | `ScenarioExplanation`-component met range + "wat-betekent-dit" | Fallback-renderer (deterministic) |
| 8 | Exportbare samenvatting | Markdown-export-block met copy-instructie | `buildMarkdownSummary()` |

---

## 2. Architectuur

```
src/lib/analytics/wealth/
├── types.ts                 # WealthDashboardReport + 5 sub-card-types
├── engine.ts                # buildWealthDashboardReport (pure functie)
├── loader.ts                # Server-side hydratie van alle bronnen
├── engine.test.ts           # 15 tests
└── index.ts                 # Public API

src/app/(app)/wealth/
└── page.tsx                 # /wealth — 8 sections + collapsible aannames
```

**Geen Prisma-migratie**. Alle data komt uit bestaande tabellen (Portfolio, FinancialGoal, Transaction, UserProfile) en bestaande in-memory engines.

---

## 3. Engine pipeline

```
loader: portfolioRepository.findUserContextByEmail
              │
              ├─→ buildPortfolioView (view.summary + view.rebalance)
              ├─→ loadGoalsForUser (Module 5 — live-sync incl.)
              ├─→ transactionRepository.list type=CASH (deze maand)
              └─→ getFundamentals per ticker (dividend-yield)
                            │
                            ▼
              ┌──────────────────────────────────┐
              │  buildWealthDashboardReport      │  pure functie
              │  - deriveCourse (5 status-tiers) │
              │  - buildDecadeProjection (3 scen)│
              │  - buildDriftSummary (top-3)     │
              │  - buildDiscipline (deze maand)  │
              │  - buildDividendIncome           │
              └──────────────────────────────────┘
                            │
                            ▼
                    WealthDashboardReport
```

**Faal-safe**: elke sub-fetch wrapped in `try/catch` met sensible defaults — geen kapotte pagina bij market-data-failure.

---

## 4. Course-status afleiding

| Status | Voorwaarde |
|---|---|
| `no_goals` | 0 doelen ingesteld |
| `on_track` | 100% van doelen `ON_TRACK` of `ACHIEVABLE` |
| `mostly_on_track` | ≥80% haalbaar |
| `at_risk` | 50-80% haalbaar |
| `off_track` | <50% haalbaar |

UI rendert tone-coded card (emerald/amber/rose) + per-goal-progress-lijstje.

---

## 5. Projection-aannames (transparantie-eis)

Module 21-spec eist "Toon aannames expliciet — geen schijnzekerheid". `DecadeProjection.assumptions[]` bevat:

1. Verwacht neutraal-rendement per risicoprofiel (`DEFAULT_EXPECTED_RETURN`)
2. Pessimistic/optimistic-spread per risicoprofiel (`SCENARIO_SPREAD`)
3. Maandelijkse inleg is constant — geen indexatie
4. Geen inflatie-correctie (rendementen zijn nominaal)
5. Geen belastingen of transactiekosten verwerkt
6. Sequence-of-returns wordt NIET gemodelleerd (linear compound)

UI: collapsible `<details>`-block onder de scenario-cards.

---

## 6. Discipline-tolerance

`MonthlyDiscipline.onTrack` = `delta ≥ -10% van planned`. 10%-tolerance erkent dat een gebruiker niet exact op de dag inleg doet — een paar dagen vertraging of variatie is OK; >10% achterstand wordt expliciet als off-track gemarkeerd.

---

## 7. Dividend-card — alleen bij data-coverage

Card verschijnt **niet** wanneer:
- `getFundamentals()` faalt voor alle holdings (geen data)
- Alle holdings hebben `dividendYield = null` (bv. growth-portefeuille zonder dividend)

Bij gemengde coverage: card toont `coveredPositions / (covered + uncovered)` zodat de gebruiker ziet hoeveel van de portefeuille gedekt is.

---

## 8. Export-format

Markdown-block dat handmatig gekopieerd kan worden. Bewuste keuze:
- **Geen automatische PDF-export** in v1 — vereist pdfmake/Puppeteer dependency
- **Geen email-export** in v1 — vereist SMTP-flow
- **Markdown** werkt overal: Obsidian, Notion, plain text-editor

Inhoud:
- Portfolio nu + course-status
- 10-jaars projectie 3 scenarios
- Maandelijkse discipline (ingelegd / gepland / delta)
- Drift top-3 + alignment-score
- Verwacht dividend-inkomen (indien beschikbaar)
- Disclaimer-blok

---

## 9. Topbelegger + spec-perspectieven

| Lens | Hoe Module 21 hier landt |
|---|---|
| **Buffett (vertrouwen)** | Aannames-block expliciet collapsible; disclaimer onderaan; "geen voorspelling" expliciet in scenario-uitleg |
| **Dalio (scenario-denken)** | 3 scenarios met expliciete return-bands; sequence-of-returns disclaimer in aannames |
| **Lynch (begrijpelijk)** | "Op koers?" in 1 zin spreektaal; scenario-uitleg in `<strong>`-bedragen zonder jargon |
| **Simons (reproduceerbaar)** | Pure-functie engine + 15 tests bevriezen output-shape; geen Date.now in engine |
| **Wood (innovatief)** | Hooks naar AI-uitleg (toekomstige Module 8-integratie); export-format laat eigen tooling toe |
| **Langetermijn-belegger (rust + voortgang)** | Drift + discipline-cards waarschuwen vroeg; Course-tier toont voortgang i.p.v. dagschommelingen |
| **Hedge fund (backtest)** | Aannames expliciet maakt backtest mogelijk — verwacht rendement is `const` |
| **Risicoanalist (onzekerheid)** | Pessimistic-scenario expliciet; coverage-counts bij dividend-card |
| **Marketeer (Pro-feature?)** | Sterke conversie-aanker: één pagina toont je 10-jaar-traject + maandtucht. Sterk argument voor PRO-tier (waar dit thuishoort, evt entitlement-gate in volgende sprint) |
| **CEO (omzet/schaalbaarheid)** | Geen Prisma-migratie, geen externe API-keys; schaalt met bestaande deploy |

---

## 10. Tests

| File | Tests | Coverage |
|---|---|---|
| `engine.test.ts` | 15 | Course-status (4 niveaus), 3-scenario projection + aannames + horizon, discipline (3 cases: voorsprong/achterstand/binnen-tolerance), drift top-3 + significant-count, dividend (null + mixed coverage), disclaimer-taal |

**Niet in deze pas**:
- E2E-test van `/wealth`-page (vereist Playwright)
- Tests op `loader.ts` (DB-afhankelijk; pure engine is dekkend voor de logica)

---

## 11. Resterende risico's

| Risk | Mitigatie |
|---|---|
| Geen entitlement-gate; iedereen ziet alle 8 cards | Backlog: zet achter `goals.unlimited` of nieuwe `wealth.dashboard` feature-key (PRO+) |
| `getFundamentals` faalt → geen dividend-card; geen explicit error UI | Acceptabel — kaart verschijnt simpelweg niet; toekomstig: "data laad onbevredigend"-banner |
| Maandelijkse discipline rekent alleen `type=CASH > 0`; transfers tussen portefeuilles tellen onterecht mee | Acceptabel v1; toekomstig: filter op `metadata.source!=="transfer"` |
| Drift gebruikt `rebalance.targetWeight` — zonder doel-allocatie is target=current → drift=0 | Acceptabel — gebruiker moet eerst rebalance-plan generen voor zinvolle drift |
| Geen real-time herberekening; data is on-load fresh | Acceptabel — niet-real-time is Buffett-laag-juist |
| Export is markdown via select+copy; geen download-knop | v2-werk; vereist `URL.createObjectURL` of server-side blob-route |
| 10-jaars horizon hardcoded; doelen kunnen 30+ jaar zijn | Acceptabel — 10y is "begrijpelijke planning-horizon"; doelen-engine (Module 5) dekt langere horizons al |
| Geen AI-uitleg (alleen deterministic explanation) | Backlog: hook in Module 8 `explainability.layer` als nieuwe domain `wealth_summary` |
