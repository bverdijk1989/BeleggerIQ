import { describe, expect, it } from "vitest";

import type { FundamentalsSnapshot } from "@/types/factor";

import { scoreEarningsQuality } from "./earnings-quality";

function fund(
  overrides: Partial<FundamentalsSnapshot> = {},
): FundamentalsSnapshot {
  return {
    ticker: "X",
    asOf: "2024-01-01",
    currency: "EUR",
    ...overrides,
  };
}

describe("scoreEarningsQuality", () => {
  it("neutraal bij geen data", () => {
    expect(scoreEarningsQuality(null).score).toBe(50);
  });

  it("sterke groei + hoge marge → hoge score", () => {
    const r = scoreEarningsQuality(
      fund({
        revenueGrowth5y: 0.15,
        epsGrowth5y: 0.2,
        revenueGrowthTtm: 0.12,
        netMargin: 0.2,
      }),
    );
    expect(r.score).toBeGreaterThan(90);
  });

  it("krimp → lage score", () => {
    const r = scoreEarningsQuality(
      fund({
        revenueGrowth5y: -0.02,
        epsGrowth5y: -0.05,
        revenueGrowthTtm: -0.08,
        netMargin: 0.02,
      }),
    );
    expect(r.score).toBeLessThan(15);
  });

  it("disconnect 5y vs TTM voegt waarschuwing toe", () => {
    const r = scoreEarningsQuality(
      fund({
        revenueGrowth5y: 0.1,
        revenueGrowthTtm: -0.05,
      }),
    );
    expect(r.rationale.some((x) => /Disconnect/.test(x))).toBe(true);
  });
});
