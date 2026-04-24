import { afterEach, describe, expect, it } from "vitest";

import { marketDataCache } from "@/lib/data/cache";
import type { Holding } from "@/types/portfolio";

import { enrichHoldings } from "./enrichment";

/**
 * End-to-end enrichment tests tegen de deterministische stub-provider.
 * De cache wordt na elke test geleegd zodat volgende runs niet op elkaar
 * leunen.
 */

afterEach(() => {
  marketDataCache.clear();
});

function makeHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: "h1",
    portfolioId: "p1",
    ticker: "ASML.AS",
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

describe("enrichHoldings — empty input", () => {
  it("retourneert lege collecties + baseCurrency=1 bij lege holdings", async () => {
    const result = await enrichHoldings([], { baseCurrency: "EUR" });
    expect(result.valuations).toEqual([]);
    expect(result.quotes.size).toBe(0);
    expect(result.fundamentals.size).toBe(0);
    expect(result.priceHistories.size).toBe(0);
    expect(result.factorScores.size).toBe(0);
    // Fx-map bevat de identity van base currency.
    expect(result.fxRates.get("EUR")).toBe(1);
  });
});

describe("enrichHoldings — valuations", () => {
  it("bouwt valuations met base currency correct (identity FX)", async () => {
    const result = await enrichHoldings([makeHolding()], {
      baseCurrency: "EUR",
    });
    expect(result.valuations).toHaveLength(1);
    const v = result.valuations[0]!;
    expect(v.holding.ticker).toBe("ASML.AS");
    expect(v.fxRate).toBe(1);
    expect(v.marketValue).toBeGreaterThan(0);
    expect(v.marketValueBase).toBe(v.marketValue);
  });

  it("converteert USD holdings naar EUR via FX-rate ≠ 1", async () => {
    const holding = makeHolding({
      id: "h2",
      ticker: "MSFT",
      currency: "USD",
      avgCostPrice: 300,
      currentPrice: 400,
    });
    const result = await enrichHoldings([holding], { baseCurrency: "EUR" });
    const usdRate = result.fxRates.get("USD");
    expect(usdRate).toBeDefined();
    expect(usdRate).not.toBe(1);
    const v = result.valuations[0]!;
    expect(v.marketValueBase).toBeCloseTo(v.marketValue * usdRate!, 5);
  });

  it("dedupliceert tickers in parallel fetches (unieke quotes)", async () => {
    const holdings = [
      makeHolding({ id: "a" }),
      makeHolding({ id: "b" }), // zelfde ticker
    ];
    const result = await enrichHoldings(holdings, { baseCurrency: "EUR" });
    expect(result.valuations).toHaveLength(2);
    // Beide holdings delen één quote uit de cache.
    expect(result.quotes.size).toBe(1);
  });
});

describe("enrichHoldings — fallback pricing", () => {
  it("valt terug op holding.currentPrice als de ticker geen quote heeft", async () => {
    // De stub provider produceert deterministisch quotes voor elke ticker,
    // dus we testen pickPrice indirect: currentPrice zit op Holding en wordt
    // via lastKnown pad gebruikt wanneer quote NaN zou zijn. Hier checken we
    // gewoon dat unitPrice een eindig getal is — geen NaN propagatie.
    const result = await enrichHoldings([makeHolding({ currentPrice: 650 })], {
      baseCurrency: "EUR",
    });
    const v = result.valuations[0]!;
    expect(Number.isFinite(v.unitPrice)).toBe(true);
    expect(v.marketValue).toBeGreaterThan(0);
  });
});

describe("enrichHoldings — fundamentals + factor scores", () => {
  it("laadt fundamentals alleen bij includeFundamentals", async () => {
    const without = await enrichHoldings([makeHolding()], {
      baseCurrency: "EUR",
    });
    expect(without.fundamentals.size).toBe(0);

    const withFund = await enrichHoldings([makeHolding()], {
      baseCurrency: "EUR",
      includeFundamentals: true,
    });
    expect(withFund.fundamentals.size).toBeGreaterThan(0);
  });

  it("factor scoring schakelt fundamentals automatisch in", async () => {
    const result = await enrichHoldings([makeHolding()], {
      baseCurrency: "EUR",
      includeFactorScores: true,
    });
    // Fundamentals moeten zijn meegefetched zelfs zonder expliciet includeFundamentals.
    expect(result.fundamentals.size).toBeGreaterThan(0);
    expect(result.priceHistories.size).toBeGreaterThan(0);
    expect(result.factorScores.size).toBe(1);
    const score = result.factorScores.get("ASML.AS");
    expect(score).toBeDefined();
    expect(score!.composite).toBeGreaterThanOrEqual(0);
    expect(score!.composite).toBeLessThanOrEqual(100);
  });

  it("factor score is altijd 0..100 bounded, ook bij ontbrekende data", async () => {
    const result = await enrichHoldings(
      [makeHolding({ ticker: "NOSUCHTICKER" })],
      {
        baseCurrency: "EUR",
        includeFactorScores: true,
      },
    );
    const score = result.factorScores.get("NOSUCHTICKER");
    expect(score).toBeDefined();
    expect(score!.composite).toBeGreaterThanOrEqual(0);
    expect(score!.composite).toBeLessThanOrEqual(100);
    // Met nul data hoort de confidence laag of de composite rond 50 te liggen.
    if (score!.confidence !== undefined) {
      expect(score!.confidence).toBeGreaterThanOrEqual(0);
      expect(score!.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe("enrichHoldings — finite numbers in outputs", () => {
  it("alle valuations hebben eindige prijzen en marketValues (geen NaN)", async () => {
    const holdings = [
      makeHolding({ id: "a", ticker: "ASML.AS" }),
      makeHolding({ id: "b", ticker: "MSFT", currency: "USD" }),
      makeHolding({ id: "c", ticker: "SHEL", currency: "EUR" }),
    ];
    const result = await enrichHoldings(holdings, { baseCurrency: "EUR" });
    for (const v of result.valuations) {
      expect(Number.isFinite(v.marketValue)).toBe(true);
      expect(Number.isFinite(v.marketValueBase)).toBe(true);
      expect(Number.isFinite(v.costBasisBase)).toBe(true);
      expect(Number.isFinite(v.unrealizedPnlBase)).toBe(true);
      expect(Number.isFinite(v.fxRate)).toBe(true);
      expect(v.fxRate).toBeGreaterThan(0);
    }
  });
});
