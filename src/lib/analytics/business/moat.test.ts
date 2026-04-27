import { describe, expect, it } from "vitest";

import type { FundamentalsSnapshot } from "@/types/factor";

import { scoreMoat } from "./moat";

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

describe("scoreMoat", () => {
  it("neutraal (50) bij volledige data-leegte", () => {
    const r = scoreMoat(null);
    expect(r.score).toBe(50);
    expect(r.coverage).toBe(0);
  });

  it("hoge gross margin + roic → hoge score", () => {
    const r = scoreMoat(
      fund({
        grossMargin: 0.6,
        roic: 0.25,
        operatingMargin: 0.3,
      }),
    );
    expect(r.score).toBeGreaterThanOrEqual(95);
    expect(r.coverage).toBeCloseTo(1, 2);
  });

  it("commodity-business → lage score", () => {
    const r = scoreMoat(
      fund({
        grossMargin: 0.15,
        roic: 0.05,
        operatingMargin: 0.03,
      }),
    );
    expect(r.score).toBeLessThan(20);
  });

  it("partial data → coverage < 1, score op beschikbare velden", () => {
    const r = scoreMoat(fund({ roic: 0.25 }));
    expect(r.coverage).toBeLessThan(1);
    expect(r.coverage).toBeGreaterThan(0);
    expect(r.score).toBe(100);
  });

  it("rationale bevat letterlijke cijfers uit fundamentals", () => {
    const r = scoreMoat(fund({ grossMargin: 0.45 }));
    expect(r.rationale.some((x) => /45\.0%/.test(x))).toBe(true);
  });
});
