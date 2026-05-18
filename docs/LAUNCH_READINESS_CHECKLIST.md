# Launch Readiness Checklist — Module 19

Operationele go/no-go checklist voor een commerciële pilot van BeleggerIQ. Dekt 10 spec-controles uit Module 19 + verwijst naar code-implementatie en handmatige stappen.

> **Aanpak**: één pagina, één per-regel checkbox. Geen "we doen dat later" — elk item krijgt **status** + **bewijs-locatie** + (waar relevant) **wie**.

---

## 0. Snel-overzicht

| Categorie | Status | Detail |
|---|---|---|
| Code-hardening | ✅ | Modules 16 + 18-QW + 19 |
| Auth + admin guards | ✅ | Magic-link, Google OAuth, password, env-allowlist admin |
| Entitlements | ✅ | 24 features × 4 tiers, 21 bypass-tests |
| Env-validatie | ✅ | fail-fast op DATABASE_URL, BIQ_SESSION_SECRET, demo-flag, Stripe-prices, AI-provider |
| Logging | ✅ | redactDeep (PII + tokens + IPs); audit-trail op admin-acties |
| Rate-limit | ✅ | Token-bucket + `RateLimitStore`-interface (Redis drop-in mogelijk) |
| AI-provider | ⚠️ | Fallback-mode actief op productie (geen API-key gezet) |
| Stripe | ⚠️ | Test-mode keys actief; productie price-IDs niet bevestigd |
| Sentry | ⚠️ | DSN niet gezet — productie-errors alleen via journalctl |
| Juridisch | ❌ | privacy-policy / terms / disclaimers niet door advocaat gereviewed |

**Legenda**: ✅ = launchable · ⚠️ = launchable met caveat · ❌ = blocker

---

## 1. Module 19-spec mapping — 10 controles

### 1.1 Auth bescherming op /api/market/* ✅

- **Status**: `requireMarketAuth()` actief op alle 5 routes (quote/fx/fundamentals/history/regime)
- **Code**: [`src/app/api/market/_shared.ts`](../src/app/api/market/_shared.ts)
- **Bewijs**: `curl https://beleggeriq.aegiscore.nl/api/market/quote?ticker=AAPL` → HTTP 401 zonder cookie
- **Tweede laag**: `STRICT_MARKET` rate-limit policy (10/min/IP)

### 1.2 Server-side entitlement checks ✅

- **Status**: `canUseFeature(tier, key)` actief op gated pages (`/macro`, `/score/[ticker]`, `/crypto-lab`)
- **Code**: [`src/lib/entitlements/service.ts`](../src/lib/entitlements/service.ts)
- **Bewijs**: [`spec-conformance.test.ts`](../src/lib/entitlements/spec-conformance.test.ts) — 21 bypass-tests (FREE krijgt geen PRO/ELITE/ADVISOR features; null/undefined tier valt terug op FREE)
- **Caveat**: UI-pagina's zijn consistent gated; sommige **loaders** lezen data zonder entitlement-check (audit-PR in backlog, geen evidente bypass-route)

### 1.3 Veilige logging met PII-redactie ✅

- **Status**: Veld-naam-redactie + value-level `redactDeep` actief
- **Code**: [`src/lib/log.ts`](../src/lib/log.ts) + [`src/lib/security/redact.ts`](../src/lib/security/redact.ts)
- **Scrubt**: emails → `[email-redacted]`, IPv4 → eerste octet, IPv6 → `x:x:x`, Bearer-tokens, long-tokens (opt-in), password/cookie/authorization veld-namen

### 1.4 Centrale security headers ✅

- **Status**: CSP + HSTS + X-Frame-Options=DENY + X-Content-Type-Options=nosniff + Referrer-Policy + Permissions-Policy
- **Code**: [`src/lib/security/headers.ts`](../src/lib/security/headers.ts) → [`next.config.ts`](../next.config.ts)
- **Caveat**: CSP gebruikt `'unsafe-inline'` voor styles + scripts (Next 16 inline runtime); strakker via nonces is P3-werk

### 1.5 Rate limiting abstraction met Redis-pad ✅

- **Status**: `RateLimitStore`-interface; `inMemoryStore` default; `setRateLimitStore(redisStore)` drop-in
- **Code**: [`src/lib/ratelimit/store.ts`](../src/lib/ratelimit/store.ts)
- **Migratie-pad**: implementeer `RateLimitStore` met `ioredis`-client + Lua-script voor atomic refill+consume; activeer via `RATELIMIT_BACKEND=redis`
- **Caveat**: pure-function laag (`token-bucket.ts`) is backend-agnostisch; Redis-store is nog niet geschreven maar interface staat

### 1.6 AI provider readiness check ✅

- **Status**: `validateEnv` checkt `AI_PROVIDER` × `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` consistentie
- **Code**: [`src/lib/security/env-validation.ts`](../src/lib/security/env-validation.ts) §8
- **Bewijs**: 4 tests in [`launch-readiness.test.ts`](../src/lib/security/launch-readiness.test.ts) — `AI_PROVIDER=anthropic` zonder key in prod → error; geen `AI_PROVIDER` → warning (fallback geldig)

### 1.7 Stripe price-id configuratiecheck (zonder secrets te loggen) ✅

- **Status**: `validateEnv` controleert `STRIPE_SECRET_KEY` × price-IDs × webhook-secret consistentie. Error-messages bevatten alleen env-var-NAMEN, geen waardes.
- **Code**: [`src/lib/security/env-validation.ts`](../src/lib/security/env-validation.ts) §7
- **Bewijs**: 4 tests in [`launch-readiness.test.ts`](../src/lib/security/launch-readiness.test.ts) — Stripe + missing price-IDs → error met env-var-namen; **assertie**: error-message bevat geen secret-waarde

### 1.8 Productie env-validatie bij startup ✅

- **Status**: `assertEnvOrExit()` doet `process.exit(1)` op fail in productie
- **Code**: [`src/lib/security/env-validation.ts`](../src/lib/security/env-validation.ts) `assertEnvOrExit`
- **Bewijs**: 3 tests bevriezen fail-fast voor DATABASE_URL, BIQ_SESSION_SECRET length, BIQ_ALLOW_DEMO_AUTH=true

### 1.9 Admin-only check op /admin ✅

- **Status**: Module 15 env-allowlist; non-admin krijgt `notFound()` (security-by-obscurity)
- **Code**: [`src/lib/admin/guards.ts`](../src/lib/admin/guards.ts) `isAdminEmail`
- **Bewijs**: 21 admin-tests + audit-trail per page-view (`admin.access_denied` event op blocked-attempts)

### 1.10 Launch checklist doc ✅

Dit document.

---

## 2. Pre-launch deployment checklist (handmatig)

Te bevestigen vóór commerciële launch:

### Env-vars op productie (`/mnt/HC_Volume_105455257/apps/beleggeriq/shared/.env.production`)

- [ ] `DATABASE_URL` — actief met `?sslmode=require`
- [ ] `BIQ_SESSION_SECRET` — ≥ 32 chars (`openssl rand -hex 32`)
- [ ] `BIQ_ALLOW_DEMO_AUTH` — leeg of `false` (NOOIT `true` in prod)
- [x] `BIQ_ADMIN_EMAILS` — gezet op `bart.verdijk@gmail.com` (2026-05-18)
- [ ] `AI_PROVIDER` + `ANTHROPIC_API_KEY` of `OPENAI_API_KEY`
- [ ] `STRIPE_SECRET_KEY` + 4 price-IDs (PRO/ELITE × MONTHLY/YEARLY) + `STRIPE_WEBHOOK_SECRET`
- [ ] `SENTRY_DSN` (of `LOG_SINK_URL`) voor error-monitoring
- [ ] `SMTP_HOST` + 4 SMTP_* vars als `MAIL_TRANSPORT=smtp`
- [ ] `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (beide of geen)

### Service-health

- [ ] `systemctl status beleggeriq` → active
- [ ] `curl https://beleggeriq.aegiscore.nl/api/health` → `{status:"ok",db.ok:true}`
- [ ] `curl -I https://beleggeriq.aegiscore.nl` → security-headers aanwezig (CSP, HSTS, X-Frame-Options)
- [ ] `curl -I https://beleggeriq.aegiscore.nl/api/market/quote?ticker=AAPL` → HTTP 401 (auth-gate werkt)

### Database

- [ ] Recent `pg_dump`-backup aanwezig in `backups/`
- [ ] Restore-test maandelijks gedraaid (zie [docs/BACKUPS.md](BACKUPS.md))
- [ ] Migraties up-to-date (`prisma migrate deploy` clean output)

### Stripe

- [ ] Webhook-endpoint geverifieerd in Stripe Dashboard (`/api/stripe/webhook`)
- [ ] Test-mode → live-mode swap bevestigd
- [ ] Customer Portal URL geconfigureerd

### nginx / SSL

- [ ] `nginx -t` → ok
- [ ] `ssllabs.com` score ≥ A
- [ ] HSTS 1 jaar + `includeSubDomains`
- [ ] UFW: alleen 22 (of 2222), 80, 443 open

---

## 3. Resterende juridische/compliance punten (buiten code)

Deze items **kunnen niet in code worden gesloten** en vereisen externe partijen vóór commerciële launch:

### P0 — Vóór paid users (advocaat + AFM-specialist nodig)

1. **`/terms` + `/privacy` juridische review**
   Engineering-drafts staan; advocaat moet bevestigen dat de tekst aan AVG/GDPR + NL-consument-recht voldoet.

2. **Disclaimer-set (`src/lib/enterprise/disclaimers.ts`)**
   `advisor.report`, `white_label.footer`, `general.investment_data` — AFM-vergunde formuleringen vereisen financieel-juridisch-specialist review.

3. **AFM-vraag**: BeleggerIQ presenteert "informatie" en geen "beleggingsadvies". AFM-jurist moet bevestigen dat:
   - Scores + Briefings + Confidence-tier-mappings binnen "informatieverstrekking" blijven
   - Maandbeslissing-page en allocation-engine geen "individueel advies" vormen
   - Module 14 Advisor-tier voor wettelijk gereglementeerde adviseurs een aparte AFM-vergunning vereist

4. **Data Processing Agreement (DPA) met LLM-providers**
   Standard Contractual Clauses (SCCs) voor data-transfer buiten EU. Onze prompts bevatten geen PII (Module 16 §3.7 geverifieerd), maar wél portfolio-holdings → potentieel persoonsgegevens.

5. **Cookie-policy + cookie-banner**
   Huidige scope = functioneel only (sessie + rate-limit-id, geen tracking). Geen banner wettelijk verplicht, wel **best-practice** voor transparantie. Advocaat moet bevestigen.

### P1 — Vóór Advisor-pilot (B2B-launch)

6. **Multi-tenant DPA**
   Advisor-organisaties zijn data-controllers voor hun cliënten; BeleggerIQ wordt processor. Nieuwe DPA-template nodig.

7. **AFM-toezicht voor Advisor-tier**
   Advisor-functionaliteit vereist mogelijk een eigen AFM-vergunning voor BeleggerIQ als "execution-platform" of "rapportage-leverancier". Specialist-input nodig.

8. **White-label compliance**
   Bij white-label moet duidelijk zijn wie de data-controller is (de white-label-organisatie) en wie de processor (BeleggerIQ). Contractueel + technisch (Module 14 `WhiteLabelConfig`).

### P2 — Operationeel

9. **Pen-test door derde**
   Onze hardening dekt OWASP-top-10 op code-niveau (Module 16); infrastructuur-config (nginx, firewall, Postgres) niet. Aanbevolen vóór Advisor-pilot.

10. **GDPR-DPIA**
    Data Protection Impact Assessment voor "verwerking van financiële gegevens". Verplicht onder AVG art. 35 voor risico-volle verwerkingen — vermogensdata kwalificeert mogelijk.

---

## 4. Topbelegger-validatie van deze checklist

| Lens | Hoe Module 19 hier landt |
|---|---|
| **Buffett** (vertrouwen) | Operationele blast-radius geminimaliseerd door fail-fast env-validatie + redact-laag + admin-guard; gebruiker krijgt geen DB-stacks in DevTools |
| **Dalio** (risico minimaliseren) | 10 spec-controles + 14 nieuwe tests bevriezen het pad; juridische items expliciet als P0/P1/P2 |
| **Lynch** (begrijpelijk) | Eén-pagina checklist met status-emoji's; geen verborgen "we vergeten dit" |
| **Simons** (reproduceerbaar) | `validateEnv` is pure functie + 14 tests; rate-limit-store-zwap getest met fake-Redis |
| **Wood** (AI-native) | AI-provider readiness expliciet; fallback-mode geldige operatie-modus; geen harde dep op één provider |

---

## 5. Wat NIET in deze pas

- **Echte Redis-implementatie** van `RateLimitStore` — interface staat klaar; activatie wacht op multi-instance-besluit
- **Sentry-DSN configureren** — wacht op DSN van operator
- **AI-provider key** — wacht op key van operator
- **Stripe live-mode swap** — wacht op product-pricing-besluit
- **Juridisch review** — out-of-scope code (zie §3)
- **Pen-test** — externe partij
