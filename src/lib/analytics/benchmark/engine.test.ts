import { describe, expect, it } from "vitest";

import { buildBenchmarkReport } from "./engine";
import type { AttributionBreakdown, BenchmarkPerformance } from "./types";

const NOW = "2026-04-25T00:00:00.000Z";

function performance(overrides: Partial<BenchmarkPerformance> = {}): BenchmarkPerformance {
  return {
    benchmark: { id: "MSCI_WORLD", label: "MSCI World", ticker: "IWDA.AS", usedFallback: false },
    periodStart: "2024-01",
    periodEnd: "2024-12",
    monthsObserved: 12,
    portfolioReturn: 0.12,
    benchmarkReturn: 0.10,
    alpha: 0.02,
    trackingError: 0.04,
    informationRatio: 0.5,
    portfolioSeries: [],
    benchmarkSeries: [],
    warnings: [],
    ...overrides,
  };
}

function attribution(overrides: Partial<AttributionBreakdown> = {}): AttributionBreakdown {
  return {
    sectors: [],
    factors: [],
    stocks: [],
    totalSectorContribution: 0,
    totalFactorContribution: 0,
    totalStockContribution: 0,
    residualAlpha: 0,
    ...overrides,
  };
}

describe("buildBenchmarkReport", () => {
  it("verdict bij outperformance noemt 'boven' + alpha", () => {
    const r = buildBenchmarkReport({
      performance: performance({ alpha: 0.05 }),
      attribution: attribution(),
      now: NOW,
    });
    expect(r.verdict).toMatch(/boven/);
    expect(r.verdict).toMatch(/5\.0%/);
  });

  it("verdict bij underperformance noemt 'onder'", () => {
    const r = buildBenchmarkReport({
      performance: performance({ alpha: -0.03 }),
      attribution: attribution(),
      now: NOW,
    });
    expect(r.verdict).toMatch(/onder/);
  });

  it("verdict bij ~vlakke alpha noemt 'in lijn met'", () => {
    const r = buildBenchmarkReport({
      performance: performance({ alpha: 0.001 }),
      attribution: attribution(),
      now: NOW,
    });
    expect(r.verdict).toMatch(/in lijn met/);
  });

  it("verdict noemt top-sector als positief", () => {
    const r = buildBenchmarkReport({
      performance: performance({ alpha: 0.05 }),
      attribution: attribution({
        sectors: [
          { key: "sector:Tech", label: "Tech", weight: 0.5, bucketReturn: 0.3, benchmarkReturn: 0.1, contribution: 0.1, positions: 3 },
          { key: "sector:Energy", label: "Energy", weight: 0.2, bucketReturn: -0.1, benchmarkReturn: 0.1, contribution: -0.04, positions: 2 },
        ],
      }),
      now: NOW,
    });
    expect(r.verdict).toMatch(/Tech/);
    expect(r.verdict).toMatch(/Energy/);
  });

  it("verdict bij geen observaties = duidelijke fallback-string", () => {
    const r = buildBenchmarkReport({
      performance: performance({ monthsObserved: 0 }),
      attribution: attribution(),
      now: NOW,
    });
    expect(r.verdict).toMatch(/Onvoldoende data/);
  });
});
