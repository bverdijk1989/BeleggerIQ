import type { AllocationSlice } from "@/types/allocation";
import type { Currency } from "@/types/common";

import { aggregateAllocation } from "../valuation";
import type { HoldingValuation } from "../valuation";

import {
  classify,
  continuousRiskScore,
  type CoreRiskClass,
  type RiskThresholds,
} from "./thresholds";

/**
 * Currency-module. Berekent valuta-exposure en de per-positie bijdrage
 * aan valuta-risico (positiegewicht als die positie in een vreemde valuta staat).
 */

export function computeForeignCurrencyExposure(
  valuations: HoldingValuation[],
  totalValue: number,
  baseCurrency: Currency,
): number {
  if (totalValue <= 0) return 0;
  const foreign = valuations
    .filter((v) => v.holding.currency !== baseCurrency)
    .reduce((sum, v) => sum + v.marketValueBase, 0);
  return foreign / totalValue;
}

export function computeCurrencyAllocation(
  valuations: HoldingValuation[],
  totalValue: number,
): AllocationSlice[] {
  return aggregateAllocation(valuations, (v) => v.holding.currency, totalValue);
}

/**
 * Per-positie bijdrage aan valuta-risico. 0 als de positie in base currency
 * staat, anders het gewicht van de positie.
 */
export function currencyContribution(
  valuation: HoldingValuation,
  totalValue: number,
  baseCurrency: Currency,
): number {
  if (totalValue <= 0 || valuation.holding.currency === baseCurrency) return 0;
  return valuation.marketValueBase / totalValue;
}

export function classifyForeignCurrencyExposure(
  exposure: number,
  thresholds: RiskThresholds,
): CoreRiskClass {
  return classify(exposure, thresholds.foreignCurrencyExposure);
}

export function currencyRiskScore(
  exposure: number,
  thresholds: RiskThresholds,
): number {
  return continuousRiskScore(exposure, thresholds.foreignCurrencyExposure);
}
