import { describe, expect, it } from "vitest";

import { NoneMarketDataProvider } from "./none";

describe("NoneMarketDataProvider", () => {
  const provider = new NoneMarketDataProvider();

  it("getQuote retourneert altijd null", async () => {
    expect(await provider.getQuote("ASML.AS")).toBeNull();
  });

  it("getQuotes retourneert lege array", async () => {
    expect(await provider.getQuotes(["AAPL", "MSFT"])).toEqual([]);
  });

  it("getFundamentals retourneert null", async () => {
    expect(await provider.getFundamentals("AAPL")).toBeNull();
  });

  it("getHistory retourneert lege array", async () => {
    const res = await provider.getHistory({
      ticker: "AAPL",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    });
    expect(res).toEqual([]);
  });

  describe("getRate", () => {
    it("identity: zelfde currency geeft rate 1", async () => {
      const r = await provider.getRate("EUR", "EUR");
      expect(r?.rate).toBe(1);
      expect(r?.source).toBe("none:identity");
    });

    it("USD→EUR is <1 (dollar is zwakker dan euro)", async () => {
      const r = await provider.getRate("USD", "EUR");
      expect(r?.rate).toBeGreaterThan(0);
      expect(r?.rate).toBeLessThan(1);
      expect(r?.source).toBe("none:hardcoded");
    });

    it("EUR→USD is >1 (euro is sterker dan dollar)", async () => {
      const r = await provider.getRate("EUR", "USD");
      expect(r?.rate).toBeGreaterThan(1);
    });

    it("GBP→EUR ligt rond 1.17", async () => {
      const r = await provider.getRate("GBP", "EUR");
      expect(r?.rate).toBeGreaterThan(1.1);
      expect(r?.rate).toBeLessThan(1.3);
    });

    it("round-trip: X→Y→X geeft ~originele bedrag", async () => {
      const usdToEur = await provider.getRate("USD", "EUR");
      const eurToUsd = await provider.getRate("EUR", "USD");
      expect(usdToEur!.rate * eurToUsd!.rate).toBeCloseTo(1, 5);
    });
  });
});
