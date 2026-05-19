/**
 * Correlation Studio — server-side loader (Module 28).
 *
 * Hergebruikt `getHistory` voor zowel portfolio-holdings als
 * BENCHMARK_CATALOG-tickers. Bouwt daily-returns en delegeert aan de
 * pure engine.
 *
 * **Limiet**: max 15 holdings + 3 benchmarks = 18 assets in matrix
 * (anders wordt UI onleesbaar en fetch-cost loopt op).
 *
 * **Faal-safe**: per-ticker history-fail → asset dropt; bij <2 assets
 * met genoeg data → lege rapport met warning.
 */

import type { Portfolio } from "@/types/portfolio";

import { buildPortfolioView } from "../portfolio-view";
import { BENCHMARK_CATALOG, type BenchmarkId } from "../benchmark/types";
import { getHistory } from "@/lib/data/history";
import { log } from "@/lib/log";

import { buildCorrelationReport } from "./engine";
import type { CorrelationAsset, CorrelationReport } from "./types";

const MAX_HOLDINGS = 15;
const DEFAULT_LOOKBACK_TRADING_DAYS = 252; // ~1 jaar
const DEFAULT_BENCHMARKS: BenchmarkId[] = ["MSCI_WORLD", "SP500", "ALL_WORLD"];

export interface LoadCorrelationReportInput {
  portfolio: Portfolio;
  /** Hoeveel trading days terugkijken — default 252 (~1 jaar). */
  lookbackTradingDays?: number;
  /** Welke benchmarks meenemen. Default: 3 brede indices. */
  benchmarks?: ReadonlyArray<BenchmarkId>;
}

export async function loadCorrelationReport(
  input: LoadCorrelationReportInput,
): Promise<CorrelationReport> {
  const lookback =
    input.lookbackTradingDays ?? DEFAULT_LOOKBACK_TRADING_DAYS;
  const benchmarks = input.benchmarks ?? DEFAULT_BENCHMARKS;
  const generatedAt = new Date().toISOString();

  // Bouw view voor weight-info per holding.
  const view = await buildPortfolioView(input.portfolio, {
    includeFundamentals: false,
    includeFactorScores: false,
    cashBalance: input.portfolio.cashBalance,
  }).catch(() => null);

  const totalValue = view?.summary.totalValue ?? 0;

  // Selecteer top-N holdings op marktwaarde (gemaximeerd om UI leesbaar
  // te houden).
  const sortedHoldings = view
    ? [...view.valuations]
        .sort((a, b) => b.marketValueBase - a.marketValueBase)
        .slice(0, MAX_HOLDINGS)
    : [];

  const holdingAssets: CorrelationAsset[] = sortedHoldings.map((v) => ({
    ticker: v.holding.ticker.toUpperCase(),
    name: v.holding.name,
    kind: "holding",
    sector: v.holding.sector ?? null,
    weight: totalValue > 0 ? v.marketValueBase / totalValue : null,
  }));

  const benchmarkAssets: CorrelationAsset[] = benchmarks.map((id) => {
    const def = BENCHMARK_CATALOG[id];
    return {
      ticker: def.ticker.toUpperCase(),
      name: def.label,
      kind: "benchmark",
      sector: null,
      weight: null,
    };
  });

  const allAssets = [...holdingAssets, ...benchmarkAssets];
  if (allAssets.length < 2) {
    return buildCorrelationReport({
      generatedAt,
      lookbackTradingDays: lookback,
      assets: [],
    });
  }

  // Bouw fetch-window in kalenderdagen — pak ruim zodat we 1y trading
  // days zeker hebben (≈ 1.5 jaar kalender).
  const calendarDays = Math.ceil(lookback * 1.5);
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - calendarDays * 86_400_000);

  const seriesByTicker = await fetchSeriesForAssets({
    tickers: allAssets.map((a) => a.ticker),
    startIso: startDate.toISOString().slice(0, 10),
    endIso: endDate.toISOString().slice(0, 10),
  });

  // Bouw daily-returns + datum-array per asset.
  const enriched = allAssets.map((asset) => {
    const series = seriesByTicker.get(asset.ticker) ?? [];
    const { returns, dates } = buildDailyReturns(series, lookback);
    return { asset, dailyReturns: returns, dates };
  });

  return buildCorrelationReport({
    generatedAt,
    lookbackTradingDays: lookback,
    assets: enriched,
  });
}

interface SeriesPoint {
  date: string;
  close: number;
}

async function fetchSeriesForAssets(args: {
  tickers: ReadonlyArray<string>;
  startIso: string;
  endIso: string;
}): Promise<Map<string, SeriesPoint[]>> {
  const out = new Map<string, SeriesPoint[]>();
  await Promise.all(
    args.tickers.map(async (t) => {
      try {
        const points = await getHistory({
          ticker: t,
          startDate: args.startIso,
          endDate: args.endIso,
          interval: "1d",
        });
        const filtered: SeriesPoint[] = points
          .filter((p) => Number.isFinite(p.close) && p.close > 0)
          .map((p) => ({ date: p.date.slice(0, 10), close: p.close }))
          .sort((a, b) => a.date.localeCompare(b.date));
        out.set(t, filtered);
      } catch (error) {
        log.info("correlation", "history_fetch_failed", {
          ticker: t,
          errorName: error instanceof Error ? error.name : "unknown",
        });
        out.set(t, []);
      }
    }),
  );
  return out;
}

function buildDailyReturns(
  series: ReadonlyArray<SeriesPoint>,
  maxDays: number,
): { returns: number[]; dates: string[] } {
  if (series.length < 2) return { returns: [], dates: [] };
  const returns: number[] = [];
  const dates: string[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!.close;
    const curr = series[i]!.close;
    if (prev > 0 && Number.isFinite(prev) && Number.isFinite(curr)) {
      returns.push(curr / prev - 1);
      dates.push(series[i]!.date);
    }
  }
  // Tail-trim: pak laatste maxDays observaties.
  if (returns.length > maxDays) {
    const start = returns.length - maxDays;
    return { returns: returns.slice(start), dates: dates.slice(start) };
  }
  return { returns, dates };
}
