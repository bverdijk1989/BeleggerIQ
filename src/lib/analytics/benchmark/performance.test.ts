import { describe, expect, it } from "vitest";

import type { HistoricalPoint } from "@/types/market";

import { computeBenchmarkPerformance } from "./performance";
import { BENCHMARK_CATALOG } from "./types";

function bench(values: number[]): HistoricalPoint[] {
  return values.map((close, i) => ({
    date: `2024-${String(i + 1).padStart(2, "0")}-28`,
    close,
  }));
}

function port(values: number[], contribs: number[] = []) {
  return values.map((totalValue, i) => ({
    date: `2024-${String(i + 1).padStart(2, "0")}-28`,
    totalValue,
    cumulativeContribution: contribs[i] ?? 0,
  }));
}

const BENCH = BENCHMARK_CATALOG.MSCI_WORLD;

describe("computeBenchmarkPerformance", () => {
  it("retourneert nullen bij minder dan 2 overlappende maanden", () => {
    const r = computeBenchmarkPerformance({
      portfolioSeries: port([10000]),
      benchmarkHistory: bench([100]),
      benchmark: BENCH,
      benchmarkResolvedTicker: BENCH.ticker,
      benchmarkUsedFallback: false,
    });
    expect(r.monthsObserved).toBe(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("portefeuille +20%, benchmark +10% → alpha ~10%", () => {
    const r = computeBenchmarkPerformance({
      portfolioSeries: port([
        10000, 10500, 11000, 11500, 11800, 12000,
      ]),
      benchmarkHistory: bench([100, 102, 105, 107, 109, 110]),
      benchmark: BENCH,
      benchmarkResolvedTicker: BENCH.ticker,
      benchmarkUsedFallback: false,
    });
    expect(r.portfolioReturn).toBeCloseTo(0.2, 2);
    expect(r.benchmarkReturn).toBeCloseTo(0.1, 2);
    expect(r.alpha).toBeCloseTo(0.1, 2);
    expect(r.monthsObserved).toBe(5);
  });

  it("contributions worden NIET als rendement geteld", () => {
    // Portfolio gaat van 10k → 11k, maar 1k is bijgestort. Echte
    // return = 0%. Benchmark blijft flat.
    const r = computeBenchmarkPerformance({
      portfolioSeries: port([10000, 11000], [0, 1000]),
      benchmarkHistory: bench([100, 100]),
      benchmark: BENCH,
      benchmarkResolvedTicker: BENCH.ticker,
      benchmarkUsedFallback: false,
    });
    expect(r.portfolioReturn).toBeCloseTo(0, 4);
    expect(r.benchmarkReturn).toBeCloseTo(0, 4);
  });

  it("normaliseert beide series naar start = 100", () => {
    const r = computeBenchmarkPerformance({
      portfolioSeries: port([10000, 11000, 12000]),
      benchmarkHistory: bench([100, 105, 110]),
      benchmark: BENCH,
      benchmarkResolvedTicker: BENCH.ticker,
      benchmarkUsedFallback: false,
    });
    expect(r.portfolioSeries[0]!.index).toBe(100);
    expect(r.benchmarkSeries[0]!.index).toBe(100);
    expect(r.portfolioSeries[2]!.index).toBeCloseTo(120, 2);
    expect(r.benchmarkSeries[2]!.index).toBeCloseTo(110, 2);
  });

  it("trackingError = 0 bij identieke maand-returns", () => {
    const r = computeBenchmarkPerformance({
      portfolioSeries: port([10000, 10100, 10200, 10300]),
      benchmarkHistory: bench([100, 101, 102, 103]),
      benchmark: BENCH,
      benchmarkResolvedTicker: BENCH.ticker,
      benchmarkUsedFallback: false,
    });
    expect(r.trackingError).toBeCloseTo(0, 4);
  });

  it("warnt en passeert door bij gebruikte fallback", () => {
    const r = computeBenchmarkPerformance({
      portfolioSeries: port([10000, 10500]),
      benchmarkHistory: bench([100, 101]),
      benchmark: BENCH,
      benchmarkResolvedTicker: "URTH",
      benchmarkUsedFallback: true,
    });
    expect(r.benchmark.usedFallback).toBe(true);
    expect(r.benchmark.ticker).toBe("URTH");
  });
});
