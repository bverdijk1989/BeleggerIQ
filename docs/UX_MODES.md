# UX Modes — Module 8

Drie modi die de UI-densiteit per gebruiker sturen — Beginner / Focus / Expert. Default = **FOCUS** (minimaal-maar-bruikbaar voor iedereen). Schakel in `/profiel` over naar een andere modus.

> **Doel**: minder dashboard-chaos, meer rust, duidelijke hiërarchie. Een gewone belegger ziet doelen + score + risico; een expert zit nog steeds in de volledige analytics.

---

## 1. De 3 modi

| Mode | Voor wie | Toont |
|---|---|---|
| **BEGINNER** | Nieuwe gebruikers, "ik wil rust + uitleg" | Doelen, Health Score, Behavioral Coach + status-snapshot. Educatieve microcopy boven elke sectie. |
| **FOCUS** | Bewuste belegger, "alleen kerntaken" | Briefing, Health, Risk, Opportunities, Macro, Coach, Goals. Geen scenario/allocation/AI-explain/business-quality. |
| **EXPERT** | Power user, "alle data" | Volledige Decision Cockpit: alle widgets + Confidence Summary + Decision History + Verdieping (regime/benchmark) + Business Quality + Net Return + Historiek. |

---

## 2. Architectuur

```
src/lib/ux-mode/
├── types.ts             # UxMode, DashboardVisibility, NavRouteKey
├── microcopy.ts         # Beginner-mode educatieve teksten per sectie
├── actions.ts           # Server action: setUxModeAction
├── visibility.test.ts   # 19 tests (config + nav-filter + microcopy)
└── index.ts

prisma/
├── schema.prisma                # +UxMode enum + uxMode field on UserProfile
└── migrations/20260510180000_add_ux_mode/

src/components/
├── ux-mode/ux-mode-selector.tsx # Client picker (3-card radio)
└── layout/
    ├── sidebar.tsx              # +uxMode prop → filter NAV_ITEMS
    ├── mobile-nav.tsx           # +uxMode prop pass-through
    ├── top-bar.tsx              # +uxMode prop pass-through
    └── app-shell.tsx            # Reads profile.uxMode + injects in tree
```

---

## 3. DashboardVisibility config

`getDashboardVisibility(mode)` levert booleans per dashboard-sectie:

| Sectie | BEGINNER | FOCUS | EXPERT |
|---|---|---|---|
| `showPrimaryAction` | ✓ | ✓ | ✓ |
| `showStatusSnapshot` | ✓ | ✓ | ✓ |
| `showHealthScoreCard` | ✓ | ✓ | ✓ |
| `showBehavioralCoach` | ✓ | ✓ | ✓ |
| `showGoals` | ✓ | ✓ | ✓ |
| `showRiskActions` | — | ✓ | ✓ |
| `showOpportunities` | — | ✓ | ✓ |
| `showBriefing` | — | ✓ | ✓ |
| `showMacroRegime` | — | ✓ | ✓ |
| `showAllocationPreview` | — | — | ✓ |
| `showScenarioSnapshot` | — | — | ✓ |
| `showAiExplain` | — | — | ✓ |
| `showConfidenceSummary` | — | — | ✓ |
| `showDecisionHistory` | — | — | ✓ |
| `showDeepDive` | — | — | ✓ |
| `showBusinessQuality` | — | — | ✓ |
| `showNetReturn` | — | — | ✓ |
| `showHistoryCharts` | — | — | ✓ |
| `showEducationalMicrocopy` | ✓ | — | — |

Strikte subset: BEGINNER ⊂ FOCUS ⊂ EXPERT (geverifieerd in tests).

---

## 4. Sidebar-navigatie filter

`getVisibleNavRoutes(mode)` levert de subset van `NAV_ITEMS` die zichtbaar is per modus:

| Modus | Routes |
|---|---|
| **BEGINNER** | `/dashboard` · `/portfolio` · `/portfolio-health` · `/doelen` · `/coach` · `/profiel` · `/methodologie` |
| **FOCUS** | + `/risico` · `/briefing` · `/macro` · `/maandbeslissing` · `/transacties` |
| **EXPERT** | + `/score` · `/kansen` · `/screener` · `/watchlist` · `/strategy-lab` · `/backtest` · `/chat` · `/belasting` |

**Belangrijk**: dit is een **densiteit-keuze, geen permission-laag**. Direct-URL-toegang werkt in alle modi. We verbergen alleen items in de sidebar zodat de gebruiker visuele rust krijgt.

---

## 5. Educational microcopy (alleen BEGINNER)

Boven elke kern-sectie toont BEGINNER-modus één korte uitleg-zin:

- **Health**: "De Health Score (0–100) telt 10 dingen mee: spreiding, sectorconcentratie, volatiliteit, kwaliteit, waardering, en meer. Een score van 70+ is doorgaans gezond."
- **Goals**: "Je portefeuille bestaat niet voor zichzelf — koppel hem aan je leven: pensioen, FIRE, huis, of een eigen doel."
- **Coach**: "We meten gedragspatronen (te veel handelen, FOMO, panic-verkopen). Geen verwijten — alleen reflectievragen."

Plus een banner bovenaan het dashboard die uitlegt dat ze in beginner-modus zitten + hoe over te schakelen.

`getMicrocopy(section, mode)` retourneert lege string voor FOCUS / EXPERT — UI checkt op truthy.

---

## 6. Persistentie

Prisma `UserProfile.uxMode UxMode @default(FOCUS)`. Server-action `setUxModeAction(mode)`:

1. Verifieert auth
2. Upsert `UserProfile` met nieuwe modus (maakt rij aan als die ontbrak)
3. `revalidatePath("/dashboard")` + `revalidatePath("/profiel")`

UI verandert direct na de mutation — geen pagina-refresh nodig.

---

## 7. UX-richtlijnen toegepast

| Richtlijn | Hoe |
|---|---|
| **Premium fintech** | Selector is 3-card radio met subtiele primary-border bij selectie + check-icoon. Geen klikbare `<select>`-dropdown — visuele kaarten passen bij premium-uitstraling. |
| **Minder chaos** | BEGINNER toont 5 secties; FOCUS toont 9; EXPERT toont alle 18. Strikte subset-relatie. |
| **Meer rust** | Default-modus FOCUS. BEGINNER + Focus verbergen aiExplain + scenario + allocation — engines die zelden actie-relevant zijn. |
| **Duidelijke hiërarchie** | Above-the-fold blijft identiek (PrimaryAction + Status + Health). De rest schaalt mee. |
| **Premium CTA's** | BEGINNER-banner heeft een directe link naar `/profiel` om naar Focus/Expert te schakelen. |
| **Mobile** | Bestaande `lg:`-breakpoints werken — minder secties = minder scrolling op mobiel = echte rust. |
| **AI-first (Wood)** | AI Explain-panel is ingebakken in EXPERT; FOCUS gebruikt nog steeds de Daily Briefing (Module 2) en Behavioral Coach (Module 3) die AI-redacteur zijn. |

---

## 8. Tests — 19 in totaal

| Categorie | Tests |
|---|---|
| Subset-relations (BEGINNER ⊂ FOCUS ⊂ EXPERT) | 4 |
| Visibility per modus | 3 |
| Default + null-fallback | 1 |
| Sidebar nav-filter (BEGINNER / FOCUS / EXPERT) | 6 |
| `isRouteVisibleInMode` | 3 |
| Microcopy-empty in non-BEGINNER | 4 |

---

## 9. Toekomstige uitbreidingen

| Idee | Waarom |
|---|---|
| **Auto-suggest na onboarding** | Onboarding-wizard kan op basis van `investorType` automatisch de juiste modus voorstellen (`LONG_TERM` → BEGINNER, `FACTOR` → EXPERT). |
| **Per-pagina mode-overrides** | Sommige pagina's hebben hun eigen densiteit — een EXPERT op `/score` ziet alle 10 signalen, een BEGINNER ziet alleen totalScore + headline. |
| **Mode-aware notification routing** | BEGINNER krijgt minder notificaties; EXPERT krijgt alle factor-drift-alerts. |
| **A/B testing** | Track of FOCUS-mode betere engagement levert dan BEGINNER bij nieuwe users. |
| **Tour overlay in BEGINNER** | Eerste-bezoek-tour over de 5 kern-secties (Goal, Health, Coach, Status, Briefing). |
| **Mode-specific empty states** | BEGINNER-empty-states zijn eduactiever; EXPERT verwacht direct alle metrics. |
