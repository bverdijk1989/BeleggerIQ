import { describe, expect, it } from "vitest";

import type {
  ActionPlan,
  AttentionItem,
  BenchmarkReport,
  BusinessQualityResult,
  MacroScenarioReport,
  OpportunityCandidate,
  PortfolioView,
  TaxReport,
} from "@/lib/analytics";
import type { AllocationPlan } from "@/types/allocation";

import { buildCockpitViewModel } from "./view-model";

const NOW = "2026-04-25T00:00:00.000Z";

function emptyView(): PortfolioView {
  return {
    summary: {
      portfolioId: "p",
      baseCurrency: "EUR",
      totalValue: 100_000,
      totalCost: 90_000,
      cashBalance: 10_000,
      unrealizedPnl: 10_000,
      unrealizedPnlPct: 0.1,
      positionCount: 8,
      largestPosition: null,
      topPositions: [],
      allocationByAssetClass: [],
      allocationBySector: [],
      allocationByRegion: [],
      allocationByCurrency: [],
    },
    health: {
      portfolioId: "p",
      asOf: NOW,
      grade: "B",
      score: 72,
      diversificationScore: 70,
      qualityScore: 70,
      riskAlignmentScore: 70,
      factorAlignmentScore: 70,
      signals: [],
    },
    risk: {
      portfolioId: "p",
      asOf: NOW,
      overallSeverity: "moderate",
      concentrationHhi: 0.1,
      largestPositionWeight: 0.2,
      sectorConcentrationHhi: 0.1,
      regionConcentrationHhi: 0.1,
      exposures: { byAssetClass: [], bySector: [], byRegion: [] },
      positions: [],
      flags: [],
    },
    rebalance: {
      portfolioId: "p",
      asOf: NOW,
      baseCurrency: "EUR",
      totalValue: 100_000,
      recommendations: [],
      totalTurnover: 0,
      summary: {
        NO_ACTION: 0,
        TRIM_LIGHT: 0,
        TRIM_HEAVY: 0,
        RECONSIDER: 0,
      },
    },
    valuations: [],
    factorScores: new Map(),
    lastUpdated: NOW,
  };
}

function emptyActionPlan(): ActionPlan {
  return {
    generatedAt: NOW,
    baseCurrency: "EUR",
    positions: [],
    global: {
      overallAdvice: "INSUFFICIENT_DATA",
      reason: "Geen posities om te evalueren.",
      urgency: "LOW",
      distribution: { BUY: 0, HOLD: 0, TRIM: 0, SELL: 0, DO_NOTHING: 0 },
    },
    warnings: [],
  };
}

function emptyTaxReport(): TaxReport {
  return {
    generatedAt: NOW,
    baseCurrency: "EUR",
    taxYear: 2025,
    result: {
      grossReturn: 0.08,
      taxImpact: -0.02,
      netReturn: 0.06,
      amounts: {
        grossReturnAmount: 8000,
        taxAmount: 2000,
        netReturnAmount: 6000,
        box3Tax: 1500,
        dividendTax: 300,
        foreignWht: 200,
      },
      box3: {
        taxableWealth: 42316,
        exemption: 57684,
        notionalReturnRate: 0.0604,
        notionalIncome: 2556,
        taxRate: 0.36,
        taxOwed: 920,
        effectiveTaxOnPortfolio: 0.0092,
        rationale: [],
      },
      dividend: {
        grossDividend: 2000,
        foreignWithholdingTax: 200,
        dutchDividendTax: 300,
        creditableTax: 500,
        netDividend: 1500,
        effectiveTaxRate: 0.25,
        perHolding: [],
      },
      warnings: [],
      confidence: 0.8,
    },
  };
}

function emptyAllocation(): AllocationPlan {
  return {
    id: "plan-1",
    portfolioId: "p",
    baseCurrency: "EUR",
    asOf: NOW,
    monthlyContribution: 500,
    cashAvailable: 10_000,
    recommendations: [],
    deployedAmount: 0,
  };
}

function emptyMacro(): MacroScenarioReport {
  return {
    generatedAt: NOW,
    baseCurrency: "EUR",
    totalValue: 100_000,
    scenarios: [],
  };
}

describe("buildCockpitViewModel", () => {
  it("bouwt een lege-staat VM zonder te crashen", () => {
    const vm = buildCockpitViewModel({
      view: emptyView(),
      actionPlan: emptyActionPlan(),
      attention: [],
      opportunities: [],
      allocationPlan: emptyAllocation(),
      monthlyContribution: 500,
      benchmark: null,
      businessRanked: [],
      taxReport: emptyTaxReport(),
      scenarios: emptyMacro(),
      regime: null,
    });
    expect(vm.primaryAction.globalAdvice).toBe("INSUFFICIENT_DATA");
    expect(vm.primaryAction.topAction).toBeNull();
    expect(vm.risks.items).toEqual([]);
    expect(vm.opportunities.items).toEqual([]);
  });

  it("risico's worden gemapped naar severity", () => {
    const attention: AttentionItem[] = [
      {
        id: "1",
        label: "Test risico",
        message: "Detail",
        severity: "high",
        category: "risk",
      },
    ];
    const vm = buildCockpitViewModel({
      view: emptyView(),
      actionPlan: emptyActionPlan(),
      attention,
      opportunities: [],
      allocationPlan: emptyAllocation(),
      monthlyContribution: 500,
      benchmark: null,
      businessRanked: [],
      taxReport: emptyTaxReport(),
      scenarios: emptyMacro(),
      regime: null,
    });
    expect(vm.risks.items[0]!.severity).toBe("high");
    expect(vm.risks.items[0]!.label).toBe("Test risico");
  });

  it("opportunities top-5 wordt gerespecteerd", () => {
    const opps: OpportunityCandidate[] = Array.from(
      { length: 8 },
      (_, i): OpportunityCandidate => ({
        ticker: `T${i}`,
        name: `Ticker ${i}`,
        isin: null,
        score: 80 - i,
        confidence: "MEDIUM",
        signals: [],
        source: "screener",
        currentPrice: null,
        currency: null,
        summary: `Sig ${i}`,
        warnings: [],
      }),
    );
    const vm = buildCockpitViewModel({
      view: emptyView(),
      actionPlan: emptyActionPlan(),
      attention: [],
      opportunities: opps,
      allocationPlan: emptyAllocation(),
      monthlyContribution: 500,
      benchmark: null,
      businessRanked: [],
      taxReport: emptyTaxReport(),
      scenarios: emptyMacro(),
      regime: null,
    });
    expect(vm.opportunities.items.length).toBe(5);
    expect(vm.opportunities.total).toBe(8);
  });

  it("identieke input → identieke output (determinisme)", () => {
    const args = {
      view: emptyView(),
      actionPlan: emptyActionPlan(),
      attention: [],
      opportunities: [],
      allocationPlan: emptyAllocation(),
      monthlyContribution: 500,
      benchmark: null as BenchmarkReport | null,
      businessRanked: [] as BusinessQualityResult[],
      taxReport: emptyTaxReport(),
      scenarios: emptyMacro(),
      regime: null,
    };
    const a = buildCockpitViewModel(args);
    const b = buildCockpitViewModel(args);
    expect(a).toEqual(b);
  });
});
