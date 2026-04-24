import { afterEach, describe, expect, it, vi } from "vitest";

// Mock de shared client zodat de adapter-tests onafhankelijk zijn van de
// echte yahoo-finance2 library. We typen de vier methodes die de adapter
// aanraakt.
vi.mock("./yahoo-client", () => ({
  yahooClient: {
    quote: vi.fn(),
    quoteSummary: vi.fn(),
    chart: vi.fn(),
    search: vi.fn(),
    suppressNotices: vi.fn(),
  },
}));

import { yahooClient } from "./yahoo-client";

import { YahooMarketDataProvider } from "./yahoo";

const mocked = yahooClient as unknown as {
  quote: ReturnType<typeof vi.fn>;
  quoteSummary: ReturnType<typeof vi.fn>;
  chart: ReturnType<typeof vi.fn>;
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("YahooMarketDataProvider.getQuote", () => {
  const provider = new YahooMarketDataProvider();

  it("mapt Yahoo response naar Quote shape", async () => {
    mocked.quote.mockResolvedValueOnce({
      symbol: "ASML.AS",
      regularMarketPrice: 650.5,
      regularMarketChange: -12.5,
      regularMarketChangePercent: -1.88,
      currency: "EUR",
      regularMarketDayHigh: 660,
      regularMarketDayLow: 645,
      regularMarketVolume: 1_234_000,
      regularMarketTime: new Date("2026-04-24T15:00:00Z"),
    });
    const q = await provider.getQuote("ASML.AS");
    expect(q).not.toBeNull();
    expect(q!.ticker).toBe("ASML.AS");
    expect(q!.price).toBe(650.5);
    expect(q!.currency).toBe("EUR");
    expect(q!.changePct).toBeCloseTo(-0.0188, 4);
    expect(q!.source).toBe("yahoo");
  });

  it("converteert GBp (pence) naar GBP (pounds)", async () => {
    mocked.quote.mockResolvedValueOnce({
      symbol: "SHEL.L",
      regularMarketPrice: 2800,
      currency: "GBp",
    });
    const q = await provider.getQuote("SHEL.L");
    expect(q).not.toBeNull();
    expect(q!.price).toBe(28);
    expect(q!.currency).toBe("GBP");
  });

  it("retourneert null wanneer regularMarketPrice ontbreekt", async () => {
    mocked.quote.mockResolvedValueOnce({ symbol: "XXX" });
    expect(await provider.getQuote("XXX")).toBeNull();
  });

  it("retourneert null bij thrown error (netwerkfout)", async () => {
    mocked.quote.mockRejectedValueOnce(new Error("network blip"));
    expect(await provider.getQuote("AAPL")).toBeNull();
  });
});

describe("YahooMarketDataProvider.getRate", () => {
  const provider = new YahooMarketDataProvider();

  it("identity-rate voor same-currency", async () => {
    const r = await provider.getRate("EUR", "EUR");
    expect(r?.rate).toBe(1);
    expect(r?.source).toBe("yahoo:identity");
    expect(mocked.quote).not.toHaveBeenCalled();
  });

  it("bouwt Yahoo FX-pair symbol en mapt rate", async () => {
    mocked.quote.mockResolvedValueOnce({
      symbol: "EURUSD=X",
      regularMarketPrice: 1.085,
      regularMarketTime: new Date("2026-04-24T15:00:00Z"),
    });
    const r = await provider.getRate("EUR", "USD");
    expect(r?.rate).toBe(1.085);
    expect(mocked.quote).toHaveBeenCalledWith("EURUSD=X");
  });

  it("retourneert null bij onverwachte shape", async () => {
    mocked.quote.mockResolvedValueOnce({ symbol: "EURUSD=X" });
    expect(await provider.getRate("EUR", "USD")).toBeNull();
  });
});

describe("YahooMarketDataProvider.getQuotes", () => {
  const provider = new YahooMarketDataProvider();

  it("filtert entries zonder prijs", async () => {
    mocked.quote.mockResolvedValueOnce([
      { symbol: "AAPL", regularMarketPrice: 170.25, currency: "USD" },
      { symbol: "BROKEN" },
      { symbol: "MSFT", regularMarketPrice: 420.1, currency: "USD" },
    ]);
    const quotes = await provider.getQuotes(["AAPL", "BROKEN", "MSFT"]);
    expect(quotes.map((q) => q.ticker)).toEqual(["AAPL", "MSFT"]);
  });

  it("retourneert [] voor lege ticker-lijst", async () => {
    expect(await provider.getQuotes([])).toEqual([]);
    expect(mocked.quote).not.toHaveBeenCalled();
  });

  it("retourneert [] bij error", async () => {
    mocked.quote.mockRejectedValueOnce(new Error("boom"));
    expect(await provider.getQuotes(["AAPL"])).toEqual([]);
  });
});

describe("YahooMarketDataProvider.getFundamentals", () => {
  const provider = new YahooMarketDataProvider();

  it("mapt quoteSummary naar FundamentalsSnapshot", async () => {
    mocked.quoteSummary.mockResolvedValueOnce({
      price: { currency: "USD", marketCap: 3_000_000_000_000 },
      summaryDetail: {
        trailingPE: 28.5,
        forwardPE: 25.1,
        dividendYield: 0.005,
      },
      defaultKeyStatistics: { priceToBook: 45, enterpriseToEbitda: 22 },
      financialData: {
        returnOnEquity: 1.5,
        grossMargins: 0.45,
        debtToEquity: 120,
      },
    });
    const f = await provider.getFundamentals("AAPL");
    expect(f).not.toBeNull();
    expect(f!.currency).toBe("USD");
    expect(f!.marketCap).toBe(3_000_000_000_000);
    expect(f!.pe).toBe(28.5);
    expect(f!.pb).toBe(45);
    expect(f!.grossMargin).toBe(0.45);
    expect(f!.debtToEquity).toBeCloseTo(1.2, 5);
    expect(f!.source).toBe("yahoo");
  });

  it("retourneert null bij error", async () => {
    mocked.quoteSummary.mockRejectedValueOnce(new Error("404"));
    expect(await provider.getFundamentals("XXX")).toBeNull();
  });
});

describe("YahooMarketDataProvider.getHistory", () => {
  const provider = new YahooMarketDataProvider();

  it("mapt chart-quotes naar HistoricalPoint[]", async () => {
    mocked.chart.mockResolvedValueOnce({
      quotes: [
        {
          date: new Date("2025-06-01"),
          open: 100,
          high: 105,
          low: 99,
          close: 104,
          adjclose: 104,
          volume: 1_000_000,
        },
        { date: new Date("2025-06-02"), close: 106 },
        { date: new Date("2025-06-03"), close: NaN },
      ],
    });
    const points = await provider.getHistory({
      ticker: "AAPL",
      startDate: "2025-06-01",
      endDate: "2025-06-03",
      interval: "1d",
    });
    expect(points).toHaveLength(2);
    expect(points[0]!.date).toBe("2025-06-01");
    expect(points[0]!.close).toBe(104);
    expect(points[1]!.date).toBe("2025-06-02");
  });

  it("retourneert [] bij error", async () => {
    mocked.chart.mockRejectedValueOnce(new Error("invalid range"));
    const points = await provider.getHistory({
      ticker: "AAPL",
      startDate: "2025-01-01",
      endDate: "2024-01-01",
    });
    expect(points).toEqual([]);
  });
});
