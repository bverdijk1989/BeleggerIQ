import { getHistory } from "@/lib/data/history";
import type { HistoricalPoint } from "@/types/market";

import {
  BENCHMARK_CATALOG,
  type BenchmarkId,
  type BenchmarkDefinition,
} from "./types";

/**
 * Benchmark-fetcher: haalt daily history op voor een benchmark-id.
 *
 * Probeert eerst de primary ticker; valt terug op `fallbackTickers`
 * wanneer de primary geen data oplevert (bv. delisted of region-locked).
 * Server-only — leunt op `getHistory` (cache + provider).
 */

export interface FetchBenchmarkOptions {
  /** Aantal trading-dagen historie (default 600 ≈ 2.5 jaar). */
  lookbackDays?: number;
  /** Override voor `getHistory`-call in tests. */
  fetcher?: typeof getHistory;
  /** Override voor `now`. */
  now?: Date;
}

export interface FetchBenchmarkResult {
  definition: BenchmarkDefinition;
  /** Werkelijk gebruikte ticker (primary of fallback). */
  resolvedTicker: string;
  usedFallback: boolean;
  history: HistoricalPoint[];
  warnings: string[];
}

const DEFAULT_LOOKBACK_DAYS = 600;

export async function fetchBenchmark(
  id: BenchmarkId,
  options: FetchBenchmarkOptions = {},
): Promise<FetchBenchmarkResult> {
  const definition = BENCHMARK_CATALOG[id];
  const lookback = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const now = options.now ?? new Date();
  const fetcher = options.fetcher ?? getHistory;
  const start = new Date(now);
  start.setDate(start.getDate() - lookback);
  const startIso = start.toISOString().slice(0, 10);
  const endIso = now.toISOString().slice(0, 10);

  const warnings: string[] = [];
  const candidates = [definition.ticker, ...definition.fallbackTickers];

  for (let i = 0; i < candidates.length; i++) {
    const ticker = candidates[i]!;
    const history = await fetcher({
      ticker,
      startDate: startIso,
      endDate: endIso,
      interval: "1d",
    }).catch((err) => {
      warnings.push(
        `Fetch faalde voor ${ticker}: ${err instanceof Error ? err.message : "onbekende fout"}`,
      );
      return [] as HistoricalPoint[];
    });

    if (history.length >= 30) {
      return {
        definition,
        resolvedTicker: ticker,
        usedFallback: i > 0,
        history,
        warnings,
      };
    }
    if (history.length > 0) {
      warnings.push(
        `${ticker} leverde slechts ${history.length} datapunten; te kort voor benchmark-analyse.`,
      );
    }
  }

  // Geen enkele kandidaat leverde bruikbare data.
  warnings.push(
    `Geen benchmark-data beschikbaar voor ${definition.label}; alle ${candidates.length} tickers gefaald.`,
  );
  return {
    definition,
    resolvedTicker: definition.ticker,
    usedFallback: false,
    history: [],
    warnings,
  };
}

/**
 * Resampelt een daily-history naar **maandelijkse** sluitkoersen op de
 * laatste handelsdag van iedere maand. Pure functie — handig om de
 * benchmark op gelijke cadence te zetten als portfolio-snapshots
 * (vaak maandelijks).
 */
export function resampleMonthly(
  history: HistoricalPoint[],
): HistoricalPoint[] {
  if (history.length === 0) return [];
  const byMonth = new Map<string, HistoricalPoint>();
  for (const point of history) {
    if (!Number.isFinite(point.close) || point.close <= 0) continue;
    const key = point.date.slice(0, 7); // YYYY-MM
    const existing = byMonth.get(key);
    if (!existing || point.date > existing.date) {
      byMonth.set(key, point);
    }
  }
  return [...byMonth.values()].sort((a, b) =>
    a.date < b.date ? -1 : 1,
  );
}
