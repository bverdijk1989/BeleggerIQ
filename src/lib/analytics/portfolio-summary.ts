import type { Currency } from "@/types/common";
import type { Holding, Portfolio } from "@/types/portfolio";
import type { PortfolioSummary } from "@/types/summary";

import {
  aggregateAllocation,
  calculateCurrencyAllocation,
  calculatePortfolioValue,
  calculateTopHoldings,
  valueHolding,
  type HoldingValuation,
} from "./valuation";

/**
 * Portfolio summary orchestrator. Hier vallen pure berekeningen samen die
 * werken op `HoldingValuation[]`. De async data-verrijking leeft in
 * `./enrichment`; de sync wrapper aan het eind behoudt het oude contract
 * (Portfolio in → PortfolioSummary uit, zonder I/O) voor tests en callers
 * die geen live quotes nodig hebben.
 */

export function computePositionValue(holding: Holding): number {
  const price = holding.currentPrice ?? holding.avgCostPrice;
  return Number(price) * Number(holding.quantity);
}

export function computePositionCost(holding: Holding): number {
  return Number(holding.avgCostPrice) * Number(holding.quantity);
}

export interface PortfolioSummaryFromValuationsOptions {
  cashBalance?: number;
  cashCurrency?: Currency;
  topN?: number;
}

/**
 * Canonieke builder: werkt op verrijkte valuations en produceert een
 * volledige `PortfolioSummary` inclusief currency-allocatie en grootste positie.
 */
export function computePortfolioSummaryFromValuations(
  portfolioId: string,
  baseCurrency: Currency,
  valuations: HoldingValuation[],
  options: PortfolioSummaryFromValuationsOptions = {},
): PortfolioSummary {
  const cashBalance = Math.max(0, options.cashBalance ?? 0);
  const cashCurrency = options.cashCurrency ?? baseCurrency;
  const topN = options.topN ?? 5;

  const totalValue = calculatePortfolioValue(valuations, cashBalance);
  const totalCost = valuations.reduce((sum, v) => sum + v.costBasisBase, 0);
  const unrealizedPnl = totalValue - cashBalance - totalCost;
  const unrealizedPnlPct = totalCost === 0 ? 0 : unrealizedPnl / totalCost;

  const topPositions = calculateTopHoldings(valuations, totalValue, topN);
  const largestPosition = topPositions[0] ?? null;

  return {
    portfolioId,
    baseCurrency,
    totalValue,
    totalCost,
    cashBalance,
    unrealizedPnl,
    unrealizedPnlPct,
    positionCount: valuations.length,
    topPositions,
    largestPosition,
    allocationByAssetClass: aggregateAllocation(
      valuations,
      (v) => v.holding.assetClass,
      totalValue,
    ),
    allocationBySector: aggregateAllocation(
      valuations,
      (v) => v.holding.sector ?? null,
      totalValue,
    ),
    allocationByRegion: aggregateAllocation(
      valuations,
      (v) => v.holding.region ?? null,
      totalValue,
    ),
    allocationByCurrency: calculateCurrencyAllocation(
      valuations,
      totalValue,
      cashBalance,
      cashCurrency,
    ),
  };
}

/**
 * Backward-compatible wrapper. Bouwt implicite valuations met FX = 1
 * (source-currency == base-currency) en roept dezelfde canonieke logica aan.
 * Callers zonder live data krijgen een deterministische summary.
 */
export function computePortfolioSummary(
  portfolio: Portfolio,
  options: { cashBalance?: number; topN?: number } = {},
): PortfolioSummary {
  const asOf = new Date().toISOString();
  const valuations = portfolio.holdings.map((holding) =>
    valueHolding(holding, {
      baseCurrency: portfolio.baseCurrency,
      fxRate: 1,
      asOf,
    }),
  );
  return computePortfolioSummaryFromValuations(
    portfolio.id,
    portfolio.baseCurrency,
    valuations,
    { cashBalance: options.cashBalance, topN: options.topN },
  );
}
