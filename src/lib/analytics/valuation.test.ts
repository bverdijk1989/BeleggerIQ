import { describe, expect, it } from "vitest";

import {
  aggregateAllocation,
  calculateCurrencyAllocation,
  calculatePortfolioValue,
  calculateTopHoldings,
  valueHolding,
  type HoldingValuation,
} from "./valuation";
import type { Holding } from "@/types/portfolio";

function makeHolding(overrides: Partial<Holding> = {}): Holding {
  // Merge via spread zodat explicit `null` in overrides de default overschrijft
  // (het oude `??`-patroon gaf null → default, waardoor tests geen null konden
  // forceren op currentPrice/sector/region).
  return {
    id: "h1",
    portfolioId: "p1",
    ticker: "ASML",
    name: "ASML Holding",
    assetClass: "EQUITY",
    currency: "EUR",
    quantity: 10,
    avgCostPrice: 500,
    currentPrice: 600,
    sector: "Technology",
    region: "Europe",
    isin: null,
    metadata: null,
    ...overrides,
  };
}

describe("valueHolding", () => {
  it("gebruikt meegegeven unitPrice en fxRate correct", () => {
    const v = valueHolding(makeHolding({ currency: "USD" }), {
      baseCurrency: "EUR",
      unitPrice: 100,
      fxRate: 0.92,
    });
    expect(v.unitPrice).toBe(100);
    expect(v.marketValue).toBe(1000);
    expect(v.marketValueBase).toBeCloseTo(920, 5);
    expect(v.priceSource).toBe("market");
  });

  it("valt terug op holding.currentPrice als er geen live prijs is", () => {
    const v = valueHolding(makeHolding({ currentPrice: 620 }), {
      baseCurrency: "EUR",
    });
    expect(v.unitPrice).toBe(620);
    expect(v.priceSource).toBe("lastKnown");
  });

  it("valt terug op kostprijs als er geen prijs beschikbaar is", () => {
    const v = valueHolding(
      makeHolding({ currentPrice: null, avgCostPrice: 450 }),
      { baseCurrency: "EUR" },
    );
    expect(v.unitPrice).toBe(450);
    expect(v.priceSource).toBe("costBasis");
  });
});

describe("calculatePortfolioValue", () => {
  it("somt marketValueBase + cashBalance", () => {
    const holdings: HoldingValuation[] = [
      valueHolding(makeHolding({ quantity: 1, avgCostPrice: 100, currentPrice: 150 }), {
        baseCurrency: "EUR",
      }),
      valueHolding(
        makeHolding({ id: "h2", ticker: "MSFT", currency: "USD", quantity: 2, avgCostPrice: 200, currentPrice: 300 }),
        { baseCurrency: "EUR", fxRate: 0.92 },
      ),
    ];
    // 150 + (2 * 300 * 0.92) = 150 + 552 = 702; +1000 cash = 1702
    expect(calculatePortfolioValue(holdings, 1000)).toBeCloseTo(1702, 5);
  });

  it("negeert negatieve cash (defensive)", () => {
    expect(calculatePortfolioValue([], -50)).toBe(0);
  });
});

describe("calculateTopHoldings", () => {
  it("sorteert op marketValueBase desc en berekent gewichten", () => {
    const valuations = [
      valueHolding(makeHolding({ ticker: "A", currentPrice: 100 }), {
        baseCurrency: "EUR",
      }),
      valueHolding(
        makeHolding({ id: "h2", ticker: "B", currentPrice: 50, quantity: 20 }),
        { baseCurrency: "EUR" },
      ),
    ];
    const total = calculatePortfolioValue(valuations);
    const top = calculateTopHoldings(valuations, total, 5);
    expect(top.map((t) => t.ticker)).toEqual(["A", "B"]);
    expect(top[0]!.weight + top[1]!.weight).toBeCloseTo(1, 5);
  });

  it("retourneert lege array als totalValue 0 is", () => {
    expect(calculateTopHoldings([], 0)).toEqual([]);
  });
});

describe("calculateCurrencyAllocation", () => {
  it("groepeert posities + cash op currency", () => {
    const valuations = [
      valueHolding(makeHolding({ currency: "EUR", currentPrice: 100 }), {
        baseCurrency: "EUR",
      }),
      valueHolding(
        makeHolding({
          id: "h2",
          ticker: "MSFT",
          currency: "USD",
          quantity: 5,
          avgCostPrice: 300,
          currentPrice: 400,
        }),
        { baseCurrency: "EUR", fxRate: 0.9 },
      ),
    ];
    const total = calculatePortfolioValue(valuations, 500);
    const alloc = calculateCurrencyAllocation(valuations, total, 500, "EUR");

    const labels = alloc.map((s) => s.label).sort();
    expect(labels).toEqual(["EUR", "USD"]);
    expect(alloc.reduce((sum, s) => sum + s.weight, 0)).toBeCloseTo(1, 5);
  });
});

describe("aggregateAllocation", () => {
  it("mapt null-keys naar 'Onbekend' bucket", () => {
    const valuations = [
      valueHolding(makeHolding({ sector: null, currentPrice: 100 }), {
        baseCurrency: "EUR",
      }),
      valueHolding(
        makeHolding({
          id: "h2",
          ticker: "B",
          sector: "Energy",
          currentPrice: 50,
        }),
        { baseCurrency: "EUR" },
      ),
    ];
    const total = calculatePortfolioValue(valuations);
    const alloc = aggregateAllocation(valuations, (v) => v.holding.sector, total);
    expect(alloc.map((a) => a.label)).toContain("Onbekend");
    expect(alloc.map((a) => a.label)).toContain("Energy");
  });
});
