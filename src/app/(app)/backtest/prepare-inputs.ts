import { getFundamentals } from "@/lib/data/fundamentals";
import { getHistory } from "@/lib/data/history";
import {
  DEFAULT_SCREENER_UNIVERSE,
  type UniverseEntry,
} from "@/lib/data/screener-universe";
import {
  presetToCustomConfig,
  strategyPresetRepository,
} from "@/lib/data/strategy-preset-repository";
import { scoreFactors } from "@/lib/analytics/factors/composite";
import {
  buildCustomStrategy,
  getStrategyBySlug,
  type BacktestBenchmark,
  type BacktestUniverseEntry,
  type MonthlyBar,
  type StrategyFn,
} from "@/lib/analytics/backtest";
import type { BacktestConfig } from "@/types/backtest";
import type { HistoricalPoint } from "@/types/market";

import {
  DEFAULT_BACKTEST_FILTERS,
  periodRangeFromYears,
  type BacktestFilters,
} from "./filters-serde";

/**
 * Server-side prep voor /backtest. Haalt historie + fundamentals parallel
 * op voor elke ticker in het universum, converteert naar maandelijkse bars
 * en wrapt in `BacktestUniverseEntry`. Retourneert `null` als er te weinig
 * data is om een zinvolle backtest te draaien.
 *
 * Alle fetches leunen op de market-data cache → herhaalde runs zijn gratis.
 */

export interface PreparedBacktestInputs {
  config: BacktestConfig;
  strategy: StrategyFn;
  strategyLabel: string;
  members: BacktestUniverseEntry[];
  benchmark?: BacktestBenchmark;
  effectiveFilters: BacktestFilters;
}

export async function prepareBacktestInputs(
  filters: BacktestFilters,
): Promise<PreparedBacktestInputs | null> {
  const resolved = await resolveStrategy(filters.strategy);
  if (!resolved) return null;

  const { startDate, endDate } = periodRangeFromYears(filters.years);
  const universe = DEFAULT_SCREENER_UNIVERSE.filter(
    (entry) => entry.assetClass !== "CASH",
  );

  const [memberResults, benchmarkResult] = await Promise.all([
    Promise.all(
      universe.map((entry) => buildMember(entry, startDate, endDate)),
    ),
    filters.benchmark
      ? buildBenchmark(filters.benchmark, startDate, endDate)
      : Promise.resolve(undefined),
  ]);

  const members = memberResults.filter(
    (m): m is BacktestUniverseEntry => m !== null,
  );

  if (members.length === 0) return null;

  const config: BacktestConfig = {
    name: resolved.label,
    strategyPresetId: resolved.slug,
    startDate,
    endDate,
    initialCapital: 10_000,
    baseCurrency: "EUR",
    rebalance: resolved.rebalance,
    maxPositions: resolved.maxPositions ?? 10,
    maxPositionWeight: resolved.maxPositionWeight ?? 0.15,
    includeCosts: true,
    includeTaxes: false,
    commissionBps: filters.commissionBps,
    benchmarkTicker: benchmarkResult?.ticker,
    universe: members.map((m) => m.ticker),
  };

  return {
    config,
    strategy: resolved.run,
    strategyLabel: resolved.label,
    members,
    benchmark: benchmarkResult ?? undefined,
    effectiveFilters: { ...filters, strategy: resolved.slug },
  };
}

// ============================================================
//  Strategy resolution (static map OR DB-preset)
// ============================================================

interface ResolvedStrategy {
  slug: string;
  label: string;
  run: StrategyFn;
  rebalance: BacktestConfig["rebalance"];
  maxPositions?: number | null;
  maxPositionWeight?: number | null;
}

async function resolveStrategy(
  slug: string,
): Promise<ResolvedStrategy | null> {
  const staticStrategy = getStrategyBySlug(slug);
  if (staticStrategy) {
    return {
      slug: staticStrategy.slug,
      label: staticStrategy.label,
      run: staticStrategy.run,
      rebalance: "monthly",
    };
  }

  try {
    const preset = await strategyPresetRepository.findBySlug(slug);
    if (preset) {
      const config = presetToCustomConfig(preset);
      return {
        slug: preset.slug,
        label: preset.name,
        run: buildCustomStrategy(config),
        rebalance: mapRebalance(preset.rebalance),
        maxPositions: preset.maxPositions,
        maxPositionWeight: preset.maxPositionWeight,
      };
    }
  } catch (error) {
    console.warn("[backtest] preset lookup failed", error);
  }

  // Fallback naar default static strategy.
  const fallback = getStrategyBySlug(DEFAULT_BACKTEST_FILTERS.strategy);
  if (!fallback) return null;
  return {
    slug: fallback.slug,
    label: fallback.label,
    run: fallback.run,
    rebalance: "monthly",
  };
}

function mapRebalance(
  value: string,
): BacktestConfig["rebalance"] {
  const lower = value.toLowerCase();
  if (
    lower === "monthly" ||
    lower === "quarterly" ||
    lower === "semiannual" ||
    lower === "annual" ||
    lower === "none"
  ) {
    return lower;
  }
  return "monthly";
}

// ============================================================
//  Per-ticker preparation
// ============================================================

async function buildMember(
  entry: UniverseEntry,
  startDate: string,
  endDate: string,
): Promise<BacktestUniverseEntry | null> {
  const [history, fundamentals] = await Promise.all([
    safeHistory(entry.ticker, startDate, endDate),
    safeFundamentals(entry.ticker),
  ]);

  const monthly = toMonthlyBars(history);
  if (monthly.length < 3) return null; // niet genoeg om te backtesten

  const factorScore = fundamentals
    ? scoreFactors(
        {
          ticker: entry.ticker,
          fundamentals,
          priceHistory: history,
        },
        undefined,
      )
    : null;

  return {
    ticker: entry.ticker,
    name: entry.name,
    sector: entry.sector,
    region: entry.region,
    factorScore,
    monthly,
  };
}

async function buildBenchmark(
  ticker: string,
  startDate: string,
  endDate: string,
): Promise<BacktestBenchmark | undefined> {
  const history = await safeHistory(ticker, startDate, endDate);
  const monthly = toMonthlyBars(history);
  if (monthly.length < 3) return undefined;
  return { ticker, monthly };
}

async function safeHistory(
  ticker: string,
  startDate: string,
  endDate: string,
): Promise<HistoricalPoint[]> {
  try {
    return await getHistory({
      ticker,
      startDate,
      endDate,
      interval: "1d",
    });
  } catch (error) {
    console.warn(`[backtest:prepare] history ${ticker} failed`, error);
    return [];
  }
}

async function safeFundamentals(ticker: string) {
  try {
    return await getFundamentals(ticker);
  } catch (error) {
    console.warn(`[backtest:prepare] fundamentals ${ticker} failed`, error);
    return null;
  }
}

/**
 * Downsample daily history naar maand-einde closes. Groepeert op
 * YYYY-MM en pakt de laatst-bekende close per maand.
 */
function toMonthlyBars(history: HistoricalPoint[]): MonthlyBar[] {
  if (history.length === 0) return [];
  const byMonth = new Map<string, number>();
  const sorted = history
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  for (const point of sorted) {
    const close = point.adjustedClose ?? point.close;
    if (!Number.isFinite(close) || close <= 0) continue;
    const monthKey = point.date.slice(0, 7);
    byMonth.set(monthKey, close);
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, close]) => ({ date, close }));
}
