import { describe, expect, it } from "vitest";

import type { EquityPoint } from "@/types/backtest";

import { computeBenchmarkRegret } from "./benchmark-regret";

function mk(value: number, benchmark: number | undefined, monthIdx: number): EquityPoint {
  return {
    date: `2020-${String(((monthIdx - 1) % 12) + 1).padStart(2, "0")}-28`,
    value,
    benchmark,
  };
}

describe("computeBenchmarkRegret", () => {
  it("null zonder complete benchmark", () => {
    const points: EquityPoint[] = [
      mk(100, undefined, 1),
      mk(105, undefined, 2),
    ];
    expect(computeBenchmarkRegret({ points })).toBeNull();
  });

  it("0 regret bij identieke returns", () => {
    const points: EquityPoint[] = [
      mk(100, 100, 1),
      mk(105, 105, 2),
      mk(110, 110, 3),
    ];
    const r = computeBenchmarkRegret({ points })!;
    expect(r.monthsUnderperforming).toBe(0);
    expect(r.score).toBe(0);
  });

  it("regret ~100 wanneer strategy elke maand achterloopt", () => {
    // Strategy: flat. Benchmark: +5%/m.
    const points: EquityPoint[] = [];
    let bench = 100;
    for (let i = 0; i < 24; i++) {
      if (i > 0) bench *= 1.05;
      points.push(mk(100, bench, i + 1));
    }
    const r = computeBenchmarkRegret({ points })!;
    expect(r.underperformanceShare).toBeCloseTo(1, 2);
    expect(r.score).toBeGreaterThanOrEqual(70);
  });

  it("meet maxCumulativeShortfall als fractie", () => {
    const points: EquityPoint[] = [];
    let bench = 100;
    for (let i = 0; i < 12; i++) {
      if (i > 0) bench *= 1.03;
      points.push(mk(100, bench, i + 1));
    }
    const r = computeBenchmarkRegret({ points })!;
    expect(r.maxCumulativeShortfall).toBeGreaterThan(0);
    expect(r.maxCumulativeShortfall).toBeLessThan(1);
  });
});
