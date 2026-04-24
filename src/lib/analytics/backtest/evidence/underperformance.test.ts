import { describe, expect, it } from "vitest";

import type { EquityPoint } from "@/types/backtest";

import { detectUnderperformancePeriods } from "./underperformance";

function mk(value: number, benchmark: number | undefined, monthIdx: number): EquityPoint {
  return {
    date: `2020-${String(((monthIdx - 1) % 12) + 1).padStart(2, "0")}-28`,
    value,
    benchmark,
  };
}

describe("detectUnderperformancePeriods", () => {
  it("detecteert 4-maand achterstand met cumulatieve shortfall", () => {
    // Strategy: flat 100. Benchmark: 100→110→121→133→146.
    const points: EquityPoint[] = [
      mk(100, 100, 1),
      mk(100, 110, 2),
      mk(100, 121, 3),
      mk(100, 133, 4),
      mk(100, 146, 5),
    ];
    const periods = detectUnderperformancePeriods({
      points,
      minMonths: 3,
      minShortfall: 0.05,
    });
    expect(periods.length).toBe(1);
    expect(periods[0]!.months).toBe(4);
    expect(periods[0]!.excessReturn).toBeLessThan(-0.3);
  });

  it("filtert korte wiebels (< minMonths)", () => {
    const points: EquityPoint[] = [
      mk(100, 100, 1),
      mk(100, 102, 2), // 1 maand achter
      mk(105, 103, 3), // weer gelijk/voor
    ];
    const periods = detectUnderperformancePeriods({
      points,
      minMonths: 3,
    });
    expect(periods).toEqual([]);
  });

  it("filtert kleine cumulatieve shortfall", () => {
    const points: EquityPoint[] = [
      mk(100, 100, 1),
      mk(100, 101, 2),
      mk(100, 102, 3),
      mk(100, 103, 4), // 3% achter na 3m — onder 5% drempel
    ];
    const periods = detectUnderperformancePeriods({
      points,
      minMonths: 3,
      minShortfall: 0.05,
    });
    expect(periods).toEqual([]);
  });

  it("sorteert slechtste achterstand eerst", () => {
    // Twee aparte onderperformance-runs, gescheiden door herstel.
    const points: EquityPoint[] = [
      mk(100, 100, 1),
      mk(100, 110, 2),
      mk(100, 121, 3),
      mk(100, 133, 4), // run 1 ~ -25% shortfall
      mk(140, 120, 5), // herstel
      mk(100, 130, 6),
      mk(100, 141, 7),
      mk(100, 152, 8), // run 2 ~ -10% shortfall
    ];
    const periods = detectUnderperformancePeriods({
      points,
      minMonths: 3,
      minShortfall: 0.05,
    });
    expect(periods.length).toBe(2);
    expect(periods[0]!.excessReturn).toBeLessThan(periods[1]!.excessReturn);
  });

  it("retourneert leeg bij ontbrekende benchmark", () => {
    const points: EquityPoint[] = [
      mk(100, undefined, 1),
      mk(100, undefined, 2),
      mk(100, undefined, 3),
    ];
    expect(
      detectUnderperformancePeriods({ points, minMonths: 2 }),
    ).toEqual([]);
  });
});
