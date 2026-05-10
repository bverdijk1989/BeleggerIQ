import { describe, expect, it, vi } from "vitest";

import { FallbackProviderChain } from "./fallback-chain";
import type { MarketDataProvider } from "./types";

function stubProvider(name: string, behavior: {
  getQuote?: (ticker: string) => Promise<unknown>;
  getQuotes?: (tickers: string[]) => Promise<unknown[]>;
  getRate?: () => Promise<unknown>;
  getHistory?: () => Promise<unknown[]>;
}): MarketDataProvider {
  return {
    name,
    getQuote: behavior.getQuote
      ? vi.fn(behavior.getQuote)
      : vi.fn(async () => null),
    getQuotes: behavior.getQuotes
      ? vi.fn(behavior.getQuotes)
      : vi.fn(async () => []),
    getRate: behavior.getRate ? vi.fn(behavior.getRate) : vi.fn(async () => null),
    getFundamentals: vi.fn(async () => null),
    getHistory: behavior.getHistory
      ? vi.fn(behavior.getHistory)
      : vi.fn(async () => []),
  } as unknown as MarketDataProvider;
}

describe("FallbackProviderChain", () => {
  it("primary success → secondary niet aangeroepen", async () => {
    const primary = stubProvider("primary", {
      getQuote: async () => ({
        ticker: "AAPL",
        price: 150,
        currency: "USD",
        asOf: "2026-04-29T00:00:00Z",
      }),
    });
    const secondary = stubProvider("secondary", {});
    const chain = new FallbackProviderChain([primary, secondary]);
    const result = await chain.getQuote("AAPL");
    expect(result?.price).toBe(150);
    expect(secondary.getQuote).not.toHaveBeenCalled();
  });

  it("primary returns null → secondary wordt geprobeerd", async () => {
    const primary = stubProvider("primary", {
      getQuote: async () => null,
    });
    const secondary = stubProvider("secondary", {
      getQuote: async () => ({
        ticker: "AAPL",
        price: 152,
        currency: "USD",
        asOf: "2026-04-29T00:00:00Z",
        source: "secondary",
      }),
    });
    const chain = new FallbackProviderChain([primary, secondary]);
    const result = await chain.getQuote("AAPL");
    expect(result?.price).toBe(152);
    expect(secondary.getQuote).toHaveBeenCalledTimes(1);
  });

  it("primary throws → secondary wordt geprobeerd, error wordt gelogd", async () => {
    const primary = stubProvider("primary", {
      getQuote: async () => {
        throw new Error("yahoo down");
      },
    });
    const secondary = stubProvider("secondary", {
      getQuote: async () => ({
        ticker: "AAPL",
        price: 153,
        currency: "USD",
        asOf: "2026-04-29T00:00:00Z",
      }),
    });
    const chain = new FallbackProviderChain([primary, secondary]);
    const result = await chain.getQuote("AAPL");
    expect(result?.price).toBe(153);
  });

  it("alle providers null → uiteindelijk null", async () => {
    const chain = new FallbackProviderChain([
      stubProvider("a", { getQuote: async () => null }),
      stubProvider("b", { getQuote: async () => null }),
    ]);
    expect(await chain.getQuote("X")).toBeNull();
  });

  it("getQuotes — primary lege array → secondary geprobeerd", async () => {
    const primary = stubProvider("primary", { getQuotes: async () => [] });
    const secondary = stubProvider("secondary", {
      getQuotes: async () => [
        {
          ticker: "X",
          price: 10,
          currency: "EUR",
          asOf: "2026-04-29T00:00:00Z",
        },
      ],
    });
    const chain = new FallbackProviderChain([primary, secondary]);
    const result = await chain.getQuotes(["X"]);
    expect(result).toHaveLength(1);
  });

  it("getRate — primary null → secondary", async () => {
    const primary = stubProvider("primary", { getRate: async () => null });
    const secondary = stubProvider("secondary", {
      getRate: async () => ({
        from: "EUR",
        to: "USD",
        rate: 1.08,
        asOf: "2026-04-29T00:00:00Z",
      }),
    });
    const chain = new FallbackProviderChain([primary, secondary]);
    const result = await chain.getRate("EUR", "USD");
    expect(result?.rate).toBe(1.08);
  });

  it("getHistory — primary lege array → secondary", async () => {
    const primary = stubProvider("primary", { getHistory: async () => [] });
    const secondary = stubProvider("secondary", {
      getHistory: async () => [
        { date: "2026-04-29T00:00:00Z", close: 100 },
      ],
    });
    const chain = new FallbackProviderChain([primary, secondary]);
    const result = await chain.getHistory({
      ticker: "X",
      startDate: "2026-04-01",
      endDate: "2026-04-30",
    });
    expect(result).toHaveLength(1);
  });

  it("constructor met lege provider-list throws", () => {
    expect(() => new FallbackProviderChain([])).toThrow();
  });

  it("name reflecteert chain-volgorde", () => {
    const chain = new FallbackProviderChain([
      stubProvider("yahoo", {}),
      stubProvider("alpha-vantage", {}),
    ]);
    expect(chain.name).toBe("chain(yahoo,alpha-vantage)");
  });
});
