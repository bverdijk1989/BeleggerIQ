# Monetization Model — Module 13

Vier-tier model (FREE / PRO / ELITE / ADVISOR) met één centrale feature-catalog als bron-van-waarheid. Pricing wijzigen = één file aanpassen; geen scattered if-statements door de codebase.

> **Filosofie**: AI-native premiumervaring (Wood-laag). Free is bewust waardevol; Pro maakt de Daily AI Briefing + Behavioral Coach + Watchlist Intelligence + basis scenario's + alerts beschikbaar; Elite zet de Signal Fusion + AI Explainability + volledige stress-tests + Crypto Lab + premium alerts aan; Advisor is voorbereid maar nog niet actief verkocht.

---

## 1. Tiers

| Tier | Prijs (mnd / jr) | Voor wie |
|---|---|---|
| **FREE** | €0 / €0 | Kennismaken zonder risico |
| **PRO** | €9,95 / €95 | De bewuste belegger |
| **ELITE** | €24,95 / €249 | De data-gedreven belegger |
| **ADVISOR** | Op aanvraag | Adviseurs en vermogensbeheerders |

Prijs in `TIER_CATALOG` — wijzigen = één file aanpassen.

---

## 2. Feature-catalog

| Categorie | Feature | FREE | PRO | ELITE | ADVISOR |
|---|---|---|---|---|---|
| Tracking | Portfolio tracking | tot 10 | tot 50 | unlimited | unlimited |
| Tracking | Onbeperkt holdings | — | — | ✓ | ✓ |
| Tracking | Meerdere portefeuilles | — | ✓ | ✓ | ✓ |
| Analytics | Basis Health Score | ✓ | ✓ | ✓ | ✓ |
| Analytics | Volledige Health Score (10 components) | — | ✓ | ✓ | ✓ |
| AI | Weekly briefing | ✓ | ✓ | ✓ | ✓ |
| AI | Daily AI Briefing | — | ✓ | ✓ | ✓ |
| Analytics | Behavioral Coach | — | ✓ | ✓ | ✓ |
| Tracking | Eén financieel doel | tot 1 | tot 5 | unlimited | unlimited |
| Tracking | Onbeperkt doelen | — | — | ✓ | ✓ |
| Analytics | Basis macro regime | — | ✓ | ✓ | ✓ |
| Analytics | Volledig macroregime | — | — | ✓ | ✓ |
| Analytics | Investment Confidence Score | — | — | ✓ | ✓ |
| AI | AI Explainability | — | — | ✓ | ✓ |
| Analytics | Watchlist Intelligence (M9) | — | ✓ | ✓ | ✓ |
| Analytics | Basis scenario-analyse | — | ✓ | ✓ | ✓ |
| Analytics | Volledige scenario- & tail-risk-analyse | — | — | ✓ | ✓ |
| Alerts | Basis alerts | — | ✓ | ✓ | ✓ |
| Alerts | Premium alerts | — | — | ✓ | ✓ |
| Analytics | Crypto Risk Lab (M12) | — | — | ✓ | ✓ |
| Analytics | Community benchmark | — | ✓ | ✓ | ✓ |
| Advisor | Multi-client | — | — | — | ✓ |
| Advisor | Export reports | — | — | — | ✓ |
| Advisor | White-label | — | — | — | ✓ |
| Advisor | Team-rollen | — | — | — | ✓ |

24 features in totaal. Gestapeld? **Nee — expliciet** per tier. Een feature die uit ELITE wordt gehaald valt niet automatisch naar PRO terug.

### Module 13-spec mapping

| Tier | Spec-onderdelen | Implementatie |
|---|---|---|
| **Free** | beperkte tracking, beperkte health, beperkte watchlist, beperkte AI briefing | `portfolio.tracking` limit 10, `health.basic`, `briefing.weekly` (watchlist-intelligence niet beschikbaar) |
| **Pro** | volledige health, daily briefing, behavioral coach, watchlist intelligence, basis scenario's, alerts | `health.full` + `briefing.daily` + `behavioral.coach` + `watchlist.intelligence` + `scenario.basic` + `alerts.basic` |
| **Elite** | signal fusion, geavanceerde macro, volledige stresstests, crypto lab, AI explainability overal, premium alerts | `signal_fusion.confidence_score` + `macro.full` + `scenario.analysis` + `crypto.lab` + `ai.explainability` + `alerts.premium` |
| **Advisor** | multi-client dashboards, rapportages, white-label, teamrollen | `advisor.multi_client` + `advisor.export_reports` + `advisor.white_label` + `advisor.team_roles` (allemaal voorbereid, op aanvraag) |

---

## 3. Architectuur

```
src/lib/entitlements/
├── types.ts              # FeatureKey, BillingTier, EntitlementCheck shape
├── catalog.ts            # SINGLE source of truth (FEATURE_CATALOG + TIER_CATALOG)
├── service.ts            # canUseFeature, getFeatureLimit, listFeaturesForTier,
│                         # nextTierForFeature, resolveCurrentTier
├── actions.ts            # setBillingTierAction (dev/QA — productie via webhook)
├── service.test.ts       # 36 tests
└── index.ts

prisma/
├── schema.prisma         # +BillingTier enum, +Subscription model, +UserProfile.billingTier
└── migrations/20260510200000_add_billing/

src/components/entitlements/
├── paywall-card.tsx      # PaywallCard + UpgradeCTA
└── tier-switcher.tsx     # Dev/QA tier-picker

src/app/(app)/pricing/
└── page.tsx              # Pricing-page met tier-cards + feature-vergelijkingstabel
```

---

## 4. Datamodel

### `UserProfile.billingTier` — gedenormaliseerd cache

Default `FREE`. Snelle lookup voor entitlement-checks zonder JOIN op `Subscription`. Bij echte billing-integratie sync't een Stripe-webhook-handler deze kolom zodra `Subscription.status` wijzigt.

### `Subscription` — bron-van-waarheid

```
Subscription {
  id              cuid
  userId          → User.id
  tier            BillingTier
  status          TRIALING | ACTIVE | PAST_DUE | CANCELED | EXPIRED
  externalId      String?    // Stripe/Mollie subscription-id
  currentPeriodStart  DateTime?
  currentPeriodEnd    DateTime?
  trialEndsAt         DateTime?
  createdAt / updatedAt
}
```

Eén user kan meerdere historische rijen hebben (audit). De meest recente met status TRIALING/ACTIVE bepaalt de tier.

---

## 5. API — voor feature-gating in code

```ts
import { canUseFeature, resolveCurrentTier } from "@/lib/entitlements";

// Server-side, in een page.tsx:
const { tier, overrideActive } = await resolveCurrentTier(userEmail);
const entitlement = canUseFeature(tier, "signal_fusion.confidence_score", {
  overrideActive,
});

if (!entitlement.allowed) {
  return <PaywallCard
    featureLabel={entitlement.featureLabel}
    description={...}
    entitlement={entitlement}
  />;
}

// Beschikbaar — render de feature.
```

**`canUseFeature`** retourneert een rijk `EntitlementCheck`-object:
- `allowed` — bool
- `tier` — huidige user-tier
- `limit` — null = unlimited; getal = max; undefined = N/A
- `upgradeOptions` — lijst tiers die de feature WEL ondersteunen
- `featureLabel` — UI-string voor de paywall-melding
- `overrideActive` — `true` wanneer `ENTITLEMENT_OVERRIDE_TIER` env-var actief is

---

## 6. UI-componenten

### `<PaywallCard />` — feature-blokkade vervangen door upgrade-CTA

```tsx
<PaywallCard
  featureLabel="Investment Confidence Score"
  description="Per instrument een 0–100 score over 10 transparante signaalbronnen."
  entitlement={entitlement}
  bonusCopy="Niet alleen de score: je krijgt ook de volledige breakdown..."
/>
```

Toont: feature-titel + beschrijving + upgrade-tier (uit `entitlement.upgradeOptions[0]`) + prijs + "Bekijk pricing"-CTA. UI is rustig en niet alarmistisch — geen "you can't access this".

### `<UpgradeCTA />` — banner binnen bestaande secties

Voor "wil je dit dagelijks i.p.v. wekelijks?"-style soft-nudges naast bestaande content.

### `<TierSwitcher />` — dev/QA tier-picker

In de `/pricing`-pagina onderaan (ingelogde users). Roept `setBillingTierAction` aan + `revalidatePath`. In productie kan deze component verwijderd worden zodra een echte Stripe-flow er is.

---

## 7. Pricing-page

`/pricing` toont:
1. **4 tier-cards** met prijs, tagline, top-6 features per tier, en "Aanrader"-badge op de highlighted tier (PRO).
2. **Volledige feature-vergelijkingstabel**, gegroepeerd per categorie (Tracking / Analytics / AI / Alerts / Advisor) met checkmarks of limieten per cel.
3. **TierSwitcher** voor ingelogde users in dev/QA.

Pricing-data komt rechtstreeks uit `TIER_CATALOG` + `FEATURE_CATALOG`. Pricing wijzigen = één file.

---

## 8. Webhook-integratie (toekomst — voorbereid)

De architectuur is klaar voor Stripe/Mollie:

1. Setup `Subscription` record bij eerste checkout via `stripe.checkout.sessions.create`.
2. Webhook-endpoint (toekomst: `/api/billing/webhook`) ontvangt:
   - `customer.subscription.created` → INSERT Subscription
   - `customer.subscription.updated` → UPDATE Subscription.status + currentPeriodEnd
   - `customer.subscription.deleted` → status = CANCELED
3. Zelfde handler updatet `UserProfile.billingTier` voor snelle lookup.
4. Cron-job (toekomst) markeert `Subscription` als EXPIRED wanneer `currentPeriodEnd < now` en status = CANCELED → `UserProfile.billingTier` valt terug op FREE.

---

## 9. Dev-mode override

Voor lokale ontwikkeling zonder DB-mutatie:

```bash
ENTITLEMENT_OVERRIDE_TIER=ELITE npm run dev
```

`resolveCurrentTier` ziet de env-var, retourneert ELITE met `overrideActive=true`. UI-paywalls tonen dan een amber waarschuwing "Env-override actief".

In productie nooit zetten — de override negeert de DB-tier.

---

## 10. Tests — 36 in totaal

| Categorie | Tests |
|---|---|
| Catalog-integriteit | 6 |
| `canUseFeature` per-tier | 9 |
| `getFeatureLimit` (FREE/PRO/ELITE limits) | 6 |
| `listFeaturesForTier` | 5 |
| `nextTierForFeature` | 6 |
| `getFeature` + `getTierDefinition` | 4 |

---

## 11. Wat is gewired

### Gegate features
- `/score/[ticker]` — Investment Confidence Score → ELITE-paywall
- `/score/[ticker]` — AI Explainability → ELITE-paywall (binnen de pagina)
- `/macro` — basis macro regime → PRO-paywall
- `/macro` — full macro (asset-mapping + portfolio-impact) → ELITE-paywall

### Niet gewired (volgt later)
- `/portfolio-health` — full health (10 components) → PRO-paywall
- `/briefing` — daily briefing → PRO-paywall
- `/coach` — behavioral coach → PRO-paywall
- `/doelen` — limit-check (FREE = 1 doel) → server-action validatie

Patroon staat — uitbreiden = enkele regels per page (`canUseFeature` → `PaywallCard`).

---

## 12. Topbelegger-validatie

| Lens | Hoe het zit |
|---|---|
| **Buffett** (eenvoudig) | 4 tiers, niet 8. Eén catalog-file als bron. Geen feature-stacking-logica om te debuggen. |
| **Dalio** (risico-expliciet) | Subscription-status maakt billing-state expliciet (TRIALING/ACTIVE/PAST_DUE/CANCELED). Geen "pleeg verlengen?"-grijze zones. |
| **Lynch** (begrijpelijk) | Pricing-page in NL met concrete features en NL-rationales per item. Tagline per tier. |
| **Simons** (kwantificeerbaar) | Catalog is in code; 36 unit tests dekken alle tier × feature combinaties. |
| **Wood** (AI-first premium) | Daily AI Briefing in PRO; AI Explainability in ELITE. AI is hét premium-differentiator. |

---

## 13. Toekomstige uitbreidingen

| Idee | Waarom |
|---|---|
| **Stripe-checkout-flow** | `/api/billing/checkout` + webhooks → vervangt `setBillingTierAction` voor productie |
| **Coupon / promo-codes** | Per tier korting + trial-extensions |
| **Usage metering** | Bv. "X AI-briefings deze maand"; tier-specifieke quota |
| **Annual-discount** highlight | "10% korting bij jaarbetaling" prominent in pricing-page |
| **Trial-periode** (bv. 14 dagen Pro gratis) | Subscription.status=TRIALING + trialEndsAt; conversion-tracking |
| **Plan downgrade** met grace-periode | Behoud toegang tot currentPeriodEnd; daarna FREE |
| **Per-feature pricing** (à la carte) | Sommige features los kopen — bv. AI Briefing zonder Pro |
| **Family / team plans** | Multi-user 1 subscription |
| **Refer-a-friend** | Maand gratis bij elke referral |
| **Tier-recommender** | Op basis van gebruik suggesteert app de juiste tier (Lynch + Wood) |
