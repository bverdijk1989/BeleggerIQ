/**
 * Entitlement-service — runtime entitlement-checks.
 *
 * **Pure functies**: zelfde input → identieke output. Geen DB; de caller
 * geeft de tier mee (resolved uit `UserProfile.billingTier` of
 * `Subscription`).
 *
 * **Server-side helpers**: `resolveCurrentTier(email)` haalt de tier op
 * en valt terug op FREE bij elke fout.
 */

import { portfolioRepository } from "@/lib/data";
import type { BillingTier } from "@/types/profile";

import { FEATURE_CATALOG, getFeature, TIER_RANK } from "./catalog";
import type { EntitlementCheck, FeatureKey } from "./types";

const DEFAULT_TIER: BillingTier = "FREE";

// ============================================================
//  Pure functies
// ============================================================

/**
 * Heeft `tier` toegang tot `featureKey`?
 *
 * Levert een rijk `EntitlementCheck`-resultaat terug zodat de caller
 * direct in de UI kan tonen WELKE tier(s) zouden upgraden.
 */
export function canUseFeature(
  tier: BillingTier | null | undefined,
  featureKey: FeatureKey,
  options: { overrideActive?: boolean } = {},
): EntitlementCheck {
  const effectiveTier = tier ?? DEFAULT_TIER;
  const feature = getFeature(featureKey);
  if (!feature) {
    // Onbekende key — defensive: toon als geblokkeerd, met label = key
    // zodat een UI-bug zichtbaar wordt.
    return {
      allowed: false,
      tier: effectiveTier,
      upgradeOptions: [],
      featureLabel: featureKey,
      overrideActive: options.overrideActive,
    };
  }
  const allowed = feature.availableIn.includes(effectiveTier);
  const limit = feature.limits?.[effectiveTier];
  const upgradeOptions = feature.availableIn.filter(
    (t) => TIER_RANK[t] > TIER_RANK[effectiveTier],
  );

  return {
    allowed,
    tier: effectiveTier,
    limit: allowed ? (limit ?? null) : undefined,
    upgradeOptions,
    featureLabel: feature.label,
    overrideActive: options.overrideActive,
  };
}

/**
 * Levert de feature-limit voor een tier (numeric features als
 * `portfolio.tracking` of `goals.basic`). `null` = unlimited; `undefined`
 * = de feature is niet beschikbaar voor deze tier.
 */
export function getFeatureLimit(
  tier: BillingTier | null | undefined,
  featureKey: FeatureKey,
): number | null | undefined {
  const effectiveTier = tier ?? DEFAULT_TIER;
  const feature = getFeature(featureKey);
  if (!feature || !feature.availableIn.includes(effectiveTier)) {
    return undefined;
  }
  return feature.limits?.[effectiveTier] ?? null;
}

/** Lijst alle features die `tier` mag gebruiken. */
export function listFeaturesForTier(tier: BillingTier): FeatureKey[] {
  return FEATURE_CATALOG.filter((f) => f.availableIn.includes(tier)).map(
    (f) => f.key,
  );
}

/**
 * Pak de eerstvolgende tier die `featureKey` ontgrendelt. Returns `null`
 * als de feature al beschikbaar is of als geen tier 'em ondersteunt.
 */
export function nextTierForFeature(
  currentTier: BillingTier | null | undefined,
  featureKey: FeatureKey,
): BillingTier | null {
  const effective = currentTier ?? DEFAULT_TIER;
  const feature = getFeature(featureKey);
  if (!feature) return null;
  if (feature.availableIn.includes(effective)) return null;
  const upgradeOptions = feature.availableIn.filter(
    (t) => TIER_RANK[t] > TIER_RANK[effective],
  );
  if (upgradeOptions.length === 0) return null;
  // Pak goedkoopste upgrade.
  return upgradeOptions.sort((a, b) => TIER_RANK[a] - TIER_RANK[b])[0]!;
}

// ============================================================
//  Server-side resolver (DB-fetch)
// ============================================================

/**
 * Resolve de huidige billing-tier voor een gebruiker — leest
 * `UserProfile.billingTier` (gedenormaliseerd cache) en valt terug op
 * FREE bij elke fout.
 *
 * **Override (dev-only)**: wanneer `process.env.ENTITLEMENT_OVERRIDE_TIER`
 * gezet is gebruiken we die in plaats van de DB-waarde. Bedoeld voor
 * lokale ontwikkeling — niet zetten in productie.
 */
export async function resolveCurrentTier(
  userEmail: string,
): Promise<{ tier: BillingTier; overrideActive: boolean }> {
  const override = process.env.ENTITLEMENT_OVERRIDE_TIER as BillingTier | undefined;
  if (override && (["FREE", "PRO", "ELITE", "ADVISOR"] as BillingTier[]).includes(override)) {
    return { tier: override, overrideActive: true };
  }
  try {
    const ctx = await portfolioRepository.findUserContextByEmail(userEmail);
    return { tier: ctx?.profile?.billingTier ?? DEFAULT_TIER, overrideActive: false };
  } catch {
    return { tier: DEFAULT_TIER, overrideActive: false };
  }
}
