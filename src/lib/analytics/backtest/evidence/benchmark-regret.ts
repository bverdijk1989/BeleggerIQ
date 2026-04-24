import type { EquityPoint } from "@/types/backtest";

import { clamp, hasCompleteBenchmark } from "./shared";
import type { BenchmarkRegretScore } from "./types";

/**
 * Benchmark-regret score.
 *
 * Doel: vang de emotionele component van onderperformance in één
 * getal. "Regret" is niet alleen *hoe vaak* maar ook *hoeveel* de
 * strategie slechter was dan de benchmark. Pure, reproduceerbare
 * formule:
 *
 *   freqPart   = underperformance_share (0..1)
 *   magPart    = clamp(avg monthly shortfall, 0, 0.05) / 0.05  // 5%/m = volle magnitude
 *   depthPart  = clamp(max cumulative shortfall, 0, 0.30) / 0.30 // 30% = volle depth
 *   score      = (0.4 × freqPart + 0.3 × magPart + 0.3 × depthPart) × 100
 *
 * Retourneert `null` wanneer er geen complete benchmark-koppeling is
 * (dan kan de regret-score niet betekenisvol berekend worden).
 */

export interface ComputeBenchmarkRegretInput {
  points: EquityPoint[];
}

export function computeBenchmarkRegret(
  input: ComputeBenchmarkRegretInput,
): BenchmarkRegretScore | null {
  const { points } = input;
  if (points.length < 2) return null;
  if (!hasCompleteBenchmark(points)) return null;

  let monthsObserved = 0;
  let monthsUnder = 0;
  let shortfallSum = 0; // som van negatieve excess-returns (voor gemiddelde)
  let cumulativeLogStrat = 0;
  let cumulativeLogBench = 0;
  let maxCumulativeShortfall = 0;

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
      continue;
    }

    const stratRet = curr.value / prev.value - 1;
    const benchRet = curr.benchmark / prev.benchmark - 1;
    monthsObserved += 1;

    const excess = stratRet - benchRet;
    if (excess < 0) {
      monthsUnder += 1;
      shortfallSum += -excess;
    }

    // Cumulatieve relatieve achterstand (log-space voor stabiliteit).
    cumulativeLogStrat += Math.log(Math.max(1e-9, 1 + stratRet));
    cumulativeLogBench += Math.log(Math.max(1e-9, 1 + benchRet));
    const cumulativeShortfall = cumulativeLogBench - cumulativeLogStrat;
    if (cumulativeShortfall > maxCumulativeShortfall) {
      maxCumulativeShortfall = cumulativeShortfall;
    }
  }

  if (monthsObserved === 0) return null;

  const underperformanceShare = monthsUnder / monthsObserved;
  const averageMonthlyShortfall = monthsUnder === 0 ? 0 : shortfallSum / monthsUnder;

  // Bouw de score.
  const freqPart = underperformanceShare; // 0..1
  const magPart = clamp(averageMonthlyShortfall, 0, 0.05) / 0.05;
  const depthPart = clamp(maxCumulativeShortfall, 0, 0.3) / 0.3;
  const rawScore = (0.4 * freqPart + 0.3 * magPart + 0.3 * depthPart) * 100;
  const score = clamp(Math.round(rawScore), 0, 100);

  // Convert log-shortfall terug naar fractie voor de UI-veld.
  const maxCumulativeShortfallFraction = 1 - Math.exp(-maxCumulativeShortfall);

  return {
    score,
    monthsUnderperforming: monthsUnder,
    monthsObserved,
    underperformanceShare,
    averageMonthlyShortfall,
    maxCumulativeShortfall: maxCumulativeShortfallFraction,
  };
}
