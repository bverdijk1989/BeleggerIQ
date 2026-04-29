import { describe, expect, it } from "vitest";

import { deriveHoldingAction } from "./holding-action";

/**
 * Tests voor de Bogle/Buffett-laag in de holding-action classifier:
 * een BROAD_MARKET_ETF / BOND_ETF mag GEEN factor-driven TRIM krijgen,
 * zelfs niet bij een matige composite. Een index-tracker hoort per
 * ontwerp gemiddeld te scoren.
 */

describe("deriveHoldingAction — core-ETF skip", () => {
  it("BROAD_MARKET_ETF met composite 45 + overweight → HOLD (geen TRIM)", () => {
    const r = deriveHoldingAction({
      composite: 45,
      confidence: 0.8,
      currentWeight: 0.50,
      targetWeight: 0.40,
      instrumentType: "BROAD_MARKET_ETF",
    });
    expect(r.action).toBe("HOLD");
    expect(r.rationale).toMatch(/core-broad/i);
  });

  it("BOND_ETF met composite 40 + overweight → HOLD", () => {
    const r = deriveHoldingAction({
      composite: 40,
      confidence: 0.8,
      currentWeight: 0.30,
      targetWeight: 0.20,
      instrumentType: "BOND_ETF",
    });
    expect(r.action).toBe("HOLD");
  });

  it("SINGLE_STOCK met composite 45 + overweight → TRIM (terecht)", () => {
    const r = deriveHoldingAction({
      composite: 45,
      confidence: 0.8,
      currentWeight: 0.13,
      targetWeight: 0.10,
      instrumentType: "SINGLE_STOCK",
    });
    expect(r.action).toBe("TRIM");
  });

  it("THEME_ETF met composite 45 + overweight → TRIM (themabets mogen wel afgebouwd)", () => {
    const r = deriveHoldingAction({
      composite: 45,
      confidence: 0.8,
      currentWeight: 0.12,
      targetWeight: 0.10,
      instrumentType: "THEME_ETF",
    });
    expect(r.action).toBe("TRIM");
  });

  it("SECTOR_ETF met composite 45 + overweight → TRIM (sector-bets ook tactical)", () => {
    const r = deriveHoldingAction({
      composite: 45,
      confidence: 0.8,
      currentWeight: 0.18,
      targetWeight: 0.15,
      instrumentType: "SECTOR_ETF",
    });
    expect(r.action).toBe("TRIM");
  });

  it("BROAD_MARKET_ETF met sterke score 80 → BUY_CANDIDATE (skip-rule alleen voor TRIM-pad)", () => {
    const r = deriveHoldingAction({
      composite: 80,
      confidence: 0.85,
      currentWeight: 0.30,
      targetWeight: 0.40,
      instrumentType: "BROAD_MARKET_ETF",
    });
    expect(r.action).toBe("BUY_CANDIDATE");
  });

  it("BROAD_MARKET_ETF met composite 25 → AVOID (echt zwak; rule-skip geldt alleen tussen 35-50)", () => {
    const r = deriveHoldingAction({
      composite: 25,
      confidence: 0.8,
      currentWeight: 0.30,
      targetWeight: 0.40,
      instrumentType: "BROAD_MARKET_ETF",
    });
    expect(r.action).toBe("AVOID");
  });

  it("instrumentType=undefined (legacy) → behaviour onveranderd, TRIM bij overweight + matige score", () => {
    const r = deriveHoldingAction({
      composite: 45,
      confidence: 0.8,
      currentWeight: 0.13,
      targetWeight: 0.10,
    });
    expect(r.action).toBe("TRIM");
  });
});
