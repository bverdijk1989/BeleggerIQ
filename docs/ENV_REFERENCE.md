# Environment Variables — Volledige referentie

Alle env-vars die de applicatie gebruikt, gecategoriseerd per module. **Required** = app start niet zonder; **Recommended** = functionaliteit degradeert zonder; **Optional** = nice-to-have.

> **Status na 10/10-sweep**: alle code is env-gated. Een productie-deploy met alle vars hieronder gezet activeert het volledige feature-set. Zonder optionele vars valt code netjes terug op fallbacks.

---

## Core (Required)

### `DATABASE_URL`
**Required altijd.** Postgres connection-string. Voor productie: include `sslmode=require`.
```
postgres://user:pass@host:5432/beleggeriq?sslmode=require
```

### `BIQ_SESSION_SECRET`
**Required in productie**, ≥32 chars. HMAC-key voor sessie-cookies (`biq_session`). Genereer met `openssl rand -base64 48`.

---

## Authentication

### `MAIL_TRANSPORT`
**Recommended.** `smtp` of `console`. Console = log magic-link in stdout (dev-only).

### `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
**Required wanneer `MAIL_TRANSPORT=smtp`.** Voor magic-link e-mails.

### `BIQ_ALLOW_DEMO_AUTH`
**Optional.** Demo-mode (`true`) — login zonder magic-link. **NOOIT in productie zetten**; env-validatie weigert dit.

---

## Stripe / Billing (Monetisatie — Phase 1)

### `STRIPE_SECRET_KEY`
**Required voor checkout-flow.** Server-side secret. Zonder deze: `/api/stripe/*` returnt 503 + UI toont "Binnenkort beschikbaar".
```
sk_test_... (test) | sk_live_... (productie)
```

### `STRIPE_WEBHOOK_SECRET`
**Required voor webhook-flow.** Signing-secret van de webhook-endpoint in het Stripe-dashboard.

### `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`
**Required om Pro te kunnen kopen.** Stripe Price-id's. Eenmalig aanmaken in Stripe dashboard.

### `STRIPE_PRICE_ELITE_MONTHLY`, `STRIPE_PRICE_ELITE_YEARLY`
**Required om Elite te kunnen kopen.**

### `STRIPE_PRICE_ADVISOR_MONTHLY`, `STRIPE_PRICE_ADVISOR_YEARLY`
**Optional.** Advisor is sales-led; alleen zetten als self-serve gewenst.

**Stripe-dashboard checklist**:
1. Maak Products + Prices voor elke tier × interval combo
2. Webhook-endpoint: `https://<host>/api/stripe/webhook`
3. Subscribe op events: `customer.subscription.{created,updated,deleted}`, `checkout.session.completed`
4. Tax: enable Stripe Tax voor EU-BTW (auto)

---

## Redis / Rate-limit (Schaalbaarheid — Phase 1)

### `RATELIMIT_BACKEND`
**Optional.** `memory` (default) of `redis`. Bij `redis` zonder REDIS_URL → fallback naar memory met warning-log.

### `REDIS_URL`, `REDIS_TOKEN`
**Required wanneer `RATELIMIT_BACKEND=redis`.** Upstash REST API credentials.
```
REDIS_URL=https://<id>.upstash.io
REDIS_TOKEN=<token>
```

---

## Observability (Phase 1)

### `SENTRY_DSN`
**Recommended in productie.** Sentry-project DSN voor error-monitoring. Zonder: alleen stdout-logs.

### `BIQ_GIT_SHA` / `VERCEL_GIT_COMMIT_SHA` / `GITHUB_SHA`
**Optional.** Release-tag voor Sentry. Auto-gevuld door CI/CD.

### `LOG_SINK_URL`
**Optional.** Externe log-sink (Datadog, Loki) — niet wired in v1.

### `PRISMA_SLOW_QUERY_THRESHOLD_MS`
**Optional.** Default 500. Verlaag in staging (`200`) voor strenger profileren.

---

## AI providers

### `AI_PROVIDER`
**Optional.** `deterministic` (default), `anthropic`, of `openai`. Bepaalt welke provider de AI-laag aanstuurt.

### `ANTHROPIC_API_KEY`
**Required wanneer `AI_PROVIDER=anthropic`.**

### `OPENAI_API_KEY`
**Required wanneer `AI_PROVIDER=openai`.**

### `ANTHROPIC_MODEL` / `OPENAI_MODEL`
**Optional.** Default `claude-sonnet-4-6` / `gpt-4o-mini`. Override voor goedkopere staging-runs.

---

## Market data

### `ALPHA_VANTAGE_API_KEY`
**Optional.** Fallback-provider wanneer Yahoo Finance faalt. Free-tier: 25 req/dag.

---

## Entitlements (dev-only)

### `ENTITLEMENT_OVERRIDE_TIER`
**Optional, NIET in productie.** Override de tier voor de ingelogde user. Waarde: `FREE`, `PRO`, `ELITE`, `ADVISOR`. Voor lokaal testen van paywall-gedrag zonder Stripe.

---

## Enterprise feature-flags (Module 14)

Alle 8 flags hebben een `ENTERPRISE_FLAGS_<KEY>` env-var. Zet `true` of `false`. Default uit.

| Flag | Env-var |
|---|---|
| `advisor.dashboard` | `ENTERPRISE_FLAGS_ADVISOR_DASHBOARD` |
| `advisor.client_switch` | `ENTERPRISE_FLAGS_ADVISOR_CLIENT_SWITCH` |
| `report.pdf_export` | `ENTERPRISE_FLAGS_REPORT_PDF_EXPORT` |
| `report.excel_export` | `ENTERPRISE_FLAGS_REPORT_EXCEL_EXPORT` |
| `white_label.custom_domain` | `ENTERPRISE_FLAGS_WHITE_LABEL_CUSTOM_DOMAIN` |
| `audit.advanced_filters` | `ENTERPRISE_FLAGS_AUDIT_ADVANCED_FILTERS` |
| `team.invite_flow` | `ENTERPRISE_FLAGS_TEAM_INVITE_FLOW` |
| `compliance.afm_disclaimer` | `ENTERPRISE_FLAGS_COMPLIANCE_AFM_DISCLAIMER` |

---

## Productie-checklist

Voor "10/10 operational ready" — pre-launch:

- [ ] `DATABASE_URL` met `sslmode=require`
- [ ] `BIQ_SESSION_SECRET` ≥32 chars (`openssl rand -base64 48`)
- [ ] `BIQ_ALLOW_DEMO_AUTH` **niet** gezet of `false`
- [ ] SMTP-set (`MAIL_TRANSPORT=smtp` + 5 SMTP_* vars)
- [ ] Stripe: `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + alle PRICE-id's
- [ ] Redis (bij >1 replica): `RATELIMIT_BACKEND=redis` + `REDIS_URL` + `REDIS_TOKEN`
- [ ] `SENTRY_DSN` (release-tag auto via CI)
- [ ] AI-provider keys gezet (`ANTHROPIC_API_KEY` of `OPENAI_API_KEY`)
- [ ] `ENTITLEMENT_OVERRIDE_TIER` **niet** gezet

Validatie: `npm run env:check` (TODO: script) of handmatig `assertEnvOrExit()` callen bij server-startup.

---

## Code-locaties

- `src/lib/security/env-validation.ts` — `validateEnv` checks required-prod-vars
- `src/lib/billing/stripe.ts` — `getStripeClient()` env-gated
- `src/lib/ratelimit/redis-store.ts` — `createRateLimitStore` env-gated
- `src/lib/observability/sentry.ts` — `initSentry` env-gated
- `src/lib/ai/provider/factory.ts` — provider env-gated
- `src/lib/enterprise/feature-flags.ts` — flag env-keys

Allemaal volgen hetzelfde pattern: zonder env → graceful fallback met warning-log.
