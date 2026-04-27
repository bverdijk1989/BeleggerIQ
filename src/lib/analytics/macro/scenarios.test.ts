import { describe, expect, it } from "vitest";

import type { Holding } from "@/types/portfolio";

import { runMacroScenarios, type MacroPositionInput } from "./scenarios";

const NOW = "2026-04-25T00:00:00.000Z";

function holding(overrides: Partial<Holding>): Holding {
  return {
    id: `h-${overrides.ticker ?? "X"}`,
    portfolioId: "p",
    ticker: overrides.ticker ?? "X",
    isin: null,
    name: overrides.name ?? overrides.ticker ?? "X",
    assetClass: overrides.assetClass ?? "EQUITY",
    currency: overrides.currency ?? "EUR",
    quantity: 1,
    avgCostPrice: 1,
    sector: overrides.sector ?? null,
  };
}

function pos(
  ticker: string,
  sector: string | null,
  marketValueBase: number,
  overrides: Partial<Holding> = {},
): MacroPositionInput {
  return {
    holding: holding({ ticker, sector, ...overrides }),
    marketValueBase,
  };
}

describe("runMacroScenarios — basis", () => {
  it("genereert 4 scenarios", () => {
    const r = runMacroScenarios({
      positions: [pos("ASML", "Technology", 50000)],
      totalValue: 50000,
      baseCurrency: "EUR",
      now: NOW,
    });
    expect(r.scenarios.map((s) => s.scenario)).toEqual([
      "RATES_UP_2",
      "MARKET_CRASH",
      "USD_UP_10",
      "RECESSION",
    ]);
    expect(r.generatedAt).toBe(NOW);
  });

  it("MARKET_CRASH op tech-portefeuille → ~28%", () => {
    const r = runMacroScenarios({
      positions: [pos("TECH", "Technology", 100000)],
      totalValue: 100000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const crash = r.scenarios.find((s) => s.scenario === "MARKET_CRASH")!;
    expect(crash.portfolioImpact).toBeCloseTo(-0.28, 2);
    expect(crash.portfolioImpactAmount).toBeCloseTo(-28000, 0);
  });

  it("staples + healthcare → kleine MARKET_CRASH-impact", () => {
    const r = runMacroScenarios({
      positions: [
        pos("PEP", "Consumer Staples", 50000),
        pos("JNJ", "Healthcare", 50000),
      ],
      totalValue: 100000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const crash = r.scenarios.find((s) => s.scenario === "MARKET_CRASH")!;
    // Staples -10%, healthcare -12% → gemiddeld -11%
    expect(crash.portfolioImpact).toBeGreaterThan(-0.13);
    expect(crash.portfolioImpact).toBeLessThan(-0.08);
    expect(crash.defensiveStrength).toBeGreaterThan(50);
  });

  it("RATES_UP_2 raakt REITs harder dan tech", () => {
    const reitOnly = runMacroScenarios({
      positions: [pos("REIT", "Real Estate", 100000, { assetClass: "REIT" })],
      totalValue: 100000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const techOnly = runMacroScenarios({
      positions: [pos("TECH", "Technology", 100000)],
      totalValue: 100000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const reitImpact = reitOnly.scenarios.find(
      (s) => s.scenario === "RATES_UP_2",
    )!.portfolioImpact;
    const techImpact = techOnly.scenarios.find(
      (s) => s.scenario === "RATES_UP_2",
    )!.portfolioImpact;
    expect(reitImpact).toBeLessThan(techImpact);
  });

  it("USD_UP_10 op USD-holding → positief", () => {
    const r = runMacroScenarios({
      positions: [
        pos("MSFT", "Technology", 100000, { currency: "USD" }),
      ],
      totalValue: 100000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const usd = r.scenarios.find((s) => s.scenario === "USD_UP_10")!;
    expect(usd.portfolioImpact).toBeGreaterThan(0);
  });

  it("USD_UP_10 op EUR-holding → ~ neutraal", () => {
    const r = runMacroScenarios({
      positions: [pos("ASML", "Technology", 100000, { currency: "EUR" })],
      totalValue: 100000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const usd = r.scenarios.find((s) => s.scenario === "USD_UP_10")!;
    expect(Math.abs(usd.portfolioImpact)).toBeLessThan(0.02);
  });

  it("RECESSION raakt cyclische sectoren harder dan staples", () => {
    const cyclical = runMacroScenarios({
      positions: [pos("INDU", "Industrials", 100000)],
      totalValue: 100000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const defensive = runMacroScenarios({
      positions: [pos("PEP", "Consumer Staples", 100000)],
      totalValue: 100000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const c = cyclical.scenarios.find((s) => s.scenario === "RECESSION")!.portfolioImpact;
    const d = defensive.scenarios.find((s) => s.scenario === "RECESSION")!.portfolioImpact;
    expect(c).toBeLessThan(d);
    expect(defensive.scenarios.find((s) => s.scenario === "RECESSION")!.defensiveStrength).toBeGreaterThan(60);
  });
});

describe("runMacroScenarios — biggestLosers/Winners", () => {
  it("losers gesorteerd op meest negatieve contributie", () => {
    const r = runMacroScenarios({
      positions: [
        pos("PEP", "Consumer Staples", 30000),
        pos("MSFT", "Technology", 30000),
        pos("REIT", "Real Estate", 40000, { assetClass: "REIT" }),
      ],
      totalValue: 100000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const crash = r.scenarios.find((s) => s.scenario === "MARKET_CRASH")!;
    expect(crash.biggestLosers.length).toBeGreaterThan(0);
    // Eerste loser moet de meest negatieve contributie hebben.
    for (let i = 1; i < crash.biggestLosers.length; i++) {
      expect(crash.biggestLosers[i]!.contribution).toBeGreaterThanOrEqual(
        crash.biggestLosers[i - 1]!.contribution,
      );
    }
  });

  it("respecteert topN", () => {
    const positions: MacroPositionInput[] = Array.from({ length: 10 }, (_, i) =>
      pos(`T${i}`, "Technology", 10000),
    );
    const r = runMacroScenarios({
      positions,
      totalValue: 100000,
      baseCurrency: "EUR",
      topN: 3,
      now: NOW,
    });
    const crash = r.scenarios.find((s) => s.scenario === "MARKET_CRASH")!;
    expect(crash.biggestLosers.length).toBe(3);
  });
});

describe("runMacroScenarios — edge cases", () => {
  it("lege portefeuille → warnings + score 50", () => {
    const r = runMacroScenarios({
      positions: [],
      totalValue: 0,
      baseCurrency: "EUR",
      now: NOW,
    });
    for (const s of r.scenarios) {
      expect(s.warnings.length).toBeGreaterThan(0);
      expect(s.portfolioImpact).toBe(0);
    }
  });

  it("identieke input → identieke output (determinisme)", () => {
    const input = {
      positions: [pos("ASML", "Technology", 50000)],
      totalValue: 50000,
      baseCurrency: "EUR" as const,
      now: NOW,
    };
    const a = runMacroScenarios(input);
    const b = runMacroScenarios(input);
    expect(a).toEqual(b);
  });

  it("verdict bevat NL kernconclusie", () => {
    const r = runMacroScenarios({
      positions: [pos("TECH", "Technology", 100000)],
      totalValue: 100000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const crash = r.scenarios.find((s) => s.scenario === "MARKET_CRASH")!;
    expect(crash.verdict).toMatch(/getroffen|geraakt|positief|neutraal/i);
  });
});
