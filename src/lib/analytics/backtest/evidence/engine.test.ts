import { describe, expect, it } from "vitest";

import type { BacktestConfig, BacktestResult, EquityPoint } from "@/types/backtest";

import { buildEvidenceReport } from "./engine";

const NOW = "2026-04-25T00:00:00.000Z";

function makeConfig(overrides: Partial<BacktestConfig> = {}): BacktestConfig {
  return {
    name: "test",
    startDate: "2020-01-31",
    endDate: "2020-12-31",
    initialCapital: 10_000,
    baseCurrency: "EUR",
    monthlyContribution: 500,
    rebalance: "monthly",
    includeCosts: false,
    includeTaxes: false,
    universe: ["A", "B"],
    ...overrides,
  };
}

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

function makeResult(
  values: number[],
  benchmark?: number[],
): BacktestResult {
  const equityCurve = makePoints(values, benchmark);
  return {
    config: makeConfig(),
    equityCurve,
    totalReturn:
      values.length > 1 ? values[values.length - 1]! / values[0]! - 1 : 0,
    cagr: 0.08,
    volatility: 0.15,
    sharpe: 0.5,
    sortino: 0.6,
    maxDrawdown: -0.12,
    calmar: 0.7,
    winRate: 0.55,
    turnover: 0.2,
    finalValue: values[values.length - 1] ?? 0,
    tradesCount: 12,
    benchmark: benchmark
      ? {
          ticker: "SPY",
          totalReturn: benchmark[benchmark.length - 1]! / benchmark[0]! - 1,
          cagr: 0.06,
          volatility: 0.13,
          maxDrawdown: -0.1,
        }
      : undefined,
  };
}

describe("buildEvidenceReport — orkestrator", () => {
  it("produceert lege analytics bij lege equity-curve", () => {
    const r = buildEvidenceReport({
      result: makeResult([]),
      strategyLabel: "Test",
      config: { now: NOW },
    });
    expect(r.monthsObserved).toBe(0);
    expect(r.regimeBreakdown).toEqual([]);
    expect(r.rollingTwelveMonth.count).toBe(0);
    expect(r.benchmarkRegret).toBeNull();
    expect(r.verdict.headline).toContain("Test");
    expect(r.verdict.limitations.length).toBeGreaterThan(0);
  });

  it("vult alle deelanalyses bij volledige data", () => {
    const values = Array.from({ length: 24 }, (_, i) => 10000 * (1 + i * 0.01));
    const bench = Array.from({ length: 24 }, (_, i) => 10000 * (1 + i * 0.005));
    const r = buildEvidenceReport({
      result: makeResult(values, bench),
      strategyLabel: "Quality",
      benchmarkLabel: "SPY",
      config: { now: NOW },
    });
    expect(r.monthsObserved).toBe(23);
    expect(r.rollingTwelveMonth.count).toBeGreaterThan(0);
    expect(r.worstTwelveMonth).not.toBeNull();
    expect(r.bestTwelveMonth).not.toBeNull();
    expect(r.benchmarkRegret).not.toBeNull();
    expect(r.dcaSimulation.months).toBe(23);
    expect(r.verdict.confidence).toBeGreaterThan(0.5);
  });

  it("verdict bevat highlights met cijfers", () => {
    const values = Array.from({ length: 36 }, (_, i) => 10000 + i * 100);
    const bench = Array.from({ length: 36 }, (_, i) => 10000 + i * 80);
    const r = buildEvidenceReport({
      result: makeResult(values, bench),
      strategyLabel: "Quality",
      config: { now: NOW },
    });
    expect(r.verdict.highlights.some((h) => /CAGR/i.test(h))).toBe(true);
    expect(r.verdict.highlights.some((h) => /12m-venster/i.test(h))).toBe(true);
  });

  it("limiteert verdict-confidence wanneer benchmark mist", () => {
    const values = Array.from({ length: 36 }, (_, i) => 10000 + i * 100);
    const r = buildEvidenceReport({
      result: makeResult(values),
      strategyLabel: "Quality",
      config: { now: NOW },
    });
    expect(r.verdict.limitations.some((l) => /benchmark/i.test(l))).toBe(true);
    expect(r.benchmarkRegret).toBeNull();
  });

  it("is deterministisch met expliciete now", () => {
    const values = Array.from({ length: 24 }, (_, i) => 10000 * (1 + i * 0.005));
    const bench = Array.from({ length: 24 }, (_, i) => 10000 * (1 + i * 0.004));
    const result = makeResult(values, bench);
    const a = buildEvidenceReport({
      result,
      strategyLabel: "X",
      config: { now: NOW },
    });
    const b = buildEvidenceReport({
      result,
      strategyLabel: "X",
      config: { now: NOW },
    });
    expect(a).toEqual(b);
  });
});
