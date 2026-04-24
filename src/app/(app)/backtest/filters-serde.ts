/**
 * URL-serde voor /backtest. Config wordt gedreven door searchParams zodat
 * backtest-runs reproducible en shareable zijn.
 *
 * Parameters:
 *   - `strategy`  : slug uit `STRATEGIES`
 *   - `benchmark` : ticker (of "none")
 *   - `years`     : integer voor periode (1 / 2 / 3 / 5)
 *   - `cost`      : commissionBps (integer ≥ 0)
 */

export interface BacktestFilters {
  strategy: string;
  benchmark: string | null;
  years: number;
  commissionBps: number;
}

export const DEFAULT_BACKTEST_FILTERS: BacktestFilters = {
  strategy: "quality-momentum",
  benchmark: "IWDA",
  years: 3,
  commissionBps: 10,
};

export const SUPPORTED_PERIODS = [1, 2, 3, 5] as const;
export const SUPPORTED_BENCHMARKS = ["IWDA", "VWCE"] as const;

type SearchParamsLike =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function readString(
  params: SearchParamsLike,
  key: string,
): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const v = params[key];
  if (Array.isArray(v)) return v[0];
  return v;
}

function readNumber(
  params: SearchParamsLike,
  key: string,
): number | undefined {
  const raw = readString(params, key);
  if (!raw) return undefined;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export function parseBacktestFilters(
  params: SearchParamsLike,
): BacktestFilters {
  const strategy =
    readString(params, "strategy") ?? DEFAULT_BACKTEST_FILTERS.strategy;
  const benchmarkRaw =
    readString(params, "benchmark") ?? DEFAULT_BACKTEST_FILTERS.benchmark ?? "";
  const benchmark =
    benchmarkRaw === "none" || benchmarkRaw.length === 0 ? null : benchmarkRaw;

  const rawYears = readNumber(params, "years");
  const years =
    rawYears !== undefined &&
    (SUPPORTED_PERIODS as readonly number[]).includes(Math.round(rawYears))
      ? Math.round(rawYears)
      : DEFAULT_BACKTEST_FILTERS.years;

  const rawCost = readNumber(params, "cost");
  const commissionBps =
    rawCost !== undefined && rawCost >= 0
      ? Math.round(rawCost)
      : DEFAULT_BACKTEST_FILTERS.commissionBps;

  return { strategy, benchmark, years, commissionBps };
}

export function filtersToSearchParams(
  filters: BacktestFilters,
): URLSearchParams {
  const sp = new URLSearchParams();
  if (filters.strategy !== DEFAULT_BACKTEST_FILTERS.strategy)
    sp.set("strategy", filters.strategy);
  if (filters.benchmark !== DEFAULT_BACKTEST_FILTERS.benchmark) {
    sp.set("benchmark", filters.benchmark ?? "none");
  }
  if (filters.years !== DEFAULT_BACKTEST_FILTERS.years)
    sp.set("years", String(filters.years));
  if (filters.commissionBps !== DEFAULT_BACKTEST_FILTERS.commissionBps)
    sp.set("cost", String(filters.commissionBps));
  return sp;
}

/**
 * Leidt ISO start/end dates af uit `years`. End = vandaag; start = eerste
 * dag van de maand, `years` jaar geleden. Zo houden we maandelijkse
 * observaties netjes uitgelijnd.
 */
export function periodRangeFromYears(years: number): {
  startDate: string;
  endDate: string;
} {
  const now = new Date();
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  );
  const start = new Date(
    Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), 1),
  );
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}
