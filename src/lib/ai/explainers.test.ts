import { describe, expect, it } from "vitest";

import { explain } from "./explainers";
import type {
  BuyPlanContext,
  FragileConcentrationContext,
  HoldingScoreContext,
  MarketRegimeContext,
  PortfolioRisksContext,
} from "@/types/ai";
import type { FactorScore } from "@/types/factor";
import type { MarketRegimeScore } from "@/types/regime";

function factorScore(
  overrides: Partial<FactorScore["subScores"]> & {
    composite?: number;
    confidence?: number;
  } = {},
): FactorScore {
  return {
    ticker: "X",
    asOf: "2024-01-01T00:00:00.000Z",
    subScores: {
      quality: overrides.quality ?? 50,
      value: overrides.value ?? 50,
      momentum: overrides.momentum ?? 50,
      lowVol: overrides.lowVol ?? 50,
    },
    composite: overrides.composite ?? 50,
    confidence: overrides.confidence ?? 0.7,
    rationales: {
      quality: ["Sterke ROIC"],
      value: ["Neutrale P/E"],
      momentum: ["Gemiddeld 12m"],
      lowVol: ["Lage beta"],
    },
  };
}

describe("explain — holding_score", () => {
  it("noemt composite-score en geeft high confidence bij sterke coverage", () => {
    const ctx: HoldingScoreContext = {
      useCase: "holding_score",
      ticker: "ASML",
      name: "ASML Holding",
      factorScore: factorScore({
        composite: 72,
        quality: 85,
        value: 40,
        momentum: 65,
        lowVol: 60,
        confidence: 0.8,
      }),
    };
    const result = explain(ctx);
    expect(result.headline).toContain("ASML");
    expect(result.headline).toContain("72/100");
    expect(result.confidence).toBe("high");
    expect(result.bullets.some((b) => b.includes("Quality"))).toBe(true);
    // Geen verzonnen cijfers: alleen de composite die we hem gaven.
    expect(result.narrative).toMatch(/72\/100/);
  });

  it("signaleert lage confidence en voegt disclaimer toe", () => {
    const ctx: HoldingScoreContext = {
      useCase: "holding_score",
      ticker: "X",
      name: "Mystery Co",
      factorScore: factorScore({ confidence: 0.2 }),
    };
    const result = explain(ctx);
    expect(result.confidence).toBe("low");
    expect(result.disclaimer).toBeDefined();
    expect(result.narrative.toLowerCase()).toContain("beperkt");
  });
});

describe("explain — fragile_concentration", () => {
  it("erkent HEALTHY winners en raadt niet automatisch verkopen aan", () => {
    const ctx: FragileConcentrationContext = {
      useCase: "fragile_concentration",
      ticker: "WIN",
      name: "Winner Co",
      positionWeight: 0.18,
      concentrationType: "HEALTHY",
      fragilityScore: 22,
      maxPositionWeight: 0.1,
      reasons: ["Sterke Quality (85)", "Sterke momentum"],
    };
    const result = explain(ctx);
    expect(result.headline).toContain("HEALTHY");
    expect(result.narrative.toLowerCase()).toContain("winner");
    expect(result.narrative.toLowerCase()).not.toContain("verkopen");
  });

  it("toont weight vs cap bij over-cap positie", () => {
    const ctx: FragileConcentrationContext = {
      useCase: "fragile_concentration",
      ticker: "BIG",
      name: "Big Co",
      positionWeight: 0.25,
      concentrationType: "FRAGILE",
      fragilityScore: 78,
      maxPositionWeight: 0.1,
      reasons: ["Hoge volatility", "Cyclische sector", "Zwakke quality"],
    };
    const result = explain(ctx);
    expect(result.narrative).toContain("25%");
    expect(result.narrative).toContain("10%");
    expect(result.bullets).toHaveLength(3);
  });
});

describe("explain — buy_plan", () => {
  it("vat recommendations + regime samen, geeft disclaimer bij warnings", () => {
    const ctx: BuyPlanContext = {
      useCase: "buy_plan",
      plan: {
        id: "p1",
        portfolioId: "p1",
        asOf: "2024-04-01T00:00:00.000Z",
        baseCurrency: "EUR",
        monthlyContribution: 500,
        cashAvailable: 1000,
        budget: 800,
        deployedAmount: 600,
        cashReserved: 200,
        warnings: ["Budget verlaagd met 20% door defensieve stand."],
        recommendations: [
          {
            ticker: "ASML",
            name: "ASML",
            action: "add",
            currentWeight: 0.05,
            targetWeight: 0.1,
            deltaWeight: 0.05,
            suggestedAmount: 300,
            convictionScore: 0.7,
            priority: 78,
            rationale: ["Sterke quality; ruimte tot cap."],
          },
          {
            ticker: "MSFT",
            name: "Microsoft",
            action: "add",
            currentWeight: 0.05,
            targetWeight: 0.1,
            deltaWeight: 0.05,
            suggestedAmount: 300,
            convictionScore: 0.65,
            priority: 72,
            rationale: ["Bovengemiddeld profiel."],
          },
        ],
      },
      regime: null,
    };
    const result = explain(ctx);
    expect(result.headline).toMatch(/2 koopaanbeveling/);
    expect(result.bullets.length).toBe(2);
    expect(result.disclaimer).toBeDefined();
    expect(result.confidence).toBe("high");
  });

  it("meldt bij leeg plan dat cash wordt aangehouden", () => {
    const ctx: BuyPlanContext = {
      useCase: "buy_plan",
      plan: {
        id: "p1",
        portfolioId: "p1",
        asOf: "2024-04-01T00:00:00.000Z",
        baseCurrency: "EUR",
        monthlyContribution: 500,
        cashAvailable: 0,
        budget: 50,
        deployedAmount: 0,
        cashReserved: 50,
        warnings: ["Budget onder minimum order-waarde."],
        recommendations: [],
      },
      regime: null,
    };
    const result = explain(ctx);
    expect(result.headline).toMatch(/geen/i);
    expect(result.confidence).toBe("low");
    expect(result.narrative.toLowerCase()).toContain("minimum");
  });
});

describe("explain — market_regime", () => {
  const regime: MarketRegimeScore = {
    asOf: "2024-04-01T00:00:00.000Z",
    stance: "DEFENSIVE",
    score: 28,
    confidence: 0.75,
    narrative: "Defensief klimaat: hoge vol + rising rates.",
    subDrivers: [
      { key: "volatility", label: "Volatiliteit", weight: 0.2, score: 20, rationale: "VIX 30" },
      { key: "trend", label: "Trend", weight: 0.3, score: 25, rationale: "Breadth 0.4" },
      { key: "rates", label: "Rente", weight: 0.15, score: 30, rationale: "10y 5%" },
    ],
  };

  it("toont stance en narrative zonder nieuwe cijfers", () => {
    const ctx: MarketRegimeContext = { useCase: "market_regime", regime };
    const result = explain(ctx);
    expect(result.headline).toContain("defensief");
    expect(result.headline).toContain("28/100");
    expect(result.narrative).toContain(regime.narrative);
    expect(result.bullets).toHaveLength(3);
  });
});

describe("explain — portfolio_risks", () => {
  it("toont top-3 flags en gebruikt alleen context-cijfers", () => {
    const ctx: PortfolioRisksContext = {
      useCase: "portfolio_risks",
      baseCurrency: "EUR",
      risk: {
        portfolioId: "p1",
        asOf: "2024-04-01T00:00:00.000Z",
        overallSeverity: "high",
        concentrationHhi: 0.22,
        largestPositionWeight: 0.28,
        top5Weight: 0.75,
        sectorConcentrationHhi: 0.35,
        regionConcentrationHhi: 0.5,
        foreignCurrencyExposure: 0.68,
        topSector: { label: "Technology", weight: 0.45 },
        riskScore: 72,
        exposures: {
          byAssetClass: [],
          bySector: [],
          byRegion: [],
        },
        positions: [{ ticker: "ASML", concentrationWeight: 0.28, flags: [] }],
        flags: [
          {
            code: "concentration.position",
            label: "Grote positie-concentratie",
            severity: "high",
            message: "ASML is 28%",
          },
          {
            code: "concentration.sector",
            label: "Sector-bias",
            severity: "high",
            message: "Technology 45%",
          },
          {
            code: "exposure.currency",
            label: "Hoge valuta-exposure",
            severity: "moderate",
            message: "68% niet-EUR",
          },
        ],
      },
    };
    const result = explain(ctx);
    expect(result.headline).toContain("Hoog");
    expect(result.headline).toContain("72/100");
    expect(result.narrative).toContain("28%");
    expect(result.narrative).toContain("68%");
    expect(result.bullets.length).toBe(3);
    expect(result.confidence).toBe("low"); // 1 positie alleen
  });
});
