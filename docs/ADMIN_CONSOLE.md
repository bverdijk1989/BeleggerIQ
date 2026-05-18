# Admin Console — Module 15

Interne beheerconsole voor technisch en functioneel beheer van de BeleggerIQ-platform. **Privacy-first**: geen portfolio-waardes, geen volledige e-mails, geen IP-adressen. Adminschap via env-allowlist (v1) — geen DB-toggle die door een lek geactiveerd kan worden.

> **UX-norm**: een operator moet binnen 30 seconden zien of de app gezond is. Geen dashboards-met-30-grafieken; 10 strakke cards die de spec-eisen dekken.

---

## 1. Module 15-spec mapping — 10 beheerfuncties

| # | Spec | Card | Bron |
|---|---|---|---|
| 1 | Overzicht actieve gebruikers | `ActiveUsersSummary` | `prisma.user.count()` + `prisma.userProfile.groupBy(billingTier)` + audit-entries `distinct userId` over 24u/7d |
| 2 | Subscription/tier status | `SubscriptionSummary` | `prisma.subscription.groupBy(tier)` waar status ∈ {ACTIVE, TRIALING} + `externalId not null` count voor Stripe |
| 3 | Feature flag status | `FeatureFlagStatus[]` | `FEATURE_CATALOG` (entitlements) + `DEFAULT_ENTERPRISE_FLAGS` (enterprise) via `isEnterpriseFlagEnabled()` |
| 4 | Dataprovider health | `ProviderHealthSummary` | `process.env.MARKET_DATA_PROVIDER` + `process.env.AI_PROVIDER` — proxy via env-config (échte ping out-of-scope v1) |
| 5 | AI-call kosten/gebruik | `AiCostSummary` | `snapshotCostMeter()` uit `src/lib/perf/cost-meter` — in-memory aggregator |
| 6 | Error log samenvatting | `ErrorLogSummary` | `AuditEntry` waar `action LIKE '%failed%' OR '%error%'` afgelopen 24u |
| 7 | Importstatussen | `ImportStatusSummary` | `AuditEntry` category=`transactions` + action `LIKE '%import%'` afgelopen 7d |
| 8 | Laatste failed jobs | `FailedJobsSummary` | `AuditEntry` category=`system` + action `LIKE '%failed%'` afgelopen 7d |
| 9 | Security/audit events | `SecurityEventsSummary` | `AuditEntry` category=`auth` met failed-login-filter |
| 10 | Supportinformatie per gebruiker | `SupportUserInfo` (PII-maskered) | Lookup-only; `maskEmail()` + counts (geen waardes) |

---

## 2. Architectuur

```
src/lib/admin/
├── types.ts                 # AdminContext, AdminDashboardData, 10 sub-types
├── guards.ts                # isAdminEmail (env-allowlist) + maskEmail (PII-masker)
├── audit.ts                 # recordAdminAction wrapper (category=system,
│                            #   metadata.adminAction=true)
├── dashboard.ts             # loadAdminDashboard orchestrator — Promise.all
│                            #   over 8 sub-loaders, elk faal-safe
├── guards.test.ts           # 14 tests — allowlist + masker edge cases
├── spec-conformance.test.ts # 7 tests — Module 15 spec-eisen bevriezen
└── index.ts                 # public API

src/app/(app)/admin/page.tsx # Guarded console — notFound() voor non-admin
                              # 11 sections + privacy-notice + audit-trail
                              # per page-view
```

**Geen nieuwe Prisma-tabellen**. We leunen op `AuditEntry` (bestaand) en lezen alleen aggregates.

---

## 3. Admin-guard (v1)

```ts
isAdminEmail(email, process.env.BIQ_ADMIN_EMAILS)
  → { email, isAdmin, source: "env_allowlist" | "db_role" | "none" }
```

**Env-config**:
```bash
BIQ_ADMIN_EMAILS="bart@beleggeriq.nl,ops@beleggeriq.nl"
```

- Comma-separated, whitespace-tolerant, case-insensitive
- Lege/missende env → niemand is admin (failsafe)
- Lege email → false (defensive)

**Waarom env-allowlist v1?** Een DB-flag is muteerbaar via SQL-injection of bug. Een env-allowlist is alleen muteerbaar via deployment — bewust verhoogd-friction. Voor v1 (<20 gebruikers) acceptabel; v2 kan een `User.role` of `AdminUser`-tabel.

**Non-admin response**: `notFound()` (404), niet 401. Security-by-obscurity — een attacker krijgt dezelfde response als wanneer de route niet bestond.

---

## 4. Audit-laag

Elke admin-page-view + elke user-lookup wordt vastgelegd via `recordAdminAction()`:

```ts
await recordAdminAction({
  adminEmail: "bart@beleggeriq.nl",
  action: "admin.view_dashboard",
  summary: "Admin opende dashboard.",
  metadata: { adminAction: true },
});
```

Onderwater roept dit `audit.record({ category: "system", metadata: { ..., adminAction: true } })` aan. Geen nieuwe Prisma-tabel; metadata-flag onderscheidt admin-events van system-jobs.

Actions die we tracken:
- `admin.view_dashboard` — page-view
- `admin.lookup_user` — support-lookup (met `searchedEmail` gemaskeerd in metadata)
- `admin.access_denied` — non-admin probeerde de route te bereiken

---

## 5. Privacy-laag (Module 15-eis)

### Wat we WEL tonen
- Counts en aggregates (totaal users, per-tier, error-count)
- Actie-naam + 1-zin summary uit audit-log
- Provider-namen (yahoo, openai, anthropic)
- AI-token-counts + dollar-estimates

### Wat we NIET tonen
- Portfolio-waardes (geen euro-bedragen van holdings)
- Volledige e-mails (gemaskeerd via `maskEmail()` → `b***@example.com`)
- IP-adressen (audit-laag hasht 'em al; admin-console toont ze niet)
- Wachtwoord-hashes
- Stripe-customer-IDs
- Full metadata-blobs (alleen `action + summary + createdAt`)

`maskEmail()` heeft een **anti-length-leak** ingebouwd: maximaal 3 sterren, zodat de lengte van het local-part niet onthuld wordt voor lange emails.

---

## 6. Topbelegger-validatie

| Lens | Hoe het zit |
|---|---|
| **Buffett (operationeel vertrouwen)** | Provider-health + error-log + failed-jobs maken stille degradatie zichtbaar; recurring B2B/B2C revenue vereist dat ops kan reageren voor klanten klagen. |
| **Dalio (risico's zichtbaar)** | Security-card laat failed logins zien; failed-jobs onthullen breekrisico; AI-cost-card flag uitbarstingen die budget kunnen raken. |
| **Lynch (praktisch beheer)** | 10 strakke cards, geen 30-tabel-grafiek-dashboards. Eén zoekveld voor support-lookup, PII-gemaskeerd zodat operators niet expliciet PII-data zien tijdens routine-werk. |
| **Simons (meetbaarheid)** | Alle data komt uit pure-function loaders (`snapshotCostMeter`, `prisma.groupBy`); deterministisch + reproduceerbaar; geen ad-hoc queries. |
| **Wood (schaalbaar platformbeheer)** | Module 14 multi-tenant-laag is voorbereid; deze console werkt op type-niveau zonder Prisma-migraties zodat de pilot-fase niet aan tabel-design vastzit. |

---

## 7. Tests

| File | Tests | Coverage |
|---|---|---|
| `guards.test.ts` | 14 | env-allowlist parsing, case-insensitive, whitespace-tolerant, empty/null defensive; `maskEmail()` edge cases incl. anti-length-leak |
| `spec-conformance.test.ts` | 7 | 10 spec-cards aanwezig in `AdminDashboardData`-shape, access-control (admin-only), PII-minimalisatie (geen portfolio-values in support-shape), byTier dekt alle 4 BillingTiers |

---

## 8. Migratie-pad

### v1 (huidig) — type + env-allowlist
- Geen DB-tabellen
- Adminschap via `BIQ_ADMIN_EMAILS`-env
- Audit via bestaande `AuditEntry`-tabel met `metadata.adminAction=true`

### v2 — DB-rol + UI-flows
- Nieuw veld: `User.role: ADMIN | NULL`
- Migratie: `ALTER TABLE "User" ADD COLUMN "role" TEXT;` + seed bestaande env-allowlist
- `isAdminEmail()` wordt `isAdminUser()` die DB raadpleegt (env blijft fallback)
- Admin-impersonation: ondersteund met dedicated audit-action

### v3 — Multi-tenant admin
- Org-scoped admins (een advisor kan admin zijn van zijn eigen org maar niet platform-wide)
- Reuse Module 14 `OrgRole=ADMIN` voor org-niveau; platform-admin blijft een aparte rol

---

## 9. Wat (nog) niet in scope (v1)

| Feature | Reden |
|---|---|
| Echte provider-ping voor health | Out-of-scope — zou rate-limits raken; env-config-proxy volstaat v1 |
| Admin-write-acties (impersonate, override-tier, manual webhook) | v2-werk; v1 is read-only voor minimale blast-radius |
| Real-time updates (WebSocket / SSE) | Pageload + reload volstaat voor v1 |
| Multi-page admin (users / subscriptions / settings tabs) | One-page dashboard volstaat; uitbreiding via tabs zodra UX dat eist |
| Export naar CSV / Excel | Niet expliciet in spec; toevoegen op verzoek |

---

## 10. Toekomstige uitbreidingen

- **Admin-write-acties** met expliciete confirmation: tier-override, subscription-cancel, manual webhook re-fire (Stripe), force-cache-clear
- **Real-time health-ping** via een `/api/admin/ping` endpoint die elke ~30s een test-call doet
- **Slack-integratie** voor failed-jobs (auto-alert i.p.v. dashboard-polling)
- **Audit-log UI** met filters + pagination
- **User-impersonation** (read-only) voor support-debugging — vereist robuuste audit-trail
- **Anomaly-detection** op AI-cost: alert bij +200% dag-on-dag uitgaven
