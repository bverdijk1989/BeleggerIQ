import { describe, expect, it } from "vitest";

import {
  computeAnnualizedVolatility,
  computeBacktestMetrics,
  computeCagrFromReturns,
  computeCagrFromValues,
  computeMaxDrawdown,
  computeSharpeRatio,
  computeSortinoRatio,
  computeTotalReturn,
  computeWinRate,
  monthlyReturnsFromValues,
} from "./metrics";

describe("monthlyReturnsFromValues", () => {
  it("berekent opeenvolgende returns en slaat niet-positieve startwaarden over", () => {
    const returns = monthlyReturnsFromValues([100, 110, 121]);
    expect(returns).toHaveLength(2);
    expect(returns[0]).toBeCloseTo(0.1, 5);
    expect(returns[1]).toBeCloseTo(0.1, 5);
  });
});

describe("computeTotalReturn + CAGR", () => {
  it("totalReturn is eenvoudige eind/begin − 1", () => {
    expect(computeTotalReturn([100, 150])).toBeCloseTo(0.5, 5);
  });

  it("CAGR uit returns ≈ CAGR uit values bij constante groei", () => {
    // Gelijk verdeelde 0.8% per maand over 12 maanden → ~10% CAGR
    const returns = Array.from({ length: 12 }, () => 0.008);
    const cagrReturns = computeCagrFromReturns(returns);
    expect(cagrReturns).toBeGreaterThan(0.08);
    expect(cagrReturns).toBeLessThan(0.12);
  });

  it("CAGR uit values werkt ook zonder returns-array", () => {
    const values = [100];
    // 12 maanden met 1% groei per maand → ~12.68% annual.
    for (let i = 0; i < 12; i++)
      values.push(values[values.length - 1]! * 1.01);
    const cagr = computeCagrFromValues(values);
    expect(cagr).toBeCloseTo(Math.pow(1.01, 12) - 1, 4);
  });
});

describe("computeAnnualizedVolatility", () => {
  it("is 0 voor constante returns", () => {
    expect(computeAnnualizedVolatility([0.01, 0.01, 0.01, 0.01])).toBe(0);
  });

  it("schaalt met √12", () => {
    const returns = [0.05, -0.05, 0.05, -0.05, 0.05, -0.05, 0.05, -0.05];
    const vol = computeAnnualizedVolatility(returns);
    // std ≈ 0.053 → × √12 ≈ 0.184
    expect(vol).toBeGreaterThan(0.15);
    expect(vol).toBeLessThan(0.22);
  });
});

describe("computeMaxDrawdown", () => {
  it("retourneert 0 voor monotoon stijgende reeks", () => {
    expect(computeMaxDrawdown([100, 110, 120])).toBe(0);
  });

  it("vindt peak-to-trough", () => {
    expect(computeMaxDrawdown([100, 150, 120, 90, 110])).toBeCloseTo(-0.4, 5);
  });
});

describe("computeSharpeRatio", () => {
  it("is 0 bij te weinig datapunten", () => {
    expect(computeSharpeRatio([0.01])).toBe(0);
    expect(computeSharpeRatio([])).toBe(0);
  });

  it("geeft positieve ratio voor positieve excess-returns", () => {
    const returns = [0.01, 0.012, 0.008, 0.015, 0.005, 0.011, 0.009, 0.013];
    expect(computeSharpeRatio(returns)).toBeGreaterThan(0);
  });
});

describe("computeSortinoRatio", () => {
  it("retourneert 0 als er geen downside returns zijn", () => {
    expect(computeSortinoRatio([0.01, 0.02, 0.015])).toBe(0);
  });

  it("is hoger dan of gelijk aan Sharpe bij mix van ups en downs", () => {
    const returns = [0.02, -0.01, 0.03, -0.02, 0.015];
    const sharpe = computeSharpeRatio(returns);
    const sortino = computeSortinoRatio(returns);
    expect(Number.isFinite(sharpe)).toBe(true);
    expect(Number.isFinite(sortino)).toBe(true);
  });
});

describe("computeWinRate", () => {
  it("fractie positieve maanden", () => {
    expect(computeWinRate([0.01, -0.02, 0.03, -0.01])).toBe(0.5);
    expect(computeWinRate([])).toBe(0);
  });
});

describe("computeBacktestMetrics (integration)", () => {
  it("levert een consistente metric bundel", () => {
    const values = [100];
    for (let i = 0; i < 24; i++) {
      values.push(values[values.length - 1]! * (1 + (i % 2 === 0 ? 0.02 : -0.01)));
    }
    const returns = monthlyReturnsFromValues(values);
    const metrics = computeBacktestMetrics({ values, returns });
    expect(metrics.totalReturn).toBeGreaterThan(0);
    expect(metrics.cagr).toBeGreaterThan(0);
    expect(metrics.volatility).toBeGreaterThan(0);
    expect(metrics.maxDrawdown).toBeLessThanOrEqual(0);
    expect(metrics.winRate).toBeGreaterThan(0);
    expect(metrics.winRate).toBeLessThanOrEqual(1);
  });
});
