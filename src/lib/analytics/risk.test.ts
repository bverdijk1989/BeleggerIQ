import { describe, expect, it } from "vitest";

import { computeConcentration, computeRiskSnapshot } from "./risk";
import type { PortfolioSummary } from "@/types/summary";

describe("computeConcentration", () => {
  it("retourneert 1 voor volledig geconcentreerde portefeuille", () => {
    expect(computeConcentration([1])).toBe(1);
  });

  it("retourneert 1/n voor gelijk verdeelde gewichten", () => {
    expect(computeConcentration([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(0.25, 5);
  });
});

describe("computeRiskSnapshot", () => {
  it("leidt key metrics af uit een portfolio summary", () => {
    const summary: PortfolioSummary = {
      portfolioId: "p1",
      baseCurrency: "EUR",
      totalValue: 1000,
      totalCost: 900,
      cashBalance: 0,
      unrealizedPnl: 100,
      unrealizedPnlPct: 0.11,
      positionCount: 2,
      topPositions: [
        {
          ticker: "A",
          name: "A",
          marketValue: 600,
          weight: 0.6,
          unrealizedPnl: 0,
          unrealizedPnlPct: 0,
        },
        {
          ticker: "B",
          name: "B",
          marketValue: 400,
          weight: 0.4,
          unrealizedPnl: 0,
          unrealizedPnlPct: 0,
        },
      ],
      largestPosition: {
        ticker: "A",
        name: "A",
        marketValue: 600,
        weight: 0.6,
        unrealizedPnl: 0,
        unrealizedPnlPct: 0,
      },
      allocationByAssetClass: [{ label: "EQUITY", value: 1000, weight: 1 }],
      allocationBySector: [
        { label: "Tech", value: 600, weight: 0.6 },
        { label: "Energy", value: 400, weight: 0.4 },
      ],
      allocationByRegion: [{ label: "EU", value: 1000, weight: 1 }],
      allocationByCurrency: [{ label: "EUR", value: 1000, weight: 1 }],
    };

    const snapshot = computeRiskSnapshot(summary);
    expect(snapshot.largestPositionWeight).toBe(0.6);
    expect(snapshot.concentrationHhi).toBeCloseTo(0.52, 5);
    expect(snapshot.regionConcentrationHhi).toBe(1);
  });
});
