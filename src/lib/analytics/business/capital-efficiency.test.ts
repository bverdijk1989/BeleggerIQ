import { describe, expect, it } from "vitest";

import type { FundamentalsSnapshot } from "@/types/factor";

import { scoreCapitalEfficiency } from "./capital-efficiency";

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

describe("scoreCapitalEfficiency", () => {
  it("neutraal bij geen data", () => {
    expect(scoreCapitalEfficiency(null).score).toBe(50);
  });

  it("hoge ROIC + lage debt → hoge score", () => {
    const r = scoreCapitalEfficiency(
      fund({
        roic: 0.2,
        roe: 0.25,
        debtToEquity: 0.2,
        interestCoverage: 15,
      }),
    );
    expect(r.score).toBeGreaterThan(90);
  });

  it("hoge debt → lagere score", () => {
    const lowDebt = scoreCapitalEfficiency(
      fund({ roic: 0.15, roe: 0.2, debtToEquity: 0.2, interestCoverage: 12 }),
    );
    const highDebt = scoreCapitalEfficiency(
      fund({ roic: 0.15, roe: 0.2, debtToEquity: 1.8, interestCoverage: 12 }),
    );
    expect(lowDebt.score).toBeGreaterThan(highDebt.score);
  });

  it("interest coverage zwak → component-score 0", () => {
    const r = scoreCapitalEfficiency(fund({ interestCoverage: 1.5 }));
    expect(r.score).toBeLessThan(50);
  });

  it("partial data: coverage proportioneel", () => {
    const r = scoreCapitalEfficiency(fund({ roic: 0.2 }));
    expect(r.coverage).toBeCloseTo(0.35, 2);
  });
});
