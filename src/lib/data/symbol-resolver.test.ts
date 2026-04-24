import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("yahoo-finance2", () => ({
  default: {
    search: vi.fn(),
  },
}));

import yahooFinance from "yahoo-finance2";

import {
  resetSymbolResolverCache,
  resolveYahooSymbol,
  resolveYahooSymbols,
} from "./symbol-resolver";

const mockedSearch = (
  yahooFinance as unknown as { search: ReturnType<typeof vi.fn> }
).search;

beforeEach(() => {
  resetSymbolResolverCache();
  vi.clearAllMocks();
  process.env.MARKET_DATA_PROVIDER = "yahoo";
});

afterEach(() => {
  delete process.env.MARKET_DATA_PROVIDER;
});

describe("resolveYahooSymbol", () => {
  it("geeft originele ticker terug wanneer provider niet yahoo is", async () => {
    process.env.MARKET_DATA_PROVIDER = "stub";
    const r = await resolveYahooSymbol("VANGUARD", "IE00B3XXRP09");
    expect(r).toBe("VANGUARD");
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it("zoekt bij voorkeur op ISIN en cached het resultaat", async () => {
    mockedSearch.mockResolvedValueOnce({
      quotes: [{ symbol: "VUSA.AS", exchange: "AMS" }],
    });
    const a = await resolveYahooSymbol("VANGUARD", "IE00B3XXRP09");
    const b = await resolveYahooSymbol("VANGUARD", "IE00B3XXRP09");
    expect(a).toBe("VUSA.AS");
    expect(b).toBe("VUSA.AS");
    expect(mockedSearch).toHaveBeenCalledTimes(1);
    expect(mockedSearch).toHaveBeenCalledWith("IE00B3XXRP09");
  });

  it("valt terug op ticker search wanneer ISIN niks oplevert", async () => {
    mockedSearch
      .mockResolvedValueOnce({ quotes: [] })
      .mockResolvedValueOnce({ quotes: [{ symbol: "NVDA" }] });
    const r = await resolveYahooSymbol("NVIDIA", "US67066G1040");
    expect(r).toBe("NVDA");
    expect(mockedSearch).toHaveBeenCalledTimes(2);
  });

  it("ticker-only (geen ISIN) gebruikt ticker als search query", async () => {
    mockedSearch.mockResolvedValueOnce({ quotes: [{ symbol: "MSFT" }] });
    const r = await resolveYahooSymbol("MSFT");
    expect(r).toBe("MSFT");
    expect(mockedSearch).toHaveBeenCalledWith("MSFT");
  });

  it("retourneert originele ticker wanneer search leeg is (negative cache)", async () => {
    mockedSearch.mockResolvedValue({ quotes: [] });
    const r = await resolveYahooSymbol("MYSTERY");
    expect(r).toBe("MYSTERY");
    // Tweede call mag NIET opnieuw zoeken (cache)
    await resolveYahooSymbol("MYSTERY");
    expect(mockedSearch).toHaveBeenCalledTimes(1);
  });

  it("retourneert originele ticker bij throw (netwerkfout)", async () => {
    mockedSearch.mockRejectedValue(new Error("network down"));
    const r = await resolveYahooSymbol("AAPL");
    expect(r).toBe("AAPL");
  });

  it("ISIN cache key is case-insensitive", async () => {
    mockedSearch.mockResolvedValueOnce({ quotes: [{ symbol: "VUSA.AS" }] });
    await resolveYahooSymbol("VANGUARD", "ie00b3xxrp09");
    const a = await resolveYahooSymbol("VANGUARD", "IE00B3XXRP09");
    expect(a).toBe("VUSA.AS");
    expect(mockedSearch).toHaveBeenCalledTimes(1);
  });
});

describe("resolveYahooSymbols (bulk)", () => {
  it("resolvet meerdere holdings parallel en retourneert een ticker→symbol map", async () => {
    mockedSearch.mockImplementation(async (query: string) => {
      if (query === "IE00B3XXRP09") return { quotes: [{ symbol: "VUSA.AS" }] };
      if (query === "US67066G1040") return { quotes: [{ symbol: "NVDA" }] };
      return { quotes: [] };
    });
    const map = await resolveYahooSymbols([
      { ticker: "VANGUARD", isin: "IE00B3XXRP09" },
      { ticker: "NVIDIA", isin: "US67066G1040" },
      { ticker: "XXX", isin: null },
    ]);
    expect(map.get("VANGUARD")).toBe("VUSA.AS");
    expect(map.get("NVIDIA")).toBe("NVDA");
    expect(map.get("XXX")).toBe("XXX");
  });

  it("skipt volledig wanneer provider niet yahoo is", async () => {
    process.env.MARKET_DATA_PROVIDER = "none";
    const map = await resolveYahooSymbols([
      { ticker: "AAPL", isin: "US0378331005" },
    ]);
    expect(map.get("AAPL")).toBe("AAPL");
    expect(mockedSearch).not.toHaveBeenCalled();
  });
});
