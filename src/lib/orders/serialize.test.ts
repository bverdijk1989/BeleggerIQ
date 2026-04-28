import { describe, expect, it } from "vitest";

import type { OrderRow } from "./build-orders";
import { ORDER_DISCLAIMER, buildOrderCsv, buildOrderTsv } from "./serialize";

const sample: OrderRow[] = [
  {
    ticker: "ASML.AS",
    isin: "NL0010273215",
    name: "ASML Holding",
    side: "BUY",
    amount: 1200,
    quantity: 2,
    latestQuote: 600,
    quoteCurrency: "EUR",
    orderType: "LIMIT",
    limitPrice: 603,
    note: null,
  },
  {
    ticker: "AAPL",
    isin: null,
    name: "Apple, Inc.", // bevat een komma → moet quoted worden in CSV
    side: "SELL",
    amount: 1500,
    quantity: 10,
    latestQuote: 150,
    quoteCurrency: "USD",
    orderType: "LIMIT",
    limitPrice: 149.25,
    note: null,
  },
];

describe("buildOrderCsv", () => {
  it("eerste regel is de disclaimer", () => {
    const csv = buildOrderCsv(sample);
    const firstLine = csv.split("\n")[0]!;
    expect(firstLine).toContain(ORDER_DISCLAIMER);
  });

  it("bevat header-rij in vaste volgorde", () => {
    const csv = buildOrderCsv(sample);
    const headerLine = csv.split("\n")[1]!;
    expect(headerLine).toBe(
      "Ticker,ISIN,Naam,Side,Bedrag,Aantal,Quote,Currency,Order type,Limit prijs,Toelichting",
    );
  });

  it("escaped namen met komma's", () => {
    const csv = buildOrderCsv(sample);
    expect(csv).toContain('"Apple, Inc."');
  });

  it("ontbrekende ISIN levert lege cell, niet 'null'", () => {
    const csv = buildOrderCsv(sample);
    const aaplLine = csv.split("\n").find((l) => l.startsWith("AAPL"))!;
    // "AAPL,,Apple…" — twee komma's op rij = empty ISIN cell
    expect(aaplLine.startsWith("AAPL,,")).toBe(true);
  });
});

describe("buildOrderTsv", () => {
  it("gebruikt tab-separator", () => {
    const tsv = buildOrderTsv(sample);
    const headerLine = tsv.split("\n")[1]!;
    expect(headerLine.split("\t")).toHaveLength(11);
  });

  it("disclaimer staat ook in TSV-output (copy-paste blijft duidelijk)", () => {
    const tsv = buildOrderTsv(sample);
    expect(tsv).toContain(ORDER_DISCLAIMER);
  });
});
