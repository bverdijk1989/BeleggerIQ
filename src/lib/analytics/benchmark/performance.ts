import type { ISODateString } from "@/types/common";
import type { HistoricalPoint } from "@/types/market";

import {
  annualizedTrackingError,
  excessReturns,
  informationRatio,
} from "./tracking-error";
import type {
  BenchmarkDefinition,
  BenchmarkPerformance,
  BenchmarkSeriesPoint,
} from "./types";

/**
 * Performance-engine: berekent portfolio vs benchmark return + alpha +
 * tracking-error op basis van twee gelijk-gepacte waarderingsreeksen.
 *
 * Pure functie. Caller is verantwoordelijk voor het op-elkaar-passen
 * van de twee reeksen (zelfde maand-keys, sorted asc) — `alignSeries`
 * helpt daarbij.
 */

export interface PortfolioValuePoint {
  date: ISODateString;
  totalValue: number;
  /** Cumulatieve cash-flow tot deze datum (default 0). Wordt gebruikt
   *  om contributions/withdrawals NIET als rendement mee te tellen. */
  cumulativeContribution?: number;
}

export interface ComputeBenchmarkPerformanceInput {
  portfolioSeries: PortfolioValuePoint[];
  benchmarkHistory: HistoricalPoint[];
  benchmark: BenchmarkDefinition;
  benchmarkResolvedTicker: string;
  benchmarkUsedFallback: boolean;
  warnings?: string[];
}

const MIN_MONTHS_FOR_TRACKING = 3;

export function computeBenchmarkPerformance(
  input: ComputeBenchmarkPerformanceInput,
): BenchmarkPerformance {
  const warnings = [...(input.warnings ?? [])];

  // Aligneer beide reeksen op maand-keys.
  const portfolioByMonth = monthlyFromPortfolio(input.portfolioSeries);
  const benchmarkByMonth = monthlyFromBenchmark(input.benchmarkHistory);
  const sharedMonths = [...portfolioByMonth.keys()]
    .filter((k) => benchmarkByMonth.has(k))
    .sort();

  if (sharedMonths.length < 2) {
    warnings.push(
      "Te weinig overlappende maandelijkse observaties tussen portefeuille en benchmark.",
    );
    return emptyPerformance({
      benchmark: input.benchmark,
      resolvedTicker: input.benchmarkResolvedTicker,
      usedFallback: input.benchmarkUsedFallback,
      warnings,
    });
  }

  const portfolioValues = sharedMonths.map(
    (m) => portfolioByMonth.get(m)!.totalValue,
  );
  const portfolioContributions = sharedMonths.map(
    (m) => portfolioByMonth.get(m)!.cumulativeContribution ?? 0,
  );
  const benchmarkValues = sharedMonths.map((m) => benchmarkByMonth.get(m)!);

  // Maandelijkse returns — voor portefeuille corrigeren we voor extra
  // inleg/withdrawals (delta in cumulativeContribution).
  const portfolioReturns = monthlyContributionAdjustedReturns(
    portfolioValues,
    portfolioContributions,
  );
  const benchmarkReturns = monthlyReturns(benchmarkValues);

  // Total return (compound).
  const portfolioTotal = compoundReturn(portfolioReturns);
  const benchmarkTotal = compoundReturn(benchmarkReturns);
  const alpha = portfolioTotal - benchmarkTotal;

  // Tracking-error.
  const trackingError =
    sharedMonths.length >= MIN_MONTHS_FOR_TRACKING
      ? annualizedTrackingError(portfolioReturns, benchmarkReturns)
      : 0;
  const ir = informationRatio(
    portfolioTotal,
    benchmarkTotal,
    sharedMonths.length - 1,
    trackingError,
  );

  if (sharedMonths.length < MIN_MONTHS_FOR_TRACKING) {
    warnings.push(
      `Slechts ${sharedMonths.length} overlappende maanden — tracking-error niet betekenisvol.`,
    );
  }

  // Genormaliseerde reeksen voor de chart (start = 100).
  const portfolioBase = portfolioValues[0]! - portfolioContributions[0]!;
  const portfolioSeries: BenchmarkSeriesPoint[] = sharedMonths.map(
    (date, i) => ({
      date,
      index:
        portfolioBase > 0
          ? ((portfolioValues[i]! - portfolioContributions[i]!) /
              portfolioBase) *
            100
          : 100,
    }),
  );
  const benchmarkBase = benchmarkValues[0]!;
  const benchmarkSeries: BenchmarkSeriesPoint[] = sharedMonths.map(
    (date, i) => ({
      date,
      index:
        benchmarkBase > 0 ? (benchmarkValues[i]! / benchmarkBase) * 100 : 100,
    }),
  );

  return {
    benchmark: {
      id: input.benchmark.id,
      label: input.benchmark.label,
      ticker: input.benchmarkResolvedTicker,
      usedFallback: input.benchmarkUsedFallback,
    },
    periodStart: sharedMonths[0]!,
    periodEnd: sharedMonths[sharedMonths.length - 1]!,
    monthsObserved: sharedMonths.length - 1,
    portfolioReturn: portfolioTotal,
    benchmarkReturn: benchmarkTotal,
    alpha,
    trackingError,
    informationRatio: ir,
    portfolioSeries,
    benchmarkSeries,
    warnings,
  };
}

// ============================================================
//  Series-alignment helpers (pure)
// ============================================================

function monthlyFromPortfolio(
  series: PortfolioValuePoint[],
): Map<string, PortfolioValuePoint> {
  const out = new Map<string, PortfolioValuePoint>();
  for (const p of series) {
    if (!Number.isFinite(p.totalValue) || p.totalValue <= 0) continue;
    const key = p.date.slice(0, 7);
    const existing = out.get(key);
    if (!existing || p.date > existing.date) out.set(key, p);
  }
  return out;
}

function monthlyFromBenchmark(history: HistoricalPoint[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of history) {
    if (!Number.isFinite(p.close) || p.close <= 0) continue;
    const key = p.date.slice(0, 7);
    const existing = out.get(key);
    if (existing === undefined) out.set(key, p.close);
    // Always overwrite with later date in this month.
    else out.set(key, p.close);
  }
  // Above logic kept latest-encounter; ensure deterministic by sorting input first.
  return out;
}

/**
 * Bereken maandelijkse rendementen waarbij contributions niet als
 * positief rendement worden geteld. Formule:
 *
 *   mtmDelta = V_t - V_{t-1}
 *   contribDelta = C_t - C_{t-1}    // extra inleg in deze maand
 *   monthlyReturn = (mtmDelta - contribDelta) / V_{t-1}
 */
function monthlyContributionAdjustedReturns(
  values: number[],
  cumulativeContribs: number[],
): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]!;
    const curr = values[i]!;
    if (prev <= 0) {
      out.push(0);
      continue;
    }
    const contribDelta =
      (cumulativeContribs[i] ?? 0) - (cumulativeContribs[i - 1] ?? 0);
    out.push((curr - prev - contribDelta) / prev);
  }
  return out;
}

function monthlyReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]!;
    const curr = values[i]!;
    if (prev <= 0) {
      out.push(0);
      continue;
    }
    out.push(curr / prev - 1);
  }
  return out;
}

function compoundReturn(returns: number[]): number {
  if (returns.length === 0) return 0;
  let compound = 1;
  for (const r of returns) compound *= 1 + r;
  return compound - 1;
}

function emptyPerformance(params: {
  benchmark: BenchmarkDefinition;
  resolvedTicker: string;
  usedFallback: boolean;
  warnings: string[];
}): BenchmarkPerformance {
  return {
    benchmark: {
      id: params.benchmark.id,
      label: params.benchmark.label,
      ticker: params.resolvedTicker,
      usedFallback: params.usedFallback,
    },
    periodStart: "",
    periodEnd: "",
    monthsObserved: 0,
    portfolioReturn: 0,
    benchmarkReturn: 0,
    alpha: 0,
    trackingError: 0,
    informationRatio: null,
    portfolioSeries: [],
    benchmarkSeries: [],
    warnings: params.warnings,
  };
}

// Re-export helper voor tests + attribution-engine.
export { excessReturns };
