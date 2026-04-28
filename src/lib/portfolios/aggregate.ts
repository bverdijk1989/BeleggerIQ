/**
 * Aggregate-view voor "alle portefeuilles".
 *
 * Pure functie: krijgt een lijst `Portfolio` (incl. holdings) en
 * berekent:
 *
 *   - **totalValue**         som van marktwaarde over alle holdings
 *                            (currentPrice × quantity); valt terug op
 *                            avgCostPrice × quantity wanneer geen koers.
 *   - **totalCost**          som van avgCostPrice × quantity
 *   - **unrealizedPnl**      totalValue − totalCost
 *   - **byPortfolio**        per-portfolio breakdown met value + weight%
 *
 * Geen FX-conversie: we gebruiken de portefeuille-base-currency. Wanneer
 * twee portefeuilles in verschillende currencies staan, geeft deze
 * functie het bedrag in de PRIMAIRE base — caller is verantwoordelijk
 * voor explicit FX. Acceptabel voor v1: de meeste NL-users hebben EUR
 * over de hele linie.
 */

import type { Portfolio } from "@/types/portfolio";

export interface AggregatePerPortfolio {
  id: string;
  name: string;
  isPrimary: boolean;
  holdings: number;
  totalValue: number;
  totalCost: number;
  unrealizedPnl: number;
  weight: number; // fractie van totalValue
  baseCurrency: string;
}

export interface AggregateResult {
  totalValue: number;
  totalCost: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  baseCurrency: string;
  byPortfolio: AggregatePerPortfolio[];
  /** Aantal portefeuilles met afwijkende base-currency. Niet 0 → UI moet waarschuwen. */
  fxMismatchCount: number;
}

function valueOf(holding: { quantity: number; currentPrice?: number | null; avgCostPrice: number }): number {
  const price = holding.currentPrice ?? holding.avgCostPrice;
  return price * holding.quantity;
}

function costOf(holding: { quantity: number; avgCostPrice: number }): number {
  return holding.avgCostPrice * holding.quantity;
}

export function aggregatePortfolios(
  portfolios: Portfolio[],
): AggregateResult {
  const baseCurrency =
    portfolios.find((p) => p.isPrimary)?.baseCurrency ??
    portfolios[0]?.baseCurrency ??
    "EUR";

  let fxMismatchCount = 0;
  const perPortfolio: AggregatePerPortfolio[] = portfolios.map((p) => {
    if (p.baseCurrency !== baseCurrency) fxMismatchCount += 1;
    const totalValue = p.holdings.reduce((s, h) => s + valueOf(h), 0);
    const totalCost = p.holdings.reduce((s, h) => s + costOf(h), 0);
    return {
      id: p.id,
      name: p.name,
      isPrimary: p.isPrimary,
      holdings: p.holdings.length,
      totalValue,
      totalCost,
      unrealizedPnl: totalValue - totalCost,
      weight: 0, // gevuld in de tweede pass
      baseCurrency: p.baseCurrency,
    };
  });

  const totalValue = perPortfolio.reduce((s, p) => s + p.totalValue, 0);
  const totalCost = perPortfolio.reduce((s, p) => s + p.totalCost, 0);

  if (totalValue > 0) {
    for (const p of perPortfolio) p.weight = p.totalValue / totalValue;
  }

  // Sorteer op grootte desc.
  perPortfolio.sort((a, b) => b.totalValue - a.totalValue);

  const unrealizedPnl = totalValue - totalCost;
  const unrealizedPnlPct = totalCost > 0 ? unrealizedPnl / totalCost : 0;

  return {
    totalValue,
    totalCost,
    unrealizedPnl,
    unrealizedPnlPct,
    baseCurrency,
    byPortfolio: perPortfolio,
    fxMismatchCount,
  };
}
