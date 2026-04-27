import type { RebalanceQuantityPlan } from "@/types/rebalance";

import type { ActionDecision } from "./types";

/**
 * Action-engine quantity helper.
 *
 * Beslist hoeveel stuks/euro's per actie. Voor TRIM/SELL hergebruiken
 * we de bestaande `RebalanceQuantityPlan` (uit rebalance-engine) zodat
 * de UI op /risico en op het dashboard exact dezelfde getallen toont.
 *
 * Voor BUY hebben we een eigen rule:
 *   - `desiredAmount = min(cashAvailable × maxCashShare, monthlyContribution × buyMultiplier, targetGap × totalValue)`
 *   - `sharesToBuy = floor(desiredAmount / unitPrice)` (of `round(4)` bij fractional)
 *   - `amount = sharesToBuy × unitPrice`
 *
 * Pure functie. Geen I/O, geen externe state.
 */

const DEFAULT_BUY_MULTIPLIER = 1.5; // 1.5× monthly als upper bound
const DEFAULT_MAX_CASH_SHARE = 0.5; // gebruik max 50% cash voor één positie
const FRACTIONAL_DECIMALS = 4;

export interface ResolveQuantityInput {
  action: ActionDecision;
  unitPriceBase: number | null;
  marketValueBase: number;
  /** Cash beschikbaar in base currency. */
  cashAvailable: number;
  monthlyContribution?: number | null;
  /** Doel-weging die de positie zou moeten hebben (fractie). Null = geen target. */
  targetWeight: number | null;
  totalValue: number;
  /** Reeds berekende quantity uit rebalance-engine (voor TRIM/SELL). */
  existingPlan?: RebalanceQuantityPlan | null;
  allowFractionalShares?: boolean;
}

export interface ResolveQuantityResult {
  sharesToBuy: number;
  sharesToSell: number;
  amount: number;
  /** True als we onvoldoende data hadden om een quantity te bepalen. */
  insufficientData: boolean;
  warnings: string[];
}

export function resolveActionQuantity(
  input: ResolveQuantityInput,
): ResolveQuantityResult {
  const warnings: string[] = [];

  switch (input.action) {
    case "DO_NOTHING":
    case "HOLD":
      return zero(warnings);

    case "TRIM":
    case "SELL":
      return resolveSellQuantity(input, warnings);

    case "BUY":
      return resolveBuyQuantity(input, warnings);

    default:
      return zero(warnings);
  }
}

// ============================================================
//  SELL / TRIM — leun op bestaande RebalanceQuantityPlan
// ============================================================

function resolveSellQuantity(
  input: ResolveQuantityInput,
  warnings: string[],
): ResolveQuantityResult {
  const plan = input.existingPlan;
  if (plan && plan.currentPrice !== null) {
    return {
      sharesToBuy: 0,
      sharesToSell: plan.sharesToSell,
      amount: plan.amountToSell,
      insufficientData: false,
      warnings: [...warnings, ...plan.warnings],
    };
  }

  // Geen plan → ruwe schatting o.b.v. excess-weight + unitPrice
  const price = input.unitPriceBase;
  if (price === null || price <= 0) {
    warnings.push("Onvoldoende koersdata om aantal stuks te berekenen.");
    return {
      sharesToBuy: 0,
      sharesToSell: 0,
      amount: 0,
      insufficientData: true,
      warnings,
    };
  }
  if (input.targetWeight === null || input.totalValue <= 0) {
    warnings.push("Geen targetweging — afbouw-aantal niet bepaalbaar.");
    return {
      sharesToBuy: 0,
      sharesToSell: 0,
      amount: 0,
      insufficientData: true,
      warnings,
    };
  }

  const targetValue = input.totalValue * input.targetWeight;
  const excess = Math.max(0, input.marketValueBase - targetValue);
  const rawShares = excess / price;
  const sharesToSell = input.allowFractionalShares
    ? round(rawShares, FRACTIONAL_DECIMALS)
    : Math.floor(rawShares);
  return {
    sharesToBuy: 0,
    sharesToSell,
    amount: sharesToSell * price,
    insufficientData: false,
    warnings,
  };
}

// ============================================================
//  BUY — combineer cash + monthly + target-gap
// ============================================================

function resolveBuyQuantity(
  input: ResolveQuantityInput,
  warnings: string[],
): ResolveQuantityResult {
  const price = input.unitPriceBase;
  if (price === null || price <= 0) {
    warnings.push("Geen koers — BUY-aantal niet bepaalbaar.");
    return {
      sharesToBuy: 0,
      sharesToSell: 0,
      amount: 0,
      insufficientData: true,
      warnings,
    };
  }
  if (input.cashAvailable <= 0) {
    warnings.push("Geen cash beschikbaar voor BUY.");
    return {
      sharesToBuy: 0,
      sharesToSell: 0,
      amount: 0,
      insufficientData: true,
      warnings,
    };
  }

  const monthly = (input.monthlyContribution ?? 0) > 0
    ? (input.monthlyContribution as number) * DEFAULT_BUY_MULTIPLIER
    : Number.POSITIVE_INFINITY;
  const cashCap = input.cashAvailable * DEFAULT_MAX_CASH_SHARE;
  const targetGapAmount =
    input.targetWeight !== null && input.totalValue > 0
      ? Math.max(
          0,
          input.totalValue * input.targetWeight - input.marketValueBase,
        )
      : Number.POSITIVE_INFINITY;

  const desiredAmount = Math.min(monthly, cashCap, targetGapAmount);
  if (!Number.isFinite(desiredAmount) || desiredAmount <= 0) {
    return {
      sharesToBuy: 0,
      sharesToSell: 0,
      amount: 0,
      insufficientData: false,
      warnings,
    };
  }

  const rawShares = desiredAmount / price;
  const sharesToBuy = input.allowFractionalShares
    ? round(rawShares, FRACTIONAL_DECIMALS)
    : Math.floor(rawShares);
  if (sharesToBuy <= 0) {
    warnings.push("Bedrag te klein voor één hele aandeel; overweeg fractional shares.");
    return {
      sharesToBuy: 0,
      sharesToSell: 0,
      amount: 0,
      insufficientData: false,
      warnings,
    };
  }
  return {
    sharesToBuy,
    sharesToSell: 0,
    amount: sharesToBuy * price,
    insufficientData: false,
    warnings,
  };
}

// ============================================================
//  Helpers
// ============================================================

function zero(warnings: string[]): ResolveQuantityResult {
  return {
    sharesToBuy: 0,
    sharesToSell: 0,
    amount: 0,
    insufficientData: false,
    warnings,
  };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
