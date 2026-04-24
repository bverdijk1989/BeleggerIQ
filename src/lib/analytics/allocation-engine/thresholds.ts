import type { PolicySettings } from "@/types/profile";

/**
 * Thresholds voor de monthly buy engine. Bedoeld als default policy;
 * callers kunnen via `thresholdsFromPolicy` velden overschrijven.
 */

export interface AllocationThresholds {
  /** Minimum bedrag per order in base currency. */
  minOrderAmount: number;
  /** Absolute cap op aantal recommendations (niet in stone — filter-stap). */
  maxRecommendations: number;
  /** Onder dit aantal recommendations logt de engine een hold-cash waarschuwing. */
  minRecommendations: number;
  /** Cash buffer als fractie van totalValue die niet wordt belegd. */
  cashBufferPct: number;
  /** Max gewicht per positie — harde cap bij recommendations. */
  maxPositionWeight: number;
  /** Max sector-gewicht — boven deze cap geen verdere bijkoop in die sector. */
  maxSectorWeight: number;
  /** Extra cash-holdback fractie bij DEFENSIVE regime (op het budget). */
  defensiveBudgetHoldback: number;
  /** Boost op deployable budget bij RISK_ON regime. */
  riskOnBudgetMultiplier: number;
  /** Minimum score dat een bestaande holding moet halen om mee te doen. */
  minCandidateComposite: number;
  /** Minimum aantal posities voordat core-ETF fallback wordt gebruikt. */
  coreEtfMinPositions: number;
}

export const DEFAULT_ALLOCATION_THRESHOLDS: AllocationThresholds = {
  minOrderAmount: 100,
  maxRecommendations: 5,
  minRecommendations: 3,
  cashBufferPct: 0.05,
  maxPositionWeight: 0.1,
  maxSectorWeight: 0.35,
  defensiveBudgetHoldback: 0.25,
  riskOnBudgetMultiplier: 1.0,
  minCandidateComposite: 45,
  coreEtfMinPositions: 8,
};

export function thresholdsFromPolicy(
  policy: PolicySettings | null | undefined,
  base: AllocationThresholds = DEFAULT_ALLOCATION_THRESHOLDS,
): AllocationThresholds {
  if (!policy) return base;
  return {
    ...base,
    cashBufferPct: policy.cashBufferPct ?? base.cashBufferPct,
    maxPositionWeight:
      policy.maxPositionWeight ?? base.maxPositionWeight,
    maxSectorWeight:
      policy.maxSectorWeight ?? base.maxSectorWeight,
    minCandidateComposite:
      policy.minFactorComposite !== undefined &&
      policy.minFactorComposite !== null
        ? mapCompositeToScore(policy.minFactorComposite)
        : base.minCandidateComposite,
  };
}

/**
 * PolicySettings.minFactorComposite ligt volgens de oude conventie tussen
 * -1 en 1. Onze engine denkt in 0..100. Converteer als nodig; absolute
 * waarden buiten [-1,1] laten we ongewijzigd.
 */
function mapCompositeToScore(value: number): number {
  if (value >= -1 && value <= 1) {
    return Math.round((value + 1) * 50);
  }
  return value;
}
