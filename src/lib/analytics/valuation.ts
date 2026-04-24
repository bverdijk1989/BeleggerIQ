import type { AllocationSlice } from "@/types/allocation";
import type { Currency, ISODateString } from "@/types/common";
import type { Holding } from "@/types/portfolio";
import type { PositionBreakdown } from "@/types/summary";

/**
 * Valuation-laag: converteert een Holding naar een genormaliseerde
 * `HoldingValuation` in een gekozen base currency. Pure, sync en veilig
 * voor ontbrekende data. De async enrichment-service bouwt deze objecten
 * o.b.v. live market data; de sync fallback gebruikt wat op de Holding zelf staat.
 */

export type PriceSource = "market" | "lastKnown" | "costBasis";

export interface HoldingValuation {
  holding: Holding;
  /** Prijs per stuk in de bron-currency van de holding. */
  unitPrice: number;
  /** Totale positiewaarde in de bron-currency. */
  marketValue: number;
  /** Totale positiewaarde in base currency. */
  marketValueBase: number;
  /** Kostprijs maal aantal, in base currency. */
  costBasisBase: number;
  /** marketValueBase - costBasisBase. */
  unrealizedPnlBase: number;
  /** Rate om van source → base te converteren. */
  fxRate: number;
  priceSource: PriceSource;
  asOf: ISODateString;
}

export interface ValueHoldingOptions {
  baseCurrency: Currency;
  /** Live prijs uit de quotes-service. Als afwezig vallen we terug op de Holding. */
  unitPrice?: number;
  fxRate?: number;
  priceSource?: PriceSource;
  asOf?: ISODateString;
}

/**
 * Bouwt één valuation. Tolerant voor `undefined`/`null` prijsinput:
 *  1. gebruik `unitPrice` als die gegeven is,
 *  2. anders `holding.currentPrice`,
 *  3. anders `holding.avgCostPrice`,
 *  4. en als laatste redmiddel 0.
 */
export function valueHolding(
  holding: Holding,
  options: ValueHoldingOptions,
): HoldingValuation {
  const { price, source } = resolvePrice(holding, options);
  const fxRate = Number.isFinite(options.fxRate) ? (options.fxRate as number) : 1;
  const quantity = Number.isFinite(holding.quantity) ? holding.quantity : 0;

  const marketValue = price * quantity;
  const marketValueBase = marketValue * fxRate;
  const costBasisBase = (holding.avgCostPrice ?? 0) * quantity * fxRate;
  const unrealizedPnlBase = marketValueBase - costBasisBase;

  return {
    holding,
    unitPrice: price,
    marketValue,
    marketValueBase,
    costBasisBase,
    unrealizedPnlBase,
    fxRate,
    priceSource: options.priceSource ?? source,
    asOf: options.asOf ?? new Date().toISOString(),
  };
}

function resolvePrice(
  holding: Holding,
  options: ValueHoldingOptions,
): { price: number; source: PriceSource } {
  if (options.unitPrice !== undefined && Number.isFinite(options.unitPrice)) {
    return { price: options.unitPrice, source: "market" };
  }
  if (
    holding.currentPrice !== undefined &&
    holding.currentPrice !== null &&
    Number.isFinite(holding.currentPrice)
  ) {
    return { price: holding.currentPrice, source: "lastKnown" };
  }
  if (Number.isFinite(holding.avgCostPrice)) {
    return { price: holding.avgCostPrice, source: "costBasis" };
  }
  return { price: 0, source: "costBasis" };
}

// ============================================================
//  Pure aggregates op valuations
// ============================================================

export function calculateHoldingValue(valuation: HoldingValuation): number {
  return valuation.marketValueBase;
}

export function calculatePortfolioValue(
  valuations: HoldingValuation[],
  cashBalance = 0,
): number {
  return (
    valuations.reduce((sum, v) => sum + v.marketValueBase, 0) +
    Math.max(0, cashBalance)
  );
}

export function calculateTopHoldings(
  valuations: HoldingValuation[],
  totalValue: number,
  topN = 5,
): PositionBreakdown[] {
  if (totalValue <= 0) return [];
  return valuations
    .slice()
    .sort((a, b) => b.marketValueBase - a.marketValueBase)
    .slice(0, Math.max(0, topN))
    .map((v) => ({
      ticker: v.holding.ticker,
      name: v.holding.name,
      marketValue: v.marketValueBase,
      weight: v.marketValueBase / totalValue,
      unrealizedPnl: v.unrealizedPnlBase,
      unrealizedPnlPct:
        v.costBasisBase > 0 ? v.unrealizedPnlBase / v.costBasisBase : 0,
    }));
}

export function calculateCurrencyAllocation(
  valuations: HoldingValuation[],
  totalValue: number,
  cashBalance = 0,
  cashCurrency?: Currency,
): AllocationSlice[] {
  if (totalValue <= 0) return [];

  const buckets = new Map<string, number>();
  for (const v of valuations) {
    const curr = v.holding.currency;
    buckets.set(curr, (buckets.get(curr) ?? 0) + v.marketValueBase);
  }
  if (cashBalance > 0 && cashCurrency) {
    buckets.set(
      cashCurrency,
      (buckets.get(cashCurrency) ?? 0) + cashBalance,
    );
  }

  return Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value, weight: value / totalValue }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Generieke allocatie-aggregator. Label-functie mag `null`/`undefined`
 * retourneren; die vallen in een "Onbekend" bucket zodat UI altijd een
 * sluitende verdeling ziet.
 */
export function aggregateAllocation(
  valuations: HoldingValuation[],
  keyFn: (v: HoldingValuation) => string | null | undefined,
  totalValue: number,
  fallbackLabel = "Onbekend",
): AllocationSlice[] {
  if (totalValue <= 0) return [];
  const buckets = new Map<string, number>();
  for (const v of valuations) {
    const key = keyFn(v) ?? fallbackLabel;
    buckets.set(key, (buckets.get(key) ?? 0) + v.marketValueBase);
  }
  return Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value, weight: value / totalValue }))
    .sort((a, b) => b.value - a.value);
}
