import { describe, expect, it } from "vitest";

import {
  detectCurrency,
  normalizeDutchNumber,
  parseDegiroCsv,
  parseOpenPositionRows,
  safeString,
  toHoldingDrafts,
} from "./degiro";

describe("safeString", () => {
  it("trimt strings en retourneert undefined voor lege waarden", () => {
    expect(safeString("  ASML  ")).toBe("ASML");
    expect(safeString("")).toBeUndefined();
    expect(safeString("   ")).toBeUndefined();
    expect(safeString(null)).toBeUndefined();
    expect(safeString(undefined)).toBeUndefined();
  });

  it("converteert niet-string input naar string", () => {
    expect(safeString(42)).toBe("42");
    expect(safeString(true)).toBe("true");
  });
});

describe("normalizeDutchNumber", () => {
  it("parst Nederlandse getalnotatie correct", () => {
    expect(normalizeDutchNumber("1.234,56")).toBe(1234.56);
    expect(normalizeDutchNumber("0,5")).toBe(0.5);
    expect(normalizeDutchNumber("1.000")).toBe(1000);
    expect(normalizeDutchNumber("123")).toBe(123);
  });

  it("parst Engelse notatie als fallback", () => {
    expect(normalizeDutchNumber("1,234.56")).toBe(1234.56);
    expect(normalizeDutchNumber("0.5")).toBe(0.5);
  });

  it("strip currency-prefix en -suffix", () => {
    expect(normalizeDutchNumber("EUR 1.234,56")).toBe(1234.56);
    expect(normalizeDutchNumber("USD 2,50")).toBe(2.5);
    expect(normalizeDutchNumber("1.234,56 EUR")).toBe(1234.56);
  });

  it("ondersteunt negatieve waarden en percentages", () => {
    expect(normalizeDutchNumber("-1.234,56")).toBe(-1234.56);
    expect(normalizeDutchNumber("(1.234,56)")).toBe(-1234.56);
    expect(normalizeDutchNumber("12,5%")).toBeCloseTo(0.125, 5);
  });

  it("retourneert null voor lege of ongeldige input", () => {
    expect(normalizeDutchNumber(null)).toBeNull();
    expect(normalizeDutchNumber(undefined)).toBeNull();
    expect(normalizeDutchNumber("")).toBeNull();
    expect(normalizeDutchNumber("abc")).toBeNull();
  });
});

describe("detectCurrency", () => {
  it("herkent supported ISO codes", () => {
    expect(detectCurrency("EUR 1.234,56")).toBe("EUR");
    expect(detectCurrency("USD 1,234.56")).toBe("USD");
    expect(detectCurrency("1.234,56 GBP")).toBe("GBP");
    expect(detectCurrency("CHF")).toBe("CHF");
  });

  it("retourneert null voor niet-supported of afwezige codes", () => {
    expect(detectCurrency("SEK 100")).toBeNull();
    expect(detectCurrency("100,00")).toBeNull();
    expect(detectCurrency(null)).toBeNull();
  });
});

describe("parseOpenPositionRows", () => {
  it("bouwt schone holdings uit gemapte rijen", () => {
    const result = parseOpenPositionRows([
      {
        product: "ASML HOLDING NV",
        tickerIsin: "ASML.AS",
        isin: "NL0010273215",
        quantity: "10",
        closingPrice: "720,50",
        localValue: "EUR 7.205,00",
        currency: "EUR",
      },
    ]);

    expect(result.holdings).toHaveLength(1);
    const h = result.holdings[0]!;
    expect(h.ticker).toBe("ASML.AS");
    expect(h.isin).toBe("NL0010273215");
    expect(h.quantity).toBe(10);
    expect(h.currentPrice).toBe(720.5);
    expect(h.avgCostPrice).toBe(720.5);
    expect(h.currency).toBe("EUR");
    expect(h.assetClass).toBe("EQUITY");
    expect(result.skipped).toEqual([]);
  });

  it("herkent ETF's op basis van naam", () => {
    const result = parseOpenPositionRows([
      {
        product: "VANGUARD FTSE ALL-WORLD UCITS ETF",
        tickerIsin: "VWCE",
        quantity: "5",
        closingPrice: "118,00",
      },
    ]);
    expect(result.holdings[0]?.assetClass).toBe("ETF");
  });

  it("aggregeert duplicaten op ISIN met gewogen gemiddelde kostprijs", () => {
    const result = parseOpenPositionRows([
      {
        product: "ASML HOLDING NV",
        tickerIsin: "ASML.AS",
        isin: "NL0010273215",
        quantity: "10",
        closingPrice: "600,00",
      },
      {
        product: "ASML HOLDING NV",
        tickerIsin: "ASML.AS",
        isin: "NL0010273215",
        quantity: "10",
        closingPrice: "800,00",
      },
    ]);

    expect(result.holdings).toHaveLength(1);
    const h = result.holdings[0]!;
    expect(h.quantity).toBe(20);
    // laatste rij overschrijft currentPrice, weighted average op avgCostPrice:
    // (600 * 10 + 800 * 10) / 20 = 700
    expect(h.avgCostPrice).toBe(700);
    expect(h.currentPrice).toBe(800);
  });

  it("slaat gesloten posities en short-posities over met reden", () => {
    const result = parseOpenPositionRows([
      { product: "Gesloten AEX", tickerIsin: "AEX", quantity: "0" },
      { product: "Short DAX", tickerIsin: "DAX", quantity: "-5" },
    ]);
    expect(result.holdings).toEqual([]);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped[0]?.reason).toMatch(/Gesloten/);
    expect(result.skipped[1]?.reason).toMatch(/Short/);
  });

  it("slaat rijen zonder productnaam of ticker over", () => {
    const result = parseOpenPositionRows([
      { product: "", tickerIsin: "ASML", quantity: "10" },
      { product: "MYSTERY CO", tickerIsin: "", isin: "", quantity: "10" },
    ]);
    // Tweede rij valt terug op product-naam als ticker-fallback → wordt geïmporteerd.
    expect(result.holdings).toHaveLength(1);
    expect(result.holdings[0]?.ticker).toBe("MYSTERY");
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toMatch(/productnaam/i);
  });
});

describe("parseDegiroCsv (end-to-end)", () => {
  it("parst een complete NL DEGIRO portefeuille-export", () => {
    const csv = [
      "Product;Symbool/ISIN;Beurs;Aantal;Slotkoers;Lokale waarde;Waarde in EUR",
      "\"ASML HOLDING NV\";\"ASML.AS\";EAM;10;\"720,50\";\"EUR 7.205,00\";\"EUR 7.205,00\"",
      "\"MICROSOFT CORP\";\"MSFT\";NDQ;5;\"410,00\";\"USD 2.050,00\";\"EUR 1.900,00\"",
      "\"VANGUARD ALL-WORLD UCITS ETF\";\"VWCE\";XET;15;\"118,00\";\"EUR 1.770,00\";\"EUR 1.770,00\"",
    ].join("\n");

    const result = parseDegiroCsv(csv);

    expect(result.headersDetected).toContain("Product");
    expect(result.holdings).toHaveLength(3);

    const asml = result.holdings.find((h) => h.ticker === "ASML.AS");
    expect(asml?.quantity).toBe(10);
    expect(asml?.currency).toBe("EUR");

    const msft = result.holdings.find((h) => h.ticker === "MSFT");
    expect(msft?.currency).toBe("USD");

    const vwce = result.holdings.find((h) => h.ticker === "VWCE");
    expect(vwce?.assetClass).toBe("ETF");
  });

  it("retourneert een warning bij ontbrekende verplichte kolommen", () => {
    const csv = "Foo;Bar;Baz\nx;y;z";
    const result = parseDegiroCsv(csv);
    expect(result.holdings).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/Verplichte kolom/);
  });

  it("herkent komma-gescheiden EN-export", () => {
    const csv = [
      "Product,Symbol/ISIN,Amount,Closing Price,Currency",
      "\"Microsoft Corp\",\"MSFT\",10,\"410.50\",USD",
    ].join("\n");
    const result = parseDegiroCsv(csv);
    expect(result.holdings).toHaveLength(1);
    expect(result.holdings[0]?.currency).toBe("USD");
    expect(result.holdings[0]?.currentPrice).toBe(410.5);
  });

  it("gaat veilig om met een lege input", () => {
    expect(parseDegiroCsv("").holdings).toEqual([]);
    expect(parseDegiroCsv("   ").holdings).toEqual([]);
  });
});

describe("toHoldingDrafts", () => {
  it("strip parser-specifieke velden voor persist-laag", () => {
    const drafts = toHoldingDrafts([
      {
        ticker: "ASML",
        isin: "NL0010273215",
        name: "ASML HOLDING NV",
        assetClass: "EQUITY",
        currency: "EUR",
        quantity: 10,
        avgCostPrice: 720.5,
        currentPrice: 720.5,
        sector: null,
        region: null,
        sourceRow: 2,
      },
    ]);
    expect(drafts[0]).not.toHaveProperty("sourceRow");
    expect(drafts[0]).toMatchObject({ ticker: "ASML", quantity: 10 });
  });
});
