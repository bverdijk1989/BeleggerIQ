import { describe, expect, it } from "vitest";

import {
  DECISION_THRESHOLDS,
  classifyAction,
  resolveCap,
} from "./action-classifier";

function baseInput(overrides: Partial<Parameters<typeof classifyAction>[0]> = {}) {
  return {
    ticker: "ASML",
    composite: 50,
    factorConfidence: 0.7,
    qualitySubScore: 50,
    currentWeight: 0.05,
    targetWeight: 0.05,
    cashAvailable: 1000,
    marketValueBase: 5000,
    ...overrides,
  };
}

describe("classifyAction — SELL pad", () => {
  it("composite < 25 triggert SELL", () => {
    const r = classifyAction(baseInput({ composite: 20 }));
    expect(r.action).toBe("SELL");
    expect(r.urgency).toBe("HIGH");
    expect(r.sources).toContain("factor-engine");
  });

  it("gewicht > cap × 1.2 triggert SELL", () => {
    const r = classifyAction(baseInput({ currentWeight: 0.13, composite: 60 }));
    expect(r.action).toBe("SELL");
    expect(r.sources).toContain("policy-engine");
  });

  it("risk-flag 'critical' triggert SELL", () => {
    const r = classifyAction(
      baseInput({
        composite: 70,
        positionRisk: {
          ticker: "X",
          concentrationWeight: 0.05,
          riskClass: "critical",
          contributors: [],
        } as any,
      }),
    );
    expect(r.action).toBe("SELL");
    expect(r.sources).toContain("risk-engine");
  });

  it("rebalance-engine RECONSIDER triggert SELL", () => {
    const r = classifyAction(
      baseInput({ composite: 60, rebalanceForcesReconsider: true }),
    );
    expect(r.action).toBe("SELL");
    expect(r.sources).toContain("rebalance-engine");
  });
});

describe("classifyAction — winner-protection (Buffett-laag)", () => {
  it("hoge-kwaliteit positie boven cap×1.2 wordt NIET geforceerd verkocht", () => {
    const r = classifyAction(
      baseInput({
        composite: 82,
        qualitySubScore: 78,
        currentWeight: 0.13, // boven cap × 1.2
        targetWeight: 0.10,
      }),
    );
    expect(r.action).toBe("TRIM");
    expect(r.urgency).toBe("LOW");
    expect(r.rationaleParts.join(" ")).toMatch(/winnaar mag doorlopen/i);
    expect(r.riskImpact).toMatch(/winst gradueel/i);
  });

  it("winner-protection geldt NIET bij risk-critical flag", () => {
    const r = classifyAction(
      baseInput({
        composite: 85,
        qualitySubScore: 80,
        currentWeight: 0.13,
        positionRisk: {
          ticker: "X",
          concentrationWeight: 0.13,
          riskClass: "critical",
          contributors: [],
        } as any,
      }),
    );
    expect(r.action).toBe("SELL");
    expect(r.sources).toContain("risk-engine");
  });

  it("winner-protection geldt NIET bij zwakke composite (< 70)", () => {
    const r = classifyAction(
      baseInput({
        composite: 65,
        qualitySubScore: 80,
        currentWeight: 0.13,
      }),
    );
    expect(r.action).toBe("SELL");
  });

  it("winner-protection geldt NIET bij lage quality (< 70)", () => {
    const r = classifyAction(
      baseInput({
        composite: 80,
        qualitySubScore: 50,
        currentWeight: 0.13,
      }),
    );
    expect(r.action).toBe("SELL");
  });

  it("winner-protection geldt NIET wanneer rebalance-engine RECONSIDER forceert", () => {
    const r = classifyAction(
      baseInput({
        composite: 85,
        qualitySubScore: 80,
        currentWeight: 0.13,
        rebalanceForcesReconsider: true,
      }),
    );
    expect(r.action).toBe("SELL");
  });

  it("hoge-kwaliteit positie net boven cap (zonder × 1.2) krijgt LOW-urgency winner-trim", () => {
    const r = classifyAction(
      baseInput({
        composite: 80,
        qualitySubScore: 75,
        currentWeight: 0.105, // boven cap, onder cap × 1.2
      }),
    );
    expect(r.action).toBe("TRIM");
    expect(r.urgency).toBe("LOW");
    expect(r.rationaleParts.join(" ")).toMatch(/winnaar mag doorlopen/i);
  });
});

describe("classifyAction — TRIM pad", () => {
  it("gewicht boven cap triggert TRIM (geen SELL drempel)", () => {
    const r = classifyAction(
      baseInput({ currentWeight: 0.11, composite: 60 }),
    );
    expect(r.action).toBe("TRIM");
    expect(r.urgency).toBe("MEDIUM");
  });

  it("zwakke factor + boven target triggert TRIM", () => {
    const r = classifyAction(
      baseInput({
        composite: 40,
        currentWeight: 0.07,
        targetWeight: 0.05,
      }),
    );
    expect(r.action).toBe("TRIM");
    expect(r.sources).toContain("factor-engine");
  });

  it("rebalance-engine TRIM_LIGHT propageert", () => {
    const r = classifyAction(
      baseInput({ composite: 60, rebalanceForcesTrim: true }),
    );
    expect(r.action).toBe("TRIM");
    expect(r.sources).toContain("rebalance-engine");
  });

  it("risk-flag 'elevated' triggert TRIM", () => {
    const r = classifyAction(
      baseInput({
        composite: 60,
        positionRisk: {
          ticker: "X",
          concentrationWeight: 0.05,
          riskClass: "elevated",
          contributors: [],
        } as any,
      }),
    );
    expect(r.action).toBe("TRIM");
    expect(r.urgency).toBe("MEDIUM");
  });
});

describe("classifyAction — BUY pad", () => {
  it("composite ≥ 70 + ruimte + cash → BUY", () => {
    const r = classifyAction(baseInput({ composite: 75 }));
    expect(r.action).toBe("BUY");
    expect(r.sources).toContain("factor-engine");
  });

  it("BUY niet als gewicht al op cap zit", () => {
    const r = classifyAction(
      baseInput({ composite: 80, currentWeight: 0.1 }),
    );
    expect(r.action).not.toBe("BUY");
  });

  it("BUY niet bij DEFENSIVE regime tenzij composite ≥ 80", () => {
    const r1 = classifyAction(
      baseInput({
        composite: 75,
        regime: { stance: "DEFENSIVE" } as any,
      }),
    );
    expect(r1.action).not.toBe("BUY");

    const r2 = classifyAction(
      baseInput({
        composite: 85,
        regime: { stance: "DEFENSIVE" } as any,
      }),
    );
    expect(r2.action).toBe("BUY");
    expect(r2.urgency).toBe("LOW");
  });

  it("BUY niet zonder cash", () => {
    const r = classifyAction(
      baseInput({ composite: 80, cashAvailable: 0 }),
    );
    expect(r.action).not.toBe("BUY");
  });

  it("BUY niet bij lage factor-confidence", () => {
    const r = classifyAction(
      baseInput({ composite: 80, factorConfidence: 0.2 }),
    );
    expect(r.action).not.toBe("BUY");
  });
});

describe("classifyAction — HOLD / DO_NOTHING", () => {
  it("composite tussen drempels → HOLD", () => {
    const r = classifyAction(baseInput({ composite: 55 }));
    expect(r.action).toBe("HOLD");
  });

  it("geen factor + lage confidence → DO_NOTHING", () => {
    const r = classifyAction(
      baseInput({ composite: null, factorConfidence: 0.1 }),
    );
    expect(r.action).toBe("DO_NOTHING");
    expect(r.urgency).toBe("LOW");
  });
});

describe("resolveCap", () => {
  it("default 0.10 zonder policy", () => {
    expect(resolveCap(null)).toBe(DECISION_THRESHOLDS.defaultMaxPositionWeight);
  });

  it("respecteert policy.maxPositionWeight", () => {
    expect(resolveCap({ maxPositionWeight: 0.08 } as any)).toBe(0.08);
  });

  it("ignored bij invalid waarde", () => {
    expect(resolveCap({ maxPositionWeight: 1.5 } as any)).toBe(
      DECISION_THRESHOLDS.defaultMaxPositionWeight,
    );
  });
});
