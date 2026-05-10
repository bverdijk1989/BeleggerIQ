/**
 * Public API voor de entitlement-laag.
 */

export {
  FEATURE_CATALOG,
  TIER_CATALOG,
  TIER_RANK,
  getFeature,
  getTierDefinition,
} from "./catalog";
export {
  canUseFeature,
  getFeatureLimit,
  listFeaturesForTier,
  nextTierForFeature,
  resolveCurrentTier,
} from "./service";
export type {
  BillingTier,
  EntitlementCheck,
  FeatureCategory,
  FeatureDefinition,
  FeatureKey,
  TierDefinition,
} from "./types";
