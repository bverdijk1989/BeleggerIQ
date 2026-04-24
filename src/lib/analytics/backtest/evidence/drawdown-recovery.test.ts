import { describe, expect, it } from "vitest";

import type { EquityPoint } from "@/types/backtest";

import { computeDrawdownRecovery } from "./drawdown-recovery";

function mk(value: number, monthIdx: number): EquityPoint {
  return {
    date: `2020-${String(((monthIdx - 1) % 12) + 1).padStart(2, "0")}-28`,
    value,
  };
}

describe("computeDrawdownRecovery", () => {
  it("leeg bij minder dan 2 punten", () => {
    const r = computeDrawdownRecovery({ points: [mk(100, 1)] });
    expect(r.entries).toEqual([]);
    expect(r.inProgress).toBe(false);
  });

  it("detecteert complete peak-trough-recovery cyclus", () => {
    const points: EquityPoint[] = [
      mk(100, 1),
      mk(110, 2), // peak
      mk(88, 3), // trough (-20%)
      mk(95, 4),
      mk(110, 5), // recovery
    ];
    const r = computeDrawdownRecovery({ points, minDepth: -0.1 });
    expect(r.entries.length).toBe(1);
    const e = r.entries[0]!;
    expect(e.depth).toBeCloseTo(-0.2, 2);
    expect(e.recoveryDate).not.toBeNull();
    expect(e.monthsToRecovery).toBe(3);
  });

  it("flag inProgress bij open drawdown", () => {
    const points: EquityPoint[] = [
      mk(100, 1),
      mk(120, 2), // peak
      mk(90, 3), // -25%
      mk(95, 4),
    ];
    const r = computeDrawdownRecovery({ points, minDepth: -0.1 });
    expect(r.inProgress).toBe(true);
    expect(r.entries[0]!.recoveryDate).toBeNull();
    expect(r.entries[0]!.monthsToRecovery).toBeNull();
  });

  it("filtert dippen onder minDepth", () => {
    const points: EquityPoint[] = [
      mk(100, 1),
      mk(110, 2),
      mk(107, 3), // -2.7% — onder drempel
      mk(115, 4),
    ];
    const r = computeDrawdownRecovery({ points, minDepth: -0.05 });
    expect(r.entries).toEqual([]);
  });

  it("berekent longest + average recovery", () => {
    const points: EquityPoint[] = [
      mk(100, 1),
      mk(110, 2), // peak 1
      mk(88, 3), // trough
      mk(110, 4), // recovery (2m)
      mk(130, 5), // peak 2
      mk(90, 6), // trough
      mk(100, 7),
      mk(110, 8),
      mk(130, 9), // recovery (4m)
    ];
    const r = computeDrawdownRecovery({ points, minDepth: -0.1 });
    expect(r.entries.length).toBe(2);
    expect(r.longestRecoveryMonths).toBe(4);
    expect(r.averageRecoveryMonths).toBe(3);
  });
});
