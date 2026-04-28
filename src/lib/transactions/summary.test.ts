import { describe, expect, it } from "vitest";

import { computeYearlySummary, type SummaryInput } from "./summary";

type Tx = SummaryInput["transactions"][number];

const D = (iso: string) => new Date(iso);

function tx(p: Partial<Tx> & { id: string; type: Tx["type"]; executedAt: Date }): Tx {
  return {
    id: p.id,
    type: p.type,
    executedAt: p.executedAt,
    quantity: p.quantity ?? null,
    price: p.price ?? null,
    fee: p.fee ?? null,
    signedAmount: p.signedAmount ?? null,
    currency: p.currency ?? "EUR",
    ticker: p.ticker ?? null,
    isin: p.isin ?? null,
  };
}

describe("computeYearlySummary", () => {
  it("aggregeert dividenden + taxes per jaar en currency", () => {
    const r = computeYearlySummary({
      transactions: [
        tx({ id: "d1", type: "DIVIDEND", currency: "USD", signedAmount: 12.34, executedAt: D("2026-02-01") }),
        tx({ id: "t1", type: "TAX", currency: "USD", signedAmount: -1.85, executedAt: D("2026-02-01") }),
        tx({ id: "f1", type: "FEE", currency: "EUR", signedAmount: -2, executedAt: D("2026-02-01") }),
        tx({ id: "d2", type: "DIVIDEND", currency: "EUR", signedAmount: 50, executedAt: D("2025-09-01") }),
      ],
    });
    const usd2026 = r.buckets.find((b) => b.year === 2026 && b.currency === "USD");
    const eur2026 = r.buckets.find((b) => b.year === 2026 && b.currency === "EUR");
    const eur2025 = r.buckets.find((b) => b.year === 2025 && b.currency === "EUR");
    expect(usd2026?.dividends).toBe(12.34);
    expect(usd2026?.taxes).toBe(1.85);
    expect(eur2026?.fees).toBe(2);
    expect(eur2025?.dividends).toBe(50);
  });

  it("realized PnL wordt geboekt op het jaar van de SELL", () => {
    const r = computeYearlySummary({
      transactions: [
        tx({ id: "b1", type: "BUY", quantity: 10, price: 100, ticker: "AAPL", currency: "USD", executedAt: D("2025-06-01") }),
        tx({ id: "s1", type: "SELL", quantity: 10, price: 150, ticker: "AAPL", currency: "USD", executedAt: D("2026-03-01") }),
      ],
    });
    expect(r.buckets.find((b) => b.year === 2026 && b.currency === "USD")?.realizedPnl).toBe(500);
    expect(r.buckets.find((b) => b.year === 2025 && b.currency === "USD")?.realizedPnl).toBe(0);
  });

  it("buckets zijn gesorteerd op year desc + currency asc", () => {
    const r = computeYearlySummary({
      transactions: [
        tx({ id: "a", type: "DIVIDEND", currency: "USD", signedAmount: 1, executedAt: D("2024-01-01") }),
        tx({ id: "b", type: "DIVIDEND", currency: "EUR", signedAmount: 1, executedAt: D("2026-01-01") }),
        tx({ id: "c", type: "DIVIDEND", currency: "USD", signedAmount: 1, executedAt: D("2026-01-01") }),
      ],
    });
    expect(r.buckets.map((b) => `${b.year}|${b.currency}`)).toEqual([
      "2026|EUR",
      "2026|USD",
      "2024|USD",
    ]);
  });

  it("trade-counter telt alleen BUY/SELL, events tellen alle types", () => {
    const r = computeYearlySummary({
      transactions: [
        tx({ id: "b", type: "BUY", quantity: 1, price: 1, ticker: "X", executedAt: D("2026-01-01") }),
        tx({ id: "d", type: "DIVIDEND", signedAmount: 1, executedAt: D("2026-01-15") }),
        tx({ id: "f", type: "FEE", signedAmount: -1, executedAt: D("2026-02-01") }),
      ],
    });
    const eur = r.buckets.find((b) => b.year === 2026 && b.currency === "EUR");
    expect(eur?.events).toBe(3);
    expect(eur?.trades).toBe(1);
  });
});
