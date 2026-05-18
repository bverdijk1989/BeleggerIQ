# Onboarding & First-Value Flow — Module 20

5-stappen wizard + mobile-first First-Value-dashboard zodat een nieuwe gebruiker binnen 5 minuten begrijpt wat BeleggerIQ doet en welke actie relevant is.

> **UX-norm**: een first-time user mag NIET overweldigd worden met een 8-sectie dashboard. We tonen 3 inzichten + 2 next-steps + 1 subtiele upgrade-hint.

---

## 1. Module 20-spec mapping

| # | Spec | Implementatie | Locatie |
|---|---|---|---|
| 1 | 5-stappen wizard | doel → ervaring → risico → stijl → portfolio | [`/onboarding/wizard`](../src/app/(app)/onboarding/wizard/) |
| 2 | First-Value dashboard | Health + grootste risico + eerste maandactie + uitleg + CTA | [`/welcome`](../src/app/(app)/welcome/page.tsx) |
| 3 | Progress indicator | `wizardProgressPercent()` + bar in header | client.tsx |
| 4 | Empty states | `/welcome` toont preview-cards + CTA naar `/portfolio` of `/transacties` als geen holdings | page.tsx |
| 5 | Mobile-first layout | single-column, full-width buttons op mobile, `sm:`-breakpoints voor desktop | client.tsx + welcome/page.tsx |
| 6 | Subtiele upgrade-CTA | `<UpgradeHint />` één-regel link naar `/pricing` onderaan welcome | page.tsx |

**5 spec-stappen** (volgorde van `WIZARD_STEP_ORDER`):

1. **OBJECTIVE** — Wat is je beleggingsdoel? (6 opties: pensioen / FIRE / groei / inkomen / mix / vermogen behouden)
2. **EXPERIENCE** — Beginner / Focus / Expert (mapt 1-op-1 op `UxMode`)
3. **RISK** — Voorzichtig / Gebalanceerd / Groei / Agressief (mapt op `RiskTolerance`)
4. **STYLE** — ETF / Dividend / Aandelen / Crypto / Mix (mapt op `InvestorType` via wizard-laag)
5. **PORTFOLIO** — Handmatig invoeren / Demo-portfolio / Later importeren (`PortfolioBootstrap`)

---

## 2. Architectuur

```
src/lib/onboarding/
├── state.ts            # Bestaande 3-stappen post-wizard state-machine
│                        # (PROFILE/PORTFOLIO/SNAPSHOT — heeft de user die uitgevoerd?)
├── state.test.ts       # 9 bestaande tests
├── wizard.ts           # Module 20: 5-stappen pre-flight types + validate
└── wizard.test.ts      # 15 nieuwe tests (incl. spec-conformance)

src/app/(app)/onboarding/
├── page.tsx                  # Bestaande 3-stappen post-wizard overzicht
├── actions.ts                # markOnboardingComplete + saveOnboardingPreferences
└── wizard/
    ├── client.tsx            # Module 20 client-side state-machine (mobile-first)
    └── page.tsx              # Server-component die client mount

src/app/(app)/welcome/
└── page.tsx                  # First-Value Dashboard (Module 20)
```

**Geen Prisma-migratie**. Extra wizard-state (style + portfolioBootstrap) wordt opgeslagen in `UserProfile.preferences`-JSON-blob als `onboardingWizard.{style,portfolioBootstrap,savedAt}`.

---

## 3. Wizard pipeline

```
   /onboarding/wizard (client)
              │
              ▼
   ┌──────────────────────┐
   │  Step 1: OBJECTIVE   │  6 opties — single-tap selection
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │  Step 2: EXPERIENCE  │  Beginner/Focus/Expert → UxMode
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │  Step 3: RISK        │  4 opties → RiskTolerance
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │  Step 4: STYLE       │  5 opties → InvestorType + style-blob
   └──────────┬───────────┘
              ▼
   ┌──────────────────────┐
   │  Step 5: PORTFOLIO   │  3 keuzes (manual/demo/later)
   └──────────┬───────────┘
              │
              ▼
   saveOnboardingPreferences()  ← server action
              │
              ▼
   redirect → /welcome
```

**Server-action** maakt of update `UserProfile` met:
- `objective` → `InvestmentObjective`
- `uxMode` → `UxMode`
- `riskTolerance` → `RiskTolerance`
- `investorType` → afgeleid uit `style` (DIVIDEND/FACTOR/BALANCED/LONG_TERM)
- `preferences.onboardingWizard` → JSON-blob met `{style, portfolioBootstrap, savedAt}`

Plus audit-record `onboarding_preferences_saved` met metadata `{objective, uxMode, style}` — géén PII.

---

## 4. First-Value Dashboard (`/welcome`)

**Drie inzichten** bovenaan (mobile = stack, desktop = 3-kolom grid):

| Card | Bron | Empty-fallback |
|---|---|---|
| Portfolio Health | `view.health.score` + `view.health.grade` | "Voeg minimaal 1 positie toe" |
| Grootste risico | `view.risk.flags[0]` (zwaarste severity) | "Geen flag met hoge urgentie" |
| Eerste maandactie | `view.rebalance.recommendations[0]` | "Plan een review" |

**"Wat betekent deze score?"-blok** — grade in gewone taal:
- A = "uitstekend — sterke spreiding en risico-beheersing"
- B = "goed — paar aandachtspunten maar fundament staat"
- C = "redelijk — meerdere verbeterpunten zichtbaar"
- D = "voorzichtig — concentratie of risico is verhoogd"
- F = "kritiek — directe review aanbevolen"

**Twee paden** als CTA — geen pop-up, geen dark pattern:
1. "Naar dashboard" (primary)
2. "Eerste doel instellen" (secondary)

**Subtiele upgrade-CTA** onderaan — één regel link naar `/pricing`. Bewust géén modal of intrusieve banner (per Module 13-spec: "Geen agressieve dark patterns").

---

## 5. Empty states (Module 20-eis)

| Scenario | Empty-content |
|---|---|
| Niet ingelogd | `EmptyState` met "Niet ingelogd" + auth-error |
| Geen portfolio | 3 preview-cards die uitleggen WAT je gaat zien + 2 CTA's (handmatig of CSV-import) |
| Geen risk-flag | "Risk-engine vond geen flag met hoge urgentie. Houd 't in de gaten." |
| Geen rebalance-actie | "Plan een review — een halfjaarlijkse review helpt drift te voorkomen." |

Geen scenario eindigt met een dood-spoor — er is altijd een next-step CTA.

---

## 6. Mobile-first specifieks

| Element | Mobile | Desktop |
|---|---|---|
| Container | `max-w-2xl` + `px-4 py-6` | `sm:px-6` |
| Step-card | full-width single column | single column blijft (focus) |
| Choice-list | volledig-breed buttons met grote tap-targets (`p-3` = 48-72px tap-area) | zelfde |
| Footer-nav | `flex-col gap-2` (Vorige onder Volgende) | `sm:flex-row sm:justify-between` |
| Buttons | `w-full sm:w-auto` — full-width default | auto-width desktop |
| Stat-grid | `grid-cols-1` | `lg:grid-cols-3` |

Geen horizontaal scrollen vereist op 360px-viewport.

---

## 7. UX-regels (spec)

| Regel | Implementatie |
|---|---|
| Geen overvolle dashboardervaring bij eerste login | `/welcome` toont 3 cards + 2 paden, niet de 8-sectie `/dashboard` |
| Geen technische termen zonder tooltip | Wizard gebruikt spreektaal ("Voorzichtig" i.p.v. "CONSERVATIVE"); welcome heeft `gradeMeaning()`-vertaling van grade naar zin |
| Iedere stap in gewone taal | NL-rationale per optie + 1-zin descriptie per choice-card |
| Beginner Mode simpeler dan Expert Mode | Spec-test bevestigt dat beide accepteerbaar zijn; UX-mode-visibility (Module 4) verbergt complexe pagina's voor BEGINNER |

---

## 8. Tests

| File | Tests | Coverage |
|---|---|---|
| `wizard.test.ts` | 15 | `WIZARD_STEP_ORDER` ordening, `defaultPreferences` valideert, `validatePreferences` 6 cases (compleet/onbekend-veld/null/undefined/primitief/missende-velden), step-navigatie (next/previous/index/progress), Module 20-spec-conformance (exact 5 stappen, beide UX-modes accepteerbaar) |
| `state.test.ts` | 9 | Bestaande 3-stappen post-wizard state-machine |

**Niet in deze pas** (vereist E2E-testframework):
- Volledige UI-flow van wizard step-1 t/m save + redirect
- Mobile responsive smoke-tests (zou Playwright + viewport-config vereisen)

---

## 9. Topbelegger-validatie (Module 20 perspectieven)

| Lens | Hoe Module 20 hier landt |
|---|---|
| **Lynch (begrijpt een beginner dit?)** | 5 stappen in spreektaal; elke optie heeft 1-zin descriptie; geen jargon ("CONSERVATIVE" → "Voorzichtig"); UxMode=BEGINNER simplificeert downstream UI |
| **Marketeer (conversie?)** | First-Value-dashboard reduceert eerste-sessie-overweldigingsrisico; subtiele upgrade-CTA (geen dark pattern) op het juiste moment (na waarde geleverd) |
| **CEO (churn?)** | Wizard maakt de waardepropositie expliciet in stap 1-5; `/welcome` levert 3 concrete inzichten binnen 30 seconden i.p.v. 8-sectie dashboard-zoekplaatje |
| **Buffett (vertrouwen)** | "Geen koop/verkoop-advies" expliciet in eerste sectie van `/welcome`; hedged-language door grade-vertaling |
| **Dalio (risico zichtbaar)** | Grootste risico is een eigen card naast Health Score — niet weggemoffeld onder een health-detail-paneel |

---

## 10. Wat NIET in deze pas

- **E2E-tests** met Playwright (vereist nieuwe dependency)
- **Demo-portfolio populator** voor de `DEMO`-bootstrap-keuze — backlog: pre-fab `Portfolio` met 5 holdings die de user kan klonen
- **A/B-test infra** voor stap-volgorde — overweeg bij commerciële launch
- **i18n** — wizard is NL-only v1; engelse vertaling staat klaar via bestaande i18n-laag maar wizard-copy is hardcoded
- **Auto-redirect** naar `/onboarding/wizard` voor users zonder profile — backlog (vereist proxy.ts-edit zoals Module 4 al doet)

---

## 11. Resterende risico's

| Risk | Mitigatie |
|---|---|
| Gebruiker stopt halverwege wizard (geen partial-save) | Acceptabel v1 — alleen 5 stappen, 60 seconden werk. Backlog: save-per-stap |
| `DEMO`-bootstrap-keuze doet nog niets (populator ontbreekt) | UI-tekst zegt "later overschrijven" — gebruiker krijgt fallback empty-state op `/welcome` |
| Geen middleware-redirect naar wizard voor onboardende user | Bestaande Module 4 UX-mode-laag redirect FOCUS-users; uitbreiden naar wizard-detection is backlog |
| Mobile smoke-tests handmatig | Tailwind responsive classes consistent toegepast; Playwright-suite is volgend sprint-werk |
