import type { PolicySettings } from "@/types/profile";
import type { RiskSeverity } from "@/types/risk";

/**
 * Risk engine thresholds. Elk paar `{ low, high }` definieert de drie
 * klassen: ≤ low = "low" (laag risico), ≥ high = "high", ertussen = "moderate".
 *
 * Voor metrics waar "hoger = veiliger" is (bv. een lowVol-sub-score) gebruik
 * je `classifyInverse` in plaats van `classify`.
 */

export interface ThresholdBand {
  low: number;
  high: number;
}

export interface RiskThresholds {
  /** Positie-gewicht, fractie (0..1). */
  positionWeight: ThresholdBand;
  /** Herfindahl-Hirschman index op positie-gewichten (0..1). */
  concentrationHhi: ThresholdBand;
  /** Som van top-5 posities (0..1). */
  top5Weight: ThresholdBand;
  /** Geannualiseerde volatility (0..1). */
  volatility: ThresholdBand;
  /** Beta t.o.v. benchmark. */
  beta: ThresholdBand;
  /** Absolute max drawdown (0..1). */
  drawdown: ThresholdBand;
  /** Grootste sector-gewicht (0..1). */
  sectorWeight: ThresholdBand;
  /** Aandeel in niet-base currency (0..1). */
  foreignCurrencyExposure: ThresholdBand;
  /** Minimum aantal posities voor voldoende spreiding. */
  minPositions: number;
}

export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  positionWeight: { low: 0.05, high: 0.1 },
  concentrationHhi: { low: 0.1, high: 0.2 },
  top5Weight: { low: 0.4, high: 0.6 },
  volatility: { low: 0.15, high: 0.3 },
  beta: { low: 0.9, high: 1.3 },
  drawdown: { low: 0.15, high: 0.35 },
  sectorWeight: { low: 0.3, high: 0.45 },
  foreignCurrencyExposure: { low: 0.3, high: 0.6 },
  minPositions: 8,
};

/**
 * Leidt thresholds af uit `PolicySettings`. Alleen fields die in het
 * policy-model voorkomen overschrijven de defaults; rest blijft standaard.
 */
export function thresholdsFromPolicy(
  policy: PolicySettings | null | undefined,
  base: RiskThresholds = DEFAULT_RISK_THRESHOLDS,
): RiskThresholds {
  if (!policy) return base;
  return {
    ...base,
    positionWeight: {
      low: base.positionWeight.low,
      high: policy.maxPositionWeight ?? base.positionWeight.high,
    },
    sectorWeight: {
      low: base.sectorWeight.low,
      high: policy.maxSectorWeight ?? base.sectorWeight.high,
    },
    minPositions: policy.minPositions ?? base.minPositions,
  };
}

// ============================================================
//  Classification helpers
// ============================================================

export type CoreRiskClass = Extract<RiskSeverity, "low" | "moderate" | "high">;

/**
 * Classificeer een metric waar hoger = meer risico.
 * waarde ≤ low → "low", ≥ high → "high", anders "moderate".
 */
export function classify(value: number, band: ThresholdBand): CoreRiskClass {
  if (!Number.isFinite(value)) return "moderate";
  if (value <= band.low) return "low";
  if (value >= band.high) return "high";
  return "moderate";
}

/**
 * Classificeer een metric waar hoger = minder risico.
 */
export function classifyInverse(
  value: number,
  band: ThresholdBand,
): CoreRiskClass {
  if (!Number.isFinite(value)) return "moderate";
  if (value >= band.high) return "low";
  if (value <= band.low) return "high";
  return "moderate";
}

/**
 * Lineaire risk-score 0..100 waar hoger = meer risico.
 * Waarden onder `low` klemmen op 15, boven `high` op 85. Daartussen lineair.
 */
export function continuousRiskScore(
  value: number,
  band: ThresholdBand,
): number {
  if (!Number.isFinite(value)) return 50;
  if (value <= band.low) return 15;
  if (value >= band.high) return 85;
  return 15 + ((value - band.low) / (band.high - band.low)) * 70;
}

/** Spiegelbeeld: hogere waarde drukt risk-score omlaag. */
export function continuousRiskScoreInverse(
  value: number,
  band: ThresholdBand,
): number {
  if (!Number.isFinite(value)) return 50;
  if (value >= band.high) return 15;
  if (value <= band.low) return 85;
  return 85 - ((value - band.low) / (band.high - band.low)) * 70;
}

export function classFromScore(score: number): CoreRiskClass {
  if (!Number.isFinite(score)) return "moderate";
  if (score >= 67) return "high";
  if (score >= 34) return "moderate";
  return "low";
}

/** Maps een klasse naar een numerieke proxy voor weighted combinations. */
export function scoreForClass(cls: CoreRiskClass): number {
  switch (cls) {
    case "low":
      return 15;
    case "moderate":
      return 55;
    case "high":
      return 85;
  }
}
