import { describe, expect, it } from "vitest";

import type { ActionPlan, PositionAction } from "./types";
import type { AllocationPlan } from "@/types/allocation";
import type { MarketRegimeScore } from "@/types/regime";
import type { PortfolioRiskSummary } from "@/types/risk";
import type { RebalanceRecommendation } from "@/types/rebalance";

import {
  buildDashboardPrimaryActions,
  type BuildDashboardActionsInput,
} from "./dashboard-actions";

/**
 * Tests voor Fix A (geen tegenstrijdige kaart) + Fix B (paired BUY) +
 * Fix C (triggerSources zichtbaar). Aanvullend op dashboard-actions.test.ts
 * — die suite blijft de bestaande contract-tests; deze file pint specifiek
 * de bug-fixes uit de NVDA / RHEINMETALL-analyse.
 */

const NOW = "2026-04-27T00:00:00.000Z";

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

function allocationPlan(
  recs: Array<{ ticker: string; name?: string; action?: "buy" | "add" }>,
): AllocationPlan {
  return {
    id: "plan-1",
    asOf: NOW,
    portfolioId: "p1",
    baseCurrency: "EUR",
    monthlyContribution: 500,
    deployableBudget: 500,
    cashAvailable: 500,
    cashBufferAfterPlan: 0,
    coreEtfUsed: false,
    recommendations: recs.map((r, i) => ({
      ticker: r.ticker,
      name: r.name ?? r.ticker,
      action: r.action ?? "buy",
      currentWeight: 0.05,
      targetWeight: 0.1,
      deltaWeight: 0.05,
      suggestedAmount: 200,
      convictionScore: 0.7,
      priority: i,
      rationale: ["allocation-engine: core-position-fit"],
    })),
    warnings: [],
    simulation: null,
  } as unknown as AllocationPlan;
}

function regime(stance: MarketRegimeScore["stance"]): MarketRegimeScore {
  return {
    asOf: NOW,
    score: stance === "RISK_ON" ? 70 : stance === "DEFENSIVE" ? 25 : 50,
    stance,
    confidence: 0.8,
    narrative: "test",
    subDrivers: [],
  };
}

function rebalanceRec(over: {
  ticker: string;
  sharesToSell: number;
  reason: string;
}): RebalanceRecommendation {
  return {
    ticker: over.ticker,
    action: over.sharesToSell > 0 ? "TRIM_LIGHT" : "NO_ACTION",
    rationale: ["test"],
    quantityPlan: {
      sharesToSell: over.sharesToSell,
      amountToSell: over.sharesToSell * 100,
      reason: over.reason,
      action: over.sharesToSell > 0 ? "TRIM_LIGHT" : "NO_ACTION",
      currentPrice: 100,
      targetWeightPct: 10,
      allowFractional: false,
    },
  } as unknown as RebalanceRecommendation;
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
//  Fix A — geen tegenstrijdige kaart
// ============================================================

describe("Fix A — toRiskAction filtert SELL zonder zinvol aantal", () => {
  it("rebalance zegt sharesToSell=0 én action-engine emit SELL zonder eigen quantity → kaart wordt niet gegenereerd", () => {
    const input = baseInput({
      actionPlan: plan([
        position({
          symbol: "NVDA",
          name: "NVIDIA CORP",
          action: "SELL",
          urgency: "HIGH",
          sharesToSell: 0,
          amount: 0,
          rationale: "risk-engine markeert hoge volatility",
          sources: ["risk-engine"],
        }),
      ]),
      rebalanceRecommendations: [
        rebalanceRec({
          ticker: "NVDA",
          sharesToSell: 0,
          reason: "Positie binnen target-cap — geen verkoop nodig.",
        }),
      ],
    });
    const actions = buildDashboardPrimaryActions(input);
    // Géén RISK_REDUCTION — i.p.v. één met "Verkoop NVDA" + "geen verkoop nodig".
    expect(actions.find((a) => a.type === "RISK_REDUCTION")).toBeUndefined();
  });

  it("action-engine geeft eigen quantity (sharesToSell>0) ondanks rebalance=0 → kaart blijft, action-rationale wint over rebalance-reason", () => {
    const input = baseInput({
      actionPlan: plan([
        position({
          symbol: "NVDA",
          name: "NVIDIA CORP",
          action: "SELL",
          urgency: "HIGH",
          sharesToSell: 5,
          amount: 1500,
          rationale: "risk-engine: high volatility (62%) + concentratie 12%.",
          sources: ["risk-engine"],
        }),
      ]),
      rebalanceRecommendations: [
        rebalanceRec({
          ticker: "NVDA",
          sharesToSell: 0,
          reason: "Positie binnen target-cap — geen verkoop nodig.",
        }),
      ],
    });
    const card = buildDashboardPrimaryActions(input).find(
      (a) => a.type === "RISK_REDUCTION",
    );
    expect(card).toBeDefined();
    expect(card!.title).toContain("Verkoop");
    expect(card!.title).toContain("NVIDIA");
    // Description mag NIET de rebalance-tegenspraak bevatten:
    expect(card!.description).not.toMatch(/geen verkoop nodig/i);
    // Wel de action-engine-rationale (de daadwerkelijke trigger):
    expect(card!.description).toMatch(/risk-engine.*volatility/i);
  });

  it("rebalance heeft sharesToSell>0 → rebalance-reason wint (consistent met SELL-aantal)", () => {
    const input = baseInput({
      actionPlan: plan([
        position({
          symbol: "RHM.DE",
          name: "RHEINMETALL AG",
          action: "SELL",
          urgency: "HIGH",
          sharesToSell: 1,
          amount: 600,
          rationale: "fallback rationale",
          sources: ["rebalance-engine"],
        }),
      ]),
      rebalanceRecommendations: [
        rebalanceRec({
          ticker: "RHM.DE",
          sharesToSell: 1,
          reason: "Boven policy-cap; trim 1 aandeel.",
        }),
      ],
    });
    const card = buildDashboardPrimaryActions(input).find(
      (a) => a.type === "RISK_REDUCTION",
    );
    expect(card!.description).toContain("Boven policy-cap");
  });
});

// ============================================================
//  Fix B — paired BUY (regime-aware)
// ============================================================

describe("Fix B — pairedBuy gekoppeld aan RISK_REDUCTION", () => {
  it("RISK_ON: 80% van proceeds redeployt naar eerste allocation-kandidaat", () => {
    const input = baseInput({
      actionPlan: plan([
        position({
          symbol: "NVDA",
          action: "SELL",
          urgency: "HIGH",
          sharesToSell: 5,
          amount: 1000,
        }),
      ]),
      regime: regime("RISK_ON"),
      allocationPlan: allocationPlan([
        { ticker: "VWCE", name: "Vanguard FTSE All-World" },
      ]),
    });
    const card = buildDashboardPrimaryActions(input).find(
      (a) => a.type === "RISK_REDUCTION",
    );
    expect(card?.pairedBuy).toBeDefined();
    expect(card!.pairedBuy!.symbol).toBe("VWCE");
    expect(card!.pairedBuy!.amount).toBe(800);
    expect(card!.pairedBuy!.redeployFraction).toBe(0.8);
    expect(card!.pairedBuy!.reservedCash).toBe(200);
  });

  it("DEFENSIVE: 60% redeploy (extra cash voor latere koopjes)", () => {
    const input = baseInput({
      actionPlan: plan([
        position({
          symbol: "NVDA",
          action: "SELL",
          urgency: "HIGH",
          sharesToSell: 5,
          amount: 1000,
        }),
      ]),
      regime: regime("DEFENSIVE"),
      allocationPlan: allocationPlan([{ ticker: "VWCE" }]),
    });
    const card = buildDashboardPrimaryActions(input).find(
      (a) => a.type === "RISK_REDUCTION",
    );
    expect(card!.pairedBuy!.redeployFraction).toBe(0.6);
    expect(card!.pairedBuy!.amount).toBe(600);
    expect(card!.pairedBuy!.reservedCash).toBe(400);
  });

  it("NEUTRAL stance → 80% (default)", () => {
    const input = baseInput({
      actionPlan: plan([
        position({
          symbol: "NVDA",
          action: "SELL",
          urgency: "HIGH",
          sharesToSell: 5,
          amount: 1000,
        }),
      ]),
      regime: regime("NEUTRAL"),
      allocationPlan: allocationPlan([{ ticker: "VWCE" }]),
    });
    const card = buildDashboardPrimaryActions(input).find(
      (a) => a.type === "RISK_REDUCTION",
    );
    expect(card!.pairedBuy!.redeployFraction).toBe(0.8);
  });

  it("redeploy sluit zojuist verkochte positie uit als BUY-target", () => {
    const input = baseInput({
      actionPlan: plan([
        position({
          symbol: "NVDA",
          action: "SELL",
          urgency: "HIGH",
          sharesToSell: 5,
          amount: 1000,
        }),
      ]),
      regime: regime("RISK_ON"),
      // NVDA óók in allocation-plan; mag niet als target gekozen worden.
      allocationPlan: allocationPlan([
        { ticker: "NVDA" },
        { ticker: "VWCE" },
      ]),
    });
    const card = buildDashboardPrimaryActions(input).find(
      (a) => a.type === "RISK_REDUCTION",
    );
    expect(card!.pairedBuy!.symbol).toBe("VWCE");
  });

  it("geen allocation-plan → pairedBuy=null (niet undefined, niet crash)", () => {
    const input = baseInput({
      actionPlan: plan([
        position({
          symbol: "NVDA",
          action: "SELL",
          urgency: "HIGH",
          sharesToSell: 5,
          amount: 1000,
        }),
      ]),
      regime: regime("RISK_ON"),
      allocationPlan: null,
    });
    const card = buildDashboardPrimaryActions(input).find(
      (a) => a.type === "RISK_REDUCTION",
    );
    expect(card?.pairedBuy).toBeNull();
  });

  it("BUY_OPPORTUNITY-kaart krijgt GEEN pairedBuy (alleen RISK_REDUCTION)", () => {
    const input = baseInput({
      actionPlan: plan([
        position({
          symbol: "ASML",
          action: "BUY",
          urgency: "MEDIUM",
          sharesToBuy: 1,
          amount: 600,
        }),
      ]),
      regime: regime("RISK_ON"),
      allocationPlan: allocationPlan([{ ticker: "VWCE" }]),
    });
    const buy = buildDashboardPrimaryActions(input).find(
      (a) => a.type === "BUY_OPPORTUNITY",
    );
    expect(buy?.pairedBuy).toBeUndefined();
  });
});

// ============================================================
//  Fix C — triggerSources zichtbaar
// ============================================================

describe("Fix C — triggerSources op RISK_REDUCTION-kaart", () => {
  it("propageert sources uit de action-engine", () => {
    const input = baseInput({
      actionPlan: plan([
        position({
          symbol: "NVDA",
          action: "SELL",
          urgency: "HIGH",
          sharesToSell: 5,
          amount: 1000,
          sources: ["risk-engine", "factor-engine"],
        }),
      ]),
    });
    const card = buildDashboardPrimaryActions(input).find(
      (a) => a.type === "RISK_REDUCTION",
    );
    expect(card?.triggerSources).toEqual(["risk-engine", "factor-engine"]);
  });

  it("lege sources-array → fallback op ['risk-engine'] (UI badge mag nooit leeg zijn)", () => {
    const input = baseInput({
      actionPlan: plan([
        position({
          symbol: "NVDA",
          action: "SELL",
          urgency: "HIGH",
          sharesToSell: 5,
          amount: 1000,
          sources: [],
        }),
      ]),
    });
    const card = buildDashboardPrimaryActions(input).find(
      (a) => a.type === "RISK_REDUCTION",
    );
    expect(card?.triggerSources).toEqual(["risk-engine"]);
  });
});
