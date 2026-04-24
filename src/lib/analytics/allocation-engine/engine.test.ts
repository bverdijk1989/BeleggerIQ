import { describe, expect, it } from "vitest";

import { valueHolding } from "../valuation";
import { generateAllocationPlan } from "./engine";
import { simulatePostBuyPortfolio } from "./simulate";
import type { FactorScore } from "@/types/factor";
import type { Holding } from "@/types/portfolio";
import type { MarketRegimeScore } from "@/types/regime";

function factorScore(
  overrides: Partial<FactorScore["subScores"]> & {
    composite?: number;
    confidence?: number;
    rationalesValue?: string[];
  } = {},
): FactorScore {
  return {
    ticker: "X",
    asOf: "2026-04-01T00:00:00.000Z",
    subScores: {
      quality: overrides.quality ?? 65,
      value: overrides.value ?? 55,
      momentum: overrides.momentum ?? 55,
      lowVol: overrides.lowVol ?? 55,
    },
    composite: overrides.composite ?? 58,
    confidence: overrides.confidence ?? 0.7,
    rationales: {
      quality: ["q"],
      value: overrides.rationalesValue ?? ["v"],
      momentum: ["m"],
      lowVol: ["l"],
    },
  };
}

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: overrides.id ?? "h",
    portfolioId: "p1",
    ticker: overrides.ticker ?? "ASML",
    name: overrides.name ?? "ASML",
    assetClass: overrides.assetClass ?? "EQUITY",
    currency: overrides.currency ?? "EUR",
    quantity: overrides.quantity ?? 10,
    avgCostPrice: overrides.avgCostPrice ?? 100,
    currentPrice: overrides.currentPrice ?? 100,
    sector: overrides.sector ?? "Technology",
    region: overrides.region ?? "Europe",
    factorScore: overrides.factorScore,
    volatility: overrides.volatility,
  };
}

function vals(holdings: Holding[]) {
  return holdings.map((h) =>
    valueHolding(h, { baseCurrency: "EUR", fxRate: 1 }),
  );
}

function totalOf(holdings: Holding[], cash: number) {
  return (
    holdings.reduce(
      (sum, h) => sum + h.quantity * (h.currentPrice ?? h.avgCostPrice),
      0,
    ) + cash
  );
}

const DEFENSIVE: MarketRegimeScore = {
  asOf: "2026-04-01T00:00:00.000Z",
  score: 25,
  stance: "DEFENSIVE",
  confidence: 0.7,
  narrative: "",
  subDrivers: [],
};

describe("generateAllocationPlan — happy path", () => {
  it("produceert 3-5 recommendations binnen cap en met correcte totals", () => {
    // 10 holdings x 500 = 5000 holdings-waarde; cash 5000; totaal 10.000.
    // Elk weegt 5% → headroom 5% × 10.000 = €500 per positie (ruim boven min-order).
    const holdings = Array.from({ length: 10 }).map((_, i) =>
      holding({
        id: `h${i}`,
        ticker: `T${i}`,
        name: `Naam ${i}`,
        quantity: 1,
        avgCostPrice: 500,
        currentPrice: 500,
        sector: ["Technology", "Healthcare", "Financials", "Consumer Staples", "Energy"][i % 5]!,
        factorScore: factorScore({
          composite: 55 + (i % 3) * 5,
          quality: 60,
          momentum: 55,
        }),
      }),
    );
    const cash = 5000;
    const total = totalOf(holdings, cash);

    const plan = generateAllocationPlan({
      portfolioId: "p1",
      baseCurrency: "EUR",
      valuations: vals(holdings),
      totalValue: total,
      cashBalance: cash,
      monthlyContribution: 500,
    });

    expect(plan.recommendations.length).toBeGreaterThanOrEqual(3);
    expect(plan.recommendations.length).toBeLessThanOrEqual(5);
    for (const rec of plan.recommendations) {
      expect(rec.action).toBe("add");
      expect(rec.suggestedAmount).toBeGreaterThanOrEqual(100);
      expect(rec.targetWeight).toBeLessThanOrEqual(0.1 + 0.0001);
    }
    expect(plan.deployedAmount ?? 0).toBeGreaterThan(0);
    expect(plan.deployedAmount ?? 0).toBeLessThanOrEqual(plan.budget ?? 0);
    expect(plan.simulation).toBeDefined();
  });
});

describe("generateAllocationPlan — hold cash warning", () => {
  it("onder minOrderAmount levert geen recommendations + warning", () => {
    // Holding op cap → geen headroom; core-ETF ook niet (coreEtf null).
    const holdings = [
      holding({
        id: "h1",
        ticker: "A",
        quantity: 1,
        currentPrice: 100,
        avgCostPrice: 100,
        factorScore: factorScore({ composite: 70 }),
      }),
    ];
    const cash = 0;
    const plan = generateAllocationPlan({
      portfolioId: "p1",
      baseCurrency: "EUR",
      valuations: vals(holdings),
      totalValue: totalOf(holdings, cash),
      cashBalance: cash,
      monthlyContribution: 50,
      coreEtf: null,
    });
    expect(plan.recommendations).toEqual([]);
    expect((plan.warnings ?? []).join(" ").toLowerCase()).toMatch(
      /minimum|geen holdings|geblokkeerd/,
    );
  });

  it("DEFENSIVE regime knipt budget in en voegt warning toe", () => {
    const holdings = Array.from({ length: 10 }).map((_, i) =>
      holding({
        id: `h${i}`,
        ticker: `T${i}`,
        quantity: 1,
        currentPrice: 500,
        avgCostPrice: 500,
        sector: "Technology",
        factorScore: factorScore({ composite: 60 }),
      }),
    );
    const cash = 5000;
    const total = totalOf(holdings, cash);
    const base = {
      portfolioId: "p1" as const,
      baseCurrency: "EUR" as const,
      valuations: vals(holdings),
      totalValue: total,
      cashBalance: cash,
      monthlyContribution: 1000,
    };

    const neutral = generateAllocationPlan(base);
    const defensive = generateAllocationPlan({ ...base, regime: DEFENSIVE });

    expect((defensive.warnings ?? []).join(" ").toLowerCase()).toContain(
      "defensief",
    );
    expect(defensive.budget ?? 0).toBeLessThan(neutral.budget ?? 0);
  });
});

describe("generateAllocationPlan — policy + objective", () => {
  it("past maxPositionWeight uit policy toe", () => {
    const holdings = Array.from({ length: 8 }).map((_, i) =>
      holding({
        id: `h${i}`,
        ticker: `T${i}`,
        quantity: 1,
        currentPrice: 500,
        avgCostPrice: 500,
        sector: ["Technology", "Healthcare", "Financials", "Energy"][i % 4]!,
        factorScore: factorScore({ composite: 65 }),
      }),
    );
    const cash = 6000;
    const total = totalOf(holdings, cash);
    const plan = generateAllocationPlan({
      portfolioId: "p1",
      baseCurrency: "EUR",
      valuations: vals(holdings),
      totalValue: total,
      cashBalance: cash,
      monthlyContribution: 800,
      policy: { maxPositionWeight: 0.2 },
    });
    for (const rec of plan.recommendations) {
      expect(rec.targetWeight).toBeLessThanOrEqual(0.2 + 0.0001);
    }
    expect(plan.recommendations.length).toBeGreaterThan(0);
  });

  it("INCOME objective vereist dividend-signaal", () => {
    const holdings = [
      holding({
        id: "no-div",
        ticker: "NO",
        currentPrice: 100,
        avgCostPrice: 100,
        quantity: 10,
        factorScore: factorScore({ composite: 80 }),
      }),
      holding({
        id: "with-div",
        ticker: "DIV",
        currentPrice: 100,
        avgCostPrice: 100,
        quantity: 10,
        factorScore: factorScore({
          composite: 70,
          rationalesValue: ["Aantrekkelijk dividend"],
        }),
      }),
    ];
    const cash = 18_000;
    const total = totalOf(holdings, cash);
    const plan = generateAllocationPlan({
      portfolioId: "p1",
      baseCurrency: "EUR",
      valuations: vals(holdings),
      totalValue: total,
      cashBalance: cash,
      monthlyContribution: 500,
      objective: "INCOME",
      coreEtf: null,
    });
    const tickers = plan.recommendations.map((r) => r.ticker);
    expect(tickers).toContain("DIV");
    expect(tickers).not.toContain("NO");
  });
});

describe("simulatePostBuyPortfolio", () => {
  it("telt nieuwe posities mee en update totals + cash", () => {
    const holdings = [
      holding({
        id: "h1",
        ticker: "A",
        quantity: 5,
        currentPrice: 100,
        avgCostPrice: 100,
        sector: "Technology",
      }),
    ];
    const valuations = vals(holdings);
    const projection = simulatePostBuyPortfolio({
      valuations,
      totalValue: 500 + 1000,
      baseCurrency: "EUR",
      cashBalance: 1000,
      recommendations: [
        {
          ticker: "A",
          name: "A",
          action: "add",
          currentWeight: 500 / 1500,
          targetWeight: 700 / 1500,
          deltaWeight: 200 / 1500,
          suggestedAmount: 200,
          convictionScore: 0.7,
          rationale: [],
        },
        {
          ticker: "IWDA",
          name: "IWDA",
          action: "buy",
          currentWeight: 0,
          targetWeight: 300 / 1500,
          deltaWeight: 300 / 1500,
          suggestedAmount: 300,
          convictionScore: 0.65,
          rationale: [],
        },
      ],
      newPositionHints: new Map([
        ["IWDA", { sector: "Diversified", currency: "EUR" }],
      ]),
    });

    // Cash = 1000 - (200+300) = 500.
    expect(projection.projectedCashBalance).toBe(500);
    // Totale waarde: (500+200) + 300 + 500 cash = 1500.
    expect(projection.projectedTotalValue).toBe(1500);
    expect(projection.projectedPositionCount).toBe(2);
  });
});
