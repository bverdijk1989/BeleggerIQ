# Email Drip & Monthly Investor Review — Module 34

Maandelijkse, korte e-mail die de gebruiker terugbrengt naar de app. **6 secties**, **privacy-by-default** (geen bedragen tenzij opt-in), HMAC-token unsubscribe.

> **Risicoanalist-laag**: e-mail toont standaard geen exacte portfolio-waarde of bedragen — alleen grades, score-deltas en kwalitatieve labels. Spec-test valideert geen `€`-bedragen in de e-mail.

---

## 1. Module 34-spec mapping

| # | Spec | Implementatie |
|---|---|---|
| 1 | Email preference settings | `NotificationPreferences` uitgebreid: `monthlyReview` + `monthlyReviewDetailedFigures` (additief) |
| 2a | Health score verandering | `health_change` sectie — delta uit M30 risk-trend |
| 2b | Grootste risico | `biggest_risk` sectie — uit M29 Risk Control Tower |
| 2c | Doelvoortgang | `goal_progress` sectie — uit M21 Wealth Dashboard |
| 2d | Maandactie | `monthly_action` sectie — uit rebalance-recommendations |
| 2e | Belangrijkste alert | `top_alert` sectie — health-signals (critical/warning) proxy |
| 2f | Datakwaliteit | `data_quality` sectie — uit M26 data-depth |
| 3 | HTML/text template | `renderReviewEmail` → subject + html + text |
| 4 | Preview in app | `/maandreview` route met live preview + preference-status |
| 5 | Provider abstraction | Hergebruikt bestaande `src/lib/mail/provider.ts` (`sendMail`) |
| 6 | Unsubscribe/preference respect | HMAC-token route `/api/email/unsubscribe` + `isCategoryAllowed("monthly_review")` |
| 7 | Tests | 27 nieuwe tests (data-generation, privacy, unsubscribe, preference-logic) |

---

## 2. Architectuur

```
src/lib/email-review/
├── types.ts             # MonthlyReviewData + 6 ReviewSection + disclaimer
├── generator.ts         # pure: buildMonthlyReview — 6 sectie-builders
├── template.ts          # pure: renderReviewEmail → subject/html/text
├── unsubscribe.ts       # HMAC-token create/verify + buildUnsubscribeUrl
├── loader.ts            # server-side hydratie uit 5 engines (faal-safe)
├── email-review.test.ts # 27 tests
└── index.ts

src/lib/notifications/preferences.ts  (UITGEBREID)
    # +monthlyReview, +monthlyReviewDetailedFigures (defaults backward-compat)
    # +"monthly_review" NotificationCategory

src/app/api/email/unsubscribe/route.ts
    # GET ?token=... — token-based unsubscribe, geen auth nodig
    # zet notifications.monthlyReview = false; HTML-bevestigingspagina

src/app/(app)/maandreview/page.tsx
    # In-app preview van de e-mail + huidige voorkeuren + privacy-uitleg
```

**Geen Prisma-migratie**. `NotificationPreferences` leeft al in `UserProfile.notifications` Json — additief uitgebreid.

---

## 3. Privacy-by-default — kernontwerp

### Twee preference-vlaggen
```
monthlyReview: boolean              // default true (retentie)
monthlyReviewDetailedFigures: boolean  // default FALSE (privacy)
```

**Bij `detailedFigures = false`** (default):
- Geen bedragen, geen exacte portfolio-waarde
- Alleen: grades (A-F), score-deltas (0-100), kwalitatieve labels ("verbeterd", "verhoogd risico", "op koers")
- Spec-test `geen datalekken` valideert: `r.html` matcht **niet** `/€\s?\d/` of `/\bEUR\s?\d/`

**Bij `detailedFigures = true`** (expliciete opt-in):
- E-mail mag exacte cijfers tonen — generator beslist per sectie

### Geen raw e-mail in body
- `greetingName` wordt veiliggesteld: bij e-mail-achtige input → fallback "belegger"
- Spec-test valideert: geen e-mail-pattern in gerenderde HTML

### HMAC-unsubscribe (geen auth nodig)
```
token = base64url(payload) + "." + base64url(HMAC-SHA256(payload))
payload = { email, scope: "monthly_review" }
```
- Constant-time vergelijking (`crypto.timingSafeEqual`)
- Token verloopt **niet** — een dode unsubscribe-link is slechte UX
- Geknoeid token → `null` → "link ongeldig"-pagina

---

## 4. 6 secties — toon-mapping

| Sectie | Bron | Tone-logica |
|---|---|---|
| Health-verandering | M30 risk-trend delta | stijgt → positive, daalt → warning, <3 → neutral |
| Grootste risico | M29 risk-tower ergste categorie | red/orange → warning, geen → positive |
| Doelvoortgang | M21 wealth course | alle haalbaar → positive, <50% → warning |
| Maandactie | rebalance top-recommendation | altijd info; body zegt expliciet "geen koopadvies" |
| Belangrijkste alert | health-signals critical/warning | severity-mapped |
| Datakwaliteit | M26 data-depth score | ≥70 positive, ≥50 neutral, <50 warning |

**Headline-generator**: ≥2 warnings → "aandachtspunten"; ≥3 positives → "sterke maand"; anders "rustige maand".

---

## 5. Provider abstraction

Hergebruikt bestaande `src/lib/mail/provider.ts`:
- `MailProvider`-interface met `send(SendMailInput)`
- 3 modi: console-fallback (dev), SMTP (productie via nodemailer dynamic-import), test-recorder
- `renderReviewEmail` produceert `{ subject, html, text }` → direct compatibel met `SendMailInput`

**Geen nieuwe provider-laag** — Module 19 leverde dit al.

---

## 6. Topbelegger-validatie

| Lens | Hoe Module 34 hier landt |
|---|---|
| **Buffett (vertrouwen)** | Korte, rustige e-mail; geen hype, geen koopadvies; disclaimer expliciet |
| **Dalio (risico)** | "Grootste risico"-sectie prominent; warning-tone bij verhoogd risico |
| **Lynch (begrijpelijk)** | NL-spreektaal, kwalitatieve labels i.p.v. ruwe cijfers |
| **Simons (reproduceerbaar)** | Pure-function generator + template; 27 deterministische tests |
| **Wood (toekomstgericht)** | `ReviewSection`-shape uitbreidbaar; AI-narratief-hook mogelijk in v2 |
| **Technisch beheerder** | Faal-safe loader (try/catch per engine); unsubscribe idempotent; logs zonder PII (alleen e-mail-domein) |
| **Langetermijnbelegger** | Maandelijks (niet dagelijks) — past bij rust-mentaliteit; "kom terug"-anker |
| **Risicoanalist** | Privacy-by-default: spec-test blokkeert bedragen zonder opt-in; HMAC-token; geen raw e-mail in body |
| **Marketeer** | Retentie-driver: maandelijkse terugkeer naar app; CTA-knop "Bekijk je volledige overzicht" |
| **CEO (reputatie)** | Geen datalek-risico; AVG-conform unsubscribe; geen 3rd-party e-mail-tracking-pixel |

---

## 7. Tests — 27 nieuwe tests

| Categorie | Tests | Coverage |
|---|---|---|
| Shape | 3 | 6 secties in vaste volgorde, disclaimer, lege portfolio |
| health_change | 4 | gestegen → positive, gedaald → warning, stabiel, geen vorige |
| biggest_risk | 2 | geen risico → positive, rood → warning |
| goal_progress | 3 | geen doelen, alle op koers, deels |
| monthly_action | 1 | body benoemt "geen koopadvies" |
| renderReviewEmail | 5 | subject, unsubscribe-link, "geen bedragen"-mention, XSS-escape, geen raw e-mail |
| unsubscribe-token | 6 | round-trip, normalisatie, geknoeid → null, ongeldig → null, scope-check, URL-builder |
| Risicoanalist (datalekken) | 3 | geen €-bedragen bij detailedFigures=false, disclaimer in HTML+text, headline |

Bestaande `preferences.test.ts` (8 tests) blijft groen — additieve uitbreiding brak niets.

Totaal: **2694/2694** (217 files).

---

## 8. Resterende risico's

| Risk | Mitigatie |
|---|---|
| Geen scheduled cron-job voor verzending in v1 | Loader + generator + template + provider zijn klaar; cron-handler (Vercel Cron / GitHub Actions) is v2-werk. Preview-page toont nu wat verstuurd zou worden |
| `detailedFigures=true` pad: generator toont nog niet méér cijfers | Bewust v1: privacy-veilige variant is volledig; opt-in-pad is gemarkeerd maar generator gebruikt nu nog dezelfde body. Backlog: per-sectie detailed-variant |
| AI-narratief ontbreekt (deterministic copy) | Bewust: reproduceerbaar, geen hallucination-risk in e-mail. Backlog: M8 explainability-hook |
| Unsubscribe-token verloopt nooit | Bewuste keuze (dode link = slechte UX); token bevat geen gevoelige scope, alleen e-mail + monthly_review |
| `top_alert` gebruikt health-signals als proxy i.p.v. notification-center | Acceptabel v1 — health-signals zijn de meest relevante "belangrijkste melding". Backlog: directe notification-repository-integratie |
| Geen open-rate/click-tracking | Bewust privacy-keuze — geen tracking-pixel. Conversion-events (M33) kunnen CTA-clicks vanuit app vangen |
| Greeting gebruikt geen echte voornaam | `AuthenticatedUser` heeft geen `name`-veld; fallback "belegger". Backlog: voornaam uit UserProfile |

---

## 9. Decision-log

**Vraag**: waarom `NotificationPreferences` uitbreiden i.p.v. aparte `EmailReviewPreferences`?

**Antwoord**:
1. E-mail-voorkeuren horen logisch bij de bestaande notification-voorkeuren-laag
2. Eén `parsePreferences` + één `isCategoryAllowed` — geen dubbele preference-parsers
3. Additief: defaults zorgen voor backward-compat met bestaande Json-blobs

**Vraag**: waarom default `monthlyReview = true` maar `detailedFigures = false`?

**Antwoord**:
1. `monthlyReview = true`: retentie-anker; onboarding-users moeten iets ontvangen (uitschrijfbaar)
2. `detailedFigures = false`: privacy-by-default — gevoelige cijfers vereisen expliciete opt-in. Spec eist dit letterlijk: "Geen gevoelige details in e-mail tenzij gebruiker dit expliciet toestaat"

**Vraag**: waarom HMAC-token i.p.v. een unsubscribe-record in de DB?

**Antwoord**:
1. Geen DB-write nodig om een token te genereren — stateless
2. Token kan in de e-mail worden geëmbed zonder ronde naar DB
3. Verificatie is pure crypto — geen DB-lookup tot het écht uitschrijven is
4. Geen token-tabel om op te ruimen
