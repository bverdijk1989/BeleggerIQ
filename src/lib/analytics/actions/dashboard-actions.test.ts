import { describe, expect, it } from "vitest";

import type {
  ActionPlan,
  PositionAction,
} from "./types";
import type { AllocationPlan } from "@/types/allocation";
import type { PortfolioRiskSummary } from "@/types/risk";
import type { RebalanceRecommendation } from "@/types/rebalance";

import {
  buildDashboardPrimaryActions,
  type BuildDashboardActionsInput,
  type DashboardAction,
} from "./dashboard-actions";

const NOW = "2026-04-27T00:00:00.000Z";

// ============================================================
//  Fixtures
// ============================================================

function emptyRisk(): PortfolioRiskSummary {
  return {
    portfolioId: "p",
    asOf: NOW,
    overallSeverity: "low",
    concentrationHhi: 0,
    largestPositionWeight: 0,
    sectorConcentrationHhi: 0,
    regionConcentrationHhi: 0,
    exposures: { byAssetClass: [], bySector: [], byRegion: [] },
    positions: [],
    flags: [],
  };
}

function position(overrides: Partial<PositionAction>): PositionAction {
  return {
    symbol: overrides.symbol ?? "X",
    name: overrides.name ?? overrides.symbol ?? "X",
    action: overrides.action ?? "HOLD",
    urgency: overrides.urgency ?? "LOW",
    sharesToBuy: overrides.sharesToBuy ?? 0,
    sharesToSell: overrides.sharesToSell ?? 0,
    amount: overrides.amount ?? 0,
    rationale: overrides.rationale ?? "rationale",
    riskImpact: overrides.riskImpact ?? "impact",
    sources: overrides.sources ?? ["factor-engine"],
    confidence: overrides.confidence ?? 0.7,
    quantityPlan: overrides.quantityPlan,
  };
}

function plan(positions: PositionAction[]): ActionPlan {
  return {
    generatedAt: NOW,
    baseCurrency: "EUR",
    positions,
    global: {
      overallAdvice: "HOLD",
      reason: "test",
      urgency: "LOW",
      distribution: { BUY: 0, HOLD: 0, TRIM: 0, SELL: 0, DO_NOTHING: 0 },
    },
    warnings: [],
  };
}

function baseInput(
  overrides: Partial<BuildDashboardActionsInput> = {},
): BuildDashboardActionsInput {
  return {
    actionPlan: plan([]),
    rebalanceRecommendations: [],
    allocationPlan: null,
    regime: null,
    risk: emptyRisk(),
    cashShare: 0.05,
    ...overrides,
  };
}

// ============================================================
//  Tests
// ============================================================

describe("buildDashboardPrimaryActions — RISK_REDUCTION", () => {
  it("genereert RISK_REDUCTION uit een SELL-positie met aantallen", () => {
    const input = baseInput({
      actionPlan: plan([
        position({
          symbol: "RHM.DE",
          name: "Rheinmetall",
          action: "SELL",
          urgency: "HIGH",
          sharesToSell: 1,
          amount: 1750,
          rationale: "Gewicht 31% boven cap.",
          confidence: 0.8,
        }),
      ]),
    });
    const result = buildDashboardPrimaryActions(input);
    expect(result.length).toBe(1);
    const a = result[0]!;
    expect(a.type).toBe("RISK_REDUCTION");
    expect(a.title).toMatch(/Verkoop 1/);
    expect(a.title).toMatch(/Rheinmetall/);
    expect(a.shares).toBe(1);
    expect(a.amount).toBe(1750);
    expect(a.urgency).toBe("HIGH");
    expect(a.symbol).toBe("RHM.DE");
  });

  it("hergebruikt rebalance-quantityPlan reason wanneer beschikbaar", () => {
    const action = position({
      symbol: "VWCE",
      name: "Vanguard S&P 500",
      action: "TRIM",
      urgency: "MEDIUM",
      sharesToSell: 2,
      amount: 200,
      rationale: "fallback",
      confidence: 0.7,
    });
    const rec: RebalanceRecommendation = {
      ticker: "VWCE",
      name: "Vanguard S&P 500",
      action: "TRIM_LIGHT",
      concentrationType: "NEUTRAL",
      fragilityScore: 50,
      currentWeight: 0.15,
      targetWeight: 0.1,
      deltaWeight: -0.05,
      deltaAmount: -500,
      reasons: ["Boven target."],
      confidence: 0.8,
      factorSnapshot: {
        quality: 70,
        value: 50,
        momentum: 50,
        composite: 60,
        volatility: 0.15,
        sector: "ETF",
        sectorCyclicality: "low",
      },
      quantityPlan: {
        symbol: "VWCE",
        actionLabel: "licht afbouwen",
        currentWeight: 15,
        targetWeight: 10,
        currentValue: 1500,
        targetValue: 1000,
        excessValue: 500,
        currentPrice: 100,
        sharesToSell: 4,
        amountToSell: 400,
        postSellWeight: 11,
        reason: "Bouw Vanguard S&P 500 met 4 units af",
        confidence: "HIGH",
        warnings: [],
      },
    };
    const result = buildDashboardPrimaryActions(
      baseInput({
        actionPlan: plan([action]),
        rebalanceRecommendations: [rec],
      }),
    );
    expect(result[0]!.shares).toBe(4); // uit quantityPlan, niet uit position
    expect(result[0]!.amount).toBe(400);
    expect(result[0]!.description).toMatch(/4 units/);
    expect(result[0]!.sourceEngine).toBe("rebalance-engine");
  });
});

describe("buildDashboardPrimaryActions — BUY_OPPORTUNITY", () => {
  it("genereert BUY uit action-engine BUY-positie", () => {
    const input = baseInput({
      actionPlan: plan([
        position({
          symbol: "ASML",
          name: "ASML Holding",
          action: "BUY",
          urgency: "MEDIUM",
          sharesToBuy: 2,
          amount: 300,
          rationale: "Composite 80/100.",
          confidence: 0.8,
        }),
      ]),
    });
    const result = buildDashboardPrimaryActions(input);
    expect(result[0]!.type).toBe("BUY_OPPORTUNITY");
    expect(result[0]!.title).toMatch(/Koop deze maand/);
    expect(result[0]!.title).toMatch(/€ ?300/);
    expect(result[0]!.title).toMatch(/ASML/);
  });

  it("vult BUY aan vanuit allocation-plan wanneer action-engine geen BUY heeft", () => {
    const allocationPlan: AllocationPlan = {
      id: "ap-1",
      portfolioId: "p",
      asOf: NOW,
      baseCurrency: "EUR",
      monthlyContribution: 500,
      cashAvailable: 1000,
      recommendations: [
        {
          ticker: "MSFT",
          name: "Microsoft",
          action: "buy",
          currentWeight: 0,
          targetWeight: 0.05,
          deltaWeight: 0.05,
          suggestedAmount: 250,
          convictionScore: 0.7,
          rationale: ["Maandelijks bijkopen."],
        },
      ],
    };
    const result = buildDashboardPrimaryActions(
      baseInput({ allocationPlan }),
    );
    expect(result[0]!.type).toBe("BUY_OPPORTUNITY");
    expect(result[0]!.symbol).toBe("MSFT");
    expect(result[0]!.sourceEngine).toBe("allocation-engine");
    expect(result[0]!.amount).toBe(250);
  });

  it("dedupeert dezelfde ticker uit allocation + action engine", () => {
    const action = position({
      symbol: "MSFT",
      name: "Microsoft",
      action: "BUY",
      urgency: "MEDIUM",
      sharesToBuy: 1,
      amount: 250,
      confidence: 0.8,
    });
    const allocationPlan: AllocationPlan = {
      id: "ap",
      portfolioId: "p",
      asOf: NOW,
      baseCurrency: "EUR",
      monthlyContribution: 500,
      cashAvailable: 1000,
      recommendations: [
        {
          ticker: "MSFT",
          name: "Microsoft",
          action: "buy",
          currentWeight: 0,
          targetWeight: 0.05,
          deltaWeight: 0.05,
          suggestedAmount: 999,
          convictionScore: 0.5,
          rationale: ["dup"],
        },
      ],
    };
    const result = buildDashboardPrimaryActions(
      baseInput({ actionPlan: plan([action]), allocationPlan }),
    );
    const buys = result.filter((a) => a.type === "BUY_OPPORTUNITY");
    expect(buys.length).toBe(1);
    expect(buys[0]!.amount).toBe(250); // action-engine wint
  });
});

describe("buildDashboardPrimaryActions — HOLD_CASH + DO_NOTHING", () => {
  it("HOLD_CASH bij defensief regime + cash > 25%", () => {
    const result = buildDashboardPrimaryActions(
      baseInput({
        cashShare: 0.3,
        regime: { stance: "DEFENSIVE", score: 30, confidence: 0.7 } as never,
      }),
    );
    expect(result[0]!.type).toBe("HOLD_CASH");
    expect(result[0]!.title).toMatch(/30%/);
    expect(result[0]!.sourceEngine).toBe("market-regime");
  });

  it("HOLD_CASH bij high risk + cash > 25%", () => {
    const result = buildDashboardPrimaryActions(
      baseInput({
        cashShare: 0.4,
        risk: { ...emptyRisk(), overallSeverity: "high" },
      }),
    );
    expect(result[0]!.type).toBe("HOLD_CASH");
    expect(result[0]!.sourceEngine).toBe("risk-engine");
  });

  it("geen HOLD_CASH wanneer cash-share < 25%", () => {
    const result = buildDashboardPrimaryActions(
      baseInput({
        cashShare: 0.1,
        regime: { stance: "DEFENSIVE", score: 30, confidence: 0.7 } as never,
      }),
    );
    expect(result.some((a) => a.type === "HOLD_CASH")).toBe(false);
  });

  it("DO_NOTHING fallback bij geen triggers", () => {
    const result = buildDashboardPrimaryActions(baseInput());
    expect(result.length).toBe(1);
    expect(result[0]!.type).toBe("DO_NOTHING");
    expect(result[0]!.title).toBe("Doe niets");
  });

  it("DO_NOTHING reason vermeldt defensief + hoog risico samen", () => {
    const result = buildDashboardPrimaryActions(
      baseInput({
        regime: { stance: "DEFENSIVE", score: 25, confidence: 0.7 } as never,
        risk: { ...emptyRisk(), overallSeverity: "high" },
        cashShare: 0.05, // < 25%, dus geen HOLD_CASH
      }),
    );
    const action = result.find((a) => a.type === "DO_NOTHING");
    expect(action?.description).toMatch(/defensief/);
    expect(action?.description).toMatch(/risico al hoog/);
  });
});

describe("buildDashboardPrimaryActions — sortering + limiet", () => {
  it("sorteert HIGH urgency eerst", () => {
    const positions: PositionAction[] = [
      position({
        symbol: "LOW",
        name: "Low",
        action: "BUY",
        urgency: "LOW",
        sharesToBuy: 1,
        amount: 100,
      }),
      position({
        symbol: "HIGH",
        name: "High",
        action: "SELL",
        urgency: "HIGH",
        sharesToSell: 1,
        amount: 1000,
      }),
    ];
    const result = buildDashboardPrimaryActions(
      baseInput({ actionPlan: plan(positions) }),
    );
    expect(result[0]!.symbol).toBe("HIGH");
  });

  it("RISK_REDUCTION wint van BUY bij gelijke urgency", () => {
    const positions: PositionAction[] = [
      position({
        symbol: "BUY1",
        name: "Buy",
        action: "BUY",
        urgency: "MEDIUM",
        sharesToBuy: 1,
        amount: 200,
        confidence: 0.7,
      }),
      position({
        symbol: "TRIM1",
        name: "Trim",
        action: "TRIM",
        urgency: "MEDIUM",
        sharesToSell: 2,
        amount: 300,
        confidence: 0.7,
      }),
    ];
    const result = buildDashboardPrimaryActions(
      baseInput({ actionPlan: plan(positions) }),
    );
    expect(result[0]!.type).toBe("RISK_REDUCTION");
  });

  it("respecteert maxActions = 3 default", () => {
    const positions: PositionAction[] = Array.from({ length: 6 }, (_, i) =>
      position({
        symbol: `S${i}`,
        name: `S${i}`,
        action: "SELL",
        urgency: "HIGH",
        sharesToSell: 1,
        amount: 100,
      }),
    );
    const result = buildDashboardPrimaryActions(
      baseInput({ actionPlan: plan(positions) }),
    );
    expect(result.length).toBe(3);
  });

  it("respecteert custom maxActions", () => {
    const positions: PositionAction[] = Array.from({ length: 5 }, (_, i) =>
      position({
        symbol: `S${i}`,
        name: `S${i}`,
        action: "SELL",
        urgency: "HIGH",
        sharesToSell: 1,
        amount: 100,
      }),
    );
    const result = buildDashboardPrimaryActions(
      baseInput({ actionPlan: plan(positions), maxActions: 2 }),
    );
    expect(result.length).toBe(2);
  });
});

describe("buildDashboardPrimaryActions — assetClass-driven unit-noun", () => {
  it("EQUITY: 'aandeel' (singular) en 'aandelen' (plural)", () => {
    const single = buildDashboardPrimaryActions(
      baseInput({
        actionPlan: plan([
          position({
            symbol: "RHM",
            name: "Rheinmetall",
            action: "SELL",
            urgency: "HIGH",
            sharesToSell: 1,
            amount: 100,
          }),
        ]),
        assetClassByTicker: new Map([["RHM", "EQUITY"]]),
      }),
    );
    expect(single[0]!.title).toMatch(/Verkoop 1 aandeel Rheinmetall/);

    const multi = buildDashboardPrimaryActions(
      baseInput({
        actionPlan: plan([
          position({
            symbol: "RHM",
            name: "Rheinmetall",
            action: "SELL",
            urgency: "HIGH",
            sharesToSell: 4,
            amount: 400,
          }),
        ]),
        assetClassByTicker: new Map([["RHM", "EQUITY"]]),
      }),
    );
    expect(multi[0]!.title).toMatch(/Verkoop 4 aandelen Rheinmetall/);
  });

  it("ETF: 'units'", () => {
    const r = buildDashboardPrimaryActions(
      baseInput({
        actionPlan: plan([
          position({
            symbol: "VOO",
            name: "Vanguard S&P 500",
            action: "TRIM",
            urgency: "MEDIUM",
            sharesToSell: 4,
            amount: 1500,
          }),
        ]),
        assetClassByTicker: new Map([["VOO", "ETF"]]),
      }),
    );
    expect(r[0]!.title).toMatch(/4 units/);
  });

  it("CRYPTO: 'coin'", () => {
    const r = buildDashboardPrimaryActions(
      baseInput({
        actionPlan: plan([
          position({
            symbol: "BTC",
            name: "Bitcoin",
            action: "SELL",
            urgency: "HIGH",
            sharesToSell: 1,
            amount: 60000,
          }),
        ]),
        assetClassByTicker: new Map([["BTC", "CRYPTO"]]),
      }),
    );
    expect(r[0]!.title).toMatch(/1 coin Bitcoin/);
  });

  it("zonder assetClass-map: fallback 'stuks'", () => {
    const r = buildDashboardPrimaryActions(
      baseInput({
        actionPlan: plan([
          position({
            symbol: "X",
            name: "Mystery",
            action: "SELL",
            urgency: "HIGH",
            sharesToSell: 2,
            amount: 200,
          }),
        ]),
      }),
    );
    expect(r[0]!.title).toMatch(/2 stuks Mystery/);
  });
});

describe("buildDashboardPrimaryActions — policy.maxCashShare", () => {
  it("HOLD_CASH triggert pas vanaf policy.maxCashShare wanneer gezet", () => {
    const noTrigger = buildDashboardPrimaryActions(
      baseInput({
        cashShare: 0.2,
        regime: { stance: "DEFENSIVE", score: 30, confidence: 0.7 } as never,
      }),
    );
    expect(noTrigger.some((a) => a.type === "HOLD_CASH")).toBe(false);

    const triggered = buildDashboardPrimaryActions(
      baseInput({
        cashShare: 0.2,
        regime: { stance: "DEFENSIVE", score: 30, confidence: 0.7 } as never,
        policy: { maxCashShare: 0.15 },
      }),
    );
    const hold = triggered.find((a) => a.type === "HOLD_CASH");
    expect(hold).toBeDefined();
    expect(hold!.description).toMatch(/drempel 15%/);
  });

  it("policy.maxCashShare = 0.5 onderdrukt HOLD_CASH bij 30% cash", () => {
    const r = buildDashboardPrimaryActions(
      baseInput({
        cashShare: 0.3,
        regime: { stance: "DEFENSIVE", score: 30, confidence: 0.7 } as never,
        policy: { maxCashShare: 0.5 },
      }),
    );
    expect(r.some((a) => a.type === "HOLD_CASH")).toBe(false);
  });
});

describe("buildDashboardPrimaryActions — risk-averse profile", () => {
  it("CONSERVATIVE: MEDIUM RISK-actie elevated naar HIGH", () => {
    const r = buildDashboardPrimaryActions(
      baseInput({
        actionPlan: plan([
          position({
            symbol: "X",
            name: "X",
            action: "TRIM",
            urgency: "MEDIUM",
            sharesToSell: 2,
            amount: 200,
          }),
        ]),
        riskTolerance: "CONSERVATIVE",
      }),
    );
    expect(r[0]!.urgency).toBe("HIGH");
  });

  it("CONSERVATIVE: bij gelijke urgency + gelijke confidence wint RISK", () => {
    const r = buildDashboardPrimaryActions(
      baseInput({
        actionPlan: plan([
          position({
            symbol: "BUY1",
            name: "Buy",
            action: "BUY",
            urgency: "HIGH",
            sharesToBuy: 1,
            amount: 200,
            confidence: 0.7,
          }),
          position({
            symbol: "TRIM1",
            name: "Trim",
            action: "TRIM",
            urgency: "HIGH",
            sharesToSell: 2,
            amount: 300,
            confidence: 0.7,
          }),
        ]),
        riskTolerance: "CONSERVATIVE",
      }),
    );
    expect(r[0]!.type).toBe("RISK_REDUCTION");
  });

  it("BALANCED: geen elevation", () => {
    const r = buildDashboardPrimaryActions(
      baseInput({
        actionPlan: plan([
          position({
            symbol: "X",
            name: "X",
            action: "TRIM",
            urgency: "MEDIUM",
            sharesToSell: 2,
            amount: 200,
          }),
        ]),
        riskTolerance: "BALANCED",
      }),
    );
    expect(r[0]!.urgency).toBe("MEDIUM");
  });
});

describe("buildDashboardPrimaryActions — determinisme", () => {
  it("identieke input → identieke output", () => {
    const input = baseInput({
      actionPlan: plan([
        position({
          symbol: "ASML",
          name: "ASML",
          action: "BUY",
          urgency: "MEDIUM",
          sharesToBuy: 2,
          amount: 300,
        }),
      ]),
    });
    const a = buildDashboardPrimaryActions(input);
    const b = buildDashboardPrimaryActions(input);
    expect(a).toEqual(b);
  });

  it("DashboardAction.id is stabiel: type:symbol", () => {
    const input = baseInput({
      actionPlan: plan([
        position({
          symbol: "RHM.DE",
          name: "Rheinmetall",
          action: "SELL",
          urgency: "HIGH",
          sharesToSell: 1,
          amount: 1750,
        }),
      ]),
    });
    const result = buildDashboardPrimaryActions(input);
    const ids = new Set(result.map((a: DashboardAction) => a.id));
    expect(ids.has("RISK_REDUCTION:RHM.DE")).toBe(true);
  });
});
