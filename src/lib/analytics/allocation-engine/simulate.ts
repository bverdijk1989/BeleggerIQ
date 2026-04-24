import type {
  AllocationRecommendation,
  PostBuySimulation,
} from "@/types/allocation";
import type { Currency } from "@/types/common";

import type { HoldingValuation } from "../valuation";

/**
 * Post-buy simulator. Neemt huidige valuations + voorgestelde koop-bedragen
 * en projecteert de portefeuille-aggregaten. Pure, sync.
 *
 * Aannames:
 *  - Koopbedragen (suggestedAmount) zijn in base currency en worden
 *    volledig opgenomen als extra marketValueBase van de betreffende
 *    ticker (eventueel een nieuwe positie).
 *  - Cash-balance daalt met de som van de koopbedragen.
 */

export interface SimulatePostBuyInput {
  valuations: HoldingValuation[];
  totalValue: number;
  baseCurrency: Currency;
  cashBalance: number;
  recommendations: AllocationRecommendation[];
  /** Optionele ticker → (sector, currency) hint voor nieuwe posities. */
  newPositionHints?: Map<string, { sector?: string | null; currency: Currency }>;
}

export function simulatePostBuyPortfolio(
  input: SimulatePostBuyInput,
): PostBuySimulation {
  const buyAmounts = new Map<string, number>();
  for (const rec of input.recommendations) {
    if (rec.suggestedAmount <= 0) continue;
    buyAmounts.set(
      rec.ticker.toUpperCase(),
      (buyAmounts.get(rec.ticker.toUpperCase()) ?? 0) + rec.suggestedAmount,
    );
  }

  // Pas bestaande posities aan.
  let totalPositionsBase = 0;
  const projectedByTicker = new Map<
    string,
    { base: number; sector: string | null; currency: Currency }
  >();

  for (const v of input.valuations) {
    const ticker = v.holding.ticker.toUpperCase();
    const extra = buyAmounts.get(ticker) ?? 0;
    const base = v.marketValueBase + extra;
    totalPositionsBase += base;
    projectedByTicker.set(ticker, {
      base,
      sector: v.holding.sector ?? null,
      currency: v.holding.currency,
    });
    buyAmounts.delete(ticker);
  }

  // Voeg nieuwe posities toe (niet in huidige valuations).
  for (const [ticker, extra] of buyAmounts) {
    if (extra <= 0) continue;
    const hint = input.newPositionHints?.get(ticker);
    projectedByTicker.set(ticker, {
      base: extra,
      sector: hint?.sector ?? null,
      currency: hint?.currency ?? input.baseCurrency,
    });
    totalPositionsBase += extra;
  }

  const spent = Array.from(
    input.recommendations.reduce((sum, r) => sum + Math.max(0, r.suggestedAmount), 0) ===
      0
      ? []
      : input.recommendations,
  ).reduce((sum, r) => sum + Math.max(0, r.suggestedAmount), 0);

  const projectedCashBalance = Math.max(0, input.cashBalance - spent);
  const projectedTotalValue = totalPositionsBase + projectedCashBalance;

  // Top position + sectors + foreign exposure.
  let largestWeight = 0;
  const sectorTotals = new Map<string, number>();
  let foreignBase = 0;
  for (const [, info] of projectedByTicker) {
    const weight =
      projectedTotalValue > 0 ? info.base / projectedTotalValue : 0;
    if (weight > largestWeight) largestWeight = weight;
    const sectorKey = info.sector ?? "Onbekend";
    sectorTotals.set(sectorKey, (sectorTotals.get(sectorKey) ?? 0) + info.base);
    if (info.currency !== input.baseCurrency) {
      foreignBase += info.base;
    }
  }

  let topSector: { label: string; weight: number } | undefined;
  if (projectedTotalValue > 0 && sectorTotals.size > 0) {
    let bestLabel = "";
    let bestValue = -Infinity;
    for (const [label, value] of sectorTotals) {
      if (value > bestValue) {
        bestLabel = label;
        bestValue = value;
      }
    }
    if (bestLabel) {
      topSector = {
        label: bestLabel,
        weight: bestValue / projectedTotalValue,
      };
    }
  }

  return {
    projectedTotalValue,
    projectedCashBalance,
    projectedPositionCount: projectedByTicker.size,
    projectedLargestPositionWeight: largestWeight,
    projectedForeignCurrencyExposure:
      projectedTotalValue > 0 ? foreignBase / projectedTotalValue : 0,
    projectedTopSector: topSector,
  };
}
