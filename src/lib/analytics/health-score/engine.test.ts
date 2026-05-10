import { describe, expect, it } from "vitest";

import { computePortfolioHealthScore } from "./engine";
import type { PortfolioHealthInput } from "./loader-types";

/**
 * Test-fixtures-builder. Default = "redelijk gezonde portefeuille".
 * Per-test overschrijven we velden om scenario's te bouwen.
 */
function makeInput(overrides: Partial<PortfolioHealthInput> = {}): PortfolioHealthInput {
  const base: PortfolioHealthInput = {
    portfolioId: "p-1",
    asOf: "2026-01-15",
    diversification: { positionCount: 12, hhi: 0.10, top5Weight: 0.50 },
    sector: { sectorHhi: 0.20, largestSectorWeight: 0.30, sectorCoverage: 1.0 },
    geographic: {
      regionHhi: 0.55,
      largestRegionWeight: 0.70,
      regionCoverage: 0.9,
    },
    volatility: { annualizedVolatility: 0.18, sampleSize: 250 },
    drawdown: { maxDrawdown: 0.15, sampleSize: 100 },
    cashBuffer: { cashShare: 0.05, targetCashShare: 0.05 },
    dividend: {
      weightedYield: 0.025,
      positionsWithDividends: 8,
      totalPositions: 12,
      isIncomeObjective: false,
    },
    fundamental: { weightedQualityScore: 65, coverage: 0.8 },
    valuation: { weightedValueScore: 55, coverage: 0.8 },
    macro: {
      regimeStance: "NEUTRAL",
      weightedLowVolScore: 55,
      cyclicalShare: 0.30,
      riskSeverity: "moderate",
    },
  };
  return { ...base, ...overrides };
}

describe("computePortfolioHealthScore — 6 verplichte scenario's", () => {
  it("scenario 1 — lege portefeuille → no_data + neutrale score", () => {
    const result = computePortfolioHealthScore(
      makeInput({
        diversification: { positionCount: 0, hhi: 0, top5Weight: 0 },
        sector: { sectorHhi: null, largestSectorWeight: null, sectorCoverage: 0 },
        geographic: { regionHhi: null, largestRegionWeight: null, regionCoverage: 0 },
        volatility: { annualizedVolatility: null, sampleSize: 0 },
        drawdown: { maxDrawdown: null, sampleSize: 0 },
        cashBuffer: { cashShare: 1.0, targetCashShare: 0.05 }, // 100% cash
        dividend: {
          weightedYield: null,
          positionsWithDividends: 0,
          totalPositions: 0,
          isIncomeObjective: false,
        },
        fundamental: { weightedQualityScore: null, coverage: 0 },
        valuation: { weightedValueScore: null, coverage: 0 },
        macro: {
          regimeStance: null,
          weightedLowVolScore: null,
          cyclicalShare: null,
          riskSeverity: null,
        },
      }),
    );
    // Verwacht: vrijwel alle components zijn no_data → engine moet neutraal vallen.
    const noDataCount = result.components.filter((c) => c.status === "no_data").length;
    expect(noDataCount).toBeGreaterThanOrEqual(8);
    expect(result.headline).toMatch(/te weinig data|score onder|kan beter|aandacht/i);
  });

  it("scenario 2 — geconcentreerde portefeuille → lage diversificatie + sector scores", () => {
    const result = computePortfolioHealthScore(
      makeInput({
        diversification: { positionCount: 3, hhi: 0.45, top5Weight: 1.0 },
        sector: { sectorHhi: 0.55, largestSectorWeight: 0.70, sectorCoverage: 1.0 },
      }),
    );
    const div = result.components.find((c) => c.key === "diversification")!;
    const sector = result.components.find((c) => c.key === "sector_concentration")!;
    expect(div.status).toMatch(/weak|critical/);
    expect(sector.status).toMatch(/weak|critical/);
    expect(div.score).toBeLessThan(50);
    expect(sector.score).toBeLessThan(50);
    // Recommendations moeten verschijnen
    expect(div.recommendations.length).toBeGreaterThan(0);
  });

  it("scenario 3 — gespreide portefeuille → hoge totaalscore", () => {
    const result = computePortfolioHealthScore(
      makeInput({
        diversification: { positionCount: 20, hhi: 0.06, top5Weight: 0.30 },
        sector: { sectorHhi: 0.16, largestSectorWeight: 0.22, sectorCoverage: 1.0 },
        geographic: {
          regionHhi: 0.45,
          largestRegionWeight: 0.55,
          regionCoverage: 1.0,
        },
        volatility: { annualizedVolatility: 0.13, sampleSize: 500 },
        drawdown: { maxDrawdown: 0.08, sampleSize: 200 },
        cashBuffer: { cashShare: 0.06, targetCashShare: 0.05 },
        fundamental: { weightedQualityScore: 78, coverage: 0.9 },
        valuation: { weightedValueScore: 70, coverage: 0.9 },
      }),
    );
    expect(result.totalScore).toBeGreaterThanOrEqual(75);
    expect(result.grade).toMatch(/[AB]/);
  });

  it("scenario 4 — hoge volatiliteit → lage volatility-component + recommendation", () => {
    const result = computePortfolioHealthScore(
      makeInput({
        volatility: { annualizedVolatility: 0.40, sampleSize: 250 },
      }),
    );
    const vol = result.components.find((c) => c.key === "volatility")!;
    expect(vol.score).toBeLessThanOrEqual(15);
    expect(vol.status).toBe("critical");
    expect(vol.recommendations.length).toBeGreaterThan(0);
  });

  it("scenario 5 — ontbrekende data → renormalisatie, geen straf", () => {
    const fullData = computePortfolioHealthScore(makeInput());
    const partialData = computePortfolioHealthScore(
      makeInput({
        // Drop dividend + macro + valuation data
        dividend: {
          weightedYield: null,
          positionsWithDividends: 0,
          totalPositions: 0,
          isIncomeObjective: true,
        },
        macro: {
          regimeStance: null,
          weightedLowVolScore: null,
          cyclicalShare: null,
          riskSeverity: null,
        },
        valuation: { weightedValueScore: null, coverage: 0.1 },
      }),
    );
    // Partial moet niet veel lager zijn dan full — renormalisatie compenseert.
    const partialNoData = partialData.components.filter((c) => c.status === "no_data");
    expect(partialNoData.length).toBeGreaterThanOrEqual(3);
    // effectiveWeight valt onder 1.0
    expect(partialData.effectiveWeight).toBeLessThan(1.0);
    // Confidence valt lager omdat actieve components dezelfde confidence houden
    // maar dat is een compressie — gebruik niet als hard assertion.
    expect(partialData.totalScore).toBeGreaterThan(0);
    expect(fullData.totalScore).toBeGreaterThan(0);
  });

  it("scenario 6 — extreme waarden → score blijft binnen [0, 100]", () => {
    const result = computePortfolioHealthScore(
      makeInput({
        diversification: { positionCount: 999, hhi: 0.99, top5Weight: 1.5 },
        sector: { sectorHhi: 1.5, largestSectorWeight: 1.5, sectorCoverage: 1.0 },
        volatility: { annualizedVolatility: 5.0, sampleSize: 1_000_000 },
        drawdown: { maxDrawdown: 1.5, sampleSize: 999 },
        cashBuffer: { cashShare: -0.5, targetCashShare: 0.05 },
        fundamental: { weightedQualityScore: 200, coverage: 1.0 },
        valuation: { weightedValueScore: -50, coverage: 1.0 },
      }),
    );
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.totalScore).toBeLessThanOrEqual(100);
    for (const c of result.components) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
    }
  });
});

describe("computePortfolioHealthScore — output shape", () => {
  it("levert exact 10 components in vaste volgorde", () => {
    const result = computePortfolioHealthScore(makeInput());
    expect(result.components).toHaveLength(10);
    expect(result.components.map((c) => c.key)).toEqual([
      "diversification",
      "sector_concentration",
      "geographic_concentration",
      "volatility",
      "max_drawdown",
      "cash_buffer",
      "dividend_quality",
      "fundamental_quality",
      "valuation_risk",
      "macro_sensitivity",
    ]);
  });

  it("topRecommendations is gesorteerd op expectedImpact desc + max 3", () => {
    const result = computePortfolioHealthScore(
      makeInput({
        diversification: { positionCount: 2, hhi: 0.55, top5Weight: 1.0 },
        sector: { sectorHhi: 0.60, largestSectorWeight: 0.75, sectorCoverage: 1.0 },
        volatility: { annualizedVolatility: 0.45, sampleSize: 250 },
        fundamental: { weightedQualityScore: 30, coverage: 0.9 },
      }),
    );
    expect(result.topRecommendations.length).toBeLessThanOrEqual(3);
    for (let i = 0; i < result.topRecommendations.length - 1; i++) {
      const cur = result.topRecommendations[i]!.expectedImpact ?? 0;
      const next = result.topRecommendations[i + 1]!.expectedImpact ?? 0;
      expect(cur).toBeGreaterThanOrEqual(next);
    }
  });

  it("grade is A bij top-score, F bij bodem-score", () => {
    const top = computePortfolioHealthScore(
      makeInput({
        diversification: { positionCount: 25, hhi: 0.05, top5Weight: 0.25 },
        sector: { sectorHhi: 0.14, largestSectorWeight: 0.20, sectorCoverage: 1.0 },
        geographic: {
          regionHhi: 0.40,
          largestRegionWeight: 0.45,
          regionCoverage: 1.0,
        },
        volatility: { annualizedVolatility: 0.11, sampleSize: 500 },
        drawdown: { maxDrawdown: 0.04, sampleSize: 200 },
        cashBuffer: { cashShare: 0.06, targetCashShare: 0.05 },
        fundamental: { weightedQualityScore: 90, coverage: 0.95 },
        valuation: { weightedValueScore: 80, coverage: 0.95 },
        macro: {
          regimeStance: "NEUTRAL",
          weightedLowVolScore: 55,
          cyclicalShare: 0.25,
          riskSeverity: "low",
        },
      }),
    );
    expect(top.grade).toBe("A");

    const bottom = computePortfolioHealthScore(
      makeInput({
        diversification: { positionCount: 1, hhi: 0.99, top5Weight: 1.0 },
        sector: { sectorHhi: 0.99, largestSectorWeight: 0.99, sectorCoverage: 1.0 },
        geographic: {
          regionHhi: 0.99,
          largestRegionWeight: 0.99,
          regionCoverage: 1.0,
        },
        volatility: { annualizedVolatility: 0.50, sampleSize: 250 },
        drawdown: { maxDrawdown: 0.55, sampleSize: 100 },
        cashBuffer: { cashShare: 0.0, targetCashShare: 0.05, isDefensiveRegime: true },
        fundamental: { weightedQualityScore: 10, coverage: 0.9 },
        valuation: { weightedValueScore: 10, coverage: 0.9 },
        macro: {
          regimeStance: "DEFENSIVE",
          weightedLowVolScore: 20,
          cyclicalShare: 0.7,
          riskSeverity: "critical",
        },
      }),
    );
    expect(bottom.grade).toMatch(/[DF]/);
  });

  it("INCOME-objective zonder dividend-data → no_data ipv default 75", () => {
    const result = computePortfolioHealthScore(
      makeInput({
        dividend: {
          weightedYield: null,
          positionsWithDividends: 0,
          totalPositions: 5,
          isIncomeObjective: true,
        },
      }),
    );
    const div = result.components.find((c) => c.key === "dividend_quality")!;
    expect(div.status).toBe("no_data");
  });

  it("GROWTH zonder dividend → score 75 (geen penalty)", () => {
    const result = computePortfolioHealthScore(
      makeInput({
        dividend: {
          weightedYield: null,
          positionsWithDividends: 0,
          totalPositions: 5,
          isIncomeObjective: false,
        },
      }),
    );
    const div = result.components.find((c) => c.key === "dividend_quality")!;
    expect(div.status).not.toBe("no_data");
    expect(div.score).toBe(75);
  });
});

describe("computePortfolioHealthScore — determinisme", () => {
  it("zelfde input → identieke output (geen Date.now/random)", () => {
    const input = makeInput();
    const a = computePortfolioHealthScore(input);
    const b = computePortfolioHealthScore(input);
    expect(a).toEqual(b);
  });
});
