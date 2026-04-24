import { describe, expect, it } from "vitest";

import type { EquityPoint } from "@/types/backtest";

import { computeRollingReturns } from "./rolling-windows";

function makePoints(values: number[], benchmark?: number[]): EquityPoint[] {
  const base = new Date("2020-01-31");
  return values.map((v, i) => ({
    date: new Date(base.getFullYear(), base.getMonth() + i, 0)
      .toISOString()
      .slice(0, 10),
    value: v,
    benchmark: benchmark?.[i],
  }));
}

describe("computeRollingReturns", () => {
  it("retourneert leeg summary bij minder punten dan windowMonths", () => {
    const r = computeRollingReturns({
      points: makePoints([100, 102, 105]),
      windowMonths: 12,
    });
    expect(r.count).toBe(0);
    expect(r.worst).toBeNull();
    expect(r.best).toBeNull();
  });

  it("berekent 12m return voor een oplopende reeks", () => {
    // 13 values: 100, 101, …, 112. Window 0..11 → 100→111 = 0.11.
    const values = Array.from({ length: 13 }, (_, i) => 100 * (1 + i * 0.01));
    const r = computeRollingReturns({
      points: makePoints(values),
      windowMonths: 12,
    });
    // window 1: indices 0..11 → 100→111 = 0.11
    // window 2: indices 1..12 → 101→112 ≈ 0.10891
    expect(r.count).toBe(2);
    expect(r.entries[0]!.strategyReturn).toBeCloseTo(0.11, 2);
    expect(r.entries[1]!.strategyReturn).toBeCloseTo(112 / 101 - 1, 4);
  });

  it("excess-return is null zonder benchmark", () => {
    const values = Array.from({ length: 14 }, (_, i) => 100 + i);
    const r = computeRollingReturns({
      points: makePoints(values),
      windowMonths: 12,
    });
    expect(r.entries[0]!.excessReturn).toBeNull();
  });

  it("excess-return gezet wanneer benchmark compleet is", () => {
    const values = Array.from({ length: 14 }, (_, i) => 100 + i * 2);
    const bench = Array.from({ length: 14 }, (_, i) => 100 + i);
    const r = computeRollingReturns({
      points: makePoints(values, bench),
      windowMonths: 12,
    });
    expect(r.entries[0]!.excessReturn).toBeCloseTo(
      r.entries[0]!.strategyReturn - (r.entries[0]!.benchmarkReturn ?? 0),
      8,
    );
  });

  it("worst/best identificeren extreem negatieve/positieve vensters", () => {
    const values = [
      100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
      80, // crash → 12m venster eindigend op index 12: 80/100 - 1 = -20%
      120, // 12m venster eindigend op index 13: 120/100 - 1 = +20%
    ];
    const r = computeRollingReturns({
      points: makePoints(values),
      windowMonths: 12,
    });
    // 14 values → 3 windows van 12m: (idx 0..11), (1..12), (2..13).
    expect(r.count).toBe(3);
    expect(r.worst!.strategyReturn).toBeCloseTo(-0.2, 2);
    expect(r.best!.strategyReturn).toBeCloseTo(0.2, 2);
    expect(r.negativeCount).toBe(1);
    expect(r.negativeShare).toBeCloseTo(1 / 3, 2);
  });
});
