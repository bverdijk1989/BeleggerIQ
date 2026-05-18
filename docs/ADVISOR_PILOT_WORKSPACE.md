# Advisor Pilot Workspace — Module 24

Een advisor kan meerdere klantportefeuilles **beheren of beoordelen** binnen een expliciete privacy-grens. Geen volle multi-tenant rewrite; voortbouwend op M14 (Advisor Foundation) en M23 (Advisor PDF Report).

> **Pilot-laag**: workspace-koppelingen leven nu in een env-allowlist (zoals admin in M15). Bij contract-bevestiging migreren we naar `OrgMembership` + DB-resolver zonder UI-rewrite.

---

## 1. Module 24-spec mapping — 8 deliverables

| # | Spec | Implementatie | Locatie |
|---|---|---|---|
| 1 | Advisor dashboard route | `/advisor/clients` (server-component, dynamic) | `src/app/(app)/advisor/clients/page.tsx` |
| 2 | Client list met minimale metadata | `AdvisorClientSummary` — gemaskeerde mail + counts + last-activity | `service.ts → loadAdvisorWorkspace` |
| 3 | Client portfolio summary | `/advisor/clients/[clientId]` met StatCards | `service.ts → loadAdvisorClientDetail` |
| 4 | Client report generation | `/api/advisor/clients/[clientId]/report` (hergebruik M23 builder/renderer) | `app/api/advisor/clients/[clientId]/report/route.ts` |
| 5 | Role/permission guard | `isWorkspaceAdvisor` + `checkClientAccess` | `resolver.ts` |
| 6 | Audit logging open/export | `recordAdvisorClientOpened` + `recordAdvisorClientReportExported` + `recordAdvisorAccessDenied` | `audit.ts` |
| 7 | Privacy boundary | Allowlist-resolver: advisor ziet ALLEEN expliciet gelinkte clients | `resolver.parseWorkspaceLinks` |
| 8 | White-label placeholder | Sectie op dashboard + `DEFAULT_WHITE_LABEL` hergebruik | `clients/page.tsx` + M14 `enterprise/types.ts` |

---

## 2. Architectuur

```
src/lib/advisor-workspace/
├── types.ts          # WorkspaceLink, AdvisorClientSummary, AdvisorClientDetail
├── resolver.ts       # parseWorkspaceLinks, checkClientAccess, isWorkspaceAdvisor
├── service.ts        # loadAdvisorWorkspace, loadAdvisorClientDetail,
│                       clientIdFromEmail (sha256/12), clientEmailHash (sha256/64)
├── audit.ts          # recordAdvisorClientOpened, recordAdvisorClientReportExported,
│                       recordAdvisorAccessDenied + PII-scrubber
├── resolver.test.ts  # 20 tests (parse + boundary)
├── service.test.ts   # 11 tests (hashing + resolve + stats)
├── audit.test.ts     # 6 tests (audit + scrub + privacy-conformance)
└── index.ts

src/app/(app)/advisor/clients/
├── page.tsx                    # dashboard
└── [clientId]/page.tsx         # detail + open-event audit

src/app/api/advisor/clients/[clientId]/report/route.ts
                                # hergebruik M23 loader + renderer
```

**Geen Prisma-migratie**. Hergebruikt:
- `portfolioRepository` (existing) — geen wijzigingen aan ownership-model
- `recordAdvisorAudit` patroon (M14) — adapter `audit.ts`
- M23 `loadAdvisorReport` + `renderAdvisorReportHtml` — geen duplicatie
- `maskEmail` (M15 admin-guards) — DRY

---

## 3. Privacy-boundary — drie lagen verdediging

```
Request → /advisor/clients/[clientId]
        │
        ├─→ Layer 1: resolveUser (auth-cookie check, M16)
        ├─→ Layer 2: isWorkspaceAdvisor (env-allowlist heeft advisor?)
        └─→ Layer 3: resolveClientIdInWorkspace
                     (clientId-hash hoort bij EEN VAN advisor's clients?)
                            │
                            ▼
                    Lees Portfolio data
```

Drie onafhankelijke checks. Wanneer één faalt → 403 + `advisor_access_denied`-audit-event + identieke errortekst (anti-enumeration: not-linked en niet-bestaande clientId zien er identiek uit voor de browser).

**Boundary-tests** (`resolver.test.ts`):
- Cross-tenant attempt → DENY (`not_linked`)
- Verzonnen clientId-hash → DENY (`client_not_found` / `not_linked`)
- Onbekende advisor → DENY (`not_an_advisor`)
- Lege env → DENY (`no_workspace_links`)
- Case-insensitive match werkt zoals verwacht

---

## 4. Env-config — `ADVISOR_WORKSPACE_LINKS`

```bash
ADVISOR_WORKSPACE_LINKS="advisor@firm.com:client1@a.com,client2@b.com;advisor2@firm.com:client3@x.com"
```

- Segmenten gescheiden door `;` — één segment per advisor
- Vóór `:` = advisor-email; ná `:` = comma-separated cliënt-e-mails
- Tolerant voor whitespace, case-folding (alles lowercase)
- Lege segmenten + invalide segmenten (geen `@`, geen `:`) worden genegeerd
- Meerdere segmenten met dezelfde advisor worden samengevoegd (set-merge)

**Operating model**: pilot-config wordt door beheerder gewijzigd via deployment. Geen runtime-mutatie zonder deploy = audit-trail via git-history van env-config.

---

## 5. Audit-events

| Event | Category | Trigger | resourceId | Metadata |
|---|---|---|---|---|
| `advisor_client_opened` | `system` | detail-pagina geopend | sha256(clientEmail) | clientEmailHash, workspaceVersion |
| `advisor_client_report_exported` | `system` | API-route succesvol | sha256(clientEmail) | clientEmailHash, format, schemaVersion, download? |
| `advisor_access_denied` | `auth` | elke boundary-failure | trunc'd clientId | reason (not_linked / not_an_advisor / ...) |

**Privacy-regels** geforceerd door `scrub()` in `audit.ts`:
- E-mail-pattern in metadata-strings → `[redacted-email]`
- Objects/arrays in user-supplied metadata → `[dropped]` (geen blob-dump)
- Strings cap't op 200 chars (anti-log-spam)
- `resourceId` cap't op 32 chars voor `advisor_access_denied`

---

## 6. Geen retail-impact — testen

| Retail-scenario | Status |
|---|---|
| Retail user opent `/dashboard` | ongewijzigd — `/advisor/clients` is een eigen route |
| Retail user opent `/advisor/clients` | EmptyState "geen workspace geconfigureerd" |
| Retail user probeert directe URL `/advisor/clients/<hash>` | `isWorkspaceAdvisor` returnt false → EmptyState |
| Retail user opent `/api/advisor/clients/<hash>/report` | 403 + audit-event |
| Retail user opent eigen `/advisor/report` (M23) | werkt — andere entitlement (Elite+) |

Boundary-tests `resolver.test.ts` includeert expliciet: "retailgebruiker zonder workspace-config blijft onaangetast".

---

## 7. Tenant-abstraction — pragmatisch & uitbreidbaar

In `WorkspaceLink` (type) is `advisorEmail` + `clientEmails[]` voldoende voor de pilot. Wanneer M14 fase-1 (DB-tabellen) wordt geactiveerd:

| v1 (nu) | v2 (pilot bevestigd) |
|---|---|
| `parseWorkspaceLinks(envValue)` | `loadWorkspaceLinksFromDb(orgId)` |
| `WorkspaceLink.advisorEmail` | `OrgMembership.userId` + `OrganizationId` |
| `clientEmails: string[]` | `WorkspaceClientLink[]`-tabel |
| `clientEmailHash` voor audit | same |
| `recordAdvisorClientOpened` | same — interface stabiel |
| UI in `clients/page.tsx` | same — leest `LoadWorkspaceResult` |

**Migratie-pad**: enkel `resolver.ts` + `service.loadAdvisorWorkspace` worden vervangen door DB-variant. Alle UI + audit-laag blijft identiek. Eén sprint.

---

## 8. White-label placeholder

Het dashboard toont op de `/advisor/clients`-pagina expliciet:

- Huidige brand: `BeleggerIQ` (uit `DEFAULT_WHITE_LABEL` — M14)
- Rapporten gebruiken de default-config tot per-org branding actief is
- v2-roadmap link: per-pilot `WhiteLabelConfig` (logo + primary-color + footer + AFM-licentie) — schema-shape staat al klaar

Het Advisor PDF Report (M23) honoreert `whiteLabelOverride` al; de pilot-loader gebruikt het nog niet (geen DB-koppeling), maar de API-route kan dat in v2 zonder breaking change toevoegen.

---

## 9. Topbelegger + spec-perspectieven

| Lens | Hoe Module 24 hier landt |
|---|---|
| **Buffett (vertrouwen + eenvoud)** | Eén dashboard, gemaskeerde data, geen orders — alleen aandachtspunten via M23-rapport |
| **Dalio (risico + scenarios)** | Rapport-export per cliënt → 9 stress-scenarios per cliënt zichtbaar |
| **Lynch (begrijpelijk)** | Cliëntlijst: 3 cijfers per kaart (posities/portefeuilles/laatste activiteit) — geen jargon |
| **Simons (meetbaar + reproduceerbaar)** | Deterministische `clientIdFromEmail`; 37 tests dekken boundary + privacy + audit |
| **Wood (toekomstgericht)** | Env-resolver vervangbaar door DB-resolver zonder UI-rewrite; advisor-flow is een laag, geen rewrite |
| **Technisch/functioneel beheerder** | Allowlist in env → deployment-controle; audit-events expliciet; geen secrets/PII in logs |
| **Langetermijnbelegger** | Cliënten zien geen verandering — retail-flow ongewijzigd |
| **Hedge fund (data + signals)** | Backtestbaar: zelfde portfolio-view-engine als retail; advisor-laag voegt boundary + audit toe |
| **Risicoanalist** | Boundary-failure → audit-event in `auth` category, snel filterbaar; PII-scrubber default-defensief |
| **Marketeer** | Direct verkoopbaar als pilot-propositie: "Beheer 5-10 cliënten met audit-trail en client-ready rapport per cliënt" |
| **CEO (B2B-omzet)** | Zonder Prisma-migratie pilotbaar → contract eerst, schema later |

---

## 10. Tests — 37 nieuwe tests

| File | Tests | Coverage |
|---|---|---|
| `resolver.test.ts` | 20 | env-parse (case/whitespace/dedup), boundary checks (5 reasons), cross-tenant, retailgebruiker-untouched |
| `service.test.ts` | 11 | clientIdFromEmail (case + trim), clientEmailHash (geen PII), resolveClientIdInWorkspace (cross-link forbidden), workspaceHeaderStats |
| `audit.test.ts` | 6 | Mock-based: audit.record args, resourceId = sha256, metadata-scrub e-mail-detection, 3-event privacy-conformance |

**Niet in deze pas**:
- E2E-test van `/advisor/clients/[clientId]` UI (vereist Playwright)
- Loader-integratie-tests (DB-afhankelijk; service-test dekt de helpers, e2e is sprint-2)

---

## 11. Resterende risico's

| Risk | Mitigatie |
|---|---|
| Env-allowlist wijzigingen require deploy | Acceptabel voor pilot (M15-precedent); v2 = DB-resolver |
| `clientId` is sha256-hex — kan brute-forced worden door iemand met cliëntlijst | Alleen 12 hex chars (48 bits); boundary-check leest opnieuw uit env i.p.v. trust van URL → een raden van clientId geeft alsnog 403 |
| Indicatieve waarde op detail-page gebruikt geen FX-conversie | Bewust — display-only; rapport via M23 doet wel correcte FX. UI-tekst zegt expliciet "indicatief" |
| Advisor-rapport gebruikt `generatedBy: "Advisor (pilot)"` — geen advisor-naam | Bewust voor pilot; v2 voegt `advisorDisplayName` toe via DB-resolver |
| Audit-events kunnen niet door advisor zelf worden ingezien | Backlog: `/audit?scope=advisor` view met M14 permission `audit.read` |
| Geen rate-limit op detail-page openen (kan beleid raken bij scraping) | Acceptabel — auth-gated; v2 voegt RateLimitPolicy `STRICT_ADVISOR` toe |
| Cliënt weet niet wie zijn advisor is, en zou kunnen verwachten dat hij toestemming heeft gegeven | Buiten technische scope — contract-laag tussen advisor en cliënt; documentatie bij pilot-start |
| AFM-vergunningplicht voor advies in NL | Module 14 disclaimer-catalog dekt `advisor.report` (NL) → AFM-tekst komt automatisch in rapport |
| Geen org-attribuut in M14 `recordAdvisorAudit` gebruikt — pilot heeft geen orgId | We gebruiken direct `audit.record` (geen wrapper) met `workspaceVersion: "pilot/env"` in metadata. Migreer naar `recordAdvisorAudit` zodra `OrgMembership` bestaat |

---

## 12. Decision-log

**Vraag**: waarom geen Prisma-migratie?

**Antwoord**: M14 (Advisor Foundation) decision-log staat: pas wanneer pilot bevestigd is. Module 24 brengt de eerste functionele advisor-feature live zonder dat we al een commerciële commit hebben. Migreren is goedkoper later dan kapotrenoveren nu.

**Vraag**: waarom geen `recordAdvisorAudit`-wrapper hergebruikt?

**Antwoord**: die wrapper eist een `organizationId` als verplicht veld. In pilot-fase hebben we geen org-tabel. We schrijven direct in `audit.record` met `workspaceVersion: "pilot/env"` in metadata. Bij fase-1 wisselen we naar de wrapper zonder DB-rewrite (audit-shape blijft compatibel).

**Vraag**: waarom een sha256-hash voor `clientId` i.p.v. de raw e-mail of een DB-cuid?

**Antwoord**:
1. Raw e-mail in URL → privacy-leak via browser-history/server-logs
2. cuid → vereist Prisma-tabel (geen mig)
3. sha256(email)[:12] is deterministisch én niet-omkeerbaar; boundary-check leest altijd opnieuw uit env i.p.v. trust van URL → een raden van clientId geeft alsnog 403
