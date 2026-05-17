# Advisor / Enterprise — Fundament & Migratie-pad — Module 14

Voorbereidende laag voor multi-client portfolios, advisor-dashboards, white-label rapportage en organisatie-accounts. **Geen grote rewrite** — bestaande User → Portfolio-relatie blijft de canonical structuur. Enterprise-functionaliteit komt erbovenop, gefaseerd en opt-in.

> **Status v1**: types + library + tests + 1 placeholder-pagina. Nul Prisma-migraties. UI-flows en DB-tabellen worden geactiveerd zodra de eerste pilot-organisatie is bevestigd.

---

## 1. Wat staat er al

```
src/lib/enterprise/
├── types.ts              # OrgRole, Organization, Membership, WhiteLabelConfig,
│                          ReportSpec, ComplianceDisclaimer, EnterpriseFeatureFlag
├── roles.ts              # ROLE_PERMISSIONS matrix + can.* helpers + canManageRole
├── feature-flags.ts      # 4-laags resolver: default → env → org → user
├── disclaimers.ts        # 5 disclaimers (general/advisor/white-label/AFM-NL)
├── report-spec.ts        # buildReportSpec — auto-injects relevante disclaimers
├── audit-context.ts      # recordAdvisorAudit wrapper rond bestaande audit
├── enterprise.test.ts    # 29 tests (rollen, flags, disclaimers, report-spec)
└── index.ts              # public API

src/app/(app)/advisor/page.tsx
                          # ADVISOR-tier-gated preview-pagina;
                          # toont rollen, flags, en wat er klaar staat

src/lib/entitlements/catalog.ts
                          # advisor.multi_client | advisor.export_reports |
                          # advisor.white_label — al sinds Module 9 in tier ADVISOR
```

**Nul Prisma-tabellen toegevoegd**. Geen migraties nodig om deze module te gebruiken.

---

## 2. Architectuur-overzicht

```
┌─────────────────────────────────────────────────────────────────┐
│                        BILLING TIER (Module 9)                   │
│   FREE → PRO → ELITE → ADVISOR                                   │
│   Bepaalt: WELKE features mag deze user betalen-technisch?      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     ENTERPRISE FEATURE FLAGS                     │
│   advisor.dashboard, report.pdf_export, white_label.*, ...      │
│   Bepaalt: IS DEZE FUNCTIONALITEIT geactiveerd? (gefaseerd)     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      ORG MEMBERSHIP + ROLE                       │
│   OWNER / ADMIN / ADVISOR / VIEWER / CLIENT                      │
│   Bepaalt: WAT mag deze user binnen DEZE organisatie doen?      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    Specifieke action / data
```

Drie orthogonale lagen. Een user heeft tegelijk:
- Een **billing tier** (mag advisor-functies kopen?)
- **Feature-flag overrides** (zit hij in een gefaseerde rollout?)
- **Memberships** met **rollen** (welke autoriteit binnen welke org?)

---

## 3. Rollen-matrix

| Rol | Permissies | Wie? |
|---|---|---|
| `OWNER` | org.manage, org.billing, org.white_label, client.*, report.*, audit.read | Eigenaar firma — beheert billing |
| `ADMIN` | org.manage, org.white_label, client.*, report.*, audit.read | Manager — geen billing |
| `ADVISOR` | client.list/read/write, report.generate/read | Adviseur — werkt met cliënten |
| `VIEWER` | client.list/read, report.read | Compliance/oversight rol |
| `CLIENT` | client.read, report.read (eigen data) | Cliënt zelf |

Helpers in `src/lib/enterprise/roles.ts`:
- `hasPermission(role, permission)` → bool
- `canManageRole(actor, target)` → bool — alleen OWNER/ADMIN; OWNER kan andere OWNER niet demoten (transfer-flow voor v2)
- `can.manageClients / generateReports / manageOrg / configureWhiteLabel / readAuditLog`
- `rolesWithPermission(p)` — voor UI-hints "welke rollen kunnen X?"

---

## 4. Migratie-pad: van types-only naar productie

### Fase 0 — nu (v1): types-only laag
- Geen Prisma-migratie
- Geen runtime-organisaties
- `Organization` + `OrgMembership` types worden nog nergens geïnstantieerd
- `recordAdvisorAudit` wrapper kan al gebruikt worden vanuit code-paden waar je context hebt

### Fase 1 — Pilot bevestigd: schema + minimale UI
**Trigger**: contract met eerste pilot-firma getekend.

**Prisma-migratie** (additief, geen bestaande tabel-rewrite):

```prisma
model Organization {
  id           String   @id @default(cuid())
  name         String
  slug         String   @unique
  jurisdiction String
  ownerUserId  String
  whiteLabel   Json?
  featureFlags Json?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  memberships  OrgMembership[]
  // Future: Organization-owned portfolios via OrgPortfolio link-table
}

model OrgMembership {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  userId         String
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  role           String       // OWNER | ADMIN | ADVISOR | VIEWER | CLIENT
  clientScope    Json?        // ClientScopeFilter
  joinedAt       DateTime     @default(now())

  @@unique([organizationId, userId])
  @@index([userId])
}
```

User-relatie aanvullen:
```prisma
model User {
  // ... bestaande velden
  memberships  OrgMembership[]
}
```

**Audit-extensie** (geen breaking change op bestaande tabel):
- `AuditEntry.metadata` JSON-blob is al flexibel; `recordAdvisorAudit` schrijft `metadata.advisor` sub-object met `organizationId` + `advisorUserId` + `onBehalfOfUserId` + `role`
- Audit-UI v2 leest dit eruit voor advisor-filtering

**UI-flow**:
1. `/advisor` placeholder → echte multi-client lijst
2. Cliënt-switcher in header (gated door `advisor.client_switch` flag)
3. Org-settings page: members beheren, rol toewijzen, white-label-config
4. Audit-log filter "alleen advisor-acties op cliënt X"

### Fase 2 — Multi-portfolio claim per advisor
**Trigger**: pilot vraagt om "advisor mag namens cliënt orders/transacties registreren".

Optie A (light-touch, aanbevolen voor v2):
- Houd `Portfolio.userId` zoals het is (= cliënt-user)
- Voeg een `PortfolioDelegation`-tabel toe:
  ```prisma
  model PortfolioDelegation {
    portfolioId    String
    delegatedToUserId String
    organizationId String
    permissions    String[]   // bv. ["read", "rebalance.suggest"]
    grantedAt      DateTime   @default(now())
    revokedAt      DateTime?
    @@id([portfolioId, delegatedToUserId])
  }
  ```
- Server-actions checken: actor ofwel `userId === portfolio.userId`, ofwel een geldige actieve delegation

Optie B (groter, niet aanbevolen): Portfolio.userId polymorf maken. **Forceert grote rewrite — tegen de spirit van M14**.

### Fase 3 — Volledig multi-tenant
- Org-owned portfolios (geen cliënt-user nodig — voor execution-only mandaat)
- Cross-org-isolation enforcement op DB-niveau (Postgres RLS of view-laag)
- Audit-export per org, retentie-policy per jurisdictie
- Eigen domein + DNS + cert-flow voor white-label

Buiten scope voor de eerste 12 maanden.

---

## 5. Feature-flag-resolver

`isEnterpriseFlagEnabled(flag, ctx)` — 4-laags volgorde:

1. **Default** (uit voor alles) — `DEFAULT_ENTERPRISE_FLAGS`
2. **Env** — `ENTERPRISE_FLAGS_<KEY>=true|false` (bv. `ENTERPRISE_FLAGS_ADVISOR_DASHBOARD`)
3. **Org-override** — `Organization.featureFlags` JSON-blob
4. **User-override** — `UserProfile.preferences.enterpriseFlags` JSON-blob

Voor gefaseerde rollout: eerst env-aan voor staging, dan org-aan voor pilot, dan user-aan voor specifieke testers.

8 flags geregistreerd:
- `advisor.dashboard` / `advisor.client_switch`
- `report.pdf_export` / `report.excel_export`
- `white_label.custom_domain`
- `audit.advanced_filters`
- `team.invite_flow`
- `compliance.afm_disclaimer`

---

## 6. Compliance disclaimers

5 disclaimers in `DISCLAIMER_CATALOG`:
- **`general.investment_data`** (jurisdictie-neutraal) — informatief karakter, geen advies
- **`advisor.report`** (jurisdictie-neutraal) — reikwijdte van rapport
- **`advisor.report` (NL)** — AFM/Wft-vergunningplicht
- **`advisor.recommendation`** (jurisdictie-neutraal) — status van aanbevelingen
- **`white_label.footer`** (jurisdictie-neutraal) — verantwoordelijkheid bij afzender

Elke disclaimer heeft `version: number` — bumpen wanneer juridisch reviewen, audit-trail bewaart welke versie de cliënt te zien kreeg.

`selectDisclaimers({contexts, jurisdiction})` filtert juiste set; `renderDisclaimerBlock(...)` produceert plat-tekst-blok voor PDF-renderer.

> ⚠️ **Niet juridisch advies**: deze teksten zijn een redelijke startset o.b.v. publieke richtlijnen. Voor productie-deployment in een advisor-context **MOET** een advocaat overheen.

---

## 7. Report-spec — voorbereiding voor PDF

`buildReportSpec({...})` produceert een **data-only** `ReportSpec`:
- `sections: ReportSection[]` — expliciete lijst (summary, allocation, performance, risk, holdings, transactions, tax, scenario, appendix)
- `disclaimers: ComplianceDisclaimer[]` — automatisch geselecteerd o.b.v. org + sections
- `whiteLabel: WhiteLabelConfig` — default of org-specifiek
- `title`, `advisorNote` — overschrijfbaar

**PDF-renderer komt v2**. Mogelijke routes:
- `pdfmake` (lightweight, server-side, JS-only) — geschikt voor tabellen + disclaimers
- React Server Component → Puppeteer-headless render — duurder maar pixel-perfect met UI-styling

**Excel-export** kan parallel via `exceljs` op dezelfde `ReportSpec`.

---

## 8. Audit-context

`recordAdvisorAudit(input)` wrapt bestaande `audit.record`:

```ts
await recordAdvisorAudit({
  category: "policy",
  action: "update_policy",
  resourceType: "Portfolio",
  resourceId: clientPortfolio.id,
  summary: "Advisor verhoogde max-position-cap van 10% naar 12%",
  advisor: {
    organizationId: org.id,
    advisorUserId: session.user.id,
    onBehalfOfUserId: client.userId,
    role: membership.role,
  },
});
```

Schrijft `metadata.advisor.{organizationId, advisorUserId, onBehalfOfUserId, role}` zodat compliance later kan filteren op "alle advisor-acties op cliënt X" of "alle wijzigingen door ADMIN-rol".

Bestaande audit-pad blijft volledig werken — wrapper is additief.

---

## 9. Topbelegger-validatie

| Lens | Hoe Module 14 hier landt |
|---|---|
| **Buffett** | B2B recurring revenue is duurzaam — ADVISOR-tier ligt klaar in entitlements; org-level state (membership + role) is voorbereid voor contract-billing |
| **Dalio** | Advisors willen risicodashboards — `ReportSection` heeft expliciet `risk` + `scenario`; aanbevelingen-disclaimer is apart van algemene disclaimer |
| **Lynch** | Rapporten begrijpelijk — disclaimer-versie + sectie-lijst is data-only en testbaar; renderer kan gericht NL spreektaal renderen |
| **Simons** | Data + signalen schaalbaar — feature-flags per scope, geen monolithische "advisor mode aan/uit"; gefaseerd inschakelbaar zonder code-deploy |
| **Wood** | Platformisering — multi-tenant boundary (`OrgScope`, `ClientScopeFilter`) is expliciet ingebouwd; data-leakage tussen tenants onmogelijk wanneer DB-laag wordt geactiveerd (RLS-route in fase 3) |

---

## 10. Wat NIET in v1

Bewust uitgesteld:
- **Prisma `Organization` / `OrgMembership` tabellen** — pas wanneer pilot bevestigd is
- **Multi-client UI-flows** — cliënt-switcher, advisor-dashboard, members-page
- **PDF/Excel-renderers** — `ReportSpec` is data-only
- **DNS/cert-flow voor white-label custom-domain** — feature-flag bestaat, implementatie wacht
- **Cross-org-isolation enforcement** (Postgres RLS) — alleen relevant na fase 3
- **Stripe/Mollie billing voor ADVISOR-tier** — entitlement-gating staat klaar; checkout-flow komt met pilot
- **Audit-UI advanced filters** — flag staat klaar, implementatie volgt

Deze keuzes voorkomen "grote rewrite" terwijl de fundamenten klaar liggen om in 1-2 sprints geactiveerd te worden zodra het commercieel relevant is.

---

## 11. Tests

`enterprise.test.ts` — **29 tests** allemaal groen:

**Roles + permissions** (10 tests):
- Matrix dekt alle 5 rollen
- OWNER ⊇ ADMIN-permissies
- CLIENT en VIEWER write-restrictions
- canManageRole — alleen OWNER/ADMIN, geen self-demote, target-rang-check

**Feature flags** (8 tests):
- Default uit, env-override aan/uit, org-override > env, user-override > org
- envKeyForFlag converteert correct naar SCREAMING_SNAKE
- parseUserFlagOverrides droppt onbekende keys + non-booleans

**Disclaimers** (4 tests):
- Jurisdictie-neutraal + jurisdictie-specifiek selectie
- Catalog integriteit (non-empty body, version >= 1)
- renderDisclaimerBlock plat-tekst-output

**Report-spec** (5 tests):
- Default white-label + alleen general-disclaimer zonder org
- Met org → advisor + white-label disclaimers
- NL-jurisdictie → AFM-disclaimer komt mee
- Scenario-section → recommendation-disclaimer komt mee
- Default sections wanneer geen meegegeven

**Privacy/integriteit** (2 tests):
- Wrapper merge audit-metadata zonder bestaande velden te overschrijven
- Roles-with-permission consistent met matrix

---

## 12. Decision-log: waarom géén Prisma-migratie?

**Vraag**: waarom niet meteen `Organization` + `OrgMembership` tabellen?

**Antwoord**:
1. Geen pilot-organisatie bevestigd → 0 productie-rijen → migratie-overhead zonder waarde
2. Tabel-shapes kunnen tijdens pilot-fase nog wijzigen (jurisdictie-keuzes, scope-filters)
3. Migratie-pad is "additive" — niet-blokkerende toevoeging zodra het wel relevant is (zie fase 1)
4. Tegen de spirit van "forceer geen grote rewrite" om nu al schema-velden toe te voegen die niet gebruikt worden

**Wel klaar**: types-laag, role-matrix, disclaimer-catalog, audit-wrapper. Activatie kost een sprint, niet maanden.
