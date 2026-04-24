import { describe, expect, it } from "vitest";

import { computeMaxDrawdown, classifyDrawdown } from "./drawdown";
import { DEFAULT_RISK_THRESHOLDS } from "./thresholds";
import type { HistoricalPoint } from "@/types/market";

function mkPoints(closes: number[]): HistoricalPoint[] {
  return closes.map((close, i) => {
    const d = new Date("2025-01-01T00:00:00Z");
    d.setDate(d.getDate() + i);
    return { date: d.toISOString().slice(0, 10), close };
  });
}

describe("computeMaxDrawdown", () => {
  it("retourneert 0 voor lege of monotoon stijgende reeks", () => {
    expect(computeMaxDrawdown([])).toBe(0);
    expect(computeMaxDrawdown(mkPoints([100, 105, 110]))).toBe(0);
  });

  it("berekent grootste peak-to-trough daling", () => {
    const points = mkPoints([100, 120, 90, 110, 80, 120]);
    // peak = 120, trough = 80 → drawdown = -1/3
    expect(computeMaxDrawdown(points)).toBeCloseTo(-1 / 3, 4);
  });

  it("kiest de diepste drawdown, niet de recentste", () => {
    const points = mkPoints([100, 150, 120, 140, 90, 130]);
    // first peak 150, trough 90 → -0.4
    // recent peak 140, trough 90 → -0.357
    expect(computeMaxDrawdown(points)).toBeCloseTo(-0.4, 4);
  });
});

describe("classifyDrawdown", () => {
  it("gebruikt absolute waarde voor classificatie", () => {
    expect(classifyDrawdown(-0.05, DEFAULT_RISK_THRESHOLDS)).toBe("low");
    expect(classifyDrawdown(-0.25, DEFAULT_RISK_THRESHOLDS)).toBe("moderate");
    expect(classifyDrawdown(-0.5, DEFAULT_RISK_THRESHOLDS)).toBe("high");
  });

  it("retourneert moderate bij null/undefined", () => {
    expect(classifyDrawdown(null, DEFAULT_RISK_THRESHOLDS)).toBe("moderate");
    expect(classifyDrawdown(undefined, DEFAULT_RISK_THRESHOLDS)).toBe(
      "moderate",
    );
  });
});
