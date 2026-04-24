import { describe, expect, it } from "vitest";

import type { EquityPoint } from "@/types/backtest";

import { computeDcaSimulation } from "./dca-simulation";

function constantReturnsPoints(
  months: number,
  monthlyReturn: number,
  benchmark?: number,
): EquityPoint[] {
  const out: EquityPoint[] = [];
  let value = 100;
  let benchValue = benchmark;
  for (let i = 0; i < months; i++) {
    if (i > 0) {
      value = value * (1 + monthlyReturn);
      if (typeof benchValue === "number") benchValue = benchValue * (1 + monthlyReturn / 2);
    }
    out.push({
      date: `2020-${String(((i % 12) + 1)).padStart(2, "0")}-28`,
      value,
      benchmark: typeof benchValue === "number" ? benchValue : undefined,
    });
  }
  return out;
}

describe("computeDcaSimulation", () => {
  it("retourneert leeg resultaat bij < 2 punten", () => {
    const r = computeDcaSimulation({
      points: [],
      initialCapital: 0,
      monthlyContribution: 100,
    });
    expect(r.months).toBe(0);
    expect(r.finalValue).toBe(0);
  });

  it("zonder rendementen: finalValue == totalContributed", () => {
    const points = constantReturnsPoints(13, 0);
    const r = computeDcaSimulation({
      points,
      initialCapital: 0,
      monthlyContribution: 100,
    });
    expect(r.totalContributed).toBeCloseTo(1200, 2);
    expect(r.finalValue).toBeCloseTo(1200, 1);
    expect(r.profit).toBeCloseTo(0, 1);
  });

  it("positief rendement: finalValue > totalContributed", () => {
    const points = constantReturnsPoints(13, 0.01); // +1%/m
    const r = computeDcaSimulation({
      points,
      initialCapital: 0,
      monthlyContribution: 100,
    });
    expect(r.finalValue).toBeGreaterThan(r.totalContributed);
    expect(r.moneyWeightedReturn).toBeGreaterThan(0.05);
  });

  it("benchmarkFinalValue null wanneer benchmark ontbreekt", () => {
    const points = constantReturnsPoints(13, 0.01);
    const r = computeDcaSimulation({
      points,
      initialCapital: 0,
      monthlyContribution: 100,
    });
    expect(r.benchmarkFinalValue).toBeNull();
    expect(r.benchmarkMoneyWeightedReturn).toBeNull();
  });

  it("benchmarkFinalValue gevuld wanneer benchmark op alle punten", () => {
    const points = constantReturnsPoints(13, 0.01, 100);
    const r = computeDcaSimulation({
      points,
      initialCapital: 0,
      monthlyContribution: 100,
    });
    expect(r.benchmarkFinalValue).not.toBeNull();
    expect(r.benchmarkProfit).not.toBeNull();
  });

  it("money-weighted return positief bij groeiende waarde met inleg", () => {
    const points = constantReturnsPoints(25, 0.005);
    const r = computeDcaSimulation({
      points,
      initialCapital: 1000,
      monthlyContribution: 100,
    });
    expect(r.moneyWeightedReturn).toBeGreaterThan(0);
    expect(Number.isFinite(r.moneyWeightedReturn)).toBe(true);
  });
});
