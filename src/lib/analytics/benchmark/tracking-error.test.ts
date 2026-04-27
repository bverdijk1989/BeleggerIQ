import { describe, expect, it } from "vitest";

import {
  annualizedTrackingError,
  excessReturns,
  informationRatio,
} from "./tracking-error";

describe("excessReturns", () => {
  it("returns difference per period", () => {
    const r = excessReturns([0.02, 0.01, -0.03], [0.01, 0.01, -0.01]);
    expect(r.length).toBe(3);
    expect(r[0]!).toBeCloseTo(0.01, 6);
    expect(r[1]!).toBeCloseTo(0, 6);
    expect(r[2]!).toBeCloseTo(-0.02, 6);
  });

  it("filters non-finite samples", () => {
    const r = excessReturns([0.02, NaN, 0.01], [0.01, 0.01, 0]);
    expect(r.length).toBe(2);
    expect(r[0]!).toBeCloseTo(0.01, 6);
    expect(r[1]!).toBeCloseTo(0.01, 6);
  });

  it("empty when no overlap", () => {
    expect(excessReturns([], [0.01])).toEqual([]);
  });
});

describe("annualizedTrackingError", () => {
  it("zero on identical returns", () => {
    expect(annualizedTrackingError([0.01, 0.01, 0.01], [0.01, 0.01, 0.01])).toBe(
      0,
    );
  });

  it("positive when returns diverge", () => {
    const portfolio = [0.05, -0.02, 0.04, -0.01];
    const benchmark = [0.02, 0.01, 0.02, 0.01];
    const te = annualizedTrackingError(portfolio, benchmark);
    expect(te).toBeGreaterThan(0);
    // Should annualise via √12 → te should be larger than monthly stdev
    expect(te).toBeGreaterThan(0.05);
  });

  it("zero on < 2 samples", () => {
    expect(annualizedTrackingError([0.01], [0.01])).toBe(0);
    expect(annualizedTrackingError([], [])).toBe(0);
  });
});

describe("informationRatio", () => {
  it("null when tracking error is 0", () => {
    expect(informationRatio(0.1, 0.05, 12, 0)).toBeNull();
  });

  it("positive when portfolio outperforms", () => {
    const ir = informationRatio(0.2, 0.1, 24, 0.05);
    expect(ir).not.toBeNull();
    expect(ir!).toBeGreaterThan(0);
  });

  it("null when wipeout (1+r ≤ 0)", () => {
    expect(informationRatio(-1, 0.1, 12, 0.05)).toBeNull();
  });
});
