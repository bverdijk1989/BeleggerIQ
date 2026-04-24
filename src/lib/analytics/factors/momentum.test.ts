import { describe, expect, it } from "vitest";

import {
  computeMomentumMetrics,
  scoreMomentum,
  scoreMomentumFromMetrics,
} from "./momentum";
import type { HistoricalPoint } from "@/types/market";

function buildUptrend(): HistoricalPoint[] {
  // 13 maandpunten: van 100 naar 140 (+40% in 12m)
  const start = new Date("2025-04-01T00:00:00Z");
  const points: HistoricalPoint[] = [];
  for (let i = 0; i <= 12; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i);
    points.push({
      date: d.toISOString().slice(0, 10),
      close: 100 + i * (40 / 12),
    });
  }
  return points;
}

function buildDowntrend(): HistoricalPoint[] {
  const start = new Date("2025-04-01T00:00:00Z");
  const points: HistoricalPoint[] = [];
  for (let i = 0; i <= 12; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i);
    points.push({
      date: d.toISOString().slice(0, 10),
      close: 100 - i * (30 / 12),
    });
  }
  return points;
}

describe("computeMomentumMetrics", () => {
  it("berekent positieve 6m- en 12m-trend bij uptrend", () => {
    const metrics = computeMomentumMetrics(buildUptrend());
    expect(metrics.return12m).toBeCloseTo(0.4, 2);
    expect(metrics.return6m).toBeGreaterThan(0);
    expect(metrics.distanceFromHigh52w).toBeCloseTo(0, 2);
  });

  it("berekent negatieve trend bij downtrend", () => {
    const metrics = computeMomentumMetrics(buildDowntrend());
    expect(metrics.return12m).toBeLessThan(0);
    expect(metrics.distanceFromHigh52w).toBeGreaterThan(0);
  });

  it("retourneert nulls bij lege history", () => {
    const metrics = computeMomentumMetrics([]);
    expect(metrics.return12m).toBeNull();
  });
});

describe("scoreMomentum", () => {
  it("uptrend levert hoge score", () => {
    const result = scoreMomentum(buildUptrend());
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("downtrend levert lage score", () => {
    const result = scoreMomentum(buildDowntrend());
    expect(result.score).toBeLessThanOrEqual(30);
  });

  it("lege history → neutraal 50", () => {
    expect(scoreMomentum([]).score).toBe(50);
    expect(scoreMomentum(null).score).toBe(50);
  });
});

describe("scoreMomentumFromMetrics", () => {
  it("accepteert pre-computed metrics", () => {
    const result = scoreMomentumFromMetrics({
      return6m: 0.2,
      return12m: 0.4,
      return12m1m: 0.35,
      distanceFromHigh52w: 0.02,
    });
    expect(result.score).toBeGreaterThanOrEqual(70);
  });
});
