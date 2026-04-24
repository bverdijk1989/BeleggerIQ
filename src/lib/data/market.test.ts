import { afterEach, describe, expect, it } from "vitest";

import { marketDataCache } from "./cache";
import { convertAmount, getFxRate } from "./fx";
import { getHistory } from "./history";
import { getQuote, getQuotes } from "./quotes";

// Market-data services draaien hier tegen de stub provider (default).
// De stub is deterministisch dus we kunnen assertions op shape doen zonder
// te hoeven vertrouwen op specifieke waarden.

afterEach(() => {
  marketDataCache.clear();
});

describe("quotes service", () => {
  it("normaliseert tickers naar uppercase en vult de canonieke shape", async () => {
    const quote = await getQuote("asml.as");
    expect(quote).not.toBeNull();
    expect(quote!.ticker).toBe("ASML.AS");
    expect(typeof quote!.price).toBe("number");
    expect(quote!.source).toBe("stub");
  });

  it("getQuotes dedupliceert en filtert lege invoer", async () => {
    const quotes = await getQuotes(["msft", " MSFT", "", "  "]);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]?.ticker).toBe("MSFT");
  });

  it("retourneert null voor lege ticker input", async () => {
    expect(await getQuote("")).toBeNull();
    expect(await getQuote("   ")).toBeNull();
  });
});

describe("fx service", () => {
  it("identity FX retourneert rate 1", async () => {
    const rate = await getFxRate("EUR", "EUR");
    expect(rate?.rate).toBe(1);
  });

  it("cross-currency retourneert een bruikbare numerieke rate", async () => {
    const rate = await getFxRate("EUR", "USD");
    expect(rate).not.toBeNull();
    expect(rate!.rate).toBeGreaterThan(0);
    expect(rate!.from).toBe("EUR");
    expect(rate!.to).toBe("USD");
  });

  it("convertAmount valt graceful terug op het originele bedrag bij identity", async () => {
    expect(await convertAmount(100, "EUR", "EUR")).toBe(100);
  });

  it("convertAmount schaalt correct tussen currencies", async () => {
    const rate = await getFxRate("EUR", "USD");
    const converted = await convertAmount(100, "EUR", "USD");
    expect(converted).toBeCloseTo(100 * (rate?.rate ?? 1), 6);
  });
});

describe("history service", () => {
  it("filtert invalide datum input en retourneert een lege array", async () => {
    const result = await getHistory({
      ticker: "ASML",
      startDate: "not-a-date",
      endDate: "2026-01-01",
    });
    expect(result).toEqual([]);
  });

  it("retourneert [] als endDate vóór startDate ligt", async () => {
    const result = await getHistory({
      ticker: "ASML",
      startDate: "2025-06-01",
      endDate: "2025-01-01",
    });
    expect(result).toEqual([]);
  });

  it("retourneert [] bij lege ticker", async () => {
    const result = await getHistory({
      ticker: "   ",
      startDate: "2025-01-01",
      endDate: "2025-01-15",
    });
    expect(result).toEqual([]);
  });

  it("normaliseert onbekende interval naar 1d zonder crash", async () => {
    const result = await getHistory({
      ticker: "MSFT",
      startDate: "2025-01-01",
      endDate: "2025-01-05",
      // @ts-expect-error — ruwe input uit API parameter
      interval: "5d",
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("levert een oplopend gesorteerde reeks met eindige closes", async () => {
    const result = await getHistory({
      ticker: "MSFT",
      startDate: "2025-01-01",
      endDate: "2025-01-15",
      interval: "1d",
    });
    expect(result.length).toBeGreaterThan(0);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.date >= result[i - 1]!.date).toBe(true);
      expect(Number.isFinite(result[i]!.close)).toBe(true);
    }
  });
});
