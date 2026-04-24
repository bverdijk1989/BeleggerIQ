import type { HistoricalPoint } from "@/types/market";

import {
  classify,
  continuousRiskScore,
  type CoreRiskClass,
  type RiskThresholds,
} from "./thresholds";

/**
 * Drawdown-module. Proxy-implementatie op basis van historische closes:
 *   max drawdown = min(price_t / peak_≤t - 1) over de reeks.
 * Retourneert een negatief getal (bv. -0.23 voor 23% terugval). Absolute
 * waarde wordt voor classificatie gebruikt.
 */

export function computeMaxDrawdown(
  history: HistoricalPoint[] | null | undefined,
): number {
  if (!history || history.length === 0) return 0;
  let peak = -Infinity;
  let maxDd = 0;
  for (const point of history) {
    const price = point.adjustedClose ?? point.close;
    if (!Number.isFinite(price)) continue;
    if (price > peak) peak = price;
    if (peak > 0) {
      const dd = price / peak - 1;
      if (dd < maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

export function classifyDrawdown(
  maxDrawdown: number | null | undefined,
  thresholds: RiskThresholds,
): CoreRiskClass {
  if (
    maxDrawdown === null ||
    maxDrawdown === undefined ||
    !Number.isFinite(maxDrawdown)
  ) {
    return "moderate";
  }
  return classify(Math.abs(maxDrawdown), thresholds.drawdown);
}

export function drawdownRiskScore(
  maxDrawdown: number | null | undefined,
  thresholds: RiskThresholds,
): number {
  if (
    maxDrawdown === null ||
    maxDrawdown === undefined ||
    !Number.isFinite(maxDrawdown)
  ) {
    return 50;
  }
  return continuousRiskScore(Math.abs(maxDrawdown), thresholds.drawdown);
}
