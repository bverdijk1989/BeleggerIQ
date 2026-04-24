import { describe, expect, it } from "vitest";

import { scoreValue } from "./value";
import type { FundamentalsSnapshot } from "@/types/factor";

function makeFundamentals(
  overrides: Partial<FundamentalsSnapshot> = {},
): FundamentalsSnapshot {
  return {
    ticker: "MSFT",
    asOf: "2026-04-01T00:00:00.000Z",
    currency: "USD",
    ...overrides,
  };
}

describe("scoreValue", () => {
  it("scoort neutraal zonder fundamentals", () => {
    expect(scoreValue(null).score).toBe(50);
  });

  it("beloont goedkope waarderingen", () => {
    const result = scoreValue(
      makeFundamentals({
        pe: 9,
        pb: 1.2,
        evEbitda: 6,
        fcfYield: 0.1,
      }),
    );
    expect(result.score).toBeGreaterThanOrEqual(75);
  });

  it("straft premium-waarderingen", () => {
    const result = scoreValue(
      makeFundamentals({
        pe: 50,
        pb: 12,
        evEbitda: 35,
        fcfYield: 0.005,
      }),
    );
    expect(result.score).toBeLessThanOrEqual(25);
  });

  it("leidt PEG af wanneer P/E én groei beschikbaar zijn", () => {
    const result = scoreValue(
      makeFundamentals({
        pe: 20,
        epsGrowth5y: 0.2,
      }),
    );
    // PEG = 20 / 20 = 1.0 → gunstig
    expect(result.rationales.some((r) => r.toLowerCase().includes("peg"))).toBe(
      true,
    );
  });

  it("skipt PEG bij lage/negatieve groei", () => {
    const result = scoreValue(
      makeFundamentals({ pe: 20, epsGrowth5y: 0.01 }),
    );
    expect(result.rationales.some((r) => r.toLowerCase().includes("peg"))).toBe(
      false,
    );
  });
});
