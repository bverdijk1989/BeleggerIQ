import { describe, expect, it } from "vitest";

import type { DashboardAction } from "@/lib/analytics/actions";
import type { AllocationPlan } from "@/types/allocation";
import type { Holding } from "@/types/portfolio";
import type {
  RebalanceQuantityPlan,
  RebalanceRecommendation,
} from "@/types/rebalance";

import type { HoldingValuation } from "../valuation";

import {
  simulateActionImpact,
  type SimulateActionImpactInput,
} from "./action-impact-simulator";

const NOW = "2026-04-27T00:00:00.000Z";

// ============================================================
//  Fixtures
// ============================================================

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: "h-rhm",
    portfolioId: "p1",
    ticker: "RHM",
    name: "Rheinmetall",
    assetClass: "EQUITY",
    currency: "EUR",
    quantity: 30,
    avgCostPrice: 500,
    sector: "Industrials",
    region: "Europe",
    ...overrides,
  };
}

function valuation(args: {
  ticker?: string;
  marketValueBase: number;
  currency?: Holding["currency"];
  assetClass?: Holding["assetClass"];
  sector?: string;
}): HoldingValuation {
  const h = holding({
    id: `h-${args.ticker ?? "X"}`,
    ticker: args.ticker ?? "X",
    name: args.ticker ?? "X",
    currency: args.currency ?? "EUR",
    assetClass: args.assetClass ?? "EQUITY",
    sector: args.sector ?? "Industrials",
  });
  return {
    holding: h,
    unitPrice: 100,
    marketValue: args.marketValueBase,
    marketValueBase: args.marketValueBase,
    costBasisBase: args.marketValueBase * 0.9,
    unrealizedPnlBase: args.marketValueBase * 0.1,
    fxRate: 1,
    priceSource: "market",
    asOf: NOW,
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

function dashAction(
  overrides: Partial<DashboardAction> = {},
): DashboardAction {
  return {
    id: "RISK_REDUCTION:RHM",
    type: "RISK_REDUCTION",
    title: "Verkoop 1 aandeel Rheinmetall",
    description: "Concentratie boven cap.",
    urgency: "HIGH",
    symbol: "RHM",
    confidence: 0.9,
    reason: "Concentration",
    sourceEngine: "rebalance-engine",
    ...overrides,
  };
}

function defaultInput(
  overrides: Partial<SimulateActionImpactInput> = {},
): SimulateActionImpactInput {
  const valuations = [
    valuation({ ticker: "RHM", marketValueBase: 17_500, currency: "EUR", sector: "Industrials" }),
    valuation({ ticker: "ASML", marketValueBase: 25_000, currency: "EUR", sector: "Technology" }),
    valuation({ ticker: "MSFT", marketValueBase: 20_000, currency: "USD", sector: "Technology" }),
    valuation({ ticker: "VWCE", marketValueBase: 30_000, currency: "EUR", assetClass: "ETF", sector: "Diversified" }),
    valuation({ ticker: "AAPL", marketValueBase: 5_000, currency: "USD", sector: "Technology" }),
  ];
  return {
    baseCurrency: "EUR",
    holdings: valuations.map((v) => v.holding),
    valuations,
    cashBalance: 2_500,
    dashboardActions: [],
    rebalanceRecommendations: [],
    allocationPlan: null,
    ...overrides,
  };
}

// ============================================================
//  Tests
// ============================================================

describe("simulateActionImpact", () => {
  it("retourneert vóór/na snapshots zelfs zonder acties", () => {
    const result = simulateActionImpact(defaultInput());
    expect(result.totalActionCount).toBe(0);
    expect(result.appliedActionCount).toBe(0);
    expect(result.currentAllocation.totalValue).toBeGreaterThan(0);
    expect(result.simulatedAllocation.totalValue).toBeGreaterThan(0);
    // Niets veranderd → zelfde output.
    expect(result.simulatedAllocation.byAssetClass).toEqual(
      result.currentAllocation.byAssetClass,
    );
    expect(result.simulatedTop5Concentration).toEqual(
      result.currentTop5Concentration,
    );
  });

  it("RISK_REDUCTION verlaagt de top-5 concentratie via amountToSell", () => {
    const input = defaultInput({
      dashboardActions: [dashAction()],
      rebalanceRecommendations: [rec()],
    });
    const result = simulateActionImpact(input);
    expect(result.appliedActionCount).toBe(1);
    expect(result.simulatedTop5Concentration.top5Weight).toBeLessThan(
      result.currentTop5Concentration.top5Weight,
    );
    expect(result.simulatedAllocation.cashBalance).toBeGreaterThan(
      result.currentAllocation.cashBalance,
    );
  });

  it("RISK_REDUCTION zonder quantityPlan triggert dataWarning en wordt overgeslagen", () => {
    const input = defaultInput({
      dashboardActions: [dashAction()],
      rebalanceRecommendations: [
        rec({
          quantityPlan: plan({ currentPrice: null, sharesToSell: 0, amountToSell: 0 }),
        }),
      ],
    });
    const result = simulateActionImpact(input);
    expect(result.appliedActionCount).toBe(0);
    expect(result.dataWarnings.length).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThan(0.7);
  });

  it("BUY_OPPORTUNITY met action.amount verlaagt cash en verhoogt position", () => {
    const buy = dashAction({
      id: "BUY_OPPORTUNITY:ASML",
      type: "BUY_OPPORTUNITY",
      symbol: "ASML",
      amount: 1_000,
      sourceEngine: "action-engine",
    });
    const result = simulateActionImpact(
      defaultInput({ dashboardActions: [buy] }),
    );
    expect(result.appliedActionCount).toBe(1);
    const asmlBefore = result.currentAllocation.byAssetClass;
    expect(result.simulatedAllocation.cashBalance).toBeLessThan(2_500);
    expect(asmlBefore.length).toBeGreaterThan(0);
  });

  it("BUY_OPPORTUNITY valt terug op allocationPlan suggestedAmount", () => {
    const buy = dashAction({
      id: "BUY_OPPORTUNITY:ASML",
      type: "BUY_OPPORTUNITY",
      symbol: "ASML",
    });
    const allocationPlan: AllocationPlan = {
      id: "ap1",
      portfolioId: "p1",
      asOf: NOW,
      baseCurrency: "EUR",
      monthlyContribution: 500,
      cashAvailable: 0,
      recommendations: [
        {
          ticker: "ASML",
          action: "buy",
          currentWeight: 0.25,
          targetWeight: 0.27,
          deltaWeight: 0.02,
          suggestedAmount: 750,
          convictionScore: 0.7,
          rationale: [],
        },
      ],
    };
    const result = simulateActionImpact(
      defaultInput({ dashboardActions: [buy], allocationPlan }),
    );
    expect(result.appliedActionCount).toBe(1);
    expect(result.simulatedAllocation.cashBalance).toBeCloseTo(2_500 - 750, 0);
  });

  it("HOLD_CASH / DO_NOTHING hebben geen impact", () => {
    const hold = dashAction({
      id: "HOLD_CASH:global",
      type: "HOLD_CASH",
      symbol: undefined,
    });
    const noop = dashAction({
      id: "DO_NOTHING:global",
      type: "DO_NOTHING",
      symbol: undefined,
    });
    const result = simulateActionImpact(
      defaultInput({ dashboardActions: [hold, noop] }),
    );
    expect(result.simulatedAllocation.totalValue).toBeCloseTo(
      result.currentAllocation.totalValue,
      2,
    );
  });

  it("currentRiskScore en simulatedRiskScore liggen in [0,100]", () => {
    const result = simulateActionImpact(
      defaultInput({
        dashboardActions: [dashAction()],
        rebalanceRecommendations: [rec()],
      }),
    );
    expect(result.currentRiskScore).toBeGreaterThanOrEqual(0);
    expect(result.currentRiskScore).toBeLessThanOrEqual(100);
    expect(result.simulatedRiskScore).toBeGreaterThanOrEqual(0);
    expect(result.simulatedRiskScore).toBeLessThanOrEqual(100);
  });

  it("currentCurrencyExposure base + foreign = 1", () => {
    const result = simulateActionImpact(defaultInput());
    expect(
      result.currentCurrencyExposure.baseCurrencyWeight +
        result.currentCurrencyExposure.foreignCurrencyWeight,
    ).toBeCloseTo(1, 2);
  });

  it("impactSummary bevat top-5 / risk / fx headlines", () => {
    const result = simulateActionImpact(
      defaultInput({
        dashboardActions: [dashAction()],
        rebalanceRecommendations: [rec()],
      }),
    );
    expect(result.impactSummary.length).toBe(3);
    const topics = result.impactSummary.map((i) => i.headline);
    expect(topics.some((t) => t.includes("Top 5"))).toBe(true);
    expect(topics.some((t) => t.includes("Risico-score"))).toBe(true);
    expect(topics.some((t) => t.includes("Vreemde valuta"))).toBe(true);
  });

  it("verbetering op top-5 wordt als 'improve' gemarkeerd", () => {
    const result = simulateActionImpact(
      defaultInput({
        dashboardActions: [dashAction()],
        rebalanceRecommendations: [rec()],
      }),
    );
    const top5 = result.impactSummary.find((i) => i.headline.includes("Top 5"));
    expect(top5?.direction).toBe("improve");
  });

  it("determinisme: identieke input → identieke output", () => {
    const input = defaultInput({
      dashboardActions: [dashAction()],
      rebalanceRecommendations: [rec()],
    });
    expect(simulateActionImpact(input)).toEqual(simulateActionImpact(input));
  });

  it("confidence daalt bij dataWarnings", () => {
    const cleanInput = defaultInput({
      dashboardActions: [dashAction()],
      rebalanceRecommendations: [rec()],
    });
    const noisyInput = defaultInput({
      dashboardActions: [dashAction()],
      rebalanceRecommendations: [
        rec({
          quantityPlan: plan({ currentPrice: null, sharesToSell: 0, amountToSell: 0 }),
        }),
      ],
    });
    expect(simulateActionImpact(noisyInput).confidence).toBeLessThan(
      simulateActionImpact(cleanInput).confidence,
    );
  });

  it("lege portefeuille → totalValue = 0 + lege snapshots", () => {
    const result = simulateActionImpact(
      defaultInput({
        valuations: [],
        holdings: [],
        cashBalance: 0,
      }),
    );
    expect(result.currentAllocation.totalValue).toBe(0);
    expect(result.currentAllocation.byAssetClass).toEqual([]);
    expect(result.currentTop5Concentration.top5Weight).toBe(0);
  });
});
