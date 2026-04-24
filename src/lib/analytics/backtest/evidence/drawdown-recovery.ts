import type { EquityPoint } from "@/types/backtest";

import { toIsoDateOnly } from "./shared";
import type {
  DrawdownRecoveryEntry,
  DrawdownRecoverySummary,
} from "./types";

/**
 * Drawdown-recovery analyse.
 *
 * Detecteert elke **peak → trough → recovery** cyclus in de equity-
 * curve. Een nieuwe cyclus start zodra de curve een all-time-high
 * neerzet, eindigt zodra de curve dat high weer evenaart of
 * overschrijdt. Een cyclus zonder herstel blijft open (`recoveryDate
 * = null`, `inProgress = true`).
 *
 * Drempel: `minDepth` (default -0.05 = 5%). Kleinere dippen worden
 * weggelaten omdat ze de UI vervuilen met ruis.
 */

export interface ComputeDrawdownRecoveryInput {
  points: EquityPoint[];
  /** Minimum diepte (negatief) om te tellen. Bv. -0.05 = 5%. */
  minDepth?: number;
}

export function computeDrawdownRecovery(
  input: ComputeDrawdownRecoveryInput,
): DrawdownRecoverySummary {
  const { points } = input;
  const minDepth = input.minDepth ?? -0.05;
  if (points.length < 2) {
    return {
      entries: [],
      longestRecoveryMonths: null,
      averageRecoveryMonths: null,
      inProgress: false,
    };
  }

  const entries: DrawdownRecoveryEntry[] = [];

  let peakIdx = 0;
  let peakValue = points[0]!.value;
  let troughIdx = 0;
  let troughValue = points[0]!.value;
  let inDrawdown = false;

  for (let i = 1; i < points.length; i++) {
    const v = points[i]!.value;

    if (!inDrawdown) {
      if (v >= peakValue) {
        peakIdx = i;
        peakValue = v;
        troughIdx = i;
        troughValue = v;
      } else {
        inDrawdown = true;
        troughIdx = i;
        troughValue = v;
      }
    } else {
      if (v < troughValue) {
        troughIdx = i;
        troughValue = v;
      }
      if (v >= peakValue) {
        // Gerecupereerd — registreer cyclus, reset.
        const depth = troughValue / peakValue - 1;
        if (depth <= minDepth) {
          entries.push({
            peakDate: toIsoDateOnly(points[peakIdx]!.date),
            troughDate: toIsoDateOnly(points[troughIdx]!.date),
            recoveryDate: toIsoDateOnly(points[i]!.date),
            depth,
            monthsToTrough: troughIdx - peakIdx,
            monthsToRecovery: i - peakIdx,
          });
        }
        peakIdx = i;
        peakValue = v;
        troughIdx = i;
        troughValue = v;
        inDrawdown = false;
      }
    }
  }

  // Open drawdown?
  let inProgress = false;
  if (inDrawdown) {
    const depth = troughValue / peakValue - 1;
    if (depth <= minDepth) {
      entries.push({
        peakDate: toIsoDateOnly(points[peakIdx]!.date),
        troughDate: toIsoDateOnly(points[troughIdx]!.date),
        recoveryDate: null,
        depth,
        monthsToTrough: troughIdx - peakIdx,
        monthsToRecovery: null,
      });
      inProgress = true;
    }
  }

  const recoveredDurations = entries
    .map((e) => e.monthsToRecovery)
    .filter((v): v is number => typeof v === "number");
  const longestRecoveryMonths =
    recoveredDurations.length === 0
      ? null
      : Math.max(...recoveredDurations);
  const averageRecoveryMonths =
    recoveredDurations.length === 0
      ? null
      : Math.round(
          recoveredDurations.reduce((s, v) => s + v, 0) /
            recoveredDurations.length,
        );

  // Sorteer op diepte (meest negatief eerst) voor UI-prioritering.
  entries.sort((a, b) => a.depth - b.depth);

  return {
    entries,
    longestRecoveryMonths,
    averageRecoveryMonths,
    inProgress,
  };
}
