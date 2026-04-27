import {
  BENCHMARK_CATALOG,
  buildBenchmarkReport,
  computeAttribution,
  computeBenchmarkPerformance,
  fetchBenchmark,
  resampleMonthly,
  type BenchmarkId,
  type BenchmarkReport,
  type PortfolioValuePoint,
  type PositionPerformance,
} from "@/lib/analytics/benchmark";
import type { PortfolioView } from "@/lib/analytics/portfolio-view";
import { getHistory } from "@/lib/data/history";
import {
  portfolioSnapshotRepository,
  type PortfolioSnapshotRow,
} from "@/lib/data";
import type { HistoricalPoint } from "@/types/market";
import type { Portfolio } from "@/types/portfolio";

/**
 * Server-only loader voor de Benchmark & Attribution module.
 *
 * Pipeline:
 *   1. Fetch portfolio-snapshots (maandelijkse waarderingen).
 *   2. Fetch benchmark-history via `fetchBenchmark` (met fallback).
 *   3. Resample benchmark naar maandelijkse cadence.
 *   4. Bereken `BenchmarkPerformance`.
 *   5. Voor attribution: fetch per-positie price history en bouw
 *      `PositionPerformance[]`. Skip positions zonder bruikbare history.
 *   6. Combineer in `BenchmarkReport`.
 *
 * Faal-safe: lege snapshots / lege benchmark / failures resulteren in
 * een `BenchmarkReport` met warnings, niet in een crash.
 */

export interface LoadBenchmarkInput {
  portfolio: Portfolio;
  view: PortfolioView;
  benchmarkId?: BenchmarkId;
}

export interface LoadBenchmarkResult {
  report: BenchmarkReport;
  diagnostics: {
    snapshotsLoaded: number;
    positionsAttributed: number;
    benchmarkHistoryDays: number;
  };
}

const DEFAULT_LOOKBACK_DAYS = 600;
const SNAPSHOT_LIMIT = 240;

export async function loadBenchmarkReport(
  input: LoadBenchmarkInput,
): Promise<LoadBenchmarkResult> {
  const benchmarkId = input.benchmarkId ?? "MSCI_WORLD";
  const definition = BENCHMARK_CATALOG[benchmarkId];

  // 1. Snapshots
  const snapshots = await portfolioSnapshotRepository
    .listForPortfolio(input.portfolio.id, SNAPSHOT_LIMIT)
    .catch(() => [] as PortfolioSnapshotRow[]);
  const portfolioSeries = snapshotsToValuePoints(snapshots);

  // 2-3. Benchmark fetch + resample
  const fetched = await fetchBenchmark(benchmarkId, {
    lookbackDays: DEFAULT_LOOKBACK_DAYS,
  });
  const monthlyBench = resampleMonthly(fetched.history);

  // 4. Performance
  const performance = computeBenchmarkPerformance({
    portfolioSeries,
    benchmarkHistory: monthlyBench,
    benchmark: definition,
    benchmarkResolvedTicker: fetched.resolvedTicker,
    benchmarkUsedFallback: fetched.usedFallback,
    warnings: fetched.warnings,
  });

  // 5. Attribution
  const positions = await buildPositionPerformances({
    view: input.view,
    periodStart: performance.periodStart,
    periodEnd: performance.periodEnd,
  });
  const attribution = computeAttribution({
    positions,
    benchmarkReturn: performance.benchmarkReturn,
  });

  const report = buildBenchmarkReport({ performance, attribution });

  return {
    report,
    diagnostics: {
      snapshotsLoaded: snapshots.length,
      positionsAttributed: positions.length,
      benchmarkHistoryDays: fetched.history.length,
    },
  };
}

// ============================================================
//  Helpers
// ============================================================

function snapshotsToValuePoints(
  snapshots: PortfolioSnapshotRow[],
): PortfolioValuePoint[] {
  // Snapshots zijn meest-recent-first; we draaien om voor ascending.
  const sorted = [...snapshots].sort((a, b) =>
    a.capturedAt < b.capturedAt ? -1 : 1,
  );
  // We hebben geen cumulatieve contributions in snapshots; we leiden
  // ze af uit `totalCost` als beste proxy. (totalCost stijgt bij elke
  // bijstort.) Eerste cost = baseline → contribDelta = costDelta.
  const baselineCost = sorted[0]?.totalCost ?? 0;
  return sorted
    .filter((s) => Number.isFinite(s.totalValue) && s.totalValue > 0)
    .map((s) => ({
      date: s.capturedAt.slice(0, 10),
      totalValue: s.totalValue,
      cumulativeContribution: Math.max(0, s.totalCost - baselineCost),
    }));
}

async function buildPositionPerformances(input: {
  view: PortfolioView;
  periodStart: string;
  periodEnd: string;
}): Promise<PositionPerformance[]> {
  if (!input.periodStart || !input.periodEnd) return [];
  const startIso = `${input.periodStart}-01`;
  const endIso = `${input.periodEnd}-28`; // safe binnen elke maand
  const totalValue = input.view.summary.totalValue;
  if (totalValue <= 0) return [];

  const out: PositionPerformance[] = [];
  for (const v of input.view.valuations) {
    const history = await getHistory({
      ticker: v.holding.ticker,
      startDate: startIso,
      endDate: endIso,
      interval: "1mo",
    }).catch(() => [] as HistoricalPoint[]);
    const positionReturn = totalReturnFromHistory(history);
    if (positionReturn === null) continue;
    const startWeight = v.marketValueBase / totalValue;
    out.push({
      ticker: v.holding.ticker,
      name: v.holding.name,
      sector: v.holding.sector ?? null,
      startWeight,
      positionReturn,
      factorScore: v.holding.factorScore ?? null,
    });
  }
  return out;
}

function totalReturnFromHistory(history: HistoricalPoint[]): number | null {
  const valid = history.filter((p) => Number.isFinite(p.close) && p.close > 0);
  if (valid.length < 2) return null;
  const first = valid[0]!.close;
  const last = valid[valid.length - 1]!.close;
  if (first <= 0) return null;
  return last / first - 1;
}
