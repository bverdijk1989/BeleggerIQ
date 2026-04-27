import { describe, expect, it } from "vitest";

import type { Holding } from "@/types/portfolio";

import { buildTaxReport, computeNetReturn } from "./net-return";

function holding(overrides: Partial<Holding>): Holding {
  return {
    id: `h-${overrides.ticker ?? "X"}`,
    portfolioId: "p",
    ticker: overrides.ticker ?? "X",
    isin: overrides.isin ?? null,
    name: overrides.name ?? overrides.ticker ?? "X",
    assetClass: overrides.assetClass ?? "EQUITY",
    currency: overrides.currency ?? "EUR",
    quantity: 1,
    avgCostPrice: 1,
  };
}

describe("computeNetReturn", () => {
  it("netto < bruto bij positieve box 3 + WHT-lekkage", () => {
    const r = computeNetReturn({
      holdings: [
        holding({ ticker: "IWDA.AS", isin: "IE00B4L5Y983", assetClass: "ETF" }),
      ],
      marketValueByTicker: new Map([["IWDA.AS", 200_000]]),
      grossReturnFraction: 0.08, // 8% bruto
    });
    expect(r.netReturn).toBeLessThan(r.grossReturn);
    expect(r.taxImpact).toBeLessThan(0);
  });

  it("box 3-bedrag = portfolio × forfait × tarief boven heffingsvrij", () => {
    const r = computeNetReturn({
      holdings: [holding({ ticker: "ASML.AS", isin: "NL0010273215" })],
      marketValueByTicker: new Map([["ASML.AS", 200_000]]),
      grossReturnFraction: 0.08,
    });
    // taxableWealth = 200000 - 57684 = 142316 → notional = 142316 × 6.04% ≈ 8596
    // tax = 8596 × 36% ≈ 3094
    expect(r.amounts.box3Tax).toBeCloseTo(3094.52, 1);
  });

  it("amount-velden zijn consistent", () => {
    const r = computeNetReturn({
      holdings: [holding({ ticker: "ASML.AS", isin: "NL0010273215" })],
      marketValueByTicker: new Map([["ASML.AS", 100_000]]),
      grossReturnFraction: 0.1,
    });
    expect(r.amounts.grossReturnAmount).toBeCloseTo(10_000, 0);
    expect(r.amounts.netReturnAmount).toBeLessThan(10_000);
    expect(r.amounts.netReturnAmount).toBeCloseTo(
      r.amounts.grossReturnAmount - r.amounts.taxAmount,
      0,
    );
  });

  it("warning bij IE-UCITS over WHT-lekkage", () => {
    const r = computeNetReturn({
      holdings: [
        holding({
          ticker: "IWDA.AS",
          isin: "IE00B4L5Y983",
          assetClass: "ETF",
        }),
      ],
      marketValueByTicker: new Map([["IWDA.AS", 200_000]]),
      grossReturnFraction: 0.08,
    });
    expect(r.warnings.some((w) => /UCITS|lekkage/i.test(w))).toBe(true);
  });

  it("warning wanneer box 3 > bruto rendement", () => {
    const r = computeNetReturn({
      holdings: [holding({ ticker: "X", isin: "NL0000000000" })],
      marketValueByTicker: new Map([["X", 200_000]]),
      grossReturnFraction: 0.005, // half procent
    });
    expect(
      r.warnings.some((w) => /overschrijdt het verwachte bruto rendement/i.test(w)),
    ).toBe(true);
  });

  it("crypto-warning toont fiscale onzekerheid", () => {
    const r = computeNetReturn({
      holdings: [
        holding({ ticker: "BTC", assetClass: "CRYPTO", isin: null }),
      ],
      marketValueByTicker: new Map([["BTC", 50_000]]),
      grossReturnFraction: 0.2,
    });
    expect(r.warnings.some((w) => /crypto/i.test(w))).toBe(true);
  });

  it("identieke input → identieke output (determinisme)", () => {
    const input = {
      holdings: [holding({ ticker: "ASML.AS", isin: "NL0010273215" })],
      marketValueByTicker: new Map([["ASML.AS", 100_000]]),
      grossReturnFraction: 0.08,
    };
    const a = computeNetReturn(input);
    const b = computeNetReturn(input);
    expect(a).toEqual(b);
  });

  it("buildTaxReport bundelt result + meta", () => {
    const r = buildTaxReport({
      holdings: [holding({ ticker: "ASML.AS", isin: "NL0010273215" })],
      marketValueByTicker: new Map([["ASML.AS", 100_000]]),
      grossReturnFraction: 0.08,
    });
    expect(r.taxYear).toBe(2025);
    expect(r.baseCurrency).toBe("EUR");
    expect(r.result.netReturn).toBeLessThan(r.result.grossReturn);
  });
});
