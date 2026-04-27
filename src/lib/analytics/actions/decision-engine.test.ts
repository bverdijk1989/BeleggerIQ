import { describe, expect, it } from "vitest";

import type { FactorScore } from "@/types/factor";
import type { Holding } from "@/types/portfolio";
import type { PortfolioRiskSummary } from "@/types/risk";

import { runDecisionEngine } from "./decision-engine";
import type { ActionPositionInput, DecisionEngineInput } from "./types";

const NOW = "2026-04-25T00:00:00.000Z";

function holding(ticker: string, name = ticker): Holding {
  return {
    id: `h-${ticker}`,
    portfolioId: "p1",
    ticker,
    isin: null,
    name,
    assetClass: "EQUITY",
    currency: "EUR",
    quantity: 10,
    avgCostPrice: 100,
  };
}

function factor(composite: number, confidence = 0.7): FactorScore {
  return {
    ticker: "X",
    asOf: NOW,
    subScores: { quality: composite, value: 50, momentum: 50, lowVol: 50 },
    composite,
    confidence,
  };
}

function pos(
  ticker: string,
  composite: number,
  weight: number,
  overrides: Partial<ActionPositionInput> = {},
): ActionPositionInput {
  return {
    holding: holding(ticker),
    currentWeight: weight,
    marketValueBase: weight * 100000,
    unitPriceBase: 100,
    factorScore: factor(composite),
    positionRisk: null,
    quantityPlan: null,
    ...overrides,
  };
}

function emptyRisk(): PortfolioRiskSummary {
  return {
    portfolioId: "p1",
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

function buildInput(
  positions: ActionPositionInput[],
  overrides: Partial<DecisionEngineInput> = {},
): DecisionEngineInput {
  return {
    positions,
    totalValue: 100000,
    cashBalance: 5000,
    baseCurrency: "EUR",
    risk: emptyRisk(),
    policy: null,
    regime: null,
    monthlyContribution: 500,
    now: NOW,
    ...overrides,
  };
}

describe("runDecisionEngine — basis", () => {
  it("genereert een actie per positie", () => {
    const r = runDecisionEngine(
      buildInput([pos("ASML", 80, 0.05), pos("MSFT", 50, 0.05)]),
    );
    expect(r.positions.length).toBe(2);
    expect(r.generatedAt).toBe(NOW);
  });

  it("HIGH urgency staat eerst in de lijst", () => {
    const r = runDecisionEngine(
      buildInput([
        pos("HIGH", 60, 0.05), // HOLD
        pos("DUMP", 15, 0.05), // SELL HIGH
      ]),
    );
    expect(r.positions[0]!.symbol).toBe("DUMP");
    expect(r.positions[0]!.urgency).toBe("HIGH");
  });

  it("BUY-positie krijgt sharesToBuy > 0 wanneer cash + ruimte", () => {
    const r = runDecisionEngine(buildInput([pos("ASML", 80, 0.04)]));
    const action = r.positions[0]!;
    expect(action.action).toBe("BUY");
    expect(action.sharesToBuy).toBeGreaterThan(0);
    expect(action.sharesToSell).toBe(0);
    expect(action.amount).toBeGreaterThan(0);
  });

  it("SELL-positie krijgt sharesToSell > 0 met fallback-berekening", () => {
    // 5 posities → defaultTarget = 0.2; SELL kandidaat zit op 30% → 10% excess.
    const r = runDecisionEngine(
      buildInput(
        [
          pos("DUMP", 15, 0.30),
          pos("A", 60, 0.18),
          pos("B", 60, 0.18),
          pos("C", 60, 0.17),
          pos("D", 60, 0.17),
        ],
        { totalValue: 100000 },
      ),
    );
    const dump = r.positions.find((p) => p.symbol === "DUMP")!;
    expect(dump.action).toBe("SELL");
    expect(dump.sharesToSell).toBeGreaterThan(0);
  });
});

describe("runDecisionEngine — global advice", () => {
  it("DE_RISK bij hoge sell-share", () => {
    const r = runDecisionEngine(
      buildInput([
        pos("A", 15, 0.05), // SELL
        pos("B", 15, 0.05), // SELL
        pos("C", 60, 0.05), // HOLD
      ]),
    );
    expect(r.global.overallAdvice).toBe("DE_RISK");
    expect(r.global.urgency === "HIGH" || r.global.urgency === "MEDIUM").toBe(true);
  });

  it("DE_RISK bij critical risk-severity", () => {
    const r = runDecisionEngine(
      buildInput([pos("A", 60, 0.05)], {
        risk: { ...emptyRisk(), overallSeverity: "critical" },
      }),
    );
    expect(r.global.overallAdvice).toBe("DE_RISK");
    expect(r.global.urgency).toBe("HIGH");
  });

  it("BUY_MORE wanneer BUY-kandidaten + cash > 5%", () => {
    const r = runDecisionEngine(
      buildInput([pos("ASML", 80, 0.03)], {
        cashBalance: 10000, // 10% cash
      }),
    );
    expect(r.global.overallAdvice).toBe("BUY_MORE");
  });

  it("HOLD bij default zonder triggers", () => {
    const r = runDecisionEngine(
      buildInput([pos("X", 55, 0.05)], { cashBalance: 0 }),
    );
    expect(r.global.overallAdvice).toBe("HOLD");
  });

  it("INSUFFICIENT_DATA bij lege portefeuille", () => {
    const r = runDecisionEngine(buildInput([]));
    expect(r.global.overallAdvice).toBe("INSUFFICIENT_DATA");
  });

  it("DEFENSIVE regime onderdrukt BUY_MORE wanneer geen sterke buy", () => {
    const r = runDecisionEngine(
      buildInput([pos("X", 75, 0.03)], {
        regime: { stance: "DEFENSIVE", score: 30, confidence: 0.7 } as any,
      }),
    );
    // Composite 75 < 80 → geen BUY in defensief regime → HOLD
    expect(r.positions[0]!.action).toBe("HOLD");
  });
});

describe("runDecisionEngine — warnings + determinisme", () => {
  it("warnt bij hoge cash-share", () => {
    const r = runDecisionEngine(
      buildInput([pos("X", 60, 0.05)], { cashBalance: 40000 }),
    );
    expect(r.warnings.some((w) => /Cash-balans/.test(w))).toBe(true);
  });

  it("identieke input → identieke output", () => {
    const input = buildInput([pos("ASML", 80, 0.04), pos("MSFT", 50, 0.05)]);
    const a = runDecisionEngine(input);
    const b = runDecisionEngine(input);
    expect(a).toEqual(b);
  });

  it("distribution telt acties correct", () => {
    const r = runDecisionEngine(
      buildInput([
        pos("A", 80, 0.04), // BUY
        pos("B", 55, 0.05), // HOLD
        pos("C", 15, 0.05), // SELL
      ]),
    );
    expect(r.global.distribution.BUY).toBe(1);
    expect(r.global.distribution.HOLD).toBe(1);
    expect(r.global.distribution.SELL).toBe(1);
  });
});
