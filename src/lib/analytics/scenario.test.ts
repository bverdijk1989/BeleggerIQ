import { describe, expect, it } from "vitest";

import {
  applyFxShock,
  applyMarketShock,
  applySectorShock,
  runDefaultScenarios,
} from "./scenario";
import { valueHolding } from "./valuation";
import type { Holding } from "@/types/portfolio";

function holding(
  overrides: Partial<Holding> & { marketValueBase?: number } = {},
): Holding {
  return {
    id: overrides.id ?? "h1",
    portfolioId: "p1",
    ticker: overrides.ticker ?? "T",
    name: overrides.name ?? "T",
    assetClass: "EQUITY",
    currency: overrides.currency ?? "EUR",
    quantity: overrides.quantity ?? 1,
    avgCostPrice: overrides.avgCostPrice ?? 100,
    currentPrice: overrides.currentPrice ?? 100,
    sector: overrides.sector ?? "Technology",
    region: overrides.region ?? "Europe",
  };
}

function valuations(
  configs: Array<{ currency: "EUR" | "USD"; amountBase: number; sector?: string }>,
) {
  return configs.map((c, i) =>
    valueHolding(
      holding({
        id: `h${i}`,
        ticker: `T${i}`,
        currency: c.currency,
        quantity: 1,
        currentPrice: c.amountBase,
        avgCostPrice: c.amountBase,
        sector: c.sector,
      }),
      { baseCurrency: "EUR", fxRate: c.currency === "EUR" ? 1 : 1 },
    ),
  );
}

describe("applyFxShock", () => {
  it("laat base-currency posities onveranderd", () => {
    const vs = valuations([
      { currency: "EUR", amountBase: 500 },
      { currency: "EUR", amountBase: 500 },
    ]);
    const result = applyFxShock(
      { valuations: vs, totalValue: 1000, baseCurrency: "EUR" },
      0.1,
    );
    expect(result).toBe(1000);
  });

  it("deelt buitenlandse posities door (1 + shift) bij base-versterking", () => {
    const vs = valuations([
      { currency: "EUR", amountBase: 500 },
      { currency: "USD", amountBase: 500 },
    ]);
    const result = applyFxShock(
      { valuations: vs, totalValue: 1000, baseCurrency: "EUR" },
      0.1,
    );
    expect(result).toBeCloseTo(500 + 500 / 1.1, 5);
  });

  it("vermenigvuldigt vreemde posities bij base-verzwakking", () => {
    const vs = valuations([{ currency: "USD", amountBase: 1000 }]);
    const result = applyFxShock(
      { valuations: vs, totalValue: 1000, baseCurrency: "EUR" },
      -0.1,
    );
    expect(result).toBeCloseTo(1000 / 0.9, 5);
  });
});

describe("applyMarketShock", () => {
  it("schaalt alle posities; cash blijft flat", () => {
    const vs = valuations([{ currency: "EUR", amountBase: 1000 }]);
    const result = applyMarketShock(
      { valuations: vs, totalValue: 1200, baseCurrency: "EUR", cashBalance: 200 },
      -0.2,
    );
    expect(result).toBeCloseTo(1000 * 0.8 + 200, 5);
  });
});

describe("applySectorShock", () => {
  it("raakt alleen posities in de opgegeven sector", () => {
    const vs = valuations([
      { currency: "EUR", amountBase: 600, sector: "Technology" },
      { currency: "EUR", amountBase: 400, sector: "Healthcare" },
    ]);
    const result = applySectorShock(
      { valuations: vs, totalValue: 1000, baseCurrency: "EUR" },
      "Technology",
      -0.3,
    );
    expect(result).toBeCloseTo(600 * 0.7 + 400, 5);
  });
});

describe("runDefaultScenarios", () => {
  it("produceert vier tot vijf scenario's met correcte delta's", () => {
    const vs = valuations([
      { currency: "EUR", amountBase: 600, sector: "Technology" },
      { currency: "USD", amountBase: 400, sector: "Technology" },
    ]);
    const results = runDefaultScenarios({
      valuations: vs,
      totalValue: 1000,
      baseCurrency: "EUR",
    });
    expect(results.length).toBeGreaterThanOrEqual(4);

    const market = results.find((r) => r.id === "market.down.20");
    expect(market?.deltaPct).toBeCloseTo(-0.2, 5);

    const fxUp = results.find((r) => r.id === "fx.base.strengthens");
    expect(fxUp?.deltaPct).toBeLessThan(0); // base sterker → waarde lager
  });
});
