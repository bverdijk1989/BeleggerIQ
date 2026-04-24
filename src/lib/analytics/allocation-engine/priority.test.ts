import { describe, expect, it } from "vitest";

import type { FactorScore } from "@/types/factor";

import { objectiveTilt, regimeAdjustment } from "./context";
import { scoreAllocationPriority, type PriorityContext } from "./priority";
import type { BuyCandidate } from "./candidates";
import { DEFAULT_ALLOCATION_THRESHOLDS } from "./thresholds";

function makeCandidate(
  overrides: Partial<BuyCandidate> = {},
): BuyCandidate {
  return {
    ticker: "ASML",
    name: "ASML Holding",
    currency: "EUR",
    sector: "Technology",
    region: "Europe",
    currentWeight: 0.05,
    headroomWeight: 0.05,
    unitPriceBase: 600,
    factorScore: null,
    isExisting: true,
    isCoreEtf: false,
    ...overrides,
  };
}

function makeFactorScore(sub: Partial<FactorScore["subScores"]>): FactorScore {
  return {
    ticker: "ASML",
    asOf: "2026-01-01T00:00:00.000Z",
    subScores: {
      value: 50,
      quality: 50,
      momentum: 50,
      lowVol: 50,
      ...sub,
    },
    composite: 60,
  };
}

function makeCtx(overrides: Partial<PriorityContext> = {}): PriorityContext {
  return {
    thresholds: DEFAULT_ALLOCATION_THRESHOLDS,
    regime: regimeAdjustment(null),
    objective: objectiveTilt("BALANCED"),
    ...overrides,
  };
}

describe("scoreAllocationPriority", () => {
  it("blocked candidate bij headroom = 0", () => {
    const cand = makeCandidate({ headroomWeight: 0 });
    const r = scoreAllocationPriority(cand, makeCtx());
    expect(r.blocked).toBe(true);
    expect(r.priority).toBe(0);
    expect(r.blockReason).toMatch(/cap/);
  });

  it("blocked wanneer objective minRequirements niet wordt gehaald", () => {
    const cand = makeCandidate({
      factorScore: makeFactorScore({ quality: 40 }),
    });
    const ctx = makeCtx({ objective: objectiveTilt("FIRE") });
    // FIRE vereist quality >= 50; quality = 40 → block
    const r = scoreAllocationPriority(cand, ctx);
    expect(r.blocked).toBe(true);
    expect(r.blockReason).toMatch(/quality/i);
  });

  it("priority zit altijd tussen 0 en 100", () => {
    const cand = makeCandidate({
      factorScore: makeFactorScore({ quality: 90, momentum: 90 }),
      headroomWeight: 0.1,
    });
    const r = scoreAllocationPriority(cand, makeCtx());
    expect(r.priority).toBeGreaterThanOrEqual(0);
    expect(r.priority).toBeLessThanOrEqual(100);
  });

  it("RISK_ON boost duwt momentum-gerichte candidates omhoog", () => {
    const cand = makeCandidate({
      factorScore: makeFactorScore({ momentum: 80, quality: 50 }),
      headroomWeight: 0.05,
    });
    const riskOn = scoreAllocationPriority(
      cand,
      makeCtx({
        regime: regimeAdjustment({
          asOf: "2026-01-01T00:00:00.000Z",
          score: 80,
          stance: "RISK_ON",
          confidence: 0.9,
          narrative: "test",
          subDrivers: [],
        }),
      }),
    );
    const neutral = scoreAllocationPriority(cand, makeCtx());
    expect(riskOn.priority).toBeGreaterThan(neutral.priority);
  });

  it("DEFENSIVE stance geeft core-ETF een boost", () => {
    const cand = makeCandidate({
      ticker: "IWDA",
      name: "iShares Core",
      isCoreEtf: true,
      factorScore: null,
      headroomWeight: 0.1,
    });
    const defensive = scoreAllocationPriority(
      cand,
      makeCtx({
        regime: regimeAdjustment({
          asOf: "2026-01-01T00:00:00.000Z",
          score: 20,
          stance: "DEFENSIVE",
          confidence: 0.8,
          narrative: "test",
          subDrivers: [],
        }),
      }),
    );
    expect(defensive.breakdown.regime).toBeGreaterThanOrEqual(80);
    expect(defensive.priority).toBeGreaterThan(40);
  });

  it("zonder factor score valt factor-component terug op composite 50", () => {
    const cand = makeCandidate({ factorScore: null });
    const r = scoreAllocationPriority(cand, makeCtx());
    expect(r.breakdown.factor).toBe(50);
  });

  it("breakdown componenten zitten tussen 0 en 100", () => {
    const cand = makeCandidate({
      factorScore: makeFactorScore({ quality: 70 }),
      headroomWeight: 0.08,
    });
    const r = scoreAllocationPriority(cand, makeCtx());
    const { factor, underweight, regime, objective, concentration } =
      r.breakdown;
    for (const v of [factor, underweight, regime, objective, concentration]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});
