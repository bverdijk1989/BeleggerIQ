import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./symbol-overrides", () => ({
  BY_ISIN: {
    "IE00B3XXRP09": "VUSA.AS",
  },
  BY_TICKER: {
    "NVIDIA": "NVDA",
  },
  lookupOverride: vi.fn().mockImplementation((ticker: string, isin?: string | null) => {
    if (isin && isin.toUpperCase() === "IE00B3XXRP09") return "VUSA.AS";
    if (ticker.toUpperCase() === "NVIDIA") return "NVDA";
    return null;
  }),
}));

vi.mock("./providers/yahoo-client", () => ({
  yahooClient: {
    search: vi.fn(),
    quote: vi.fn(),
    quoteSummary: vi.fn(),
    chart: vi.fn(),
    suppressNotices: vi.fn(),
  },
}));

import { yahooClient } from "./providers/yahoo-client";

import {
  resetSymbolResolverCache,
  resolveYahooMatch,
} from "./symbol-resolver";

const mockedSearch = (yahooClient as unknown as { search: ReturnType<typeof vi.fn> })
  .search;

afterEach(() => {
  resetSymbolResolverCache();
  vi.clearAllMocks();
  delete process.env.MARKET_DATA_PROVIDER;
});

describe("resolveYahooMatch met manuele overrides", () => {
  it("ISIN-override heeft voorrang op Yahoo search", async () => {
    process.env.MARKET_DATA_PROVIDER = "yahoo";
    const m = await resolveYahooMatch("VANGUARD", "IE00B3XXRP09");
    expect(m.matched).toBe(true);
    expect(m.symbol).toBe("VUSA.AS");
    // Yahoo mag niet gebeld worden — override kortsluit.
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it("Ticker-override werkt zonder ISIN", async () => {
    process.env.MARKET_DATA_PROVIDER = "yahoo";
    const m = await resolveYahooMatch("NVIDIA");
    expect(m.symbol).toBe("NVDA");
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it("Geen override: Yahoo search wordt wel aangeroepen", async () => {
    process.env.MARKET_DATA_PROVIDER = "yahoo";
    mockedSearch.mockResolvedValueOnce({
      quotes: [{ symbol: "MSFT", exchange: "NMS", quoteType: "EQUITY" }],
    });
    const m = await resolveYahooMatch("MSFT");
    expect(m.symbol).toBe("MSFT");
    expect(mockedSearch).toHaveBeenCalledWith("MSFT");
  });

  it("Override wordt gecached — tweede call geen nieuwe logica", async () => {
    process.env.MARKET_DATA_PROVIDER = "yahoo";
    await resolveYahooMatch("VANGUARD", "IE00B3XXRP09");
    await resolveYahooMatch("VANGUARD", "IE00B3XXRP09");
    // Search nooit aangeroepen (geen Yahoo-calls).
    expect(mockedSearch).not.toHaveBeenCalled();
  });
});
