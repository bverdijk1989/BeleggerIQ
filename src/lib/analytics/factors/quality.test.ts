import { describe, expect, it } from "vitest";

import { scoreQuality } from "./quality";
import type { FundamentalsSnapshot } from "@/types/factor";

function makeFundamentals(
  overrides: Partial<FundamentalsSnapshot> = {},
): FundamentalsSnapshot {
  return {
    ticker: "ASML",
    asOf: "2026-04-01T00:00:00.000Z",
    currency: "EUR",
    ...overrides,
  };
}

describe("scoreQuality", () => {
  it("scoort neutraal zonder fundamentals", () => {
    const result = scoreQuality(null);
    expect(result.score).toBe(50);
    expect(result.coverage).toBe(0);
  });

  it("beloont hoge ROIC + marges + lage debt/equity", () => {
    const result = scoreQuality(
      makeFundamentals({
        roic: 0.22,
        roe: 0.28,
        debtToEquity: 0.3,
        grossMargin: 0.55,
        operatingMargin: 0.28,
        fcfYield: 0.08,
      }),
    );
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.rationales.some((r) => r.toLowerCase().includes("roic"))).toBe(true);
  });

  it("straft zwakke fundamentals", () => {
    const result = scoreQuality(
      makeFundamentals({
        roic: 0.02,
        roe: 0.01,
        debtToEquity: 2.5,
        grossMargin: 0.1,
        operatingMargin: 0.01,
        fcfYield: -0.02,
      }),
    );
    expect(result.score).toBeLessThanOrEqual(25);
  });

  it("negeert ontbrekende velden en scoort op wat er wel is", () => {
    const partial = scoreQuality(makeFundamentals({ roic: 0.2 }));
    expect(partial.score).toBeGreaterThan(50);
  });
});
