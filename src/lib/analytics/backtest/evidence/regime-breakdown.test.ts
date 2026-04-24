import { describe, expect, it } from "vitest";

import type { EquityPoint } from "@/types/backtest";
import type { MarketRegimeState } from "@/types/regime";

import { computeRegimeBreakdown } from "./regime-breakdown";

function mk(
  value: number,
  regime: MarketRegimeState,
  monthIdx: number,
  benchmark?: number,
): EquityPoint {
  return {
    date: `2020-${String(((monthIdx - 1) % 12) + 1).padStart(2, "0")}-28`,
    value,
    benchmark,
    regime,
  };
}

describe("computeRegimeBreakdown", () => {
  it("groepeert maand-returns per regime", () => {
    const points: EquityPoint[] = [
      mk(100, "expansion", 1),
      mk(110, "expansion", 2), // +10%
      mk(100, "slowdown", 3), // -9.09%
      mk(120, "recovery", 4), // +20%
    ];
    const rows = computeRegimeBreakdown({ points });
    const byRegime = new Map(rows.map((r) => [r.regime, r]));
    expect(byRegime.get("expansion")?.monthsObserved).toBe(1);
    expect(byRegime.get("expansion")?.strategyReturn).toBeCloseTo(0.1, 2);
    expect(byRegime.get("slowdown")?.monthsObserved).toBe(1);
    expect(byRegime.get("recovery")?.monthsObserved).toBe(1);
  });

  it("excessReturn is null wanneer benchmark gedeeltelijk ontbreekt", () => {
    const points: EquityPoint[] = [
      mk(100, "expansion", 1, 100),
      mk(110, "expansion", 2), // geen benchmark
    ];
    const rows = computeRegimeBreakdown({ points });
    expect(rows[0]!.benchmarkReturn).toBeNull();
    expect(rows[0]!.excessReturn).toBeNull();
  });

  it("excessReturn gevuld wanneer benchmark volledig is", () => {
    const points: EquityPoint[] = [
      mk(100, "expansion", 1, 100),
      mk(120, "expansion", 2, 110),
    ];
    const rows = computeRegimeBreakdown({ points });
    expect(rows[0]!.strategyReturn).toBeCloseTo(0.2, 2);
    expect(rows[0]!.benchmarkReturn).toBeCloseTo(0.1, 2);
    expect(rows[0]!.excessReturn).toBeCloseTo(0.1, 2);
  });

  it("missende regime valt terug op 'unknown'", () => {
    const points: EquityPoint[] = [
      { date: "2020-01-28", value: 100 },
      { date: "2020-02-28", value: 110 },
    ];
    const rows = computeRegimeBreakdown({ points });
    expect(rows.map((r) => r.regime)).toContain("unknown");
  });

  it("lege input levert lege array", () => {
    expect(computeRegimeBreakdown({ points: [] })).toEqual([]);
  });
});
