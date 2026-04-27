import { describe, expect, it } from "vitest";

import type { PolicyReport, PolicyViolation } from "@/lib/analytics/policy-engine";
import type {
  RebalanceQuantityPlan,
  RebalanceRecommendation,
} from "@/types/rebalance";
import type {
  PortfolioRiskSummary,
  PositionRiskAnalysis,
  RiskFlag,
} from "@/types/risk";

import type { PortfolioQualityReport, HoldingQuality } from "../data-quality";

import {
  buildRiskActions,
  type BuildRiskActionsInput,
} from "./risk-action-mapper";

const NOW = "2026-04-27T00:00:00.000Z";

// ============================================================
//  Fixtures
// ============================================================

function position(
  overrides: Partial<PositionRiskAnalysis> = {},
): PositionRiskAnalysis {
  return {
    ticker: "RHM",
    concentrationWeight: 0.05,
    flags: [],
    ...overrides,
  };
}

function flag(overrides: Partial<RiskFlag> = {}): RiskFlag {
  return {
    code: "concentration.position",
    label: "Grote positie-concentratie",
    severity: "high",
    threshold: 0.10,
    metric: 0.175,
    ...overrides,
  };
}

function risk(
  overrides: Partial<PortfolioRiskSummary> = {},
): PortfolioRiskSummary {
  return {
    portfolioId: "p",
    asOf: NOW,
    overallSeverity: "moderate",
    concentrationHhi: 0.2,
    largestPositionWeight: 0.05,
    sectorConcentrationHhi: 0.2,
    regionConcentrationHhi: 0.2,
    exposures: {
      byAssetClass: [],
      bySector: [],
      byRegion: [],
    },
    positions: [],
    flags: [],
    ...overrides,
  };
}

function plan(
  overrides: Partial<RebalanceQuantityPlan> = {},
): RebalanceQuantityPlan {
  return {
    symbol: "RHM",
    actionLabel: "stevig afbouwen",
    currentWeight: 17.5,
    targetWeight: 12,
    currentValue: 17_500,
    targetValue: 12_000,
    excessValue: 5_500,
    currentPrice: 600,
    sharesToSell: 1,
    amountToSell: 600,
    postSellWeight: 16.9,
    reason: "Boven cap.",
    confidence: "HIGH",
    warnings: [],
    ...overrides,
  };
}

function rec(
  overrides: Partial<RebalanceRecommendation> = {},
): RebalanceRecommendation {
  return {
    ticker: "RHM",
    name: "Rheinmetall",
    action: "TRIM_HEAVY",
    concentrationType: "FRAGILE",
    fragilityScore: 80,
    currentWeight: 0.175,
    targetWeight: 0.10,
    deltaWeight: -0.075,
    deltaAmount: -7500,
    reasons: [],
    confidence: 0.8,
    factorSnapshot: {
      quality: null,
      value: null,
      momentum: null,
      composite: null,
      volatility: null,
      sector: null,
      sectorCyclicality: "low",
    },
    quantityPlan: plan(),
    ...overrides,
  };
}

function violation(
  overrides: Partial<PolicyViolation> = {},
): PolicyViolation {
  return {
    holdingId: "h1",
    ticker: "RHM",
    instrumentType: "SINGLE_STOCK",
    currentWeight: 0.175,
    allowedMaxWeight: 0.10,
    excessWeight: 0.075,
    violationSeverity: "major",
    policyReason: "fors boven cap: 7,5%pt over.",
    riskLevel: "ELEVATED",
    notes: [],
    ...overrides,
  };
}

function policyReport(
  violations: PolicyViolation[] = [],
): PolicyReport {
  return {
    totalValue: 100_000,
    assessedAt: NOW,
    violations,
    counts: { ok: 0, minor: 0, major: 0, critical: 0 },
    overallSeverity:
      violations.length === 0 ? "ok" : "major",
  };
}

function holdingQuality(
  overrides: Partial<HoldingQuality> = {},
): HoldingQuality {
  return {
    ticker: "ZZZ",
    holdingId: "h2",
    normalizedTicker: null,
    confidence: 0.3,
    completeness: 0.3,
    missing: ["sector", "region", "industry"],
    severity: "major",
    weight: 0.10,
    notes: [],
    assetClass: "EQUITY",
    ...overrides,
  };
}

function qualityReport(
  holdings: HoldingQuality[] = [],
): PortfolioQualityReport {
  return {
    overallScore: 0.7,
    holdingCount: holdings.length,
    fullyEnriched: 0,
    partiallyEnriched: 0,
    poorlyEnriched: holdings.filter((h) => h.severity === "major").length,
    unknownSectorWeight: 0,
    unknownRegionWeight: 0,
    unknownAssetClassWeight: 0,
    holdings,
    distributionBySource: {},
    assessedAt: NOW,
  };
}

function defaultInput(
  overrides: Partial<BuildRiskActionsInput> = {},
): BuildRiskActionsInput {
  return {
    risk: risk(),
    rebalanceRecommendations: [],
    policyReport: null,
    qualityReport: null,
    baseCurrency: "EUR",
    ...overrides,
  };
}

// ============================================================
//  Tests
// ============================================================

describe("buildRiskActions", () => {
  it("max 3 acties standaard", () => {
    const input = defaultInput({
      risk: risk({
        flags: [
          flag(),
          flag({ code: "concentration.sector", label: "Sector", severity: "high" }),
          flag({ code: "exposure.currency", label: "FX", severity: "moderate", threshold: 0.6 }),
          flag({ code: "concentration.top5", label: "Top5", severity: "high", threshold: 0.7 }),
        ],
        positions: [position({ concentrationWeight: 0.175 })],
        topSector: { label: "Industrials", weight: 0.45 },
        foreignCurrencyExposure: 0.7,
        top5Weight: 0.78,
      }),
      rebalanceRecommendations: [rec()],
    });
    const actions = buildRiskActions(input);
    expect(actions.length).toBeLessThanOrEqual(3);
  });

  it("position concentration genereert kaart met aantallen uit rebalance-quantity-engine", () => {
    const input = defaultInput({
      risk: risk({
        flags: [flag()],
        positions: [position({ concentrationWeight: 0.175 })],
      }),
      rebalanceRecommendations: [rec()],
    });
    const actions = buildRiskActions(input);
    const card = actions.find((a) => a.riskType === "POSITION_CONCENTRATION");
    expect(card).toBeDefined();
    expect(card?.symbol).toBe("RHM");
    expect(card?.sharesToSell).toBe(1);
    expect(card?.amountToSell).toBe(600);
    expect(card?.postActionWeight).toBe(16.9);
    expect(card?.recommendedAction).toContain("Verkoop indicatief 1 aandeel");
    expect(card?.recommendedAction).toContain("circa 16.9%");
    expect(card?.insufficientData).toBe(false);
  });

  it("'onvoldoende data' wanneer rebalance-quantity-engine geen prijs heeft", () => {
    const planNoPrice = plan({
      currentPrice: null,
      sharesToSell: 0,
      amountToSell: 0,
      postSellWeight: 17.5,
      confidence: "LOW",
      warnings: ["Onvoldoende koersdata om aantal stuks te berekenen."],
    });
    const input = defaultInput({
      risk: risk({
        flags: [flag()],
        positions: [position({ concentrationWeight: 0.175 })],
      }),
      rebalanceRecommendations: [rec({ quantityPlan: planNoPrice })],
    });
    const actions = buildRiskActions(input);
    const card = actions.find((a) => a.riskType === "POSITION_CONCENTRATION");
    expect(card?.insufficientData).toBe(true);
    expect(card?.sharesToSell).toBe(0);
    expect(card?.recommendedAction).toContain("aantal stuks niet te bepalen");
    expect(card?.confidence).toBeLessThan(0.6);
  });

  it("policy-violation komt als kaart wanneer er geen position-flag is", () => {
    const input = defaultInput({
      policyReport: policyReport([violation()]),
      rebalanceRecommendations: [rec()],
    });
    const actions = buildRiskActions(input);
    const card = actions.find((a) => a.riskType === "POLICY_VIOLATION");
    expect(card).toBeDefined();
    expect(card?.symbol).toBe("RHM");
    expect(card?.sharesToSell).toBe(1);
    expect(card?.amountToSell).toBe(600);
    expect(card?.severity).toBe("high"); // major → high
  });

  it("policy-violation wordt gededupliceerd door position-concentration (zelfde symbol)", () => {
    const input = defaultInput({
      risk: risk({
        flags: [flag()],
        positions: [position({ concentrationWeight: 0.175 })],
      }),
      policyReport: policyReport([violation()]),
      rebalanceRecommendations: [rec()],
    });
    const actions = buildRiskActions(input);
    const concentrationCount = actions.filter(
      (a) => a.symbol === "RHM",
    ).length;
    expect(concentrationCount).toBe(1);
    expect(actions[0]?.riskType).toBe("POSITION_CONCENTRATION");
  });

  it("ETF en single-stock policy-violation krijgen verschillende impact-tekst", () => {
    const etfInput = defaultInput({
      policyReport: policyReport([
        violation({ ticker: "VWCE", instrumentType: "BROAD_MARKET_ETF" }),
      ]),
    });
    const stockInput = defaultInput({
      policyReport: policyReport([
        violation({ ticker: "RHM", instrumentType: "SINGLE_STOCK" }),
      ]),
    });
    const etfCard = buildRiskActions(etfInput)[0];
    const stockCard = buildRiskActions(stockInput)[0];
    expect(etfCard?.impact).toContain("ETF-type");
    expect(stockCard?.impact).toContain("single-stock");
  });

  it("sector-bias kaart vanuit risk-engine flag", () => {
    const input = defaultInput({
      risk: risk({
        flags: [
          flag({
            code: "concentration.sector",
            label: "Sector-bias",
            severity: "high",
            threshold: 0.4,
          }),
        ],
        topSector: { label: "Technology", weight: 0.55 },
      }),
    });
    const card = buildRiskActions(input).find(
      (a) => a.riskType === "SECTOR_BIAS",
    );
    expect(card?.title).toContain("Technology");
    expect(card?.title).toContain("55.0%");
    expect(card?.sharesToSell).toBeUndefined();
    expect(card?.recommendedAction).toContain("Verminder Technology");
  });

  it("currency-risk kaart vanuit risk-engine flag", () => {
    const input = defaultInput({
      risk: risk({
        flags: [
          flag({
            code: "exposure.currency",
            label: "FX",
            severity: "moderate",
            threshold: 0.6,
          }),
        ],
        foreignCurrencyExposure: 0.7,
      }),
      baseCurrency: "EUR",
    });
    const card = buildRiskActions(input).find(
      (a) => a.riskType === "CURRENCY_RISK",
    );
    expect(card?.title).toContain("70%");
    expect(card?.title).toContain("vreemde valuta");
    expect(card?.recommendedAction).toContain("EUR");
  });

  it("top-5 kaart vanuit risk-engine flag", () => {
    const input = defaultInput({
      risk: risk({
        flags: [
          flag({
            code: "concentration.top5",
            label: "Top5",
            severity: "high",
            threshold: 0.7,
          }),
        ],
        top5Weight: 0.82,
      }),
    });
    const card = buildRiskActions(input).find(
      (a) => a.riskType === "TOP5_CONCENTRATION",
    );
    expect(card?.title).toContain("82%");
  });

  it("volatility kaart bij portfolioVolatility ≥ 20%", () => {
    const input = defaultInput({
      risk: risk({ portfolioVolatility: 0.32 }),
    });
    const card = buildRiskActions(input).find(
      (a) => a.riskType === "VOLATILITY",
    );
    expect(card?.severity).toBe("high");
    expect(card?.title).toContain("32.0%");
  });

  it("volatility geen kaart bij vol < 20%", () => {
    const input = defaultInput({
      risk: risk({ portfolioVolatility: 0.15 }),
    });
    const cards = buildRiskActions(input).filter(
      (a) => a.riskType === "VOLATILITY",
    );
    expect(cards).toEqual([]);
  });

  it("drawdown kaart bij maxDrawdown ≥ 20%", () => {
    const input = defaultInput({
      risk: risk({ maxDrawdown: -0.4 }),
    });
    const card = buildRiskActions(input).find(
      (a) => a.riskType === "DRAWDOWN",
    );
    expect(card?.severity).toBe("high");
    expect(card?.title).toContain("40.0%");
  });

  it("data-quality kaart voor materiële (≥ 5%) major-severity holding", () => {
    const input = defaultInput({
      qualityReport: qualityReport([
        holdingQuality({ ticker: "BAD", weight: 0.12 }),
      ]),
    });
    const card = buildRiskActions(input).find(
      (a) => a.riskType === "LOW_DATA_QUALITY",
    );
    expect(card?.symbol).toBe("BAD");
    expect(card?.insufficientData).toBe(true);
    expect(card?.recommendedAction).toContain("Vul ontbrekende velden");
  });

  it("data-quality genegeerd onder 5% weight", () => {
    const input = defaultInput({
      qualityReport: qualityReport([
        holdingQuality({ ticker: "TINY", weight: 0.02 }),
      ]),
    });
    const cards = buildRiskActions(input).filter(
      (a) => a.riskType === "LOW_DATA_QUALITY",
    );
    expect(cards).toEqual([]);
  });

  it("sortering: critical > high > moderate (severity-rank)", () => {
    const input = defaultInput({
      risk: risk({
        flags: [
          flag({ severity: "moderate" }),
          flag({
            code: "exposure.currency",
            severity: "high",
            threshold: 0.6,
          }),
          flag({
            code: "concentration.sector",
            severity: "critical",
            threshold: 0.4,
          }),
        ],
        positions: [position({ concentrationWeight: 0.175 })],
        foreignCurrencyExposure: 0.7,
        topSector: { label: "Tech", weight: 0.55 },
      }),
      rebalanceRecommendations: [rec()],
    });
    const actions = buildRiskActions(input);
    expect(actions[0]?.severity).toBe("critical");
    expect(actions[1]?.severity).toBe("high");
  });

  it("determinisme: identieke input → identieke output", () => {
    const input = defaultInput({
      risk: risk({
        flags: [flag()],
        positions: [position({ concentrationWeight: 0.175 })],
      }),
      rebalanceRecommendations: [rec()],
    });
    expect(buildRiskActions(input)).toEqual(buildRiskActions(input));
  });

  it("maxActions configureerbaar", () => {
    const input = defaultInput({
      risk: risk({
        flags: [
          flag(),
          flag({
            code: "concentration.sector",
            severity: "high",
            threshold: 0.4,
          }),
          flag({
            code: "exposure.currency",
            severity: "high",
            threshold: 0.6,
          }),
          flag({
            code: "concentration.top5",
            severity: "high",
            threshold: 0.7,
          }),
        ],
        positions: [position({ concentrationWeight: 0.175 })],
        topSector: { label: "Tech", weight: 0.45 },
        foreignCurrencyExposure: 0.7,
        top5Weight: 0.78,
      }),
      rebalanceRecommendations: [rec()],
      maxActions: 2,
    });
    expect(buildRiskActions(input).length).toBe(2);
  });

  it("lege input → lege output", () => {
    expect(buildRiskActions(defaultInput())).toEqual([]);
  });

  it("confidence ligt altijd in [0,1]", () => {
    const input = defaultInput({
      risk: risk({
        flags: [flag()],
        positions: [position({ concentrationWeight: 0.2 })],
      }),
      rebalanceRecommendations: [rec()],
    });
    for (const action of buildRiskActions(input)) {
      expect(action.confidence).toBeGreaterThanOrEqual(0);
      expect(action.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("alle acties hebben niet-lege explanation en recommendedAction", () => {
    const input = defaultInput({
      risk: risk({
        flags: [
          flag(),
          flag({
            code: "concentration.sector",
            severity: "high",
            threshold: 0.4,
          }),
        ],
        positions: [position({ concentrationWeight: 0.175 })],
        topSector: { label: "Tech", weight: 0.45 },
      }),
      rebalanceRecommendations: [rec()],
    });
    for (const a of buildRiskActions(input)) {
      expect(a.explanation.length).toBeGreaterThan(0);
      expect(a.recommendedAction.length).toBeGreaterThan(0);
      expect(a.impact.length).toBeGreaterThan(0);
      expect(a.title.length).toBeGreaterThan(0);
    }
  });
});
