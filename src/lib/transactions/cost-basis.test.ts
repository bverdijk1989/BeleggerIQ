import { describe, expect, it } from "vitest";

import { computeCostBasis } from "./cost-basis";
import type { ParsedTransaction } from "./types";

type TxIn = Pick<
  ParsedTransaction,
  "type" | "quantity" | "price" | "fee" | "executedAt"
> & { id: string };

function tx(p: Partial<TxIn> & { type: TxIn["type"]; id: string; executedAt: Date }): TxIn {
  return {
    type: p.type,
    id: p.id,
    executedAt: p.executedAt,
    quantity: p.quantity ?? null,
    price: p.price ?? null,
    fee: p.fee ?? null,
  };
}

const D = (iso: string) => new Date(iso);

describe("computeCostBasis — FIFO basics", () => {
  it("BUY 10 @ 100 + SELL 4 @ 110 → realized PnL = 40", () => {
    const r = computeCostBasis({
      ticker: "AAPL",
      currency: "USD",
      transactions: [
        tx({ id: "b1", type: "BUY", quantity: 10, price: 100, executedAt: D("2026-01-01") }),
        tx({ id: "s1", type: "SELL", quantity: 4, price: 110, executedAt: D("2026-02-01") }),
      ],
    });
    expect(r.realized).toHaveLength(1);
    const trade = r.realized[0]!;
    expect(trade.quantity).toBe(4);
    expect(trade.costBasis).toBe(400);
    expect(trade.proceeds).toBe(440);
    expect(trade.realizedPnl).toBe(40);
    expect(r.openLots).toHaveLength(1);
    expect(r.openLots[0]!.quantity).toBe(6);
  });

  it("twee BUYs + één SELL pakt eerst de oudste (FIFO)", () => {
    const r = computeCostBasis({
      ticker: "AAPL",
      currency: "USD",
      transactions: [
        tx({ id: "b1", type: "BUY", quantity: 10, price: 100, executedAt: D("2026-01-01") }),
        tx({ id: "b2", type: "BUY", quantity: 10, price: 200, executedAt: D("2026-01-15") }),
        tx({ id: "s1", type: "SELL", quantity: 5, price: 250, executedAt: D("2026-02-01") }),
      ],
    });
    expect(r.realized[0]!.costBasis).toBe(500); // 5 × $100 (oudste lot)
    expect(r.realized[0]!.realizedPnl).toBe(750); // 5×250 - 5×100
    expect(r.openLots).toHaveLength(2);
  });

  it("SELL die meerdere lots overspant", () => {
    const r = computeCostBasis({
      ticker: "AAPL",
      currency: "USD",
      transactions: [
        tx({ id: "b1", type: "BUY", quantity: 10, price: 100, executedAt: D("2026-01-01") }),
        tx({ id: "b2", type: "BUY", quantity: 10, price: 200, executedAt: D("2026-01-15") }),
        tx({ id: "s1", type: "SELL", quantity: 15, price: 250, executedAt: D("2026-02-01") }),
      ],
    });
    // costBasis = 10×100 + 5×200 = 2000
    // proceeds = 15×250 = 3750 → PnL = 1750
    expect(r.realized[0]!.costBasis).toBe(2000);
    expect(r.realized[0]!.realizedPnl).toBe(1750);
    expect(r.openLots).toHaveLength(1);
    expect(r.openLots[0]!.quantity).toBe(5); // alleen 5 over uit b2
  });
});

describe("computeCostBasis — fees", () => {
  it("BUY-fee zit in cost-basis: 5 @ 600 + €2 fee → unitCost = 600.4", () => {
    const r = computeCostBasis({
      ticker: "ASML",
      currency: "EUR",
      transactions: [
        tx({ id: "b1", type: "BUY", quantity: 5, price: 600, fee: 2, executedAt: D("2026-01-01") }),
      ],
    });
    expect(r.openLots[0]!.unitCost).toBeCloseTo(600.4, 6);
  });

  it("SELL-fee verlaagt PnL", () => {
    const r = computeCostBasis({
      ticker: "AAPL",
      currency: "USD",
      transactions: [
        tx({ id: "b1", type: "BUY", quantity: 10, price: 100, executedAt: D("2026-01-01") }),
        tx({ id: "s1", type: "SELL", quantity: 10, price: 110, fee: 5, executedAt: D("2026-02-01") }),
      ],
    });
    // PnL = 1100 - 1000 - 5 = 95
    expect(r.realized[0]!.realizedPnl).toBe(95);
    expect(r.realized[0]!.closingFee).toBe(5);
  });
});

describe("computeCostBasis — LIFO", () => {
  it("LIFO sluit nieuwste lot eerst", () => {
    const r = computeCostBasis({
      ticker: "AAPL",
      currency: "USD",
      strategy: "LIFO",
      transactions: [
        tx({ id: "b1", type: "BUY", quantity: 10, price: 100, executedAt: D("2026-01-01") }),
        tx({ id: "b2", type: "BUY", quantity: 10, price: 200, executedAt: D("2026-01-15") }),
        tx({ id: "s1", type: "SELL", quantity: 5, price: 250, executedAt: D("2026-02-01") }),
      ],
    });
    // LIFO: pakt nieuwste lot (b2 @ 200) → costBasis = 5×200 = 1000
    expect(r.realized[0]!.costBasis).toBe(1000);
    expect(r.realized[0]!.realizedPnl).toBe(250);
  });
});

describe("computeCostBasis — edge cases", () => {
  it("oversold (SELL > available) → realized voor available, oversoldEvent voor rest", () => {
    const r = computeCostBasis({
      ticker: "AAPL",
      currency: "USD",
      transactions: [
        tx({ id: "b1", type: "BUY", quantity: 5, price: 100, executedAt: D("2026-01-01") }),
        tx({ id: "s1", type: "SELL", quantity: 10, price: 110, executedAt: D("2026-02-01") }),
      ],
    });
    expect(r.oversoldEvents).toHaveLength(1);
    expect(r.oversoldEvents[0]!.requested).toBe(10);
    expect(r.oversoldEvents[0]!.available).toBe(5);
    expect(r.realized[0]!.quantity).toBe(5); // alleen 5 verkocht
  });

  it("transacties out-of-order op de input → engine sorteert ze chronologisch", () => {
    const r = computeCostBasis({
      ticker: "AAPL",
      currency: "USD",
      transactions: [
        tx({ id: "s1", type: "SELL", quantity: 5, price: 250, executedAt: D("2026-02-01") }),
        tx({ id: "b1", type: "BUY", quantity: 10, price: 100, executedAt: D("2026-01-01") }),
      ],
    });
    expect(r.realized[0]!.realizedPnl).toBe(750);
    expect(r.oversoldEvents).toHaveLength(0);
  });

  it("DIVIDEND wordt genegeerd door cost-basis-engine (alleen BUY/SELL)", () => {
    const r = computeCostBasis({
      ticker: "AAPL",
      currency: "USD",
      transactions: [
        tx({ id: "b1", type: "BUY", quantity: 10, price: 100, executedAt: D("2026-01-01") }),
        tx({ id: "d1", type: "DIVIDEND", quantity: null, price: null, executedAt: D("2026-01-15") }),
      ],
    });
    expect(r.realized).toHaveLength(0);
    expect(r.openLots).toHaveLength(1);
  });
});
