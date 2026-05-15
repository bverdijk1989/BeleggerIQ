import { deriveHoldingAction } from "@/lib/analytics/holding-action";
import type { HoldingValuation } from "@/lib/analytics/valuation";
import type { PortfolioSummary } from "@/types/summary";

import type { HoldingRow } from "./components/holdings-table";

/**
 * Bouwt serialiseerbare tabelrijen uit de analytics-output.
 * Bewust los van de page zodat tests en andere consumers dezelfde
 * transformatie kunnen gebruiken.
 */
export function buildHoldingRows(
  summary: PortfolioSummary,
  valuations: HoldingValuation[],
): HoldingRow[] {
  const totalValue = summary.totalValue;
  return valuations
    .slice()
    .sort((a, b) => b.marketValueBase - a.marketValueBase)
    .map((valuation) => toRow(valuation, totalValue));
}

function toRow(valuation: HoldingValuation, totalValue: number): HoldingRow {
  const weight = totalValue > 0 ? valuation.marketValueBase / totalValue : 0;
  const unrealizedPnlPct =
    valuation.costBasisBase > 0
      ? valuation.unrealizedPnlBase / valuation.costBasisBase
      : 0;

  const factor = valuation.holding.factorScore;
  const composite = factor?.composite ?? null;
  const confidence = factor?.confidence ?? null;
  const action = deriveHoldingAction({
    composite,
    confidence,
    currentWeight: weight,
    targetWeight: valuation.holding.targetWeight ?? null,
  });

  return {
    id: valuation.holding.id,
    name: valuation.holding.name,
    ticker: valuation.holding.ticker,
    assetClass: valuation.holding.assetClass,
    sector: valuation.holding.sector,
    quantity: valuation.holding.quantity,
    unitPrice: valuation.unitPrice,
    sourceCurrency: valuation.holding.currency,
    marketValueBase: valuation.marketValueBase,
    unrealizedPnlBase: valuation.unrealizedPnlBase,
    unrealizedPnlPct,
    weight,
    scores: {
      quality: factor?.subScores.quality ?? null,
      value: factor?.subScores.value ?? null,
      momentum: factor?.subScores.momentum ?? null,
      composite,
    },
    rationales: factor?.rationales ?? null,
    action: action.action,
    actionRationale: action.rationale,
    editable: {
      avgCostPrice: valuation.holding.avgCostPrice,
      region: valuation.holding.region ?? null,
      isin: valuation.holding.isin ?? null,
    },
  };
}
