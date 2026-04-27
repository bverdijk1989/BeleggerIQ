import { describe, expect, it } from "vitest";

import type { Holding } from "@/types/portfolio";

import { computeDividendTax, detectDomicile } from "./dividend-tax";

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

describe("detectDomicile", () => {
  it("ISIN-prefix", () => {
    expect(
      detectDomicile(holding({ isin: "NL0010273215", ticker: "ASML.AS" })),
    ).toBe("NL");
    expect(
      detectDomicile(holding({ isin: "US0378331005", ticker: "AAPL" })),
    ).toBe("US");
    expect(
      detectDomicile(holding({ isin: "DE0007236101", ticker: "SIE.DE" })),
    ).toBe("DE");
    expect(
      detectDomicile(holding({ isin: "IE00B4L5Y983", ticker: "IWDA.AS" })),
    ).toBe("IE");
  });

  it("ticker-suffix fallback wanneer ISIN ontbreekt", () => {
    expect(detectDomicile(holding({ ticker: "ASML.AS" }))).toBe("NL");
    expect(detectDomicile(holding({ ticker: "SIE.DE" }))).toBe("DE");
    expect(detectDomicile(holding({ ticker: "AIR.PA" }))).toBe("FR");
    expect(detectDomicile(holding({ ticker: "VOD.L" }))).toBe("GB");
    expect(detectDomicile(holding({ ticker: "NESN.SW" }))).toBe("CH");
  });

  it("bare ticker → US default", () => {
    expect(detectDomicile(holding({ ticker: "AAPL" }))).toBe("US");
    expect(detectDomicile(holding({ ticker: "MSFT" }))).toBe("US");
  });

  it("ISIN gaat boven ticker-suffix", () => {
    // IWDA staat aan AS-beurs maar is Iers
    expect(
      detectDomicile(holding({ isin: "IE00B4L5Y983", ticker: "IWDA.AS" })),
    ).toBe("IE");
  });
});

describe("computeDividendTax", () => {
  it("NL-aandeel: 15% NL-dividendbelasting, volledig verrekenbaar", () => {
    const r = computeDividendTax({
      entries: [
        {
          ticker: "ASML.AS",
          name: "ASML",
          grossDividend: 1000,
          holding: holding({
            ticker: "ASML.AS",
            isin: "NL0010273215",
          }),
        },
      ],
    });
    expect(r.dutchDividendTax).toBe(150);
    expect(r.foreignWithholdingTax).toBe(0);
    expect(r.creditableTax).toBe(150);
    expect(r.netDividend).toBe(850);
  });

  it("US-aandeel: 15% WHT (verdrag), verrekenbaar", () => {
    const r = computeDividendTax({
      entries: [
        {
          ticker: "MSFT",
          name: "Microsoft",
          grossDividend: 1000,
          holding: holding({ ticker: "MSFT", isin: "US5949181045" }),
        },
      ],
    });
    expect(r.foreignWithholdingTax).toBe(150);
    expect(r.creditableTax).toBe(150);
  });

  it("IE UCITS: 10% impliciete WHT, niet verrekenbaar", () => {
    const r = computeDividendTax({
      entries: [
        {
          ticker: "IWDA.AS",
          name: "iShares World",
          grossDividend: 1000,
          holding: holding({ ticker: "IWDA.AS", isin: "IE00B4L5Y983" }),
        },
      ],
    });
    expect(r.perHolding[0]!.whtRate).toBeCloseTo(0.1);
    expect(r.creditableTax).toBe(0); // niet verrekenbaar
  });

  it("GB-aandeel: 0% WHT", () => {
    const r = computeDividendTax({
      entries: [
        {
          ticker: "VOD.L",
          name: "Vodafone",
          grossDividend: 500,
          holding: holding({ ticker: "VOD.L", isin: "GB00BH4HKS39" }),
        },
      ],
    });
    expect(r.foreignWithholdingTax).toBe(0);
    expect(r.netDividend).toBe(500);
  });

  it("0 dividend → alle bedragen 0", () => {
    const r = computeDividendTax({ entries: [] });
    expect(r.grossDividend).toBe(0);
    expect(r.netDividend).toBe(0);
    expect(r.effectiveTaxRate).toBe(0);
  });

  it("domicilieOverride werkt", () => {
    const r = computeDividendTax({
      entries: [
        {
          ticker: "X",
          name: "X",
          grossDividend: 1000,
          domicileOverride: "GB",
          holding: holding({ ticker: "X", isin: "US1234567890" }),
        },
      ],
    });
    expect(r.foreignWithholdingTax).toBe(0);
  });
});
