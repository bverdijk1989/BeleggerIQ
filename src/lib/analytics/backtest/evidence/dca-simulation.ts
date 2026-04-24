import type { EquityPoint } from "@/types/backtest";

import { clamp, hasCompleteBenchmark, monthlyReturns } from "./shared";
import type { DcaContributionSimulation } from "./types";

/**
 * Monthly contribution simulation (dollar-cost averaging).
 *
 * Draait op dezelfde maandelijkse returns als de backtest: we tellen
 * `monthlyContribution` op aan het begin van elke maand en laten die
 * bijdrage mee-returnen met de strategie-return van die maand. Zo
 * krijgt de gebruiker een antwoord op "wat gebeurt er als ik €500/m
 * blijf inleggen?" — zelfs als de gepubliceerde backtest eenmalig inleg
 * gebruikt.
 *
 * Implementatie:
 *   - Startwaarde = `initialCapital` (default 0).
 *   - Voor elke maand i ≥ 1: `value = (value + contribution) * (1 + return_i)`.
 *   - Benchmark-DCA volgt dezelfde logica op de benchmark-returns.
 *
 * Money-weighted return wordt berekend via binary-search op IRR:
 *   NPV(r) = Σ cashflow_t / (1+r/12)^t = 0
 * Waarbij cashflows = -contribution per maand + finalValue op einde.
 */

export interface ComputeDcaInput {
  points: EquityPoint[];
  initialCapital: number;
  monthlyContribution: number;
}

export function computeDcaSimulation(
  input: ComputeDcaInput,
): DcaContributionSimulation {
  const { points } = input;
  const initial = sanitize(input.initialCapital, 0);
  const contribution = sanitize(input.monthlyContribution, 0);

  if (points.length < 2) {
    return {
      initialCapital: initial,
      monthlyContribution: contribution,
      months: 0,
      totalContributed: initial,
      finalValue: initial,
      benchmarkFinalValue: null,
      moneyWeightedReturn: 0,
      benchmarkMoneyWeightedReturn: null,
      profit: 0,
      benchmarkProfit: null,
    };
  }

  const stratReturns = monthlyReturns(points.map((p) => p.value));
  const benchReturns = hasCompleteBenchmark(points)
    ? monthlyReturns(points.map((p) => p.benchmark as number))
    : null;

  const months = stratReturns.length;
  let stratValue = initial;
  let benchValue = initial;
  let totalContributed = initial;
  const cashflows: number[] = [-initial];

  for (let i = 0; i < months; i++) {
    stratValue = (stratValue + contribution) * (1 + stratReturns[i]!);
    if (benchReturns !== null) {
      benchValue = (benchValue + contribution) * (1 + benchReturns[i]!);
    }
    totalContributed += contribution;
    cashflows.push(-contribution);
  }

  // De laatste cashflow vervangen we door finalValue (lift-out op einde).
  const stratCashflows = [...cashflows];
  stratCashflows[stratCashflows.length - 1] =
    (stratCashflows[stratCashflows.length - 1] ?? 0) + stratValue;
  const mwrStrategy = solveIrrMonthly(stratCashflows);

  let mwrBenchmark: number | null = null;
  if (benchReturns !== null) {
    const benchCashflows = [...cashflows];
    benchCashflows[benchCashflows.length - 1] =
      (benchCashflows[benchCashflows.length - 1] ?? 0) + benchValue;
    mwrBenchmark = solveIrrMonthly(benchCashflows);
  }

  return {
    initialCapital: initial,
    monthlyContribution: contribution,
    months,
    totalContributed,
    finalValue: stratValue,
    benchmarkFinalValue: benchReturns !== null ? benchValue : null,
    moneyWeightedReturn: mwrStrategy,
    benchmarkMoneyWeightedReturn: mwrBenchmark,
    profit: stratValue - totalContributed,
    benchmarkProfit: benchReturns !== null ? benchValue - totalContributed : null,
  };
}

// ============================================================
//  IRR — bisection
// ============================================================

/**
 * IRR voor maandelijkse cashflows. Retourneert de **annualised** rate.
 *
 * Gebruikt bisection op een [-0.99, 1.0] interval; genoeg range voor
 * realistische DCA-scenario's. Bij geen teken-wissel retourneert 0.
 */
function solveIrrMonthly(cashflows: number[]): number {
  if (cashflows.length < 2) return 0;

  const npv = (rateMonthly: number): number => {
    let total = 0;
    for (let t = 0; t < cashflows.length; t++) {
      const discount = Math.pow(1 + rateMonthly, t);
      if (!Number.isFinite(discount) || discount <= 0) return Number.NaN;
      total += cashflows[t]! / discount;
    }
    return total;
  };

  let lo = -0.99 / 12; // per-maand grens (≈ -99% / jaar)
  let hi = 1.0 / 12; // ~12× per jaar upper bound
  let npvLo = npv(lo);
  let npvHi = npv(hi);

  // Zoek een upper bound met positieve NPV; anders -> 0 (geen IRR).
  let expandAttempts = 0;
  while (Number.isFinite(npvLo) && Number.isFinite(npvHi) && npvLo * npvHi > 0) {
    if (expandAttempts >= 6) return 0;
    hi *= 2;
    npvHi = npv(hi);
    expandAttempts++;
  }
  if (!Number.isFinite(npvLo) || !Number.isFinite(npvHi)) return 0;
  if (npvLo * npvHi > 0) return 0;

  for (let iter = 0; iter < 80; iter++) {
    const mid = (lo + hi) / 2;
    const npvMid = npv(mid);
    if (!Number.isFinite(npvMid)) return 0;
    if (Math.abs(npvMid) < 1e-6) {
      lo = mid;
      break;
    }
    if (npvMid * npvLo < 0) {
      hi = mid;
      npvHi = npvMid;
    } else {
      lo = mid;
      npvLo = npvMid;
    }
  }
  const rateMonthly = (lo + hi) / 2;
  const annualised = Math.pow(1 + rateMonthly, 12) - 1;
  return clamp(annualised, -0.99, 10);
}

function sanitize(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value < 0) return fallback;
  return value;
}
