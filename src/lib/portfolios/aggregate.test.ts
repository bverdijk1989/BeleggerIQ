import { describe, expect, it } from "vitest";

import { aggregatePortfolios } from "./aggregate";
import type { Portfolio, Holding } from "@/types/portfolio";

function holding(over: Partial<Holding> & {
  ticker: string;
  quantity: number;
  avgCostPrice: number;
}): Holding {
  const base = {
    id: `h-${over.ticker}`,
    portfolioId: "px",
    name: over.ticker,
    assetClass: "EQUITY" as const,
    currency: "EUR" as const,
    isin: null as string | null,
    sector: null,
    region: null,
    metadata: null,
    currentPrice: over.currentPrice ?? over.avgCostPrice,
  };
  return { ...base, ...over } as Holding;
}

function portfolio(over: Partial<Portfolio> & {
  id: string;
  name: string;
  holdings: Holding[];
}): Portfolio {
  const base = {
    userId: "u1",
    description: null,
    baseCurrency: "EUR" as const,
    isPrimary: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
  return { ...base, ...over } as Portfolio;
}

describe("aggregatePortfolios", () => {
  it("totalValue is som van markt-waarde per holding (currentPrice × qty)", () => {
    const p1 = portfolio({
      id: "p1",
      name: "Hoofd",
      isPrimary: true,
      holdings: [
        holding({ ticker: "ASML", quantity: 10, avgCostPrice: 600, currentPrice: 700 }),
        holding({ ticker: "AAPL", quantity: 20, avgCostPrice: 150, currentPrice: 200 }),
      ],
    });
    const p2 = portfolio({
      id: "p2",
      name: "Pensioen",
      holdings: [
        holding({ ticker: "VWCE", quantity: 100, avgCostPrice: 100, currentPrice: 110 }),
      ],
    });
    const r = aggregatePortfolios([p1, p2]);
    // p1 = 7000 + 4000 = 11000
    // p2 = 11000
    // total = 22000
    expect(r.totalValue).toBe(22000);
    expect(r.byPortfolio).toHaveLength(2);
  });

  it("totalCost via avgCostPrice; PnL = value − cost", () => {
    const p1 = portfolio({
      id: "p1",
      name: "Hoofd",
      isPrimary: true,
      holdings: [
        holding({ ticker: "ASML", quantity: 10, avgCostPrice: 600, currentPrice: 700 }),
      ],
    });
    const r = aggregatePortfolios([p1]);
    expect(r.totalCost).toBe(6000);
    expect(r.unrealizedPnl).toBe(1000);
    expect(r.unrealizedPnlPct).toBeCloseTo(1000 / 6000, 6);
  });

  it("aggregaat totals matchen som van per-portfolio totals", () => {
    const portfolios = [
      portfolio({
        id: "p1",
        name: "A",
        isPrimary: true,
        holdings: [
          holding({ ticker: "X", quantity: 5, avgCostPrice: 100, currentPrice: 120 }),
        ],
      }),
      portfolio({
        id: "p2",
        name: "B",
        holdings: [
          holding({ ticker: "Y", quantity: 3, avgCostPrice: 200, currentPrice: 210 }),
        ],
      }),
      portfolio({
        id: "p3",
        name: "C",
        holdings: [
          holding({ ticker: "Z", quantity: 1, avgCostPrice: 1000, currentPrice: 950 }),
        ],
      }),
    ];
    const r = aggregatePortfolios(portfolios);
    const sum = r.byPortfolio.reduce((s, p) => s + p.totalValue, 0);
    expect(sum).toBe(r.totalValue);
    const costSum = r.byPortfolio.reduce((s, p) => s + p.totalCost, 0);
    expect(costSum).toBe(r.totalCost);
    const pnlSum = r.byPortfolio.reduce((s, p) => s + p.unrealizedPnl, 0);
    expect(pnlSum).toBeCloseTo(r.unrealizedPnl, 6);
  });

  it("weights sommeren tot 1.0 (binnen rounding)", () => {
    const p1 = portfolio({
      id: "p1",
      name: "A",
      isPrimary: true,
      holdings: [holding({ ticker: "X", quantity: 1, avgCostPrice: 100, currentPrice: 100 })],
    });
    const p2 = portfolio({
      id: "p2",
      name: "B",
      holdings: [holding({ ticker: "Y", quantity: 3, avgCostPrice: 100, currentPrice: 100 })],
    });
    const r = aggregatePortfolios([p1, p2]);
    const sumWeights = r.byPortfolio.reduce((s, p) => s + p.weight, 0);
    expect(sumWeights).toBeCloseTo(1, 6);
  });

  it("byPortfolio is gesorteerd op totalValue desc", () => {
    const p1 = portfolio({
      id: "p1",
      name: "Klein",
      isPrimary: true,
      holdings: [holding({ ticker: "X", quantity: 1, avgCostPrice: 50, currentPrice: 50 })],
    });
    const p2 = portfolio({
      id: "p2",
      name: "Groot",
      holdings: [holding({ ticker: "Y", quantity: 1, avgCostPrice: 5000, currentPrice: 5000 })],
    });
    const r = aggregatePortfolios([p1, p2]);
    expect(r.byPortfolio[0]?.id).toBe("p2");
    expect(r.byPortfolio[1]?.id).toBe("p1");
  });

  it("FX-mismatch wordt geteld zodat UI kan waarschuwen", () => {
    const p1 = portfolio({
      id: "p1",
      name: "EUR",
      isPrimary: true,
      baseCurrency: "EUR",
      holdings: [holding({ ticker: "X", quantity: 1, avgCostPrice: 100, currentPrice: 100 })],
    });
    const p2 = portfolio({
      id: "p2",
      name: "USD",
      baseCurrency: "USD",
      holdings: [holding({ ticker: "Y", quantity: 1, avgCostPrice: 100, currentPrice: 100 })],
    });
    const r = aggregatePortfolios([p1, p2]);
    expect(r.fxMismatchCount).toBe(1);
    expect(r.baseCurrency).toBe("EUR");
  });

  it("lege lijst → 0/0/0 zonder crash", () => {
    const r = aggregatePortfolios([]);
    expect(r.totalValue).toBe(0);
    expect(r.totalCost).toBe(0);
    expect(r.unrealizedPnl).toBe(0);
    expect(r.unrealizedPnlPct).toBe(0);
  });

  it("currentPrice ontbreekt → val terug op avgCostPrice (zonder NaN)", () => {
    const p1 = portfolio({
      id: "p1",
      name: "A",
      isPrimary: true,
      holdings: [holding({
        ticker: "X",
        quantity: 5,
        avgCostPrice: 100,
        currentPrice: null,
      })],
    });
    const r = aggregatePortfolios([p1]);
    expect(r.totalValue).toBe(500);
    expect(r.unrealizedPnl).toBe(0);
  });
});
