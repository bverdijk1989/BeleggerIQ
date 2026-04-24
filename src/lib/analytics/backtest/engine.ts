import type {
  BacktestConfig,
  BacktestResult,
  BenchmarkComparison,
  EquityPoint,
} from "@/types/backtest";
import type { MarketRegimeState } from "@/types/regime";

import {
  computeBacktestMetrics,
  computeCagrFromValues,
  computeMaxDrawdown,
  computeAnnualizedVolatility,
  monthlyReturnsFromValues,
} from "./metrics";
import type {
  MonthlyBar,
  StrategyContext,
  StrategyFn,
  UniverseMember,
} from "./strategies";

/**
 * Backtest orchestrator. Maandelijkse loop:
 *  1. Bereken month-to-market waarde met prijzen van deze maand.
 *  2. Bepaal maand-return (voor contributie) → opslag in `returns`.
 *  3. Voeg maandelijkse contributie toe aan cash.
 *  4. Rebalance als de frequentie het voorschrijft.
 *  5. Leg equity point vast (incl. drawdown, regime, benchmark).
 *
 * Aannames:
 *  - Fractional shares toegestaan.
 *  - Transactiekosten = `config.commissionBps` × turnover (som van absolute
 *    trade waardes). Geen bid/ask spread of tax modellering.
 *  - Benchmark wordt genormaliseerd naar `initialCapital` bij de eerste maand.
 *  - Als een ticker geen prijs heeft op een maand, behoudt de positie zijn
 *    waarde uit de vorige prijs (geen synthetische returns).
 */

export interface BacktestUniverseEntry extends UniverseMember {
  monthly: MonthlyBar[];
}

export interface BacktestBenchmark {
  ticker: string;
  monthly: MonthlyBar[];
}

export interface RunBacktestInput {
  config: BacktestConfig;
  strategy: StrategyFn;
  members: BacktestUniverseEntry[];
  benchmark?: BacktestBenchmark;
  regimeByMonth?: Map<string, MarketRegimeState>;
  riskFreeAnnual?: number;
}

const REBALANCE_STEP: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
  none: Number.POSITIVE_INFINITY,
};

export function runBacktest(input: RunBacktestInput): BacktestResult {
  const { config, strategy, members, benchmark } = input;
  const step = REBALANCE_STEP[config.rebalance] ?? 1;
  const months = enumerateMonths(config.startDate, config.endDate);
  if (months.length === 0) {
    return emptyResult(config);
  }

  const priceHistoryByTicker = buildPriceMap(members);
  const lastKnownPrice = new Map<string, number>();
  const benchmarkSeries = buildBenchmarkSeries(
    benchmark,
    months,
    config.initialCapital,
  );

  let cash = config.initialCapital;
  let positions = new Map<string, number>();
  let totalCosts = 0;
  let tradeCount = 0;
  let peak = 0;
  let prevValue = 0;
  let finalRawValue = config.initialCapital;
  const returns: number[] = [];
  const points: EquityPoint[] = [];

  for (let i = 0; i < months.length; i++) {
    const month = months[i]!;

    // 1. Compute monthly return (after price move, before contribution/rebalance)
    if (i > 0) {
      const mtmValue =
        cash + sumPositionsValue(positions, month, priceHistoryByTicker, lastKnownPrice);
      if (prevValue > 0) {
        returns.push(mtmValue / prevValue - 1);
      }
      // 2. Contribution
      if (config.monthlyContribution && config.monthlyContribution > 0) {
        cash += config.monthlyContribution;
      }
    }

    // 3. Rebalance if due (always on month 0 to set initial allocation)
    if (shouldRebalance(i, step)) {
      const totalValue =
        cash + sumPositionsValue(positions, month, priceHistoryByTicker, lastKnownPrice);
      const ctx: StrategyContext = {
        asOf: month,
        members,
        priceHistoryByTicker,
        config,
        regime: input.regimeByMonth?.get(month) ?? null,
      };
      const decision = strategy(ctx);
      const outcome = rebalance({
        positions,
        cash,
        totalValue,
        weights: decision.weights,
        priceFor: (ticker) =>
          priceForMonth(ticker, month, priceHistoryByTicker, lastKnownPrice),
        commissionBps: config.commissionBps ?? 0,
      });
      positions = outcome.positions;
      cash = outcome.cash;
      totalCosts += outcome.cost;
      tradeCount += outcome.trades;
    }

    // 4. Record equity point
    const endValue =
      cash + sumPositionsValue(positions, month, priceHistoryByTicker, lastKnownPrice);
    if (endValue > peak) peak = endValue;
    const drawdown = peak > 0 ? endValue / peak - 1 : 0;
    points.push({
      date: monthKeyToDate(month),
      value: round2(endValue),
      benchmark: benchmarkSeries.get(month) ?? undefined,
      drawdown: round4(drawdown),
      regime: input.regimeByMonth?.get(month),
    });
    prevValue = endValue;
    finalRawValue = endValue;
  }

  const values = points.map((p) => p.value);
  const metrics = computeBacktestMetrics({
    values,
    returns,
    riskFreeAnnual: input.riskFreeAnnual,
  });

  // Gebruik de onafgeronde eindwaarde zodat commissiekosten op de ordergrootte
  // zichtbaar blijven bij kleine test-scenario's; `values` zijn afgerond op
  // 2 decimalen voor UI-weergave.
  const finalValue = points.length === 0 ? config.initialCapital : finalRawValue;
  const turnover =
    config.initialCapital > 0 ? totalCosts / config.initialCapital : 0;

  return {
    config,
    equityCurve: points,
    totalReturn: metrics.totalReturn,
    cagr: metrics.cagr,
    volatility: metrics.volatility,
    sharpe: metrics.sharpe,
    sortino: metrics.sortino,
    maxDrawdown: metrics.maxDrawdown,
    calmar: metrics.calmar,
    winRate: metrics.winRate,
    turnover,
    finalValue,
    tradesCount: tradeCount,
    benchmark: buildBenchmarkComparison(benchmarkSeries, benchmark, config),
  };
}

// ============================================================
//  Rebalance
// ============================================================

interface RebalanceInput {
  positions: Map<string, number>;
  cash: number;
  totalValue: number;
  weights: Map<string, number>;
  priceFor: (ticker: string) => number | null;
  commissionBps: number;
}

interface RebalanceOutput {
  positions: Map<string, number>;
  cash: number;
  cost: number;
  trades: number;
}

function rebalance(input: RebalanceInput): RebalanceOutput {
  const { totalValue, weights, priceFor, commissionBps } = input;
  const newPositions = new Map<string, number>();
  let newCash = input.cash;
  let cost = 0;
  let trades = 0;

  // Verzamel unieke tickers uit huidige posities + target weights.
  const tickers = new Set<string>([
    ...input.positions.keys(),
    ...weights.keys(),
  ]);

  for (const ticker of tickers) {
    const price = priceFor(ticker);
    if (price === null || price <= 0) {
      // Zonder prijs kunnen we niet rebalancen; positie blijft staan.
      const existing = input.positions.get(ticker);
      if (existing && existing > 0) newPositions.set(ticker, existing);
      continue;
    }

    const targetWeight = weights.get(ticker) ?? 0;
    const targetValue = totalValue * targetWeight;
    const currentQty = input.positions.get(ticker) ?? 0;
    const currentValue = currentQty * price;
    const deltaValue = targetValue - currentValue;

    if (Math.abs(deltaValue) < 0.01) {
      if (currentQty > 0) newPositions.set(ticker, currentQty);
      continue;
    }

    const newQty = targetValue / price;
    if (newQty > 0) newPositions.set(ticker, newQty);

    newCash -= deltaValue;
    const tradeCost = (Math.abs(deltaValue) * commissionBps) / 10_000;
    newCash -= tradeCost;
    cost += tradeCost;
    trades += 1;
  }

  return { positions: newPositions, cash: Math.max(0, newCash), cost, trades };
}

// ============================================================
//  Benchmark
// ============================================================

function buildBenchmarkSeries(
  benchmark: BacktestBenchmark | undefined,
  months: string[],
  initialCapital: number,
): Map<string, number> {
  const series = new Map<string, number>();
  if (!benchmark) return series;
  const byDate = new Map(benchmark.monthly.map((p) => [p.date, p.close]));
  const first = months
    .map((m) => byDate.get(m))
    .find((close): close is number => typeof close === "number" && close > 0);
  if (!first) return series;

  for (const month of months) {
    const close = byDate.get(month);
    if (close === undefined || !Number.isFinite(close)) continue;
    series.set(month, round2((close / first) * initialCapital));
  }
  return series;
}

function buildBenchmarkComparison(
  series: Map<string, number>,
  benchmark: BacktestBenchmark | undefined,
  config: BacktestConfig,
): BenchmarkComparison | undefined {
  if (!benchmark || series.size === 0) return undefined;
  const values = Array.from(series.values());
  if (values.length < 2) return undefined;
  const returns = monthlyReturnsFromValues(values);
  return {
    ticker: benchmark.ticker,
    totalReturn:
      values.length >= 2 ? values[values.length - 1]! / values[0]! - 1 : 0,
    cagr: computeCagrFromValues(values),
    volatility: computeAnnualizedVolatility(returns),
    maxDrawdown: computeMaxDrawdown(values),
  };
}

// ============================================================
//  Month helpers
// ============================================================

function enumerateMonths(start: string, end: string): string[] {
  const [sy, sm] = parseMonthKey(start);
  const [ey, em] = parseMonthKey(end);
  if (sy === null || sm === null || ey === null || em === null) return [];
  const months: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(formatMonthKey(y, m));
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return months;
}

function parseMonthKey(
  iso: string,
): [number | null, number | null] {
  const match = iso.match(/^(\d{4})-(\d{2})/);
  if (!match) return [null, null];
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return [null, null];
  return [year, month];
}

function formatMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthKeyToDate(key: string): string {
  // Gebruik laatste dag van de maand voor de equity-point datum.
  const [y, m] = parseMonthKey(key);
  if (y === null || m === null) return `${key}-01`;
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

function shouldRebalance(index: number, step: number): boolean {
  if (index === 0) return true;
  if (!Number.isFinite(step)) return false;
  return index % step === 0;
}

// ============================================================
//  Price index
// ============================================================

function buildPriceMap(
  members: BacktestUniverseEntry[],
): Map<string, MonthlyBar[]> {
  const map = new Map<string, MonthlyBar[]>();
  for (const m of members) {
    const sorted = m.monthly.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    map.set(m.ticker, sorted);
  }
  return map;
}

function priceForMonth(
  ticker: string,
  month: string,
  history: Map<string, MonthlyBar[]>,
  lastKnown: Map<string, number>,
): number | null {
  const series = history.get(ticker);
  if (!series || series.length === 0) return lastKnown.get(ticker) ?? null;
  const exact = series.find((p) => p.date === month);
  if (exact && Number.isFinite(exact.close) && exact.close > 0) {
    lastKnown.set(ticker, exact.close);
    return exact.close;
  }
  // Fallback: laatst bekende prijs voor of op deze maand.
  let latest: number | null = null;
  for (const p of series) {
    if (p.date <= month && Number.isFinite(p.close) && p.close > 0) {
      latest = p.close;
    } else if (p.date > month) {
      break;
    }
  }
  if (latest !== null) {
    lastKnown.set(ticker, latest);
    return latest;
  }
  return lastKnown.get(ticker) ?? null;
}

function sumPositionsValue(
  positions: Map<string, number>,
  month: string,
  history: Map<string, MonthlyBar[]>,
  lastKnown: Map<string, number>,
): number {
  let sum = 0;
  for (const [ticker, qty] of positions) {
    const price = priceForMonth(ticker, month, history, lastKnown);
    if (price === null) continue;
    sum += qty * price;
  }
  return sum;
}

// ============================================================
//  Misc
// ============================================================

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function emptyResult(config: BacktestConfig): BacktestResult {
  return {
    config,
    equityCurve: [],
    totalReturn: 0,
    cagr: 0,
    volatility: 0,
    sharpe: 0,
    sortino: 0,
    maxDrawdown: 0,
    calmar: 0,
    winRate: 0,
    turnover: 0,
    finalValue: config.initialCapital,
    tradesCount: 0,
  };
}
