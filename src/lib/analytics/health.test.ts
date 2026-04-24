import { describe, expect, it } from "vitest";

import { computeBasicHealthSummary } from "./health";
import type { PortfolioSummary } from "@/types/summary";

function makeSummary(overrides: Partial<PortfolioSummary> = {}): PortfolioSummary {
  const base: PortfolioSummary = {
    portfolioId: "p1",
    baseCurrency: "EUR",
    totalValue: 10_000,
    totalCost: 9_000,
    cashBalance: 0,
    unrealizedPnl: 1_000,
    unrealizedPnlPct: 0.11,
    positionCount: 10,
    largestPosition: {
      ticker: "A",
      name: "Alpha",
      marketValue: 800,
      weight: 0.08,
      unrealizedPnl: 0,
      unrealizedPnlPct: 0,
    },
    topPositions: Array.from({ length: 10 }, (_, i) => ({
      ticker: `T${i}`,
      name: `T${i}`,
      marketValue: 1000,
      weight: 0.1,
      unrealizedPnl: 0,
      unrealizedPnlPct: 0,
    })),
    allocationByAssetClass: [],
    allocationBySector: [],
    allocationByRegion: [],
    allocationByCurrency: [{ label: "EUR", value: 10_000, weight: 1 }],
  };
  return { ...base, ...overrides };
}

describe("computeBasicHealthSummary", () => {
  it("levert hoge grade bij gelijk verdeelde en veilige portefeuille", () => {
    const health = computeBasicHealthSummary({ summary: makeSummary() });
    expect(["A", "B"]).toContain(health.grade);
    expect(health.signals).toEqual([]);
  });

  it("triggert concentration signal bij dominante positie", () => {
    const summary = makeSummary({
      largestPosition: {
        ticker: "BIG",
        name: "Big Co",
        marketValue: 3000,
        weight: 0.3,
        unrealizedPnl: 0,
        unrealizedPnlPct: 0,
      },
      topPositions: [
        {
          ticker: "BIG",
          name: "Big Co",
          marketValue: 3000,
          weight: 0.3,
          unrealizedPnl: 0,
          unrealizedPnlPct: 0,
        },
      ],
      positionCount: 1,
    });
    const health = computeBasicHealthSummary({ summary });
    const codes = health.signals.map((s) => s.code);
    expect(codes).toContain("concentration.position");
    expect(codes).toContain("diversification.low");
    // Critical severity op >= 25%
    const concentration = health.signals.find(
      (s) => s.code === "concentration.position",
    );
    expect(concentration?.severity).toBe("critical");
    expect(health.grade).not.toBe("A");
  });

  it("markeert foreign exposure als die >= 70% is", () => {
    const summary = makeSummary({
      baseCurrency: "EUR",
      allocationByCurrency: [
        { label: "USD", value: 7500, weight: 0.75 },
        { label: "EUR", value: 2500, weight: 0.25 },
      ],
    });
    const health = computeBasicHealthSummary({ summary });
    expect(health.signals.some((s) => s.code === "currency.foreign")).toBe(true);
  });

  it("emit 'positive' signal bij sterk positief rendement", () => {
    const summary = makeSummary({ unrealizedPnlPct: 0.35 });
    const health = computeBasicHealthSummary({ summary });
    expect(health.signals.some((s) => s.code === "performance.positive")).toBe(true);
  });

  it("emit 'drawdown' signal bij sterk negatief rendement", () => {
    const summary = makeSummary({
      unrealizedPnl: -2000,
      unrealizedPnlPct: -0.22,
    });
    const health = computeBasicHealthSummary({ summary });
    expect(health.signals.some((s) => s.code === "performance.drawdown")).toBe(true);
  });

  it("grade valt naar laag bij lege portefeuille", () => {
    const summary = makeSummary({
      positionCount: 0,
      largestPosition: null,
      topPositions: [],
      totalValue: 0,
      totalCost: 0,
      unrealizedPnl: 0,
      unrealizedPnlPct: 0,
      allocationByCurrency: [],
    });
    const health = computeBasicHealthSummary({ summary });
    expect(health.score).toBeGreaterThanOrEqual(0);
    expect(health.score).toBeLessThanOrEqual(100);
  });
});
