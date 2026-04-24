import { describe, expect, it } from "vitest";

import { valueHolding } from "../valuation";
import { buildRebalancePlan } from "./engine";
import type { FactorScore } from "@/types/factor";
import type { Holding } from "@/types/portfolio";

function factorScore(
  overrides: Partial<FactorScore["subScores"]> & {
    composite?: number;
    confidence?: number;
  } = {},
): FactorScore {
  const subScores = {
    quality: overrides.quality ?? 65,
    value: overrides.value ?? 55,
    momentum: overrides.momentum ?? 60,
    lowVol: overrides.lowVol ?? 60,
  };
  return {
    ticker: "X",
    asOf: "2026-04-01T00:00:00.000Z",
    subScores,
    composite: overrides.composite ?? 60,
    confidence: overrides.confidence ?? 0.6,
    rationales: {
      quality: ["q"],
      value: ["v"],
      momentum: ["m"],
      lowVol: ["l"],
    },
  };
}

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: overrides.id ?? "h1",
    portfolioId: "p1",
    ticker: overrides.ticker ?? "ASML",
    name: overrides.name ?? "ASML Holding",
    assetClass: "EQUITY",
    currency: "EUR",
    quantity: overrides.quantity ?? 10,
    avgCostPrice: overrides.avgCostPrice ?? 500,
    currentPrice: overrides.currentPrice ?? 600,
    sector: overrides.sector ?? "Technology",
    region: overrides.region ?? "Europe",
    factorScore: overrides.factorScore,
    volatility: overrides.volatility,
  };
}

function v(h: Holding) {
  return valueHolding(h, { baseCurrency: "EUR", fxRate: 1 });
}

describe("buildRebalancePlan — healthy winner", () => {
  it("laat HEALTHY winner net boven cap doorlopen (NO_ACTION)", () => {
    const winner = holding({
      ticker: "WIN",
      quantity: 1,
      currentPrice: 1500, // 15% van 10_000
      avgCostPrice: 1000,
      sector: "Healthcare",
      volatility: 0.18,
      factorScore: factorScore({ quality: 85, momentum: 75, lowVol: 75, composite: 82 }),
    });
    const other = holding({
      id: "h2",
      ticker: "FILL",
      quantity: 85,
      currentPrice: 100, // 85%
      avgCostPrice: 100,
      sector: "Consumer Staples",
      volatility: 0.15,
      factorScore: factorScore(),
    });

    const valuations = [v(winner), v(other)];
    const totalValue = valuations.reduce((s, x) => s + x.marketValueBase, 0);

    const plan = buildRebalancePlan({
      portfolioId: "p1",
      baseCurrency: "EUR",
      valuations,
      totalValue,
    });

    const rec = plan.recommendations.find((r) => r.ticker === "WIN")!;
    expect(rec.concentrationType).toBe("HEALTHY");
    expect(rec.action).toBe("NO_ACTION");
    expect(rec.reasons.join(" ")).toMatch(/winner/i);
  });

  it("TRIM_LIGHT voor HEALTHY positie ver boven run-multiplier", () => {
    const winner = holding({
      ticker: "WIN",
      quantity: 1,
      currentPrice: 2500, // 25% van 10_000 → 2.5× policy cap
      avgCostPrice: 1000,
      sector: "Healthcare",
      volatility: 0.18,
      factorScore: factorScore({ quality: 85, momentum: 75, lowVol: 75, composite: 82 }),
    });
    const filler = holding({
      id: "h2",
      ticker: "FILL",
      quantity: 75,
      currentPrice: 100,
      avgCostPrice: 100,
      sector: "Consumer Staples",
      volatility: 0.15,
      factorScore: factorScore(),
    });

    const valuations = [v(winner), v(filler)];
    const totalValue = valuations.reduce((s, x) => s + x.marketValueBase, 0);

    const plan = buildRebalancePlan({
      portfolioId: "p1",
      baseCurrency: "EUR",
      valuations,
      totalValue,
    });
    const rec = plan.recommendations.find((r) => r.ticker === "WIN")!;
    expect(rec.concentrationType).toBe("HEALTHY");
    expect(rec.action).toBe("TRIM_LIGHT");
    expect(rec.deltaWeight).toBeLessThan(0);
    expect(rec.deltaAmount).toBeLessThan(0);
  });
});

describe("buildRebalancePlan — fragiele concentratie", () => {
  it("TRIM_HEAVY bij FRAGILE positie ver boven cap", () => {
    const fragile = holding({
      ticker: "BAD",
      quantity: 1,
      currentPrice: 2000, // 20%
      avgCostPrice: 1000,
      sector: "Energy",
      volatility: 0.5,
      factorScore: factorScore({ quality: 30, momentum: 25, lowVol: 25, composite: 28 }),
    });
    const filler = holding({
      id: "h2",
      ticker: "FILL",
      quantity: 80,
      currentPrice: 100,
      avgCostPrice: 100,
      sector: "Consumer Staples",
      volatility: 0.15,
      factorScore: factorScore(),
    });

    const valuations = [v(fragile), v(filler)];
    const totalValue = valuations.reduce((s, x) => s + x.marketValueBase, 0);

    const plan = buildRebalancePlan({
      portfolioId: "p1",
      baseCurrency: "EUR",
      valuations,
      totalValue,
    });

    const rec = plan.recommendations.find((r) => r.ticker === "BAD")!;
    expect(rec.concentrationType).toBe("FRAGILE");
    expect(rec.action).toBe("TRIM_HEAVY");
    expect(rec.deltaAmount).toBeLessThan(0);
    expect(rec.targetWeight).toBeLessThan(rec.currentWeight);
  });

  it("RECONSIDER bij zeer fragiel profiel ook zonder overweging", () => {
    const fragile = holding({
      ticker: "UGLY",
      quantity: 1,
      currentPrice: 700, // 7%
      avgCostPrice: 1000,
      sector: "Energy",
      volatility: 0.55,
      factorScore: factorScore({
        quality: 15,
        momentum: 15,
        lowVol: 20,
        composite: 18,
      }),
    });
    const filler = holding({
      id: "h2",
      ticker: "FILL",
      quantity: 93,
      currentPrice: 100,
      avgCostPrice: 100,
      sector: "Consumer Staples",
      factorScore: factorScore(),
    });

    const valuations = [v(fragile), v(filler)];
    const totalValue = valuations.reduce((s, x) => s + x.marketValueBase, 0);

    const plan = buildRebalancePlan({
      portfolioId: "p1",
      baseCurrency: "EUR",
      valuations,
      totalValue,
    });

    const rec = plan.recommendations.find((r) => r.ticker === "UGLY")!;
    expect(rec.concentrationType).toBe("FRAGILE");
    expect(["RECONSIDER", "TRIM_HEAVY"]).toContain(rec.action);
    expect(rec.fragilityScore).toBeGreaterThanOrEqual(65);
  });
});

describe("buildRebalancePlan — neutraal + sortering", () => {
  it("TRIM_LIGHT voor NEUTRAL positie boven cap", () => {
    const neutral = holding({
      ticker: "MID",
      quantity: 1,
      currentPrice: 1200, // 12%
      avgCostPrice: 1000,
      sector: "Financials",
      volatility: 0.25,
      factorScore: factorScore({ quality: 55, momentum: 45, lowVol: 55, composite: 55 }),
    });
    const filler = holding({
      id: "h2",
      ticker: "FILL",
      quantity: 88,
      currentPrice: 100,
      avgCostPrice: 100,
      sector: "Consumer Staples",
      factorScore: factorScore(),
    });

    const valuations = [v(neutral), v(filler)];
    const totalValue = valuations.reduce((s, x) => s + x.marketValueBase, 0);

    const plan = buildRebalancePlan({
      portfolioId: "p1",
      baseCurrency: "EUR",
      valuations,
      totalValue,
    });

    const rec = plan.recommendations.find((r) => r.ticker === "MID")!;
    expect(rec.concentrationType).toBe("NEUTRAL");
    expect(rec.action).toBe("TRIM_LIGHT");
    expect(rec.targetWeight).toBeCloseTo(0.1, 5);
  });

  it("summary telt acties correct en totalTurnover >= 0", () => {
    const neutral = holding({
      ticker: "A",
      quantity: 1,
      currentPrice: 1200,
      avgCostPrice: 1000,
      factorScore: factorScore({ quality: 55, composite: 55 }),
    });
    const filler = holding({
      id: "h2",
      ticker: "B",
      quantity: 88,
      currentPrice: 100,
      avgCostPrice: 100,
      factorScore: factorScore({ composite: 60 }),
    });
    const valuations = [v(neutral), v(filler)];
    const totalValue = valuations.reduce((s, x) => s + x.marketValueBase, 0);

    const plan = buildRebalancePlan({
      portfolioId: "p1",
      baseCurrency: "EUR",
      valuations,
      totalValue,
    });

    const totalActions = Object.values(plan.summary).reduce((s, n) => s + n, 0);
    expect(totalActions).toBe(plan.recommendations.length);
    expect(plan.totalTurnover).toBeGreaterThanOrEqual(0);
    // TRIM_LIGHT zit bovenaan; NO_ACTION onderaan
    expect(plan.recommendations[0]?.action).not.toBe("NO_ACTION");
  });
});

describe("buildRebalancePlan — policy override", () => {
  it("respect maxPositionWeight uit policy", () => {
    const big = holding({
      ticker: "BIG",
      quantity: 1,
      currentPrice: 800, // 8% van 10_000
      avgCostPrice: 500,
      factorScore: factorScore({ quality: 55, momentum: 45, composite: 55 }),
    });
    const filler = holding({
      id: "h2",
      ticker: "FILL",
      quantity: 92,
      currentPrice: 100,
      avgCostPrice: 100,
      factorScore: factorScore({ composite: 60 }),
    });
    const valuations = [v(big), v(filler)];
    const totalValue = valuations.reduce((s, x) => s + x.marketValueBase, 0);

    const plan = buildRebalancePlan({
      portfolioId: "p1",
      baseCurrency: "EUR",
      valuations,
      totalValue,
      policy: { maxPositionWeight: 0.05 }, // striktere cap
    });

    const rec = plan.recommendations.find((r) => r.ticker === "BIG")!;
    expect(["TRIM_LIGHT", "TRIM_HEAVY"]).toContain(rec.action);
    expect(rec.targetWeight).toBeLessThanOrEqual(0.08);
  });
});
