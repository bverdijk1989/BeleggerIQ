import type { PolicySettings } from "@/types/profile";

/**
 * Rebalance-engine thresholds. Default conservatief: als de gebruiker geen
 * policy heeft, laat winners iets meer lopen dan het absolute maximum
 * en begin pas stevig te trimmen boven 1.5× het policy-maximum.
 *
 * Alle waarden zijn fracties (0..1).
 */
export interface RebalanceThresholds {
  /** Hard maximum gewicht per positie volgens policy. */
  maxPositionWeight: number;
  /** Ondergrens waarboven een positie als "concentratie" telt. */
  concentratedMinWeight: number;
  /** Boven deze factor × max wordt altijd afgebouwd, ook bij HEALTHY. */
  healthyRunMultiplier: number;
  /** Boven deze factor × max volgt TRIM_HEAVY bij FRAGILE. */
  fragileHeavyMultiplier: number;
  /** Fragility-score drempel waarboven RECONSIDER triggert. */
  fragileReconsiderScore: number;
}

export const DEFAULT_REBALANCE_THRESHOLDS: RebalanceThresholds = {
  maxPositionWeight: 0.1,
  concentratedMinWeight: 0.05,
  healthyRunMultiplier: 2.0,
  fragileHeavyMultiplier: 1.5,
  fragileReconsiderScore: 80,
};

export function thresholdsFromPolicy(
  policy: PolicySettings | null | undefined,
  base: RebalanceThresholds = DEFAULT_REBALANCE_THRESHOLDS,
): RebalanceThresholds {
  if (!policy) return base;
  return {
    ...base,
    maxPositionWeight: policy.maxPositionWeight ?? base.maxPositionWeight,
    concentratedMinWeight:
      policy.minPositionWeight ?? base.concentratedMinWeight,
  };
}
