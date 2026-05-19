# Marketing Landing Page & Conversiefunnel — Module 33

Publieke homepage met **10 secties** + **privacy-vriendelijke conversion-tracking** zonder 3rd-party pixels. Buffett-toon: vertrouwen, eenvoud, geen hype.

> **Positionering**: "De AI-beleggingscoach voor Nederlandse langetermijnbeleggers die elke maand rust, inzicht en een concreet actieplan geeft."

---

## 1. Module 33-spec mapping — 10 secties

| # | Spec | Implementatie |
|---|---|---|
| 1 | Hero met duidelijke belofte | `HeroSection` met positionering + 2 CTA's |
| 2 | Probleem | `ProblemSection` met 5 pain-points (verdrinken in data) |
| 3 | Oplossing | `SolutionSection` met 4 pilaren (Health Score / AI-briefing / Risk Tower / Maandactie) |
| 4 | Demo cards/screenshots | `DemoCardsSection` met 4 voorbeeld-outputs (illustratief, gelabeld) |
| 5 | Voor wie | `ForWhoSection` met 5 personae (ETF / Dividend / Aandelen / Elite / Advisor) |
| 6 | Pricing teaser | `PricingTeaserSection` met 4 tier-kaarten + link naar /pricing |
| 7 | Trust/disclaimer | `TrustSection` met "wel/niet"-kaarten — geen broker, geen advies |
| 8 | CTA naar onboarding | `FooterCta` met "Begin gratis" + pricing-link |
| 9 | FAQ | `FaqSection` met 6 details/summary (broker, advies, data, AI, brokers, prijs) |
| 10 | Advisor pilot CTA | `AdvisorPilotSection` met "Plan pilot-gesprek" |

---

## 2. Architectuur

```
src/app/page.tsx
    # Root — auth-aware:
    #   ingelogd → redirect("/dashboard")
    #   anders → render landing met 10 secties + marketing chrome inline

src/lib/marketing/
├── conversion-events.ts       # ConversionEvent-keys (whitelist), hashSessionId,
│                                 recordConversionEvent (audit-wrapper)
└── conversion-events.test.ts  # 11 tests

src/app/api/marketing/track/route.ts
    # POST endpoint voor client-side fire-and-forget tracking
    # Whitelist-validatie op event-key; session-cookie wordt direct gehasht

src/components/marketing/track-event-button.tsx
    # "use client" wrapper rond Link met fire-and-forget tracking
    # keepalive: true zodat navigatie geen impact heeft
```

**Geen rewrite**. Bestaande pricing-page (`/(app)/pricing`) blijft staan; landing linkt erheen.

---

## 3. Conversion-tracking — privacy-by-default

**Geen 3rd-party**: geen Google Analytics, geen Mixpanel, geen Plausible-extern. Alles server-side via `audit.record`.

```ts
type ConversionEvent =
  | "landing_viewed"
  | "landing_cta_hero_clicked"
  | "landing_cta_pricing_clicked"
  | "landing_cta_demo_clicked"
  | "landing_cta_advisor_clicked"
  | "landing_section_scrolled_pricing"
  | "landing_section_scrolled_for_who"
  | "landing_section_scrolled_faq"
  | "signup_started"
  | "signup_completed"
  | "pricing_viewed"
  | "pricing_tier_selected"
  | "upgrade_clicked"
  | "advisor_pilot_inquired";
```

**Privacy-laag**:
- Whitelist-only: route weigert onbekende events met 400
- Session-cookie wordt **direct gehasht** (sha256 → 12 chars) — geen raw cookie in DB
- Geen IP / user-agent / fingerprint in audit-metadata
- Source-string capped op 64 chars
- `audit.userEmail = null` voor uitgelogde funnel-events
- Anonieme correlatie via sessionHash; admins kunnen funnel-attrition per session-hash zien zonder PII

**Spec-tests valideren**:
- Hash deterministisch + niet-omkeerbaar
- Geen e-mail-pattern / IP / user-agent in serialized payload
- Audit-write-fail breekt user-flow niet (`expect().resolves.toBeUndefined()`)
- Category altijd `"system"` (geen confusion met `auth`-events)

---

## 4. Content-toon — Buffett & co.

**Wat staat er niet**:
- Geen percentages ("10× je rendement")
- Geen koersdoelen
- Geen verzonnen testimonials
- Geen FOMO-language ("nog 3 plekken!")

**Wat staat er wel**:
- "Rust, inzicht en een concreet actieplan"
- "Geen koerstickers, geen hype, geen koopadvies"
- "Wat we wel/niet zijn"-kaarten (Trust-sectie)
- "Voorbeeld-output · illustratief"-disclaimers op demo-cards
- FAQ-antwoord op "Geven jullie koopadvies?" → "Nee. De beslissing ligt altijd bij jezelf."

---

## 5. Conditional root-rendering

```
src/app/page.tsx
└─ async function RootPage()
   ├─ const auth = await resolveUserFromServer()
   ├─ if (auth.ok) → redirect("/dashboard")
   └─ else → <LandingPage />
```

Ingelogde gebruikers zien **identiek** gedrag als voorheen (redirect naar dashboard); niet-ingelogde gebruikers zien nu de landing. Geen breaking change voor bestaande users.

---

## 6. Topbelegger-validatie

| Lens | Hoe Module 33 hier landt |
|---|---|
| **Buffett (vertrouwen)** | Geen hype, geen 10×-claims, geen FOMO. "Wat we wel/niet zijn"-trust-sectie expliciet. |
| **Dalio (risico expliciet)** | Risk Control Tower als kernlaag in solution-section; trust-sectie noemt "geen rendementsgaranties". |
| **Lynch (begrijpelijk)** | NL-spreektaal, geen jargon zonder uitleg. FAQ in eenvoudige zinnen. |
| **Simons (meetbaar)** | "Pure-function engines, deterministisch, testbaar" expliciet in trust-sectie. |
| **Wood (AI-native)** | "Uitlegbare AI met source-tracing en hallucination-guardrails" — AI-native maar verantwoord. |
| **Technisch beheerder** | Conversion-events via bestaande `audit.record`; geen nieuwe infra. |
| **Langetermijnbelegger** | "elke maand rust" als positioning — geen real-time-dashboard-belofte. |
| **Hedge fund** | Niet de doelgroep van landing; Advisor-pilot-sectie expliciet voor B2B. |
| **Risicoanalist** | Disclaimer-tekst in footer + trust-sectie expliciet over "geen broker, geen advies". |
| **Marketeer** | 10 secties met heldere narrative-flow: probleem → oplossing → demo → voor-wie → pricing → trust → CTA → FAQ. Conversion-events trackbaar. |
| **CEO (reputatie)** | Geen verzonnen feiten, geen valse promises; AFM/Wft-grens duidelijk afgebakend. |

---

## 7. Tests — 11 nieuwe tests

| Categorie | Tests | Coverage |
|---|---|---|
| hashSessionId | 4 | null/empty → null, deterministisch, verschillende inputs → verschillend, hash bevat geen raw input |
| recordConversionEvent | 5 | category=system, metadata-shape, source capping, anonymous-by-default, faal-safe |
| Privacy + spec-conformance | 2 | geen e-mail/IP/user-agent in serialized payload, audit-category altijd `system` voor alle events |

Pre-existing flakey `opportunity`-engine timing-test (1ms `detectedAt`-drift) is niet aan deze module — solo-run is groen.

---

## 8. Resterende risico's

| Risk | Mitigatie |
|---|---|
| Geen scroll-tracking-implementatie (alleen click-events) | Backlog: IntersectionObserver-based scroll-into-view tracking voor pricing/for-who/faq secties (events zijn al gedefinieerd in whitelist) |
| Landing rendert nog geen real screenshots | Demo-cards zijn caption-only, expliciet "voorbeeld-output · illustratief"-gelabeld. Backlog: vervang met echte screenshots wanneer pricing-design landt. |
| Geen A/B-test infra | Bewust v1; backlog: feature-flag-driven CTA-variants via M14 enterprise-flags |
| Hero-positionering is hardcoded NL — geen i18n | Doelgroep is NL-only; backlog: i18n-key-extractie wanneer EN-versie nodig is |
| Session-hash is 12 chars (48 bits) | Voldoende voor funnel-analytics op user-base <1M; bij grotere schaal naar 16 chars |
| Cookie-banner staat al in root-layout (M16 compliance) | Geen extra werk; landing erft 'em via root layout |
| Geen rel="noopener" op TrackedLink wanneer target="_blank" | Toegevoegd via prop; default ongebruikt op landing (alle CTA's internal) |

---

## 9. Decision-log

**Vraag**: waarom geen aparte `/(marketing)`-route-group?

**Antwoord**:
1. `/(marketing)/page.tsx` zou matchen op `/` net als bestaande `/page.tsx` — route-conflict
2. Pragmatisch: één bestand met conditional auth-check is duidelijker en houdt SEO-route stabiel op `/`
3. Wanneer marketing groeit (FAQ-page, demo-page, blog) kan een groep later worden toegevoegd voor andere routes

**Vraag**: waarom server-side conversion-tracking ipv client-only?

**Antwoord**:
1. Privacy: client-side tracking-pixels openen deur naar 3rd-party-vendor-keuze later (bad practice)
2. Audit-log-pad is al productie-gehard (M16 security hardening, retention-policy)
3. Bestaande admin-console kan funnel-stats lezen zonder extra tooling
4. Geen tracking-blocker-issues (extensions, Safari ITP) — events landen altijd

**Vraag**: waarom geen testimonials / case-studies?

**Antwoord**:
1. Reputatie-risico bij verzonnen testimonials
2. Pre-launch: geen echte user-quotes om te citeren
3. Buffett-toon: vertrouwen door product-helderheid, niet door social proof
4. Backlog: bij eerste pilot-advisor opt-in vragen voor case-study
