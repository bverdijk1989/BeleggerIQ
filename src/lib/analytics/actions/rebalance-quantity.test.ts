import { describe, expect, it } from "vitest";

import { resolveActionQuantity } from "./rebalance-quantity";

describe("resolveActionQuantity — HOLD/DO_NOTHING", () => {
  it("levert nullen voor HOLD", () => {
    const r = resolveActionQuantity({
      action: "HOLD",
      unitPriceBase: 100,
      marketValueBase: 5000,
      cashAvailable: 1000,
      targetWeight: 0.05,
      totalValue: 100000,
    });
    expect(r.sharesToBuy).toBe(0);
    expect(r.sharesToSell).toBe(0);
    expect(r.amount).toBe(0);
  });

  it("levert nullen voor DO_NOTHING", () => {
    const r = resolveActionQuantity({
      action: "DO_NOTHING",
      unitPriceBase: 100,
      marketValueBase: 0,
      cashAvailable: 0,
      targetWeight: null,
      totalValue: 0,
    });
    expect(r.sharesToBuy).toBe(0);
    expect(r.sharesToSell).toBe(0);
  });
});

describe("resolveActionQuantity — BUY pad", () => {
  it("koopt floor(desiredAmount / price) hele aandelen", () => {
    const r = resolveActionQuantity({
      action: "BUY",
      unitPriceBase: 100,
      marketValueBase: 0,
      cashAvailable: 1000,
      monthlyContribution: 200, // monthly × 1.5 = 300
      targetWeight: 0.05,
      totalValue: 10000, // target gap = 500
    });
    // min(300, 500, 1000*0.5=500) = 300, /100 = 3 shares.
    expect(r.sharesToBuy).toBe(3);
    expect(r.amount).toBe(300);
  });

  it("waarschuwt als bedrag te klein voor één aandeel", () => {
    const r = resolveActionQuantity({
      action: "BUY",
      unitPriceBase: 1000,
      marketValueBase: 0,
      cashAvailable: 100,
      monthlyContribution: 50,
      targetWeight: 0.5,
      totalValue: 10000,
    });
    expect(r.sharesToBuy).toBe(0);
    expect(r.warnings.some((w) => /klein/i.test(w))).toBe(true);
  });

  it("insufficientData zonder koers", () => {
    const r = resolveActionQuantity({
      action: "BUY",
      unitPriceBase: null,
      marketValueBase: 0,
      cashAvailable: 1000,
      targetWeight: 0.05,
      totalValue: 10000,
    });
    expect(r.insufficientData).toBe(true);
  });

  it("insufficientData zonder cash", () => {
    const r = resolveActionQuantity({
      action: "BUY",
      unitPriceBase: 100,
      marketValueBase: 0,
      cashAvailable: 0,
      targetWeight: 0.05,
      totalValue: 10000,
    });
    expect(r.insufficientData).toBe(true);
  });

  it("fractional shares afgerond op 4 decimalen", () => {
    const r = resolveActionQuantity({
      action: "BUY",
      unitPriceBase: 33.33,
      marketValueBase: 0,
      cashAvailable: 200,
      monthlyContribution: 100, // 150 < 100, < 5% van 10000 = 500 → 100
      targetWeight: 0.05,
      totalValue: 10000,
      allowFractionalShares: true,
    });
    expect(r.sharesToBuy).toBeGreaterThan(2.99);
    expect(r.sharesToBuy).toBeLessThan(3.1);
  });
});

describe("resolveActionQuantity — SELL/TRIM pad", () => {
  it("hergebruikt existing RebalanceQuantityPlan", () => {
    const r = resolveActionQuantity({
      action: "TRIM",
      unitPriceBase: 100,
      marketValueBase: 12000,
      cashAvailable: 0,
      targetWeight: 0.1,
      totalValue: 100000,
      existingPlan: {
        symbol: "X",
        actionLabel: "licht afbouwen",
        currentWeight: 12,
        targetWeight: 10,
        currentValue: 12000,
        targetValue: 10000,
        excessValue: 2000,
        currentPrice: 100,
        sharesToSell: 20,
        amountToSell: 2000,
        postSellWeight: 10,
        reason: "test",
        confidence: "HIGH",
        warnings: [],
      },
    });
    expect(r.sharesToSell).toBe(20);
    expect(r.amount).toBe(2000);
    expect(r.insufficientData).toBe(false);
  });

  it("fallback berekening zonder plan", () => {
    const r = resolveActionQuantity({
      action: "SELL",
      unitPriceBase: 50,
      marketValueBase: 8000,
      cashAvailable: 0,
      targetWeight: 0.05,
      totalValue: 100000,
    });
    // excess = 8000 - 5000 = 3000, / 50 = 60 shares
    expect(r.sharesToSell).toBe(60);
    expect(r.amount).toBe(3000);
  });

  it("insufficientData bij ontbrekende koers", () => {
    const r = resolveActionQuantity({
      action: "TRIM",
      unitPriceBase: null,
      marketValueBase: 8000,
      cashAvailable: 0,
      targetWeight: 0.05,
      totalValue: 100000,
    });
    expect(r.insufficientData).toBe(true);
  });
});
