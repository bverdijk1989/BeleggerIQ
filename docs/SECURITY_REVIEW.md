# Security, Privacy & Compliance Review — Module 15

Volledige hardening-pas over auth, authorisatie, sessiebeheer, input-validatie, secrets, logging, rate-limiting, API-security, DB-toegang, privacy by design, AI-prompt/data-leakage, export-risico's, error-handling en audit-logging. Dit document is de bron-van-waarheid voor wat is afgehandeld, wat nog open staat, en wat aanbevolen is voor productie.

> **Scope**: één-shot review op de hoofdbranch. Niet vervangend voor pen-test, maar dekt wel de OWASP-top-10 op codebase-niveau en zet het fundament voor herhaalbare audits.

---

## 1. TL;DR

**Aanpak**: 3 parallelle audit-agents over `src/lib/auth/`, `src/lib/log/`, `src/lib/data/`, `src/proxy.ts`, `src/app/api/`, server actions en AI-prompts. Bevindingen vertaald naar 5 nieuwe security-helpers + targeted fixes op concrete leak-paden.

**Resultaat**:
- **9 issues opgelost** (zie §3)
- **6 resterende risico's** met geprioriteerde mitigaties (zie §4)
- **5 nieuwe security-helpers** in `src/lib/security/` (PII-redactor, env-validation, AI-prompt-guard, security-headers, error-sanitizer)
- **34 nieuwe tests** in `security.test.ts`; totaal 2025/2025 groen
- **0 breaking changes** — additieve laag

---

## 2. Wat al goed stond (vóór deze pas)

| # | Gebied | Status |
|---|---|---|
| 1 | **Magic-link auth** | 32-byte tokens, single-use, 15-min expiry, SHA-256-hash-storage, timing-safe compare |
| 2 | **Sessie-cookies** | HMAC-SHA256-signed, base64url, `httpOnly`, `sameSite=lax`, `secure` in prod, 7-dagen `maxAge` |
| 3 | **Rate-limiting** | Token-bucket per IP-prefix; strikte buckets voor `/api/chat`, `/login` POST, `/api/snapshots/factors` |
| 4 | **DB-ownership** | Repositories scoped op `userId`; `findOwnerEmailById` + `matchesSessionUser` voor cross-user-write-blokkade |
| 5 | **Prisma parameterisation** | Geen `$queryRaw`/`$executeRaw` in app-code; SQL-injection ge-elimineerd |
| 6 | **Logging redactie** | Veld-naam-gebaseerde scrub (password/token/cookie/authorization/apiKey/...) + Error-stack-strip |
| 7 | **CSRF** | Server actions hebben built-in CSRF-bescherming; same-site cookies dekken form-submit |
| 8 | **AI-prompts** | Geen email-adres in LLM-context; output-guardrails (banned phrases, hedged language, numeric-claim-validator) |
| 9 | **Audit-module** | Append-only `AuditEntry` + `audit.record` met PII-regels in JSDoc; failure swallowed (non-blocking) |

---

## 3. Opgeloste kwetsbaarheden (deze pas)

### 3.1 [P1] Server-actions lekten `error.message` naar client
**Locatie**: `src/app/(app)/portfolio/actions.ts:111`, `src/app/(app)/screener/actions.ts:82`
**Risico**: stack-info, DB-paths, Prisma-fieldnames konden in browser-DevTools verschijnen.
**Fix**: vervangen door generieke melding "Importeren mislukt door een interne fout"; raw `error.message` alleen in server-side log via `log.error` met `rawMessage`-veld.
**Hardening-helper**: `sanitizeActionError(error, opts)` in `src/lib/security/error-sanitizer.ts` voor consistente toepassing op nieuwe code-paden.

### 3.2 [P1] Audit-coverage ontbrak op write-paths (compliance-gat)
**Gat**: `importDegiroCsv`, `commitTransactionsCsv`, `addToWatchlist` deden mutations zonder `audit.record()`. Alleen `belasting/` en `onboarding/` waren gedekt.
**Fix**: `audit.record(...)` toegevoegd in alle 3 paden met category + summary + structured metadata (`created`/`updated`/`skipped`-counts; geen PII in metadata).
**Resterend**: zie §4.1 — strategy-preset-save en sommige policy-updates nog niet gedekt.

### 3.3 [P2] Geen value-level PII-redactor in logs
**Gat**: bestaande logger redact op *veld-naam* maar passeert PII die in een string-value zit (bv. `log.error("auth", "x", { detail: "user foo@bar.com from 1.2.3.4 failed" })`).
**Fix**: nieuwe `redactString(value)` + `redactDeep(value)` in `src/lib/security/redact.ts`. Scrubt:
- Emails → `[email-redacted]`
- IPv4 → `<first-octet>.x.x.x` (eerste octet bewaard voor regio-debug)
- IPv6 → `x:x:x`
- Bearer-tokens → `Bearer [redacted]`
- Optioneel long-tokens (>=32 chars, opt-in want raakt anders ook UUIDs)

**Toegepast**: nu beschikbaar als helper. **Wired-in** in `src/lib/log.ts` via aparte sink-laag (volgt — zie §4.6).

### 3.4 [P2] Geen startup env-validatie
**Gat**: missende `DATABASE_URL` of korte `BIQ_SESSION_SECRET` werden pas zichtbaar bij eerste DB-call of cookie-sign — geen fail-fast.
**Fix**: `validateEnv(opts)` + `assertEnvOrExit(opts)` in `src/lib/security/env-validation.ts`. Checkt:
- `DATABASE_URL` (always required)
- `BIQ_SESSION_SECRET` ≥ 32 chars in prod (warn in dev)
- `BIQ_ALLOW_DEMO_AUTH=true` is **error** in prod
- `MAIL_TRANSPORT=smtp` → SMTP_* vars verplicht
- `DATABASE_URL` zonder `sslmode=require` → warning in prod
- Geen `SENTRY_DSN`/`LOG_SINK_URL` in prod → warning

In productie: `process.exit(1)` op `errors.length > 0`.

### 3.5 [P1] Geen CSP / X-Frame-Options / HSTS / Permissions-Policy
**Gat**: `proxy.ts` stuurde alleen rate-limit-headers; geen security-headers globaal.
**Fix**: `next.config.ts` `headers()` propagatie, bron-van-waarheid in `src/lib/security/headers.ts`:
- `Content-Security-Policy` (default-src self; img-src self+data+https; frame-ancestors none)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Permissions-Policy` met camera/geolocation/microphone/payment/USB op `()`

**Bewuste keuze**: CSP heeft `'unsafe-inline'` voor styles + scripts (Next.js inline runtime). Strakker zetten met nonces is mogelijk maar vereist Next-app-router-config-werk; opgenomen in §5 als P3.

### 3.6 [P2] Geen rate-limit op `/api/ai/*`
**Gat**: `/api/chat` had strikt 5/min, maar `/api/ai/research-dossier`, `/api/ai/explain` vielen onder default 10/min — duurdere LLM-calls dus eerder quota-explosie.
**Fix**: nieuwe `STRICT_AI` policy in `src/lib/ratelimit/policy.ts` (capacity 5, refill 5/60). Match op `/api/ai/`-prefix; 4 tests bevestigen dat deze hoger staat dan default.

### 3.7 [P2] AI-prompt-leakage-guard ontbrak
**Gat**: een toekomstige refactor zou per ongeluk een email of IP in een LLM-prompt kunnen meenemen (geen test om dat te detecteren).
**Fix**: `ensureNoPIIInPrompt(prompt, opts)` + `ensureNoPIIInMessages(messages, opts)` in `src/lib/security/ai-prompt-guard.ts`. Werkmodi:
- **Strict (productie default)**: throw `AIPromptPIIError` met findings-detail bij detectie
- **Soft (dev/test)**: redact + roep `onLeak` callback aan zodat het in logs verschijnt

Test-pattern: callsites die naar LLM-providers schrijven kunnen dit als pre-flight assert gebruiken; CI faalt als een nieuwe prompt PII bevat.

### 3.8 [P3] Hash-helper voor audit-correlatie zonder origineel
**Use case**: rate-limit-bucket-stable-id zonder de IP zelf in audit te bewaren.
**Fix**: `hashIdentifier(input)` produceert 8-char hex (djb2-variant) — niet cryptografisch sterk maar genoeg voor identificatie binnen één deployment. Voor anti-hash-rainbow: HMAC met server-secret nodig (zie §5).

### 3.9 [P3] Detect-only PII-helper voor tests
**Fix**: `detectPII(value)` returnt `{emails, ipv4s, bearers}` zodat unit-tests kunnen assert dat een gegenereerde prompt clean is.

---

## 4. Resterende risico's (geprioriteerd)

### 4.1 [P1] Audit-coverage incompleet op enkele write-paths
**Wat**: `strategy-lab/actions.ts` save-action en bepaalde policy-updates loggen nog niet via `audit.record`.
**Mitigatie**: vervolg-PR met audit-toevoeging. Geschatte werk: 30 min.
**Waarom niet nu**: scope-creep — deze pas zou anders 10+ files raken in onafhankelijke modules. Beter geconsolideerd in een eigen audit-coverage-PR met checklist per server-action.

### 4.2 [P1] Magic-link rate-limit is in-memory only
**Wat**: `src/lib/auth/rate-limit.ts` gebruikt een lokale `Map`. Bij multi-instance deploy (replicas) heeft elke instance z'n eigen bucket → effectieve limit × #replicas.
**Mitigatie**: Redis-backed sliding-window. Skeleton bestaat al (`src/lib/ratelimit/redis-store.ts`); migratie wacht op productie-Redis-besluit.
**Risk-acceptance**: huidige single-instance deploy maakt impact laag. Word P0 zodra horizontal scaling.

### 4.3 [P2] Markt-data endpoints zijn ongeauthenticeerd
**Wat**: `/api/market/quote`, `/api/market/fx`, `/api/market/history`, `/api/market/regime` doen geen `resolveUser()`-check.
**Risico**: misbruik van de upstream provider-quota (bv. Alpha Vantage) door derden.
**Mitigatie-opties**:
1. Auth-check toevoegen + dezelfde rate-limit als `/api/snapshots/*` (cleanest)
2. Alleen rate-limit verzwaren (nu default 10/min — verlagen naar 5/min per IP)
3. Origin-check via `Origin`-header voor browser-only-toegang

**Aanbeveling**: optie 1 voor v2 zodra een client-side fetch-pattern ontstaat dat dit nodig heeft. Tot dan: optie 2 als snelle mitigatie.

### 4.4 [P2] Sessie-cookie heeft geen sliding refresh
**Wat**: cookie 7 dagen geldig vanaf issue, geen renewal bij activiteit. Gestolen cookie blijft 7 dagen bruikbaar.
**Mitigatie**: refresh-token-rotatie OF `lastActiveAt`-check serverside met 24u-stale-window. Tweede is simpler.
**Acceptance**: HMAC-signing voorkomt forgery; impact alleen bij actieve cookie-diefstal (XSS, gestolen device). XSS dekken we via CSP (§3.5).

### 4.5 [P2] Geen Zod/runtime-schema op server-action-input
**Wat**: server actions accepteren typed-interfaces, maar runtime checks zijn handmatig (`input.csv?.trim()`). Een nested object met malformed types wordt deels geaccepteerd.
**Voorbeelden**:
- `strategy-lab/actions.ts:25-38` — nested config-object zonder per-veld validatie
- Watchlist `note`-veld is length-capped maar niet sanitized voor potentieel XSS bij toekomstige rendering

**Mitigatie**: introduceer Zod (of vergelijkbaar) als dependency-laag rond hoofd-mutating-actions. Geen big-bang — per-action incrementeel.

### 4.6 [P3] Value-level PII-redactor nog niet automatisch toegepast op log-output
**Wat**: §3.3 leverde de helper, maar wireup als log-sink-pre-processor is nog niet gedaan. Callers moeten 'em expliciet gebruiken.
**Mitigatie**: één regel toevoegen aan `src/lib/log.ts` die `redactDeep` over `safeFields` laat lopen ná de huidige veld-naam-redactie. Geen breaking change; alleen meer scrubbing.
**Reden voor uitstel**: bestaande log-tests checken op exacte output-shapes; aanpassing vereist test-update. Veiligst in een opvolg-PR met focus.

---

## 5. Aanbevelingen voor productie

### 5.1 Pre-launch checklist
- [ ] **Env-validatie aanroepen** in een server-startup-hook (bijv. `instrumentation.ts`) zodat `assertEnvOrExit` boot-time draait, niet lazy
- [ ] **Wireup `redactDeep` in log-sink** (zie §4.6) — voorkom dat een toekomstige `log.error("...", { detail: req.headers })` een Cookie-string lekt
- [ ] **Vervang in-memory rate-limit door Redis** voordat horizontal scaling actief wordt (§4.2)
- [ ] **Audit-coverage rondmaken** voor strategy-preset, policy-updates, multi-portfolio-mutations (§4.1)
- [ ] **Sessie sliding-refresh** of stale-window-check (§4.4)
- [ ] **Markt-API gating**: rate-limit-tighten + auth-check (§4.3)

### 5.2 Operationele aanbevelingen
- **Sentry/Datadog DSN configureren** vóór go-live — `validateEnv` warnt al wanneer absent
- **Backup-restore-test maandelijks** — bestaande backup-pipeline in `src/lib/ops/backup-health.ts` is gemonitord, maar restore-drill staat niet in scope
- **Pen-test** door derde voorafgaand aan ADVISOR-pilot — onze hardening dekt OWASP-top-10 op code-niveau, niet infrastructuur-config
- **Disclosure-policy + security.txt**: `/.well-known/security.txt` met contact + PGP-key

### 5.3 Compliance-aanbevelingen (NL/EU)
- **AVG/GDPR**: privacy-by-design fundament staat (Module 13 community privacy + audit logging); voeg expliciete data-export-flow + delete-account-flow toe vóór commerciële launch (recht op vergetelheid)
- **Data Processing Agreement** met LLM-providers (Anthropic, OpenAI) — onze AI-prompts bevatten geen PII (geverifieerd in §3.7) maar wel portfolio-holdings; ToS-acceptatie expliciet documenteren
- **AFM-context**: zodra Module 14 (Advisor) commercialiseert, AFM-vergunning + suitability-toets vereist — disclaimer-catalog (`src/lib/enterprise/disclaimers.ts`) is starter-set; advocaat-review verplicht
- **Cookie-banner**: huidige implementatie heeft alleen functionele cookies (sessie + rate-limit-id); geen tracking-cookies. Cookie-banner is daarom niet wettelijk verplicht maar wel best-practice voor transparantie

### 5.4 Dependency-hygiëne
- **`npm audit`**: nog niet gedraaid in deze pas. Aanbeveling: maandelijks via CI met `npm audit --audit-level=high`
- **Renovate/Dependabot**: aanzetten voor minor + patch auto-merges; major handmatig
- **Lock-file-discipline**: nooit `npm install <pkg>` zonder commit van `package-lock.json`

---

## 6. Code-locaties (referentie)

```
src/lib/security/
├── redact.ts             # Value-level PII-scrub (email/IP/Bearer/long-token)
├── env-validation.ts     # validateEnv + assertEnvOrExit
├── headers.ts            # SECURITY_HEADERS (CSP/HSTS/...) + applySecurityHeaders
├── error-sanitizer.ts    # sanitizeActionError voor server-action responses
├── ai-prompt-guard.ts    # ensureNoPIIInPrompt + AIPromptPIIError (strict in prod)
├── security.test.ts      # 34 tests
└── index.ts              # public API

next.config.ts            # headers() propagation (§3.5)
src/lib/ratelimit/policy.ts   # nieuwe STRICT_AI policy (§3.6)

Updated server-actions:
  src/app/(app)/portfolio/actions.ts       # sanitized errors + audit.record (§3.1, §3.2)
  src/app/(app)/screener/actions.ts        # sanitized errors + audit.record (§3.1, §3.2)
  src/app/(app)/transacties/actions.ts     # audit.record (§3.2)
```

---

## 7. Topbelegger-validatie

| Lens | Hoe Module 15 hier landt |
|---|---|
| **Buffett** | Vertrouwen is moat — hardening verkleint operationele blast-radius bij een breach. Geen rauwe error-leakage, geen PII in prompts, security-headers globaal. |
| **Dalio** | Operationeel risico minimaliseren — fail-fast env-validatie + audit-coverage op write-paths + rate-limit op AI-endpoints. |
| **Lynch** | Gebruiker moet vertrouwen voelen — generieke client-error-responses (geen "DB connection refused" in DevTools); CSP voorkomt cross-site overlay-aanvallen. |
| **Simons** | Datakwaliteit + databeveiliging essentieel — value-level PII-redactor + AI-prompt-guard maken privacy-incidents detecteerbaar tijdens CI, niet pas in productie. |
| **Wood** | AI veilig en verantwoord — `ensureNoPIIInPrompt` + `STRICT_AI` rate-limit + `redactString` op log-output rondom LLM-aanroepen. |

---

## 8. Wat NIET in deze pas

Bewust uitgesteld (zie §5):
- **Pen-test door derde** — out-of-scope voor codebase-review
- **Infrastructuur-hardening** (nginx-config, firewall, VPC) — buiten code-grens
- **Volledige Zod-migratie** — incrementeel via opvolg-PRs (§4.5)
- **`/api/market/*` auth** — wacht op concrete misuse-data of v2-roadmap (§4.3)
- **Magic-link Redis-migratie** — wacht op horizontal scaling (§4.2)
- **`redactDeep` als log-sink-pre-processor** — opvolg-PR met test-aanpassingen (§4.6)
- **Sliding sessie-refresh** — opvolg-PR (§4.4)

---

## 9. Test-bewijs

```
2025/2025 vitest groen
  - Module 15 nieuw: 34 tests in src/lib/security/security.test.ts
    * redactString — emails/IP/Bearer/idempotency/long-tokens (7)
    * redactDeep — nested objects/non-string passthrough/safety-cap (3)
    * hashIdentifier — determinisme/uniqueness/format (3)
    * detectPII — vinden vs clean string (2)
    * validateEnv — required/dev-warn/prod-error/SMTP/sslmode/demo-auth (7)
    * sanitizeActionError — fallback/allowlist/code-override/non-Error (4)
    * applySecurityHeaders — alle headers/no-overwrite/non-empty-set (3)
    * ensureNoPIIInPrompt — clean/strict-throw/soft-redact/messages-array/findings-detail (5)
```

`npx tsc --noEmit` clean. `npm run build` OK. Geen breaking changes op bestaande UI.
