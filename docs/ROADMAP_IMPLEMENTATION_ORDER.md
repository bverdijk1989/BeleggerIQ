# BeleggerIQ — Roadmap Implementation Order

**Datum**: 2026-05-17
**Bron**: complementair aan [`IMPLEMENTATION_AUDIT.md`](IMPLEMENTATION_AUDIT.md)
**Doel**: per geplande module aangeven welke bestanden geraakt worden, of er DB-migraties nodig zijn, en welk bestaand code-fundament hergebruikt kan worden.

Modules zijn gerangschikt op **commerciële + technische impact** (laagste blast-radius eerst). Elke module krijgt expliciete **belegger-lens-validatie** (Buffett/Dalio/Lynch/Simons/Wood).

> ⚠️ **Disclaimer**: deze roadmap wijzigt geen functionele code. Alleen documentatie. Concrete implementatie gebeurt per module na expliciete go.

---

## Fase 1 — Launch readiness (P0, 2 weken)

Drie blockers voor commerciële launch. Geen nieuwe features.

### M20: Demo-auth dichten + magic-link via SMTP
**Doel**: voorkomen dat publieke bezoekers automatisch als demo-user inloggen.

**Bestanden geraakt**:
- `.env.production` (op server) — set `MAIL_TRANSPORT=smtp` + 5 SMTP_*-vars + remove `BIQ_ALLOW_DEMO_AUTH` + `DEMO_USER_EMAIL`
- Geen code-wijzigingen — alle hooks bestaan al

**Migraties**: geen.

**Hergebruik**:
- `src/lib/mail/provider.ts` ✅ (SMTP-pad bestaat)
- `src/lib/auth/magic-link.ts` ✅
- `src/lib/auth/actions.ts` (requestMagicLink) ✅
- `src/app/auth/callback/route.ts` (M17 fix met proxy-aware redirect) ✅

**Lenzen**: Buffett (vertrouwen via geverifieerde identiteit) · Simons (deterministisch single-use token).

**Effort**: 0.5d voor SendGrid account-setup + sender-verificatie + env-update.

---

### M21: Stripe productie-keys + EU-BTW config
**Doel**: van test-mode naar echte EUR-flow.

**Bestanden geraakt**:
- `.env.production` — vervang test-keys door live-keys
- Stripe Dashboard: enable Stripe Tax voor EU, configureer tax-IDs
- `src/lib/billing/stripe.ts` ✅ — geen code-wijziging (env-gated)
- `src/lib/billing/sync.ts` ✅ — webhook-handler ongewijzigd

**Migraties**: geen.

**Risico's**:
- Live-keys vereisen bedrijfs-verificatie bij Stripe (KvK + bankrekening)
- BTW-config moet per EU-land getest worden (B2C vs B2B)
- Webhook-secret moet opnieuw aangemaakt worden voor live-mode endpoint

**Hergebruik**: alle Stripe-code uit Module 17-18 (env-gated). UpgradeButton + checkout/portal-routes ongewijzigd.

**Lenzen**: Buffett (duurzame recurring revenue).

**Effort**: 1d (afhankelijk van Stripe-verificatie-doorlooptijd).

---

### M22: Sentry observability + nightly cost-snapshot
**Doel**: error-monitoring + AI-spend zichtbaarheid voor productie.

**Bestanden geraakt**:
- `.env.production` — set `SENTRY_DSN`
- `src/instrumentation.ts` ✅ (init bestaat al, alleen DSN ontbreekt)
- `src/lib/observability/sentry.ts` ✅ (skeleton met `@sentry/nextjs` lazy-import — Module 17)
- NIEUW: `src/lib/perf/cost-snapshot-job.ts` — nightly snapshot van `snapshotCostMeter()` naar `AuditEntry`
- NIEUW: `scripts/run-cost-snapshot.ts` — CLI / cron-trigger

**Migraties**: geen (AuditEntry-tabel bestaat).

**Hergebruik**:
- `src/lib/observability/sentry.ts` ✅
- `src/lib/perf/cost-meter.ts` (`snapshotCostMeter`, `resetCostMeter`) ✅
- `src/lib/audit/index.ts` ✅

**Lenzen**: Dalio (operationeel risico minimaliseren).

**Effort**: 1d (Sentry-project setup + cron-job aanmaken).

---

## Fase 2 — UX polish (P1, 1 week)

Verlaagt drop-off + maakt productie-UI professioneel.

### M23: TopBar dood-elementen fixen
**Doel**: search-veld interactief + avatar-dropdown met uitloggen.

**Bestanden geraakt**:
- `src/components/layout/top-bar.tsx` — vervang `<span>` placeholder door `<input>`-form; vervang `<div>` BV-avatar door dropdown-component
- NIEUW: `src/components/layout/top-bar-search.tsx` (client-component) — form-submit naar `/screener?q=...`
- NIEUW: `src/components/layout/user-menu.tsx` (client-component) — Sheet of dropdown met profile-link + tier-badge + logout-action
- NIEUW: `src/lib/auth/logout-action.ts` — server-action die `biq_session`-cookie wist + redirect

**Migraties**: geen.

**Hergebruik**:
- Bestaande `Sheet`/`Button` shadcn-components
- `src/app/(app)/screener/page.tsx` ondersteunt al query-params indien geïmplementeerd
- `src/lib/auth/session.ts` (cookie-wis-logic)

**Lenzen**: Lynch (UI doet wat 'em belooft).

**Effort**: 0.5d.

---

### M24: Tier-badge zichtbaar in TopBar
**Doel**: gebruiker ziet altijd welke tier hij heeft (niet alleen op `/pricing`).

**Bestanden geraakt**:
- `src/components/layout/top-bar.tsx` — voeg badge toe naast notification-bell
- `src/components/layout/app-shell.tsx` — pas `resolveShellContext` aan om tier op te halen
- NIEUW: `src/components/entitlements/tier-badge.tsx` — kleine `<Badge>`-wrapper met tier + tooltip

**Migraties**: geen.

**Hergebruik**:
- `src/lib/entitlements/service.ts` (resolveCurrentTier) ✅
- `src/components/ui/badge.tsx` + tooltip

**Lenzen**: Lynch (transparantie over wat je hebt).

**Effort**: 0.5d.

---

### M25: Onboarding inline-wizard
**Doel**: 3-stap state-machine in één pagina i.p.v. route-bouncing.

**Bestanden geraakt**:
- `src/app/(app)/onboarding/page.tsx` — refactor naar client-component met stepper
- `src/lib/onboarding/state.ts` ✅ (bestaat met `isOnboardingComplete`)
- NIEUW: `src/components/onboarding/onboarding-wizard.tsx` — stepper UI (3 stappen: profiel → portfolio-add → doelen)
- NIEUW: `src/app/(app)/onboarding/actions.ts` — server-actions per stap (incrementele save zonder volledige form-submit)
- `src/components/layout/app-shell.tsx` — `onboardedAt` redirect-logic blijft

**Migraties**: geen (`UserProfile.onboardedAt` bestaat).

**Hergebruik**:
- `src/lib/onboarding/state.ts` (state-machine logica)
- Bestaande forms: `goal-form.tsx`, profiel-form, portfolio-add-dialog
- `src/lib/data/portfolio-repository.ts` (upsertHoldings)

**Lenzen**: Lynch (begrijpelijke first-60-seconds ervaring) · Wood (smooth user-acquisition).

**Effort**: 2d.

---

### M26: Mobile-padding + container-queries
**Doel**: charts overflow op <640px viewport oplossen.

**Bestanden geraakt**:
- `src/components/stress-tests/impact-chart.tsx` — SVG met container-query-class
- `src/app/(app)/portfolio/components/holdings-table.tsx` — bestaande responsive klassen aanvullen
- `tailwind.config.ts` — bevestig `@container`-plugin (Tailwind 4 native)
- `src/components/macro-regime/*-chart.tsx` (~3 files)
- `src/components/community/benchmark-card.tsx`

**Migraties**: geen.

**Hergebruik**:
- Bestaande Tailwind setup
- `src/components/layout/app-shell.tsx` padding-fix uit Module 17 sweep

**Lenzen**: Lynch (mobile-users niet uitsluiten).

**Effort**: 1d.

---

## Fase 3 — Commerciële uitbreiding (P2, 2-3 weken)

### M27: Trial-flow + email-nurture
**Doel**: 14-dagen Pro-trial + post-onboarding nurture-emails.

**Bestanden geraakt**:
- NIEUW: `src/lib/billing/trial.ts` — trial-state in `UserProfile.preferences.billing.trial`
- `src/lib/entitlements/service.ts` — `resolveCurrentTier` rekent trial-state mee
- NIEUW: `src/lib/mail/nurture.ts` — email-templates (day 1, day 3, day 7, day 14)
- NIEUW: `src/app/api/cron/nurture/route.ts` — daily-cron-endpoint
- `src/components/entitlements/paywall-card.tsx` — "Probeer 14d gratis"-CTA
- NIEUW: `scripts/run-nurture.ts` + systemd timer

**Migraties**: geen (preferences-blob).

**Hergebruik**:
- Bestaande SMTP-laag (na M20)
- `src/lib/audit/index.ts` voor trial-start/end-tracking

**Lenzen**: Wood (conversion-funnel optimalisatie).

**Effort**: 3d.

---

### M28: Notifications-feed UI
**Doel**: in-app notifications-pagina (currently `NotificationDelivery`-tabel exists, alleen mails worden verstuurd).

**Bestanden geraakt**:
- NIEUW: `src/app/(app)/notifications/page.tsx`
- NIEUW: `src/components/notifications/notification-list.tsx`
- NIEUW: `src/components/notifications/notification-card.tsx`
- `src/components/alerts/notification-bell.tsx` — linkt nu naar `/alerts`, mogelijk verplaatsen naar `/notifications`
- `src/lib/data/` — voeg `notificationRepository` toe of breid `alertRepository` uit

**Migraties**: geen (`NotificationDelivery` bestaat met `(userId, status)`-index uit Module 16).

**Hergebruik**:
- `src/lib/notifications/preferences.ts` ✅
- `src/lib/notifications/jobs.ts` ✅
- Bestaande alert-card-styling

**Lenzen**: Lynch (in-app communicatie zichtbaar).

**Effort**: 1.5d.

---

### M29: Cost-meter admin dashboard (`/admin/cost`)
**Doel**: zichtbaarheid van AI-spend voor product-owner.

**Bestanden geraakt**:
- NIEUW: `src/app/(app)/admin/cost/page.tsx` — server-component met snapshot + breakdown
- NIEUW: `src/components/admin/cost-breakdown.tsx`
- NIEUW: `src/lib/admin/auth-guard.ts` — gating (alleen specifieke emails)
- `src/lib/perf/cost-meter.ts` ✅ (bestaande aggregator)

**Migraties**: geen.

**Hergebruik**:
- `snapshotCostMeter()` ✅
- `recordAICost()` (bestaande wireup in briefing/explainability/research-narrative)

**Lenzen**: Buffett (lage kosten = marge).

**Effort**: 1d.

---

### M30: Drill-down per signaal in Investment Confidence cockpit
**Doel**: gebruiker ziet welke onderliggende factor (P/E, ROIC, ...) hoeveel bijdroeg aan de composite-score.

**Bestanden geraakt**:
- `src/components/dashboard/confidence-cockpit/*.tsx` — uitbreiden met `<details>`-sectie per signaal
- `src/lib/analytics/signal-fusion/types.ts` — `SignalContribution` shape bevat al `breakdown`-veld; UI moet 'em renderen

**Migraties**: geen.

**Hergebruik**:
- Bestaande signal-fusion engine output ✅
- Tone-palette + tooltip-componenten

**Lenzen**: Simons (datakwaliteit zichtbaar tot op factor-niveau) · Buffett (no black box).

**Effort**: 1d.

---

## Fase 4 — Schaalbaarheid (P2, parallel met fase 3)

### M31: Redis-migratie voor rate-limit + caches
**Doel**: multi-instance-deploy-ready maken.

**Bestanden geraakt**:
- `.env.production` — `RATELIMIT_BACKEND=redis` + `REDIS_URL` + `REDIS_TOKEN`
- `src/lib/ratelimit/redis-store.ts` ✅ (Upstash REST + Lua-script — Module 17)
- `src/lib/auth/rate-limit.ts` — migreer in-memory map naar `createRateLimitStore()`
- `src/lib/data/cache.ts` — optioneel: Redis-backed TtlCache voor market-data
- `src/lib/ai/briefing/cache.ts` — idem
- `src/lib/ai/explainability/service.ts` — idem

**Migraties**: geen.

**Risico's**:
- Cache-consolidatie naar `AIResponseCache` is parallel werk
- Fail-open-gedrag bij Redis-fout moet getest worden onder load

**Hergebruik**:
- `RedisRateLimitStore` skeleton uit Module 17 ✅
- Fail-open-pattern al geïmplementeerd

**Lenzen**: Dalio (operationele robuustheid bij scale).

**Effort**: 2d (skeleton bestaat).

---

### M32: Sliding session-refresh
**Doel**: gestolen cookie 7d cap → 24u stale-window + activity-refresh.

**Bestanden geraakt**:
- `src/lib/auth/session.ts` — `verifySessionCookie` checkt `lastActiveAt` tegen 24u
- `src/lib/auth/server.ts` — `resolveUserFromServer` refresht cookie bij activity > X min
- ~40 callsites van `resolveUser` (no-op verandering — cookie wordt automatisch ververst)
- NIEUW: `src/lib/auth/session-store.ts` — server-side tracking van last-active per session

**Migraties**: optioneel — `Session`-tabel toevoegen voor server-side tracking (anders alleen cookie-iat-stamp checken)

**Hergebruik**:
- Bestaande `signSessionCookie` + `verifySessionCookie`
- HMAC-flow ongewijzigd

**Risico's**: voorzichtige rollout — onderschat impact op caching/middleware.

**Lenzen**: Buffett (vertrouwen via betere session-hygiëne) · Dalio (security-risico verkleinen).

**Effort**: 2d + 1d testing.

---

## Fase 5 — Advisor activatie (P2, 2 weken — afhankelijk van pilot-bevestiging)

### M33: Organization + OrgMembership Prisma-tabellen
**Doel**: van type-laag (Module 14) naar werkelijke multi-tenant DB-state.

**Bestanden geraakt**:
- `prisma/schema.prisma` — voeg `Organization` + `OrgMembership` models (schema in `docs/ADVISOR_ENTERPRISE_FOUNDATION.md`)
- NIEUW: `prisma/migrations/<date>_add_enterprise_orgs/migration.sql`
- NIEUW: `src/lib/data/organization-repository.ts`
- `src/lib/enterprise/types.ts` — bind Prisma-types aan bestaande TypeScript-types
- `src/lib/audit/index.ts` — uitbreiden met `recordAdvisorAudit`-callsites in echte server-actions

**Migraties**: ✅ vereist.

**Hergebruik**:
- Volledige `src/lib/enterprise/*` types + helpers + role-permission-matrix ✅
- `recordAdvisorAudit` wrapper ✅
- `selectDisclaimers` + DISCLAIMER_CATALOG ✅

**Lenzen**: Wood (platformisering) · Buffett (B2B recurring).

**Effort**: 3d.

---

### M34: Advisor multi-client dashboard
**Doel**: van `/advisor` placeholder naar functionele client-lijst.

**Bestanden geraakt**:
- `src/app/(app)/advisor/page.tsx` — vervang preview-stub met echte data
- NIEUW: `src/app/(app)/advisor/clients/page.tsx`
- NIEUW: `src/app/(app)/advisor/clients/[clientId]/page.tsx` — cliënt-detail
- NIEUW: `src/components/advisor/client-list.tsx`
- NIEUW: `src/components/advisor/client-switcher.tsx` (in TopBar gated door `advisor.client_switch`-flag)
- `src/lib/enterprise/feature-flags.ts` — activeer `advisor.dashboard` + `advisor.client_switch`

**Migraties**: geen (orgs uit M33 bestaan dan al).

**Hergebruik**:
- Bestaande dashboard-componenten (kunnen worden hergebruikt met clientUserId-context)
- `src/lib/enterprise/roles.ts` (canManageClients-check)

**Lenzen**: Dalio (advisors willen risico-dashboard per client) · Wood (multi-tenant).

**Effort**: 4d.

---

### M35: PDF-report-renderer
**Doel**: `buildReportSpec` data-only → PDF-output.

**Bestanden geraakt**:
- `package.json` — voeg `pdfmake` (~1MB) of `playwright` (~150MB) toe
- NIEUW: `src/lib/enterprise/report-renderer.ts` — `renderToPdf(spec): Buffer`
- NIEUW: `src/app/api/advisor/reports/[id]/route.ts` — GET PDF-blob
- NIEUW: `src/components/advisor/report-builder.tsx` — UI voor report-config
- `src/lib/enterprise/report-spec.ts` ✅ (data-laag bestaat)

**Migraties**: optioneel — `Report`-tabel voor generation-history.

**Hergebruik**:
- `ReportSpec` + `selectDisclaimers` + `renderDisclaimerBlock` ✅
- Bestaande analytics-engines voor section-data (health/risk/scenario)

**Lenzen**: Wood (export-flexibiliteit) · Dalio (compliance-bewijs).

**Effort**: 5d (pdfmake-route).

---

## Fase 6 — AI-uplift (P3, optioneel, post-launch)

### M36: AI-coach met conversation-memory
**Doel**: chat-page van one-shot Q&A naar agent-achtige coach.

**Bestanden geraakt**:
- `src/lib/ai/chat-memory.ts` ✅ (M17 — opslag bestaat)
- `src/app/api/chat/route.ts` ✅ (memory wordt al gepersisteerd)
- NIEUW: refactor `src/lib/ai/chat.ts` van intent-routing naar LLM-flow met memory-context
- NIEUW: `src/lib/ai/chat-llm.ts` — LLM-wrapper met cost-meter + guardrails
- `src/app/(app)/chat/page.tsx` — UI uitbreiden met conversation-thread + "wis history"-knop
- `src/lib/perf/cost-meter.ts` — scope `chat`

**Migraties**: geen (memory in JSON-blob).

**Hergebruik**:
- `appendChatMessage` + `buildChatContextForLLM` ✅
- Provider-abstractie + cost-meter ✅
- Guardrails-pattern uit `briefing/guardrails.ts`

**Risico's**: kruist Buffett-principe ("no predictor"). Houd uitleg-modus, geen voorspelling-modus.

**Lenzen**: Wood (AI-native UX) · Lynch (één-aanspreekpunt voor vragen).

**Effort**: 3d.

---

### M37: Drill-down audit log UI
**Doel**: gebruiker (en advisor) ziet compliance-trail van eigen acties.

**Bestanden geraakt**:
- NIEUW: `src/app/(app)/audit/page.tsx` — per-user audit-feed
- NIEUW: `src/components/audit/audit-feed.tsx`
- `src/lib/audit/index.ts` — voeg query-functions toe
- `src/lib/data/audit-repository.ts` (NIEUW of in bestaande repo)

**Migraties**: geen.

**Hergebruik**: bestaande `AuditEntry`-tabel + tone-palette voor severity-styling.

**Lenzen**: Simons (reproduceerbaarheid van eigen wijzigingen) · Dalio (compliance-zichtbaarheid).

**Effort**: 1.5d.

---

## Fase 7 — Backlog (P3, longer-term)

| Module | Beschrijving | Migratie | Effort |
|---|---|---|---|
| M38 | Multi-portfolio-mutation flow (`PortfolioDelegation`) | ✅ | 4d |
| M39 | White-label custom-domain DNS + cert | optioneel | 5d |
| M40 | Multi-language URL routing (`/en/dashboard`) | ❌ | 5d (translation-keys + middleware) |
| M41 | Apple OAuth + Microsoft OAuth | optioneel | 2d per provider |
| M42 | Mollie als alternatieve betaalprovider (iDEAL focus) | ❌ | 3d |
| M43 | Webhook-relay voor real-time market-events | ❌ | 4d |
| M44 | Predictive signals AI-laag | optioneel | 5d (botst met Buffett-laag — design-vraag eerst) |
| M45 | UI/A11y tests (Playwright voor 5 core-flows) | ❌ | 3d |
| M46 | API-route-tests (vitest + msw-mocks) | ❌ | 3d |
| M47 | Repository-laag type-cleanup (84 `any` → schoon) | ❌ | 4d incrementeel |

---

## Cross-cutting concerns

Voor elke module geldt:
- ✅ **Tests bij feature-impact**: vitest tests voor nieuwe pure-functies + server-actions
- ✅ **Audit-trail**: gebruik `audit.record()` of `recordAdvisorAudit()` bij elke write
- ✅ **Tone-palette consistentie**: gebruik bestaande `CockpitTone` en `TONE_*`-maps
- ✅ **Entitlement-gating**: nieuwe features verwijzen naar `FEATURE_CATALOG` keys
- ✅ **Guardrails op AI-output**: hergebruik 4-laags-pattern uit briefing/explainability
- ✅ **Privacy-first**: nieuwe data-velden expliciet documenteren in `COMMUNITY_PRIVACY_MODEL.md` indien shared-data

---

## Migration-summary

**Modules ZONDER Prisma-migratie**: M20, M21, M22, M23, M24, M25, M26, M27 (optioneel), M28, M29, M30, M31, M36, M37

**Modules MET Prisma-migratie**:
- M32 (optioneel — Session-tabel)
- M33 (Organization + OrgMembership) — ✅ verplicht
- M35 (optioneel — Report-tabel voor history)
- M38 (PortfolioDelegation)

**Modules met externe-account-afhankelijkheid**:
- M20 (SMTP-provider)
- M21 (Stripe live-keys + BTW)
- M22 (Sentry-account)
- M31 (Upstash Redis of equivalent)
- M41 (Apple/MS developer accounts)

---

## Aanbevolen volgorde

```
Sprint 1 (launch readiness)       : M20 → M21 → M22
Sprint 2 (UX polish)              : M23 → M24 → M25 → M26
Sprint 3 (commerciële uitbreiding): M27 → M28 → M29 → M30
Sprint 4 (schaal)                 : M31 → M32
Sprint 5+ (advisor — bij pilot)   : M33 → M34 → M35
Sprint X (AI-uplift, post-launch) : M36 → M37
```

Backlog (M38-M47) is fase-onafhankelijk; pak items wanneer prioriteit opduikt.

---

## Hoe deze doc te gebruiken

Voor elke nieuwe sprint-planning:
1. Kies module uit deze doc
2. Lees `IMPLEMENTATION_AUDIT.md` voor context van bestaande architectuur
3. Open de specifieke module-doc in `docs/` indien aanwezig (bv. `ADVISOR_ENTERPRISE_FOUNDATION.md` voor M33)
4. Volg "Bestanden geraakt"-lijst + "Hergebruik"-lijst
5. Run lint/typecheck/tests na elke commit
6. Update deze roadmap-doc bij significante wijziging
