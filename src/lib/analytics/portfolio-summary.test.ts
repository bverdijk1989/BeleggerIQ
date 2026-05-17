import { describe, expect, it } from "vitest";

import { computePortfolioSummary } from "./portfolio-summary";
import type { Portfolio } from "@/types/portfolio";

function makePortfolio(): Portfolio {
  return {
    id: "p1",
    userId: "u1",
    name: "Test",
    baseCurrency: "EUR",
    isPrimary: true,
    cashBalance: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    holdings: [
      {
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
      },
      {
        id: "h2",
        portfolioId: "p1",
        ticker: "SHELL",
        name: "Shell plc",
        assetClass: "EQUITY",
        currency: "EUR",
        quantity: 20,
        avgCostPrice: 25,
        currentPrice: 30,
        sector: "Energy",
        region: "Europe",
        isin: null,
        metadata: null,
      },
    ],
  };
}

describe("computePortfolioSummary", () => {
  it("rekent totale waarde, kostprijs en winst correct uit", () => {
    const summary = computePortfolioSummary(makePortfolio(), { cashBalance: 1000 });

    expect(summary.totalValue).toBe(10 * 600 + 20 * 30 + 1000);
    expect(summary.totalCost).toBe(10 * 500 + 20 * 25);
    expect(summary.cashBalance).toBe(1000);
    expect(summary.unrealizedPnl).toBe(summary.totalValue - 1000 - summary.totalCost);
    expect(summary.positionCount).toBe(2);
  });

  it("valt terug op portfolio.cashBalance als options.cashBalance ontbreekt", () => {
    // Regressie: eerder werd portfolio.cashBalance stilletjes genegeerd
    // wanneer de caller geen options.cashBalance meegaf. Dat veroorzaakte
    // false-positive "0.0% cash — beperkte buffer"-signalen in de
    // behavioral coach voor users die wél cash hadden opgegeven.
    const portfolio = { ...makePortfolio(), cashBalance: 862 };
    const summary = computePortfolioSummary(portfolio);

    expect(summary.cashBalance).toBe(862);
    expect(summary.totalValue).toBe(10 * 600 + 20 * 30 + 862);
  });

  it("options.cashBalance overschrijft portfolio.cashBalance", () => {
    const portfolio = { ...makePortfolio(), cashBalance: 862 };
    const summary = computePortfolioSummary(portfolio, { cashBalance: 5000 });
    expect(summary.cashBalance).toBe(5000);
  });

  it("sorteert topposities op marktwaarde aflopend", () => {
    const summary = computePortfolioSummary(makePortfolio());
    expect(summary.topPositions[0]?.ticker).toBe("ASML");
    expect(summary.topPositions[1]?.ticker).toBe("SHELL");
  });

  it("aggregeert allocatie per sector met gewichten die optellen tot 1", () => {
    const summary = computePortfolioSummary(makePortfolio());
    const totalWeight = summary.allocationBySector.reduce(
      (sum, slice) => sum + slice.weight,
      0,
    );
    expect(totalWeight).toBeCloseTo(1, 5);
  });

  it("gaat veilig om met lege portefeuilles", () => {
    const empty: Portfolio = { ...makePortfolio(), holdings: [] };
    const summary = computePortfolioSummary(empty);
    expect(summary.totalValue).toBe(0);
    expect(summary.unrealizedPnlPct).toBe(0);
    expect(summary.topPositions).toEqual([]);
  });
});
