import { describe, expect, it } from "vitest";

import {
  classifyConcentrationType,
  type ClassifyConcentrationInput,
} from "./concentration-classifier";
import { DEFAULT_REBALANCE_THRESHOLDS } from "./thresholds";

function baseInput(
  overrides: Partial<ClassifyConcentrationInput> = {},
): ClassifyConcentrationInput {
  return {
    positionWeight: 0.08,
    qualityScore: 60,
    momentumScore: 55,
    compositeScore: 60,
    volatility: 0.2,
    sector: "Technology",
    thresholds: DEFAULT_REBALANCE_THRESHOLDS,
    ...overrides,
  };
}

describe("classifyConcentrationType", () => {
  it("HEALTHY bij zware winner met sterke factor-profiel", () => {
    const result = classifyConcentrationType(
      baseInput({
        positionWeight: 0.18,
        qualityScore: 85,
        momentumScore: 78,
        compositeScore: 82,
        volatility: 0.18,
        sector: "Healthcare",
      }),
    );
    expect(result.concentrationType).toBe("HEALTHY");
    expect(result.fragilityScore).toBeLessThan(35);
    expect(result.reasons.some((r) => /Quality/i.test(r))).toBe(true);
  });

  it("FRAGILE bij zware positie met zwakke signalen en cyclische sector", () => {
    const result = classifyConcentrationType(
      baseInput({
        positionWeight: 0.22,
        qualityScore: 30,
        momentumScore: 25,
        compositeScore: 25,
        volatility: 0.45,
        sector: "Energy",
      }),
    );
    expect(result.concentrationType).toBe("FRAGILE");
    expect(result.fragilityScore).toBeGreaterThanOrEqual(60);
    expect(result.cyclicality).toBe("high");
  });

  it("NEUTRAL bij gemengde signalen", () => {
    const result = classifyConcentrationType(
      baseInput({
        positionWeight: 0.12,
        qualityScore: 55,
        momentumScore: 45,
        compositeScore: 55,
        volatility: 0.25,
        sector: "Financials",
      }),
    );
    expect(result.concentrationType).toBe("NEUTRAL");
    expect(result.fragilityScore).toBeGreaterThanOrEqual(35);
    expect(result.fragilityScore).toBeLessThan(60);
  });

  it("valt terug op lowVolScore als volatility ontbreekt", () => {
    const result = classifyConcentrationType(
      baseInput({
        volatility: null,
        lowVolScore: 20,
      }),
    );
    expect(result.reasons.some((r) => /volatiliteit/i.test(r))).toBe(true);
  });

  it("werkt met minimale input (alleen positionWeight)", () => {
    const result = classifyConcentrationType({
      positionWeight: 0.06,
      thresholds: DEFAULT_REBALANCE_THRESHOLDS,
    });
    expect(["HEALTHY", "NEUTRAL"]).toContain(result.concentrationType);
  });
});
