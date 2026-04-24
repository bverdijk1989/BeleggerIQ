import type { EquityPoint } from "@/types/backtest";

import {
  totalReturnOverValues,
  toIsoDateOnly,
} from "./shared";
import type {
  RollingWindowEntry,
  RollingWindowSummary,
} from "./types";

/**
 * Bereken rolling N-maand returns uit de equity-curve. Voor elk
 * window van `windowMonths` opeenvolgende punten berekenen we de
 * total return van de strategie en (indien beschikbaar) de benchmark.
 *
 * Convention: equity-curve is maandelijks en oplopend gesorteerd.
 * `entries[i]` correspondeert met het window dat op punt `i + window - 1`
 * eindigt. Voor `points.length < windowMonths` geeft de functie een
 * leeg summary-object terug.
 */

export interface ComputeRollingInput {
  points: EquityPoint[];
  /** Grootte van het window in maanden. Bv. 12. */
  windowMonths: number;
}

export function computeRollingReturns(
  input: ComputeRollingInput,
): RollingWindowSummary {
  const { points, windowMonths } = input;

  if (!Number.isFinite(windowMonths) || windowMonths < 2) {
    return emptySummary(windowMonths);
  }
  if (points.length < windowMonths) {
    return emptySummary(windowMonths);
  }

  const entries: RollingWindowEntry[] = [];
  for (let end = windowMonths - 1; end < points.length; end++) {
    const start = end - (windowMonths - 1);
    const first = points[start]!;
    const last = points[end]!;

    const stratValues = [first.value, last.value];
    const strategyReturn = totalReturnOverValues(stratValues);

    let benchmarkReturn: number | null = null;
    if (
      typeof first.benchmark === "number" &&
      typeof last.benchmark === "number" &&
      Number.isFinite(first.benchmark) &&
      Number.isFinite(last.benchmark) &&
      first.benchmark > 0
    ) {
      benchmarkReturn = last.benchmark / first.benchmark - 1;
    }

    const excessReturn =
      benchmarkReturn !== null ? strategyReturn - benchmarkReturn : null;

    entries.push({
      startDate: toIsoDateOnly(first.date),
      endDate: toIsoDateOnly(last.date),
      strategyReturn,
      benchmarkReturn,
      excessReturn,
    });
  }

  let worst: RollingWindowEntry | null = null;
  let best: RollingWindowEntry | null = null;
  let negativeCount = 0;

  for (const e of entries) {
    if (!worst || e.strategyReturn < worst.strategyReturn) worst = e;
    if (!best || e.strategyReturn > best.strategyReturn) best = e;
    if (e.strategyReturn < 0) negativeCount += 1;
  }

  return {
    windowMonths,
    count: entries.length,
    entries,
    worst,
    best,
    negativeCount,
    negativeShare: entries.length === 0 ? 0 : negativeCount / entries.length,
  };
}

function emptySummary(windowMonths: number): RollingWindowSummary {
  return {
    windowMonths,
    count: 0,
    entries: [],
    worst: null,
    best: null,
    negativeCount: 0,
    negativeShare: 0,
  };
}
