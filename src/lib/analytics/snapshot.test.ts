import { describe, expect, it } from "vitest";

import {
  buildFactorSnapshotData,
  buildPortfolioSnapshotData,
  mapRegimeStateToLabel,
  mapRegimeToLabel,
} from "./snapshot";
import type { PortfolioView } from "./portfolio-view";
import type { AllocationPlan } from "@/types/allocation";
import type { MarketRegimeScore } from "@/types/regime";

function makeView(overrides: Partial<PortfolioView> = {}): PortfolioView {
  const base = {
    summary: {
      portfolioId: "p1",
      baseCurrency: "EUR",
      totalValue: 12_345.6789,
      totalCost: 10_000,
      cashBalance: 500,
      unrealizedPnl: 2_345.6789,
      unrealizedPnlPct: 0.23456789,
      positionCount: 3,
      largestPosition: {
        ticker: "ASML",
        name: "ASML Holding",
        marketValue: 6_000,
        weight: 0.49,
        unrealizedPnl: 0,
        unrealizedPnlPct: 0,
      },
      topPositions: [],
      allocationByAssetClass: [],
      allocationBySector: [],
      allocationByRegion: [],
      allocationByCurrency: [
        { label: "EUR", value: 8_000, weight: 0.65 },
        { label: "USD", value: 4_345.6789, weight: 0.35 },
      ],
    },
    health: {
      portfolioId: "p1",
      asOf: "2026-04-23T00:00:00.000Z",
      grade: "B" as const,
      score: 72.4,
      diversificationScore: 70,
      qualityScore: 75,
      riskAlignmentScore: 70,
      factorAlignmentScore: 70,
      signals: [],
    },
    risk: {
      portfolioId: "p1",
      asOf: "2026-04-23T00:00:00.000Z",
      overallSeverity: "moderate" as const,
      concentrationHhi: 0.3,
      largestPositionWeight: 0.49,
      top5Weight: 0.88,
      sectorConcentrationHhi: 0.3,
      regionConcentrationHhi: 0.4,
      portfolioVolatility: 0.18,
      maxDrawdown: -0.12,
      riskScore: 42,
      foreignCurrencyExposure: 0.35,
      exposures: {
        byAssetClass: [],
        bySector: [],
        byRegion: [],
      },
      positions: [],
      flags: [],
    },
    rebalance: {
      portfolioId: "p1",
      asOf: "2026-04-23T00:00:00.000Z",
      actions: [],
      summary: { trimCount: 0, reconsiderCount: 0, ok: 0 },
    },
    valuations: [
      {
        holding: {
          ticker: "ASML",
          factorScore: { composite: 80, confidence: 0.9 },
        },
      },
      {
        holding: {
          ticker: "MSFT",
          factorScore: { composite: 60, confidence: 0.7 },
        },
      },
      {
        holding: { ticker: "CASH" },
      },
    ],
    factorScores: new Map(),
    lastUpdated: "2026-04-23T00:00:00.000Z",
  };
  return { ...base, ...overrides } as unknown as PortfolioView;
}

function makeRegime(
  stance: MarketRegimeScore["stance"] = "RISK_ON",
  score = 72,
): MarketRegimeScore {
  return {
    asOf: "2026-04-23T00:00:00.000Z",
    score,
    stance,
    confidence: 0.8,
    narrative: "test",
    subDrivers: [],
  };
}

function makePlan(): AllocationPlan {
  return {
    id: "plan-1",
    portfolioId: "p1",
    asOf: "2026-04-23T00:00:00.000Z",
    baseCurrency: "EUR",
    monthlyContribution: 500,
    cashAvailable: 500,
    budget: 500,
    deployedAmount: 450,
    cashReserved: 50,
    recommendations: [
      { action: "BUY" } as unknown as AllocationPlan["recommendations"][number],
      { action: "BUY" } as unknown as AllocationPlan["recommendations"][number],
    ],
  };
}

describe("buildPortfolioSnapshotData", () => {
  it("bouwt een snapshot met afgeronde monetaire velden en metrics", () => {
    const snapshot = buildPortfolioSnapshotData({
      view: makeView(),
      regime: makeRegime("RISK_ON", 72),
      plan: makePlan(),
      capturedAt: new Date("2026-04-23T00:00:00.000Z"),
    });

    expect(snapshot.portfolioId).toBe("p1");
    expect(snapshot.totalValue).toBe(12_345.68);
    expect(snapshot.totalCost).toBe(10_000);
    expect(snapshot.unrealizedPnl).toBe(2_345.68);
    expect(snapshot.unrealizedPnlPct).toBe(0.2346);
    expect(snapshot.drawdown).toBe(-0.12);
    expect(snapshot.volatility).toBe(0.18);
    expect(snapshot.regimeLabel).toBe("EXPANSION");
    expect(snapshot.healthGrade).toBe("B");
    expect(snapshot.healthScore).toBe(72.4);

    expect(snapshot.metrics.positionCount).toBe(3);
    expect(snapshot.metrics.largestPosition).toEqual({
      ticker: "ASML",
      name: "ASML Holding",
      weight: 0.49,
    });
    // Average composite over 2 valuations met score: (80 + 60) / 2 = 70
    expect(snapshot.metrics.avgFactorComposite).toBe(70);
    // Average coverage: (0.9 + 0.7) / 2 = 0.8
    expect(snapshot.metrics.averageFactorCoverage).toBeCloseTo(0.8, 5);
    expect(snapshot.metrics.foreignCurrencyExposure).toBe(0.35);
    expect(snapshot.metrics.top5Weight).toBe(0.88);
    expect(snapshot.metrics.allocationByCurrency).toHaveLength(2);
    expect(snapshot.metrics.riskScore).toBe(42);
    expect(snapshot.metrics.regimeScore).toBe(72);
    expect(snapshot.metrics.planDeployed).toBe(450);
    expect(snapshot.metrics.planRecommendations).toBe(2);
  });

  it("valt netjes terug op null waarden zonder factor-scores of regime", () => {
    const snapshot = buildPortfolioSnapshotData({
      view: makeView({
        valuations: [
          { holding: { ticker: "CASH" } },
        ] as unknown as PortfolioView["valuations"],
      }),
    });

    expect(snapshot.metrics.avgFactorComposite).toBeNull();
    expect(snapshot.metrics.averageFactorCoverage).toBe(0);
    expect(snapshot.regimeLabel).toBeNull();
    expect(snapshot.metrics.regimeScore).toBeNull();
    expect(snapshot.metrics.planDeployed).toBeNull();
    expect(snapshot.metrics.planRecommendations).toBeNull();
  });
});

describe("buildFactorSnapshotData", () => {
  it("mapt een factor score + fundamentals naar een platte rij", () => {
    const data = buildFactorSnapshotData({
      ticker: "asml.as",
      isin: "NL0010273215",
      factorScore: {
        subScores: {
          value: 70,
          quality: 85,
          momentum: 62,
          lowVol: 55,
          growth: 74,
        },
        composite: 71,
        percentile: 0.82,
        confidence: 0.9,
        model: "beleggeriq.v1",
      },
      fundamentals: {
        ticker: "ASML.AS",
        asOf: "2026-04-23T00:00:00.000Z",
        currency: "EUR",
        roic: 0.25,
      },
      source: "beleggeriq.engine",
      capturedAt: new Date("2026-04-23T00:00:00.000Z"),
    });

    expect(data.ticker).toBe("ASML.AS");
    expect(data.isin).toBe("NL0010273215");
    expect(data.model).toBe("beleggeriq.v1");
    expect(data.valueScore).toBe(70);
    expect(data.qualityScore).toBe(85);
    expect(data.growthScore).toBe(74);
    expect(data.dividendScore).toBeNull();
    expect(data.composite).toBe(71);
    expect(data.percentile).toBe(0.82);
    expect(data.confidence).toBe(0.9);
    expect(data.source).toBe("beleggeriq.engine");
    expect(data.fundamentals).not.toBeNull();
  });

  it("default model + source als die niet zijn meegegeven", () => {
    const data = buildFactorSnapshotData({
      ticker: "MSFT",
      factorScore: {
        subScores: { value: 50, quality: 80, momentum: 70, lowVol: 60 },
        composite: 68,
      },
    });
    expect(data.model).toBe("beleggeriq.v1");
    expect(data.source).toBe("beleggeriq");
    expect(data.fundamentals).toBeNull();
    expect(data.isin).toBeNull();
  });
});

describe("mapRegimeToLabel", () => {
  it("mapt stance naar Prisma label", () => {
    expect(mapRegimeToLabel(makeRegime("RISK_ON"))).toBe("EXPANSION");
    expect(mapRegimeToLabel(makeRegime("DEFENSIVE"))).toBe("RECESSION");
    expect(mapRegimeToLabel(makeRegime("NEUTRAL"))).toBe("SLOWDOWN");
    expect(mapRegimeToLabel(null)).toBeNull();
    expect(mapRegimeToLabel(undefined)).toBeNull();
  });
});

describe("mapRegimeStateToLabel", () => {
  it("mapt legacy MarketRegimeState naar Prisma label", () => {
    expect(mapRegimeStateToLabel("expansion")).toBe("EXPANSION");
    expect(mapRegimeStateToLabel("slowdown")).toBe("SLOWDOWN");
    expect(mapRegimeStateToLabel("recession")).toBe("RECESSION");
    expect(mapRegimeStateToLabel("recovery")).toBe("RECOVERY");
    expect(mapRegimeStateToLabel("unknown")).toBe("UNKNOWN");
    expect(mapRegimeStateToLabel(null)).toBeNull();
  });
});
