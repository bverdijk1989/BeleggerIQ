import { describe, expect, it } from "vitest";

import type { FundamentalsSnapshot } from "@/types/factor";
import type { Holding } from "@/types/portfolio";

import {
  computeBusinessQuality,
  computeBusinessQualityBatch,
} from "./business-score";

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

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: "h",
    portfolioId: "p",
    ticker: overrides.ticker ?? "X",
    isin: null,
    name: overrides.name ?? "X",
    assetClass: "EQUITY",
    currency: "EUR",
    quantity: 10,
    avgCostPrice: 100,
    sector: overrides.sector ?? "Technology",
  };
}

describe("computeBusinessQuality — composite + label", () => {
  it("COMPOUNDER bij sterke fundamentals + niet-cyclische sector", () => {
    const r = computeBusinessQuality({
      ticker: "MSFT",
      fundamentals: fund({
        grossMargin: 0.65,
        roic: 0.25,
        operatingMargin: 0.4,
        roe: 0.45,
        debtToEquity: 0.4,
        interestCoverage: 25,
        revenueGrowth5y: 0.12,
        epsGrowth5y: 0.18,
        revenueGrowthTtm: 0.14,
        netMargin: 0.35,
      }),
      holding: holding({ ticker: "MSFT", sector: "Technology" }),
    });
    expect(r.label).toBe("COMPOUNDER");
    expect(r.businessQualityScore).toBeGreaterThan(80);
    expect(r.canHoldLongTerm).toBe(true);
  });

  it("SPECULATIVE bij zwakke fundamentals", () => {
    const r = computeBusinessQuality({
      ticker: "BAD",
      fundamentals: fund({
        grossMargin: 0.1,
        roic: 0.02,
        operatingMargin: -0.05,
        roe: -0.03,
        debtToEquity: 2.5,
        interestCoverage: 0.8,
        revenueGrowth5y: -0.05,
        epsGrowth5y: -0.1,
        revenueGrowthTtm: -0.08,
        netMargin: -0.05,
      }),
      holding: holding({ ticker: "BAD" }),
    });
    expect(r.label).toBe("SPECULATIVE");
    expect(r.canHoldLongTerm).toBe(false);
  });

  it("CYCLICAL als score in mid-bucket of cyclische sector", () => {
    const r = computeBusinessQuality({
      ticker: "OIL",
      fundamentals: fund({
        grossMargin: 0.55,
        roic: 0.18,
        operatingMargin: 0.25,
        roe: 0.2,
        debtToEquity: 0.4,
        interestCoverage: 10,
        revenueGrowth5y: 0.08,
        epsGrowth5y: 0.1,
        revenueGrowthTtm: 0.05,
        netMargin: 0.15,
      }),
      holding: holding({ ticker: "OIL", sector: "Energy" }),
    });
    expect(r.label).toBe("CYCLICAL");
    expect(r.canHoldLongTerm).toBe(false);
    expect(r.warnings.some((w) => /cyclisch/i.test(w))).toBe(true);
  });

  it("neutrale fallback (50) bij ontbrekende fundamentals", () => {
    const r = computeBusinessQuality({
      ticker: "X",
      fundamentals: null,
      holding: null,
    });
    expect(r.moatScore).toBe(50);
    expect(r.earningsStability).toBe(50);
    expect(r.capitalEfficiency).toBe(50);
    expect(r.confidence).toBe(0);
    expect(r.warnings.some((w) => /ontbreken/i.test(w))).toBe(true);
  });

  it("canHoldLongTerm = false bij lage confidence ondanks COMPOUNDER", () => {
    // Alleen één veld → lage coverage
    const r = computeBusinessQuality({
      ticker: "X",
      fundamentals: fund({ grossMargin: 0.7 }),
      holding: holding({ sector: "Software" }),
    });
    expect(r.canHoldLongTerm).toBe(false);
  });

  it("identieke input → identieke output (determinisme)", () => {
    const input = {
      ticker: "MSFT",
      fundamentals: fund({
        grossMargin: 0.65,
        roic: 0.25,
        netMargin: 0.3,
      }),
      holding: holding({ ticker: "MSFT" }),
      asOf: "2024-04-25T00:00:00.000Z",
    };
    const a = computeBusinessQuality(input);
    const b = computeBusinessQuality(input);
    expect(a).toEqual(b);
  });
});

describe("computeBusinessQualityBatch", () => {
  it("sorteert ranked aflopend op composite", () => {
    const r = computeBusinessQualityBatch([
      {
        ticker: "WEAK",
        fundamentals: fund({ roic: 0.05, netMargin: 0.05 }),
        holding: holding({ ticker: "WEAK" }),
      },
      {
        ticker: "STRONG",
        fundamentals: fund({
          grossMargin: 0.6,
          roic: 0.22,
          operatingMargin: 0.3,
          roe: 0.3,
          debtToEquity: 0.3,
          interestCoverage: 20,
          revenueGrowth5y: 0.12,
          epsGrowth5y: 0.18,
          revenueGrowthTtm: 0.1,
          netMargin: 0.3,
        }),
        holding: holding({ ticker: "STRONG" }),
      },
    ]);
    expect(r.ranked[0]!.ticker).toBe("STRONG");
    expect(r.ranked[1]!.ticker).toBe("WEAK");
    expect(r.byTicker.get("STRONG")!.label).toBe("COMPOUNDER");
  });
});
