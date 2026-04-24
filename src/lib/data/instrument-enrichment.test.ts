import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock de shared yahoo-client + resolver zodat deze tests geen echte
// Yahoo-calls doen.
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
  enrichInstrument,
  enrichInstruments,
} from "./instrument-enrichment";
import { marketDataCache } from "./cache";
import { resetSymbolResolverCache } from "./symbol-resolver";

const mocked = yahooClient as unknown as {
  search: ReturnType<typeof vi.fn>;
  quoteSummary: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  resetSymbolResolverCache();
  marketDataCache.clear();
  vi.clearAllMocks();
  process.env.MARKET_DATA_PROVIDER = "yahoo";
});

afterEach(() => {
  delete process.env.MARKET_DATA_PROVIDER;
});

describe("enrichInstrument", () => {
  it("combineert search + assetProfile tot volledig record (EQUITY)", async () => {
    mocked.search.mockResolvedValueOnce({
      quotes: [
        {
          symbol: "NVDA",
          exchange: "NMS",
          quoteType: "EQUITY",
          shortname: "NVIDIA Corporation",
        },
      ],
    });
    mocked.quoteSummary.mockResolvedValueOnce({
      price: {
        currency: "USD",
        exchange: "NMS",
        quoteType: "EQUITY",
        longName: "NVIDIA Corporation",
      },
      assetProfile: {
        sector: "Technology",
        industry: "Semiconductors",
        country: "United States",
      },
    });
    const e = await enrichInstrument({
      ticker: "NVIDIA",
      isin: "US67066G1040",
    });

    expect(e.ticker).toBe("NVIDIA");
    expect(e.normalizedTicker).toBe("NVDA");
    expect(e.assetClass).toBe("EQUITY");
    expect(e.sector).toBe("Technology");
    expect(e.industry).toBe("Semiconductors");
    expect(e.country).toBe("United States");
    expect(e.region).toBe("North America");
    expect(e.currency).toBe("USD");
    expect(e.exchange).toBe("NMS");
    expect(e.confidence).toBeGreaterThanOrEqual(0.75);
    expect(e.sources).toContain("yahoo-search");
    expect(e.sources).toContain("yahoo-profile");
    expect(e.warnings).toEqual([]);
  });

  it("classificeert ETFs correct via quoteType MUTUALFUND/ETF", async () => {
    mocked.search.mockResolvedValueOnce({
      quotes: [
        {
          symbol: "VUSA.AS",
          exchange: "AMS",
          quoteType: "ETF",
          shortname: "Vanguard S&P 500 UCITS ETF",
        },
      ],
    });
    mocked.quoteSummary.mockResolvedValueOnce({
      price: { currency: "EUR", exchange: "AMS", quoteType: "ETF" },
      fundProfile: { family: "Vanguard", categoryName: "Large Blend" },
    });
    const e = await enrichInstrument({
      ticker: "VANGUARD",
      isin: "IE00B3XXRP09",
    });

    expect(e.assetClass).toBe("ETF");
    expect(e.region).toBe("Europe");
    expect(e.sector).toBeNull(); // ETFs hebben geen company-sector
    // Warnings over ontbrekende sector mogen NIET verschijnen voor ETFs
    expect(e.warnings.some((w) => w.toLowerCase().includes("sector"))).toBe(
      false,
    );
  });

  it("retourneert fallback record wanneer Yahoo volledig leeg teruggeeft", async () => {
    mocked.search.mockResolvedValue({ quotes: [] });
    const e = await enrichInstrument({
      ticker: "MYSTERY",
      isin: null,
      name: "Mystery Co",
    });

    expect(e.normalizedTicker).toBe("MYSTERY");
    expect(e.sector).toBeNull();
    expect(e.region).toBe("Unknown");
    expect(e.confidence).toBeLessThan(0.5);
    expect(e.sources).toContain("input");
    expect(e.warnings.length).toBeGreaterThan(0);
  });

  it("valt terug op name-heuristiek voor assetClass bij ontbrekende quoteType", async () => {
    mocked.search.mockResolvedValueOnce({ quotes: [] });
    const e = await enrichInstrument({
      ticker: "XXX",
      name: "Vanguard S&P 500 UCITS ETF",
    });
    expect(e.assetClass).toBe("ETF");
  });

  it("normaliseert GBp (pence) naar GBP", async () => {
    mocked.search.mockResolvedValueOnce({
      quotes: [{ symbol: "SHEL.L", exchange: "LSE", quoteType: "EQUITY" }],
    });
    mocked.quoteSummary.mockResolvedValueOnce({
      price: { currency: "GBp", exchange: "LSE", quoteType: "EQUITY" },
      assetProfile: { sector: "Energy", country: "United Kingdom" },
    });
    const e = await enrichInstrument({ ticker: "SHELL" });
    expect(e.currency).toBe("GBP");
    expect(e.region).toBe("UK");
  });

  it("cached: tweede call met dezelfde key triggert geen nieuwe fetch", async () => {
    mocked.search.mockResolvedValueOnce({
      quotes: [{ symbol: "NVDA", quoteType: "EQUITY" }],
    });
    mocked.quoteSummary.mockResolvedValueOnce({});

    await enrichInstrument({ ticker: "NVIDIA", isin: "US67066G1040" });
    await enrichInstrument({ ticker: "NVIDIA", isin: "US67066G1040" });

    expect(mocked.search).toHaveBeenCalledTimes(1);
    expect(mocked.quoteSummary).toHaveBeenCalledTimes(1);
  });

  it("crasht niet wanneer Yahoo profile-call throwt — valt terug op search-data", async () => {
    mocked.search.mockResolvedValueOnce({
      quotes: [
        { symbol: "NVDA", exchange: "NMS", quoteType: "EQUITY", shortname: "NVIDIA Corp" },
      ],
    });
    mocked.quoteSummary.mockRejectedValueOnce(new Error("429 rate limited"));

    const e = await enrichInstrument({ ticker: "NVIDIA" });
    expect(e.normalizedTicker).toBe("NVDA");
    expect(e.assetClass).toBe("EQUITY");
    expect(e.region).toBe("North America"); // afgeleid uit exchange
    expect(e.warnings.some((w) => /assetProfile/i.test(w))).toBe(true);
  });
});

describe("enrichInstruments (bulk)", () => {
  it("verrijkt meerdere holdings parallel en retourneert ticker→record map", async () => {
    mocked.search.mockImplementation(async (q: string) => {
      if (q === "IE00B3XXRP09")
        return {
          quotes: [{ symbol: "VUSA.AS", exchange: "AMS", quoteType: "ETF" }],
        };
      if (q === "US67066G1040")
        return {
          quotes: [{ symbol: "NVDA", exchange: "NMS", quoteType: "EQUITY" }],
        };
      return { quotes: [] };
    });
    mocked.quoteSummary.mockResolvedValue({
      price: { currency: "USD", quoteType: "EQUITY" },
      assetProfile: { sector: "Technology", country: "United States" },
    });

    const map = await enrichInstruments([
      { ticker: "VANGUARD", isin: "IE00B3XXRP09" },
      { ticker: "NVIDIA", isin: "US67066G1040" },
    ]);

    expect(map.size).toBe(2);
    expect(map.get("VANGUARD")?.assetClass).toBe("ETF");
    expect(map.get("NVIDIA")?.assetClass).toBe("EQUITY");
  });
});
