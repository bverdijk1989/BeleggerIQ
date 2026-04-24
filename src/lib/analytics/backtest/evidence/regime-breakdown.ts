import type { EquityPoint } from "@/types/backtest";
import type { MarketRegimeState } from "@/types/regime";

import { annualiseReturn, round4 } from "./shared";
import type { RegimeBreakdownRow } from "./types";

/**
 * Regime breakdown: berekent total- en annualised return per regime-
 * fase op basis van de equity-curve. Werkt door maand-op-maand returns
 * uit de curve te halen en ze te groeperen op `point.regime`. Dat geeft
 * een correct beeld zelfs als regime-transities in de loop van een
 * maand plaatsvinden (we nemen het regime van de eind-maand).
 *
 * Voor elke regime-emmer:
 *   - `strategyReturn` = product van (1 + r) - 1 over alle maanden in die emmer
 *   - `benchmarkReturn` = idem op basis van benchmark-returns, als alle
 *     benchmark-punten in die emmer beschikbaar zijn
 *   - `strategyAnnualised` / `benchmarkAnnualised` via `annualiseReturn`
 *
 * Emmers zonder data worden weggelaten. Sortering: volgens de vaste
 * `ORDER`-lijst om UI-volgorde te borgen.
 */

const ORDER: MarketRegimeState[] = [
  "expansion",
  "recovery",
  "slowdown",
  "recession",
  "unknown",
];

export interface ComputeRegimeBreakdownInput {
  points: EquityPoint[];
}

export function computeRegimeBreakdown(
  input: ComputeRegimeBreakdownInput,
): RegimeBreakdownRow[] {
  const { points } = input;
  if (points.length < 2) return [];

  // Per-regime accumulators.
  const accum = new Map<
    MarketRegimeState,
    {
      months: number;
      strategyCompound: number;
      benchmarkCompound: number;
      benchmarkMissing: boolean;
    }
  >();

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    if (prev.value <= 0) continue;
    const regime: MarketRegimeState = curr.regime ?? "unknown";

    let bucket = accum.get(regime);
    if (!bucket) {
      bucket = {
        months: 0,
        strategyCompound: 1,
        benchmarkCompound: 1,
        benchmarkMissing: false,
      };
      accum.set(regime, bucket);
    }

    const stratRet = curr.value / prev.value - 1;
    bucket.strategyCompound *= 1 + stratRet;
    bucket.months += 1;

    if (
      typeof prev.benchmark === "number" &&
      typeof curr.benchmark === "number" &&
      Number.isFinite(prev.benchmark) &&
      Number.isFinite(curr.benchmark) &&
      prev.benchmark > 0
    ) {
      const benchRet = curr.benchmark / prev.benchmark - 1;
      bucket.benchmarkCompound *= 1 + benchRet;
    } else {
      bucket.benchmarkMissing = true;
    }
  }

  const rows: RegimeBreakdownRow[] = [];
  for (const regime of ORDER) {
    const bucket = accum.get(regime);
    if (!bucket || bucket.months === 0) continue;

    const strategyReturn = bucket.strategyCompound - 1;
    const strategyAnnualised = annualiseReturn(strategyReturn, bucket.months);
    const benchmarkReturn = bucket.benchmarkMissing
      ? null
      : bucket.benchmarkCompound - 1;
    const benchmarkAnnualised =
      benchmarkReturn === null
        ? null
        : annualiseReturn(benchmarkReturn, bucket.months);
    const excessReturn =
      benchmarkReturn === null ? null : strategyReturn - benchmarkReturn;

    rows.push({
      regime,
      monthsObserved: bucket.months,
      strategyReturn: round4(strategyReturn),
      strategyAnnualised: round4(strategyAnnualised),
      benchmarkReturn: benchmarkReturn === null ? null : round4(benchmarkReturn),
      benchmarkAnnualised:
        benchmarkAnnualised === null ? null : round4(benchmarkAnnualised),
      excessReturn: excessReturn === null ? null : round4(excessReturn),
    });
  }

  return rows;
}
