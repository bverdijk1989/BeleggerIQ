import { describe, expect, it } from "vitest";

import type { FactorScore } from "@/types/factor";

import {
  computeAttribution,
  type PositionPerformance,
} from "./attribution";

function pos(overrides: Partial<PositionPerformance>): PositionPerformance {
  // `sector` mag expliciet `null` zijn; alleen ontbrekend valt terug op default.
  const sector =
    "sector" in overrides ? (overrides.sector ?? null) : "Tech";
  return {
    ticker: overrides.ticker ?? "X",
    name: overrides.name ?? overrides.ticker ?? "X",
    sector,
    startWeight: overrides.startWeight ?? 0.1,
    positionReturn: overrides.positionReturn ?? 0.05,
    factorScore: overrides.factorScore,
  };
}

function fs(quality: number, value: number, momentum: number): FactorScore {
  return {
    ticker: "X",
    asOf: "2024-01-01",
    subScores: { quality, value, momentum, lowVol: 50 },
    composite: 50,
  };
}

describe("computeAttribution — sectors", () => {
  it("groepeert per sector + sorteert op contributie desc", () => {
    const positions = [
      pos({ ticker: "A", sector: "Tech", startWeight: 0.4, positionReturn: 0.2 }),
      pos({ ticker: "B", sector: "Energy", startWeight: 0.3, positionReturn: -0.05 }),
      pos({ ticker: "C", sector: "Tech", startWeight: 0.2, positionReturn: 0.15 }),
    ];
    const r = computeAttribution({ positions, benchmarkReturn: 0.08 });
    expect(r.sectors[0]!.label).toBe("Tech"); // hoogste contributie
    expect(r.sectors[r.sectors.length - 1]!.label).toBe("Energy");
    // Tech weight = 0.6, weighted return = (0.4*0.2 + 0.2*0.15)/0.6 = 0.183
    expect(r.sectors[0]!.weight).toBeCloseTo(0.6, 4);
    expect(r.sectors[0]!.bucketReturn).toBeCloseTo((0.4 * 0.2 + 0.2 * 0.15) / 0.6, 4);
  });

  it("posities zonder sector vallen onder 'Onbekend'", () => {
    const positions = [
      pos({ ticker: "A", sector: null, startWeight: 0.5, positionReturn: 0.1 }),
    ];
    const r = computeAttribution({ positions, benchmarkReturn: 0.05 });
    expect(r.sectors.find((s) => s.label === "Onbekend")).toBeDefined();
  });
});

describe("computeAttribution — factors", () => {
  it("bucket high quality (≥ 65) en low quality (≤ 35)", () => {
    const positions = [
      pos({
        ticker: "Q1",
        startWeight: 0.3,
        positionReturn: 0.2,
        factorScore: fs(80, 50, 50),
      }),
      pos({
        ticker: "Q2",
        startWeight: 0.2,
        positionReturn: -0.1,
        factorScore: fs(20, 50, 50),
      }),
      pos({
        ticker: "Q3",
        startWeight: 0.5,
        positionReturn: 0.05,
        factorScore: fs(50, 50, 50), // mid → niet gebucket
      }),
    ];
    const r = computeAttribution({ positions, benchmarkReturn: 0.05 });
    expect(r.factors.find((f) => f.label === "Quality hoog")).toBeDefined();
    expect(r.factors.find((f) => f.label === "Quality laag")).toBeDefined();
  });

  it("posities zonder factor-score worden geskipt", () => {
    const positions = [
      pos({ ticker: "X", startWeight: 0.5, factorScore: null }),
    ];
    const r = computeAttribution({ positions, benchmarkReturn: 0.05 });
    expect(r.factors).toEqual([]);
  });
});

describe("computeAttribution — single-stock", () => {
  it("toont top-N op |contribution|", () => {
    const positions = [
      pos({ ticker: "WIN", startWeight: 0.3, positionReturn: 0.4 }),
      pos({ ticker: "LOSS", startWeight: 0.2, positionReturn: -0.3 }),
      pos({ ticker: "MID", startWeight: 0.5, positionReturn: 0.05 }),
    ];
    const r = computeAttribution({ positions, benchmarkReturn: 0.05, topStocks: 2 });
    expect(r.stocks.length).toBe(2);
    // Beide extremes zouden de top-2 moeten halen.
    const tickers = r.stocks.map((s) => s.label);
    expect(tickers.some((t) => t.includes("WIN"))).toBe(true);
    expect(tickers.some((t) => t.includes("LOSS"))).toBe(true);
  });
});

describe("computeAttribution — totals + residual", () => {
  it("totalSectorContribution ≈ alpha (binnen ruis)", () => {
    const positions = [
      pos({ ticker: "A", sector: "Tech", startWeight: 0.5, positionReturn: 0.15 }),
      pos({ ticker: "B", sector: "Energy", startWeight: 0.5, positionReturn: 0.05 }),
    ];
    const r = computeAttribution({ positions, benchmarkReturn: 0.08 });
    // portfolio return = 0.5*0.15 + 0.5*0.05 = 0.10
    // alpha = 0.10 - 0.08 = 0.02
    expect(r.totalSectorContribution).toBeCloseTo(0.02, 4);
    expect(r.residualAlpha).toBeCloseTo(0, 4);
  });
});
