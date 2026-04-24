import { describe, expect, it } from "vitest";

import {
  computeHhi,
  computeTop5Weight,
  classifyPositionWeight,
} from "./concentration";
import { DEFAULT_RISK_THRESHOLDS } from "./thresholds";

describe("computeHhi", () => {
  it("is 1 voor een single-position portefeuille", () => {
    expect(computeHhi([1])).toBe(1);
  });

  it("is 1/n bij gelijk verdeelde portefeuille", () => {
    const hhi = computeHhi([0.25, 0.25, 0.25, 0.25]);
    expect(hhi).toBeCloseTo(0.25, 5);
  });
});

describe("computeTop5Weight", () => {
  it("somt de vijf grootste gewichten", () => {
    const weights = [0.3, 0.2, 0.15, 0.1, 0.08, 0.07, 0.05, 0.05];
    expect(computeTop5Weight(weights)).toBeCloseTo(0.83, 5);
  });

  it("werkt ook bij minder dan 5 posities", () => {
    expect(computeTop5Weight([0.6, 0.4])).toBe(1);
  });
});

describe("classifyPositionWeight", () => {
  it("retourneert low/moderate/high rond de thresholds", () => {
    expect(classifyPositionWeight(0.02, DEFAULT_RISK_THRESHOLDS)).toBe("low");
    expect(classifyPositionWeight(0.08, DEFAULT_RISK_THRESHOLDS)).toBe(
      "moderate",
    );
    expect(classifyPositionWeight(0.15, DEFAULT_RISK_THRESHOLDS)).toBe("high");
  });
});
