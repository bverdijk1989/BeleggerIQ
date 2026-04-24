import type { EquityPoint } from "@/types/backtest";

import { toIsoDateOnly } from "./shared";
import type { UnderperformancePeriod } from "./types";

/**
 * Detecteer aaneengesloten periodes waarin de strategie **slechter
 * presteerde** dan de benchmark. De regel: voor elke maand berekenen
 * we het excess return (strategie_ret − benchmark_ret). Aaneengesloten
 * maanden met negatief excess worden één `UnderperformancePeriod`.
 *
 * Drempels:
 *   - `minMonths` (default 3): kleine wiebels worden overgeslagen.
 *   - `minShortfall` (default 0.02 = 2%): een periode telt alleen als
 *     de cumulatieve achterstand ≥ `minShortfall`. Voorkomt dat we
 *     lange "bijna-gelijk"-streaks vlaggen als serieus probleem.
 *
 * Periodes worden gesorteerd op excess-return asc (slechtste eerst) en
 * geclampt tot `limit`.
 */

export interface DetectUnderperformanceInput {
  points: EquityPoint[];
  minMonths?: number;
  minShortfall?: number;
  limit?: number;
}

export function detectUnderperformancePeriods(
  input: DetectUnderperformanceInput,
): UnderperformancePeriod[] {
  const { points } = input;
  const minMonths = Math.max(1, Math.floor(input.minMonths ?? 3));
  const minShortfall = input.minShortfall ?? 0.02;
  const limit = input.limit ?? 10;

  if (points.length < minMonths + 1) return [];

  const candidates: UnderperformancePeriod[] = [];
  let runStartIdx: number | null = null;
  let runStrategyCompound = 1;
  let runBenchmarkCompound = 1;

  const closeRun = (endIdx: number) => {
    if (runStartIdx === null) return;
    const startPoint = points[runStartIdx - 1]!; // begin vóór eerste maand
    const endPoint = points[endIdx]!;
    const stratRet = runStrategyCompound - 1;
    const benchRet = runBenchmarkCompound - 1;
    const excess = stratRet - benchRet;
    const months = endIdx - runStartIdx + 1;
    if (months >= minMonths && excess <= -minShortfall) {
      candidates.push({
        startDate: toIsoDateOnly(startPoint.date),
        endDate: toIsoDateOnly(endPoint.date),
        months,
        strategyReturn: stratRet,
        benchmarkReturn: benchRet,
        excessReturn: excess,
      });
    }
    runStartIdx = null;
    runStrategyCompound = 1;
    runBenchmarkCompound = 1;
  };

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    if (
      prev.value <= 0 ||
      typeof prev.benchmark !== "number" ||
      typeof curr.benchmark !== "number" ||
      !Number.isFinite(prev.benchmark) ||
      !Number.isFinite(curr.benchmark) ||
      prev.benchmark <= 0
    ) {
      // Missing benchmark-data breekt elke actieve run af.
      if (runStartIdx !== null) closeRun(i - 1);
      continue;
    }

    const stratRet = curr.value / prev.value - 1;
    const benchRet = curr.benchmark / prev.benchmark - 1;
    const isUnder = stratRet < benchRet;

    if (isUnder) {
      if (runStartIdx === null) runStartIdx = i;
      runStrategyCompound *= 1 + stratRet;
      runBenchmarkCompound *= 1 + benchRet;
    } else if (runStartIdx !== null) {
      closeRun(i - 1);
    }
  }
  // Sluit eventuele lopende run.
  if (runStartIdx !== null) closeRun(points.length - 1);

  // Sorteer op `excessReturn` asc (meest negatief eerst).
  candidates.sort((a, b) => a.excessReturn - b.excessReturn);
  return candidates.slice(0, limit);
}
