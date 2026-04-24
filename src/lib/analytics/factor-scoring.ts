import type { FactorScore, FactorWeights } from "@/types/factor";
import type { Holding } from "@/types/portfolio";

import {
  DEFAULT_FACTOR_WEIGHTS,
  scoreFactors,
} from "./factors/composite";

/**
 * Legacy-facing barrel: behoudt het oudere `scoreHoldings([...])` contract
 * dat een platte lijst `FactorScore` retourneerde zonder fundamentals-input.
 * Nieuwe code gebruikt `@/lib/analytics/factors` direct.
 */

export { DEFAULT_FACTOR_WEIGHTS };

export function scoreHoldings(
  holdings: Holding[],
  weights: FactorWeights = DEFAULT_FACTOR_WEIGHTS,
): FactorScore[] {
  // Zonder fundamentals en prijshistorie valt elke sub-score terug op 50
  // (neutraal). Use `@/lib/analytics/factors/composite#scoreFactors` met
  // rijkere inputs voor een echte score.
  return holdings.map((h) =>
    scoreFactors(
      {
        ticker: h.ticker,
        fundamentals: null,
        priceHistory: null,
        volatility: h.volatility ?? null,
        beta: h.beta ?? null,
      },
      weights,
    ),
  );
}
