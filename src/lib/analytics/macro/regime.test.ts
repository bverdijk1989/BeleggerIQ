import { describe, expect, it } from "vitest";

import type { Holding } from "@/types/portfolio";

import {
  assetClassShockMultiplier,
  classifySector,
  isDefensiveSector,
  isForeignCurrency,
} from "./regime";

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: "h",
    portfolioId: "p",
    ticker: "X",
    isin: null,
    name: "X",
    assetClass: overrides.assetClass ?? "EQUITY",
    currency: overrides.currency ?? "EUR",
    quantity: 1,
    avgCostPrice: 1,
    sector: overrides.sector ?? null,
  };
}

describe("classifySector", () => {
  it("herkent tech-sectoren", () => {
    expect(classifySector("Technology")).toBe("tech");
    expect(classifySector("Software")).toBe("tech");
    expect(classifySector("Semiconductors")).toBe("tech");
  });

  it("staples → consumer-staples", () => {
    expect(classifySector("Consumer Staples")).toBe("consumer-staples");
    expect(classifySector("Food & Beverage")).toBe("consumer-staples");
  });

  it("REIT/Real Estate", () => {
    expect(classifySector("Real Estate")).toBe("real-estate");
    expect(classifySector("REIT - Diversified")).toBe("real-estate");
  });

  it("onbekend → 'unknown'", () => {
    expect(classifySector(null)).toBe("unknown");
    expect(classifySector("xxx")).toBe("unknown");
  });
});

describe("isDefensiveSector", () => {
  it("staples + healthcare + utilities zijn defensief", () => {
    expect(isDefensiveSector("consumer-staples")).toBe(true);
    expect(isDefensiveSector("healthcare")).toBe(true);
    expect(isDefensiveSector("utilities")).toBe(true);
  });

  it("tech is niet defensief", () => {
    expect(isDefensiveSector("tech")).toBe(false);
  });
});

describe("assetClassShockMultiplier", () => {
  it("BOND krijgt hoge rates-multiplier", () => {
    expect(assetClassShockMultiplier("BOND").rates).toBeGreaterThan(1);
  });

  it("CASH = 0 voor alle scenario's", () => {
    const m = assetClassShockMultiplier("CASH");
    expect(m.rates).toBe(0);
    expect(m.crash).toBe(0);
    expect(m.recession).toBe(0);
  });

  it("CRYPTO is meest crash-gevoelig", () => {
    expect(assetClassShockMultiplier("CRYPTO").crash).toBeGreaterThan(1.5);
  });
});

describe("isForeignCurrency", () => {
  it("USD-holding met EUR-base = foreign", () => {
    expect(isForeignCurrency(holding({ currency: "USD" }), "EUR")).toBe(true);
  });

  it("EUR-holding met EUR-base = niet-foreign", () => {
    expect(isForeignCurrency(holding({ currency: "EUR" }), "EUR")).toBe(false);
  });

  it("case-insensitive", () => {
    expect(isForeignCurrency(holding({ currency: "USD" }), "usd")).toBe(false);
  });
});
