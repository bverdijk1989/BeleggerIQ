import { describe, expect, it } from "vitest";

import { buildOrderList } from "./build-orders";

interface Rec {
  ticker: string;
  name?: string | null;
  action: string;
  suggestedAmount: number;
  suggestedQuantity?: number | null;
}

const isins = new Map<string, string | null>([
  ["ASML.AS", "NL0010273215"],
  ["AAPL", "US0378331005"],
]);

const quotes = new Map<string, { price: number; currency: string }>([
  ["ASML.AS", { price: 600, currency: "EUR" }],
  ["AAPL", { price: 150, currency: "USD" }],
  ["VWCE", { price: 100, currency: "EUR" }],
]);

describe("buildOrderList — filter", () => {
  it("HOLD wordt overgeslagen — geen order voor 'no action'", () => {
    const rows = buildOrderList({
      recommendations: [
        { ticker: "AAPL", action: "hold", suggestedAmount: 0 },
      ],
      isinByTicker: isins,
      quoteByTicker: quotes,
    });
    expect(rows).toEqual([]);
  });

  it("WATCH-only recommendations zijn niet aanwezig in de input → niets te doen", () => {
    // De engine zet WATCH-tickers niet in `recommendations`, dus de
    // builder krijgt 'em niet. Een lege input → lege output.
    const rows = buildOrderList({ recommendations: [] });
    expect(rows).toEqual([]);
  });

  it("onbekende action wordt geskipt (defensief)", () => {
    const rows = buildOrderList({
      recommendations: [
        { ticker: "AAPL", action: "investigate", suggestedAmount: 100 },
      ],
      quoteByTicker: quotes,
    });
    expect(rows).toEqual([]);
  });
});

describe("buildOrderList — quantity rounding", () => {
  it("gebruikt suggestedQuantity wanneer aanwezig (al gerond door engine)", () => {
    const rows = buildOrderList({
      recommendations: [
        {
          ticker: "AAPL",
          action: "buy",
          suggestedAmount: 750,
          suggestedQuantity: 5,
        },
      ],
      quoteByTicker: quotes,
    });
    expect(rows[0]?.quantity).toBe(5);
  });

  it("zonder suggestedQuantity → Math.floor(amount/price)", () => {
    const rows = buildOrderList({
      recommendations: [
        // 600 EUR / 600 per stuk = exact 1
        { ticker: "ASML.AS", action: "buy", suggestedAmount: 600 },
        // 1500 USD / 150 per stuk = exact 10
        { ticker: "AAPL", action: "buy", suggestedAmount: 1500 },
      ],
      quoteByTicker: quotes,
    });
    expect(rows[0]?.quantity).toBe(1);
    expect(rows[1]?.quantity).toBe(10);
  });

  it("nooit afronden naar boven (anders gaan we boven budget)", () => {
    const rows = buildOrderList({
      recommendations: [
        // 700 EUR / 600 per stuk = 1.166… → 1
        { ticker: "ASML.AS", action: "buy", suggestedAmount: 700 },
      ],
      quoteByTicker: quotes,
    });
    expect(rows[0]?.quantity).toBe(1);
  });

  it("amount te klein voor 1 stuk → rij wordt weggelaten", () => {
    // 100 EUR / 600 per stuk = 0.166 → 0 → skip.
    const rows = buildOrderList({
      recommendations: [
        { ticker: "ASML.AS", action: "buy", suggestedAmount: 100 },
      ],
      quoteByTicker: quotes,
    });
    expect(rows).toEqual([]);
  });

  it("non-finite suggestedQuantity wordt genegeerd, fallback op price-divisie", () => {
    const rows = buildOrderList({
      recommendations: [
        {
          ticker: "ASML.AS",
          action: "buy",
          suggestedAmount: 1200,
          suggestedQuantity: Number.NaN,
        },
      ],
      quoteByTicker: quotes,
    });
    expect(rows[0]?.quantity).toBe(2);
  });
});

describe("buildOrderList — ISIN fallback", () => {
  it("ISIN wordt opgehaald uit lookup", () => {
    const rows = buildOrderList({
      recommendations: [
        { ticker: "ASML.AS", action: "buy", suggestedAmount: 600 },
      ],
      isinByTicker: isins,
      quoteByTicker: quotes,
    });
    expect(rows[0]?.isin).toBe("NL0010273215");
  });

  it("ontbrekend in lookup → isin=null (rest van de rij intact)", () => {
    const rows = buildOrderList({
      recommendations: [
        { ticker: "VWCE", action: "buy", suggestedAmount: 200 },
      ],
      isinByTicker: isins,
      quoteByTicker: quotes,
    });
    expect(rows[0]?.isin).toBeNull();
    expect(rows[0]?.ticker).toBe("VWCE");
    expect(rows[0]?.quantity).toBe(2);
  });

  it("geen lookup meegegeven → alle rijen krijgen isin=null", () => {
    const rows = buildOrderList({
      recommendations: [
        { ticker: "ASML.AS", action: "buy", suggestedAmount: 1200 },
      ],
      quoteByTicker: quotes,
    });
    expect(rows[0]?.isin).toBeNull();
  });
});

describe("buildOrderList — order-type & limit", () => {
  it("BUY met quote → LIMIT @ quote × 1.005", () => {
    const rows = buildOrderList({
      recommendations: [
        { ticker: "ASML.AS", action: "buy", suggestedAmount: 600 },
      ],
      quoteByTicker: quotes,
    });
    expect(rows[0]?.orderType).toBe("LIMIT");
    expect(rows[0]?.limitPrice).toBeCloseTo(603, 1);
  });

  it("SELL met quote → LIMIT @ quote × 0.995", () => {
    const rows = buildOrderList({
      recommendations: [
        {
          ticker: "ASML.AS",
          action: "sell",
          suggestedAmount: 600,
          suggestedQuantity: 1,
        },
      ],
      quoteByTicker: quotes,
    });
    expect(rows[0]?.side).toBe("SELL");
    expect(rows[0]?.orderType).toBe("LIMIT");
    expect(rows[0]?.limitPrice).toBeCloseTo(597, 1);
  });

  it("trim alias → SELL", () => {
    const rows = buildOrderList({
      recommendations: [
        {
          ticker: "AAPL",
          action: "trim",
          suggestedAmount: 1500,
          suggestedQuantity: 10,
        },
      ],
      quoteByTicker: quotes,
    });
    expect(rows[0]?.side).toBe("SELL");
  });

  it("zonder quote → MARKET met expliciete waarschuwing", () => {
    const rows = buildOrderList({
      recommendations: [
        {
          ticker: "UNKNOWN",
          action: "buy",
          suggestedAmount: 500,
          suggestedQuantity: 5,
        },
      ],
    });
    expect(rows[0]?.orderType).toBe("MARKET");
    expect(rows[0]?.limitPrice).toBeNull();
    expect(rows[0]?.note).toMatch(/MARKET/);
  });
});
