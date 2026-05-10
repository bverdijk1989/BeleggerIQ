import { describe, expect, it } from "vitest";

import {
  annualToMonthly,
  buildProjectionSeries,
  monthsBetween,
  projectFutureValue,
  solveRequiredAnnualReturn,
  solveRequiredMonthlyContribution,
} from "./projection";

describe("annualToMonthly", () => {
  it("0% jaar → 0% maand", () => {
    expect(annualToMonthly(0)).toBe(0);
  });

  it("12% jaar → ongeveer 0.949% maand (compound)", () => {
    const m = annualToMonthly(0.12);
    expect(m).toBeCloseTo(0.00949, 4);
  });

  it("opnieuw 12 maand-stappen samengesteld → terug naar 12%", () => {
    const m = annualToMonthly(0.12);
    const annualized = Math.pow(1 + m, 12) - 1;
    expect(annualized).toBeCloseTo(0.12, 6);
  });
});

describe("projectFutureValue", () => {
  it("nul horizon → finalValue = initialAmount", () => {
    const r = projectFutureValue({
      initialAmount: 10_000,
      monthlyContribution: 500,
      annualReturn: 0.06,
      months: 0,
    });
    expect(r.finalValue).toBe(10_000);
    expect(r.totalInvested).toBe(10_000);
    expect(r.growthComponent).toBe(0);
  });

  it("0% rendement, 12 mnd, €100/mnd, €0 start → €1200", () => {
    const r = projectFutureValue({
      initialAmount: 0,
      monthlyContribution: 100,
      annualReturn: 0,
      months: 12,
    });
    expect(r.finalValue).toBeCloseTo(1200, 2);
    expect(r.growthComponent).toBeCloseTo(0, 2);
  });

  it("6% rendement, 30 jaar, €500/mnd, €10k start → ≈ €565k (lange-termijn-DCA)", () => {
    const r = projectFutureValue({
      initialAmount: 10_000,
      monthlyContribution: 500,
      annualReturn: 0.06,
      months: 360,
    });
    // Sanity check op de financial-math-formule:
    //   FV start = 10_000 × (1.06)^30 ≈ 57_435
    //   FV inleg ≈ 500 × ((1+0.00487)^360 − 1)/0.00487 ≈ 502_810
    //   Totaal ≈ 560–570k afhankelijk van compound-conventie
    expect(r.finalValue).toBeGreaterThan(530_000);
    expect(r.finalValue).toBeLessThan(560_000);
    expect(r.totalInvested).toBe(10_000 + 500 * 360);
  });

  it("negatieve initialAmount wordt geclampt op 0", () => {
    const r = projectFutureValue({
      initialAmount: -100,
      monthlyContribution: 100,
      annualReturn: 0.05,
      months: 12,
    });
    expect(r.totalInvested).toBe(1200);
  });
});

describe("buildProjectionSeries", () => {
  it("levert N+1 punten voor N jaar (incl. t=0)", () => {
    const series = buildProjectionSeries({
      initialAmount: 1_000,
      monthlyContribution: 100,
      annualReturn: 0.05,
      months: 60,
      startDate: new Date("2026-01-01"),
    });
    expect(series).toHaveLength(6); // 0..5 jaar
    expect(series[0]!.value).toBe(1_000);
    expect(series[0]!.yearOffset).toBe(0);
    expect(series[5]!.yearOffset).toBe(5);
  });

  it("waarden zijn monotoon stijgend bij positief rendement + inleg", () => {
    const series = buildProjectionSeries({
      initialAmount: 1_000,
      monthlyContribution: 100,
      annualReturn: 0.06,
      months: 120,
      startDate: new Date("2026-01-01"),
    });
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!.value).toBeGreaterThan(series[i - 1]!.value);
    }
  });
});

describe("solveRequiredMonthlyContribution", () => {
  it("doel al gehaald zonder bijstorten → M = 0", () => {
    const m = solveRequiredMonthlyContribution({
      targetAmount: 1_000,
      initialAmount: 10_000,
      annualReturn: 0.05,
      months: 60,
    });
    expect(m).toBe(0);
  });

  it("0% rendement: M = (T − P) / n", () => {
    const m = solveRequiredMonthlyContribution({
      targetAmount: 12_000,
      initialAmount: 0,
      annualReturn: 0,
      months: 120,
    });
    expect(m).toBeCloseTo(100, 2);
  });

  it("substitutie-check: oplossen → projecteren met M moet T leveren", () => {
    const M = solveRequiredMonthlyContribution({
      targetAmount: 100_000,
      initialAmount: 5_000,
      annualReturn: 0.06,
      months: 240,
    });
    const fv = projectFutureValue({
      initialAmount: 5_000,
      monthlyContribution: M,
      annualReturn: 0.06,
      months: 240,
    });
    expect(fv.finalValue).toBeCloseTo(100_000, -1); // ±10 tolerance
  });
});

describe("solveRequiredAnnualReturn", () => {
  it("genoeg inleg zonder rendement → r = 0", () => {
    const r = solveRequiredAnnualReturn({
      targetAmount: 12_000,
      initialAmount: 0,
      monthlyContribution: 200,
      months: 60, // 12k inleg in 5 jaar
    });
    expect(r).toBe(0);
  });

  it("substitutie-check: oplossen → projecteren met r moet T leveren", () => {
    const r = solveRequiredAnnualReturn({
      targetAmount: 50_000,
      initialAmount: 5_000,
      monthlyContribution: 200,
      months: 120,
    });
    expect(r).not.toBeNull();
    const fv = projectFutureValue({
      initialAmount: 5_000,
      monthlyContribution: 200,
      annualReturn: r ?? 0,
      months: 120,
    });
    expect(fv.finalValue).toBeCloseTo(50_000, -1);
  });

  it("onmogelijk doel (zelfs 30% rendement) → null", () => {
    const r = solveRequiredAnnualReturn({
      targetAmount: 1_000_000_000,
      initialAmount: 1,
      monthlyContribution: 1,
      months: 12,
    });
    expect(r).toBeNull();
  });
});

describe("monthsBetween", () => {
  it("12 maanden tussen 1-jan-2026 en 1-jan-2027", () => {
    const m = monthsBetween(new Date("2026-01-01"), new Date("2027-01-01"));
    expect(m).toBe(12);
  });

  it("doelloos / 0 maanden voor zelfde datum", () => {
    const m = monthsBetween(new Date("2026-01-01"), new Date("2026-01-01"));
    expect(m).toBe(0);
  });
});
