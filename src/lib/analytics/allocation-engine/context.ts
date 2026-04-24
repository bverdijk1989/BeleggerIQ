import type { FactorSubScores } from "@/types/factor";
import type { InvestmentObjective } from "@/types/profile";
import type { MarketRegimeScore, MarketRegimeStance } from "@/types/regime";

/**
 * Context-modulatie voor de monthly buy engine. Bepaalt hoe het budget en
 * de priority-score schuiven onder invloed van regime-stance en het
 * beleggingsdoel. Puur — geen I/O.
 */

// ============================================================
//  Regime adjustments
// ============================================================

export interface RegimeAdjustment {
  /** Multiplier op deployable budget (1.0 = ongewijzigd). */
  budgetMultiplier: number;
  /** Boost voor momentum sub-score in de priority-mix (-1..+1). */
  momentumBias: number;
  /** Boost voor quality sub-score. */
  qualityBias: number;
  /** Boost voor lowVol sub-score. */
  lowVolBias: number;
  /** Of de core-ETF fallback extra gewicht moet krijgen. */
  preferCoreEtf: boolean;
  /** Waarschuwingen om in het plan te loggen. */
  warnings: string[];
}

export function regimeAdjustment(
  regime: MarketRegimeScore | null | undefined,
): RegimeAdjustment {
  const stance: MarketRegimeStance | null = regime?.stance ?? null;

  if (!regime || !stance) {
    return {
      budgetMultiplier: 1,
      momentumBias: 0,
      qualityBias: 0,
      lowVolBias: 0,
      preferCoreEtf: false,
      warnings: [],
    };
  }

  switch (stance) {
    case "RISK_ON":
      return {
        budgetMultiplier: 1,
        momentumBias: 0.25,
        qualityBias: 0,
        lowVolBias: -0.1,
        preferCoreEtf: false,
        warnings: [],
      };
    case "DEFENSIVE":
      return {
        budgetMultiplier: 0.7,
        momentumBias: -0.2,
        qualityBias: 0.2,
        lowVolBias: 0.25,
        preferCoreEtf: true,
        warnings: [
          `Marktregime is defensief (score ${regime.score}/100) — houd een deel bewust als cash.`,
        ],
      };
    case "NEUTRAL":
    default:
      return {
        budgetMultiplier: 1,
        momentumBias: 0,
        qualityBias: 0.05,
        lowVolBias: 0,
        preferCoreEtf: false,
        warnings: [],
      };
  }
}

// ============================================================
//  Objective tilts
// ============================================================

export interface ObjectiveTilt {
  /** Extra gewicht per factor (0..1). */
  factorWeights: Partial<FactorSubScores>;
  /** Minimum sub-score eisen per factor (0..100). */
  minRequirements: Partial<FactorSubScores>;
  /** Vereis een positief dividend-signaal (gecheckt via FactorScore). */
  requireDividend?: boolean;
  /** Vermijd posities met zeer hoge volatiliteit (lowVol < threshold). */
  maxVolatility?: number;
}

export function objectiveTilt(
  objective: InvestmentObjective | null | undefined,
): ObjectiveTilt {
  switch (objective) {
    case "GROWTH":
      return {
        factorWeights: { momentum: 0.35, quality: 0.3, value: 0.15, lowVol: 0.2 },
        minRequirements: {},
      };
    case "FIRE":
      return {
        factorWeights: { momentum: 0.35, quality: 0.35, value: 0.1, lowVol: 0.2 },
        minRequirements: { quality: 50 },
      };
    case "INCOME":
      return {
        factorWeights: {
          quality: 0.3,
          value: 0.25,
          lowVol: 0.25,
          momentum: 0.1,
          dividend: 0.2,
        },
        minRequirements: {},
        requireDividend: true,
      };
    case "CAPITAL_PRESERVATION":
      return {
        factorWeights: {
          quality: 0.4,
          lowVol: 0.35,
          value: 0.15,
          momentum: 0.1,
        },
        minRequirements: { lowVol: 45 },
        maxVolatility: 0.3,
      };
    case "RETIREMENT":
      return {
        factorWeights: {
          quality: 0.35,
          value: 0.25,
          lowVol: 0.25,
          momentum: 0.15,
          dividend: 0.1,
        },
        minRequirements: { quality: 45 },
      };
    case "BALANCED":
    case "CUSTOM":
    default:
      return {
        factorWeights: {
          quality: 0.3,
          value: 0.25,
          momentum: 0.25,
          lowVol: 0.2,
        },
        minRequirements: {},
      };
  }
}
