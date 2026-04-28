import { describe, expect, it } from "vitest";

import { REDEPLOY_THRESHOLDS, computeRedeploy } from "./redeploy-budget";
import type { AllocationPlan } from "@/types/allocation";

function plan(
  recs: Array<{
    ticker: string;
    name?: string | null;
    action: "buy" | "add" | "hold" | "trim" | "sell";
    suggestedAmount?: number;
    rationale?: string[];
  }>,
): AllocationPlan {
  return {
    id: "plan-1",
    asOf: "2026-04-27T00:00:00.000Z",
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
      action: r.action,
      currentWeight: 0.05,
      targetWeight: 0.1,
      deltaWeight: 0.05,
      suggestedAmount: r.suggestedAmount ?? 200,
      convictionScore: 0.7,
      priority: i,
      rationale: r.rationale ?? ["test rationale"],
    })),
    warnings: [],
    simulation: null,
  } as unknown as AllocationPlan;
}

describe("computeRedeploy — regime-tiers", () => {
  it("RISK_ON → 80% redeploy", () => {
    const r = computeRedeploy({
      proceeds: 1000,
      stance: "RISK_ON",
      allocationPlan: plan([{ ticker: "VWCE", action: "buy" }]),
    });
    expect(r.redeployFraction).toBe(REDEPLOY_THRESHOLDS.default);
    expect(r.redeployAmount).toBe(800);
    expect(r.reservedCash).toBe(200);
  });

  it("NEUTRAL → 80% redeploy (default)", () => {
    const r = computeRedeploy({
      proceeds: 1000,
      stance: "NEUTRAL",
      allocationPlan: plan([{ ticker: "VWCE", action: "buy" }]),
    });
    expect(r.redeployFraction).toBe(0.8);
  });

  it("DEFENSIVE → 60% redeploy (extra cash voor latere koopjes)", () => {
    const r = computeRedeploy({
      proceeds: 1000,
      stance: "DEFENSIVE",
      allocationPlan: plan([{ ticker: "VWCE", action: "buy" }]),
    });
    expect(r.redeployFraction).toBe(REDEPLOY_THRESHOLDS.defensive);
    expect(r.redeployAmount).toBe(600);
    expect(r.reservedCash).toBe(400);
  });

  it("stance=null → behandel als NEUTRAL (80%)", () => {
    const r = computeRedeploy({
      proceeds: 1000,
      stance: null,
      allocationPlan: plan([{ ticker: "VWCE", action: "buy" }]),
    });
    expect(r.redeployFraction).toBe(0.8);
  });
});

describe("computeRedeploy — target-keuze", () => {
  it("kiest eerste BUY-kandidaat uit allocation-plan", () => {
    const r = computeRedeploy({
      proceeds: 1000,
      stance: "RISK_ON",
      allocationPlan: plan([
        { ticker: "VWCE", action: "buy", rationale: ["Brede dekking"] },
        { ticker: "ASML", action: "buy" },
      ]),
    });
    expect(r.target?.ticker).toBe("VWCE");
    expect(r.target?.rationale).toBe("Brede dekking");
  });

  it("sluit zojuist verkochte symbol uit (excludeSymbol)", () => {
    const r = computeRedeploy({
      proceeds: 1000,
      stance: "RISK_ON",
      excludeSymbol: "NVDA",
      allocationPlan: plan([
        { ticker: "NVDA", action: "buy" },
        { ticker: "VWCE", action: "buy" },
      ]),
    });
    expect(r.target?.ticker).toBe("VWCE");
  });

  it("HOLD/TRIM/SELL kandidaten worden genegeerd", () => {
    const r = computeRedeploy({
      proceeds: 1000,
      stance: "RISK_ON",
      allocationPlan: plan([
        { ticker: "X", action: "hold" },
        { ticker: "Y", action: "trim" },
        { ticker: "Z", action: "sell" },
        { ticker: "VWCE", action: "buy" },
      ]),
    });
    expect(r.target?.ticker).toBe("VWCE");
  });

  it("`add` action wordt ook geaccepteerd (bijkoop bestaande positie)", () => {
    const r = computeRedeploy({
      proceeds: 1000,
      stance: "NEUTRAL",
      allocationPlan: plan([{ ticker: "ASML", action: "add" }]),
    });
    expect(r.target?.ticker).toBe("ASML");
  });

  it("geen kandidaat → target=null, alle proceeds blijven cash", () => {
    const r = computeRedeploy({
      proceeds: 1000,
      stance: "RISK_ON",
      allocationPlan: plan([{ ticker: "X", action: "hold" }]),
    });
    expect(r.target).toBeNull();
    expect(r.redeployAmount).toBe(0);
    expect(r.reservedCash).toBe(1000);
  });

  it("geen allocation-plan → target=null, alle proceeds blijven cash", () => {
    const r = computeRedeploy({
      proceeds: 1000,
      stance: "RISK_ON",
      allocationPlan: null,
    });
    expect(r.target).toBeNull();
    expect(r.redeployAmount).toBe(0);
  });

  it("target.amount = regime-budget, niet allocation-suggestion", () => {
    const r = computeRedeploy({
      proceeds: 5000,
      stance: "DEFENSIVE",
      allocationPlan: plan([
        { ticker: "VWCE", action: "buy", suggestedAmount: 200 },
      ]),
    });
    // 5000 × 0.6 = 3000, niet de standaard 200 uit allocation-plan
    expect(r.target?.amount).toBe(3000);
  });
});

describe("computeRedeploy — edge cases", () => {
  it("proceeds = 0 → 0/0/0", () => {
    const r = computeRedeploy({
      proceeds: 0,
      stance: "RISK_ON",
      allocationPlan: plan([{ ticker: "VWCE", action: "buy" }]),
    });
    expect(r.redeployAmount).toBe(0);
    expect(r.reservedCash).toBe(0);
  });

  it("negatieve proceeds → geclamped op 0", () => {
    const r = computeRedeploy({
      proceeds: -100,
      stance: "RISK_ON",
      allocationPlan: plan([{ ticker: "VWCE", action: "buy" }]),
    });
    expect(r.redeployAmount).toBe(0);
  });

  it("DEFENSIVE reasoning expliciet noemt 'droog kruit'", () => {
    const r = computeRedeploy({
      proceeds: 1000,
      stance: "DEFENSIVE",
      allocationPlan: plan([{ ticker: "VWCE", action: "buy" }]),
    });
    expect(r.reasoning).toMatch(/droog kruit/i);
  });

  it("RISK_ON / NEUTRAL reasoning bevat geen 'droog kruit'-tilt", () => {
    const r = computeRedeploy({
      proceeds: 1000,
      stance: "RISK_ON",
      allocationPlan: plan([{ ticker: "VWCE", action: "buy" }]),
    });
    expect(r.reasoning).not.toMatch(/droog kruit/i);
  });
});
