import { describe, expect, it } from "vitest";

import { computeRebalanceQuantity } from "./rebalance-quantity";

describe("computeRebalanceQuantity — happy path (example uit spec)", () => {
  it("RHM voorbeeld: 17.53% → target 10% → verkoop 1 aandeel", () => {
    // Portfolio 80k. RHM positie ~14k (17.5%). Target 10% = 8k. Excess 6k.
    // Koers €1.407 (uit screenshot). 6k/1407 = 4.27 → floor 4 shares.
    // Exact uit de spec-voorbeeld: currentPrice 1750, excess 2266, 1 share.
    // 17.53% van 10k = 1753 → current value 1753. Target 10% × 10k = 1000.
    // Excess = 753? Uit voorbeeld excessValue: 2266 met currentPrice 1750.
    // Onze formule moet EXACT die waardes geven bij de matchende input:
    const r = computeRebalanceQuantity({
      symbol: "RHM",
      action: "TRIM_LIGHT",
      currentValue: 17530,
      currentPrice: 1750,
      totalPortfolioValue: 100000,
      targetWeight: 0.10,
    });
    // currentWeight 17.53%, target 10%
    expect(r.currentWeight).toBeCloseTo(17.53, 2);
    expect(r.targetWeight).toBe(10);
    expect(r.currentValue).toBe(17530);
    expect(r.targetValue).toBe(10000);
    expect(r.excessValue).toBe(7530);
    // 7530 / 1750 = 4.3 → floor 4
    expect(r.sharesToSell).toBe(4);
    expect(r.amountToSell).toBe(7000);
    // postSell = (17530 - 7000) / 100000 = 10.53%
    expect(r.postSellWeight).toBeCloseTo(10.53, 2);
    expect(r.actionLabel).toBe("licht afbouwen");
    expect(r.reason).toMatch(/verkoop 4 aandelen/);
    expect(r.confidence).toBe("HIGH");
    expect(r.warnings).toEqual([]);
  });

  it("Spec-exact scenario (1 aandeel bij €1750): excess moet matchen floor-getal", () => {
    // Zoek input waarbij sharesToSell=1 uitkomt.
    // Doel: excess ligt tussen 1750 en 3499 (floor naar 1).
    const r = computeRebalanceQuantity({
      symbol: "RHM",
      action: "TRIM_LIGHT",
      currentValue: 12266,
      currentPrice: 1750,
      totalPortfolioValue: 100000,
      targetWeight: 0.10,
    });
    expect(r.excessValue).toBe(2266);
    expect(r.sharesToSell).toBe(1);
    expect(r.amountToSell).toBe(1750);
  });
});

describe("computeRebalanceQuantity — action labels NL", () => {
  const base = {
    symbol: "X",
    currentValue: 15000,
    currentPrice: 100,
    totalPortfolioValue: 100000,
    targetWeight: 0.10,
  } as const;

  it("NO_ACTION → 'geen actie' + sharesToSell 0 + specifieke reason", () => {
    const r = computeRebalanceQuantity({ ...base, action: "NO_ACTION" });
    expect(r.actionLabel).toBe("geen actie");
    expect(r.sharesToSell).toBe(0);
    expect(r.amountToSell).toBe(0);
    expect(r.reason).toMatch(/binnen target/i);
  });

  it("TRIM_LIGHT → 'licht afbouwen'", () => {
    const r = computeRebalanceQuantity({ ...base, action: "TRIM_LIGHT" });
    expect(r.actionLabel).toBe("licht afbouwen");
  });

  it("TRIM_HEAVY → 'stevig afbouwen'", () => {
    const r = computeRebalanceQuantity({ ...base, action: "TRIM_HEAVY" });
    expect(r.actionLabel).toBe("stevig afbouwen");
  });

  it("RECONSIDER → 'heroverwegen' + plant volledige afbouw (niet alleen excess)", () => {
    const r = computeRebalanceQuantity({ ...base, action: "RECONSIDER" });
    expect(r.actionLabel).toBe("heroverwegen");
    // Plan afbouw = currentValue (volledig) / 100 = 150 shares
    expect(r.sharesToSell).toBe(150);
    expect(r.amountToSell).toBe(15000);
    // postSell weight = (15000 - 15000) / 100000 = 0
    expect(r.postSellWeight).toBe(0);
  });
});

describe("computeRebalanceQuantity — ontbrekende koers", () => {
  it("Geen currentPrice + geen lastKnownPrice → LOW confidence + warning + 0 stuks", () => {
    const r = computeRebalanceQuantity({
      symbol: "X",
      action: "TRIM_LIGHT",
      currentValue: 15000,
      totalPortfolioValue: 100000,
      targetWeight: 0.10,
      currentPrice: null,
    });
    expect(r.currentPrice).toBeNull();
    expect(r.sharesToSell).toBe(0);
    expect(r.amountToSell).toBe(0);
    expect(r.confidence).toBe("LOW");
    expect(r.warnings).toContain("Onvoldoende koersdata om aantal stuks te berekenen.");
    expect(r.reason).toMatch(/niet te bepalen zonder koersdata/i);
  });

  it("Val terug op lastKnownPrice → MEDIUM confidence + warning", () => {
    const r = computeRebalanceQuantity({
      symbol: "X",
      action: "TRIM_LIGHT",
      currentValue: 15000,
      currentPrice: null,
      lastKnownPrice: 100,
      totalPortfolioValue: 100000,
      targetWeight: 0.10,
    });
    expect(r.currentPrice).toBe(100);
    expect(r.sharesToSell).toBe(50); // 5000 / 100
    expect(r.confidence).toBe("MEDIUM");
    expect(
      r.warnings.some((w) => /laatst bekende koers/i.test(w)),
    ).toBe(true);
  });

  it("Koers <= 0 wordt behandeld als ontbrekend", () => {
    const r = computeRebalanceQuantity({
      symbol: "X",
      action: "TRIM_LIGHT",
      currentValue: 15000,
      currentPrice: 0,
      totalPortfolioValue: 100000,
      targetWeight: 0.10,
    });
    expect(r.currentPrice).toBeNull();
    expect(r.sharesToSell).toBe(0);
    expect(r.confidence).toBe("LOW");
  });
});

describe("computeRebalanceQuantity — edge cases", () => {
  it("sharesToSell is nooit negatief (positie onder target)", () => {
    const r = computeRebalanceQuantity({
      symbol: "X",
      action: "TRIM_LIGHT",
      currentValue: 5000, // 5%
      currentPrice: 100,
      totalPortfolioValue: 100000,
      targetWeight: 0.10, // target 10% = 10k
    });
    expect(r.excessValue).toBe(0);
    expect(r.sharesToSell).toBe(0);
    expect(r.amountToSell).toBe(0);
    expect(r.postSellWeight).toBe(5);
  });

  it("Excess kleiner dan één aandeel → sharesToSell=0 + specifieke reason", () => {
    // currentValue 10050, targetValue 10000, excess 50, price 100 → 0 shares
    const r = computeRebalanceQuantity({
      symbol: "X",
      action: "TRIM_LIGHT",
      currentValue: 10050,
      currentPrice: 100,
      totalPortfolioValue: 100000,
      targetWeight: 0.10,
    });
    expect(r.excessValue).toBe(50);
    expect(r.sharesToSell).toBe(0);
    expect(r.amountToSell).toBe(0);
    expect(r.reason).toMatch(/kleiner dan één aandeel/i);
  });

  it("Fractional shares: round(4) i.p.v. floor", () => {
    const r = computeRebalanceQuantity({
      symbol: "X",
      action: "TRIM_LIGHT",
      currentValue: 15000,
      currentPrice: 33.33,
      totalPortfolioValue: 100000,
      targetWeight: 0.10,
      allowFractionalShares: true,
    });
    // excess 5000, 5000 / 33.33 ≈ 150.015 → round(4) = 150.015
    expect(r.sharesToSell).toBeGreaterThan(150);
    expect(r.sharesToSell).toBeLessThan(150.1);
    expect(r.reason).toMatch(/stuks/); // fractional pluralisatie
  });

  it("totalPortfolioValue = 0 → geen crash, alle weights 0", () => {
    const r = computeRebalanceQuantity({
      symbol: "X",
      action: "TRIM_LIGHT",
      currentValue: 15000,
      currentPrice: 100,
      totalPortfolioValue: 0,
      targetWeight: 0.10,
    });
    expect(r.currentWeight).toBe(0);
    expect(r.targetValue).toBe(0);
    expect(r.postSellWeight).toBe(0);
  });

  it("targetWeight > 1 wordt geclampt naar 1 (defensive)", () => {
    const r = computeRebalanceQuantity({
      symbol: "X",
      action: "NO_ACTION",
      currentValue: 50000,
      currentPrice: 100,
      totalPortfolioValue: 100000,
      targetWeight: 1.5, // bug-input
    });
    expect(r.targetWeight).toBe(100);
  });

  it("targetWeight negatief → 0% (defensive)", () => {
    const r = computeRebalanceQuantity({
      symbol: "X",
      action: "RECONSIDER",
      currentValue: 10000,
      currentPrice: 100,
      totalPortfolioValue: 100000,
      targetWeight: -0.5,
    });
    expect(r.targetWeight).toBe(0);
    expect(r.sharesToSell).toBe(100); // RECONSIDER plant volledige afbouw
  });

  it("NaN currentValue → 0 (sanitized)", () => {
    const r = computeRebalanceQuantity({
      symbol: "X",
      action: "NO_ACTION",
      currentValue: NaN,
      currentPrice: 100,
      totalPortfolioValue: 100000,
      targetWeight: 0.10,
    });
    expect(r.currentValue).toBe(0);
    expect(r.currentWeight).toBe(0);
  });
});

describe("computeRebalanceQuantity — confidence", () => {
  it("HIGH wanneer alle data aanwezig + classifier confidence ≥ 0.5", () => {
    const r = computeRebalanceQuantity({
      symbol: "X",
      action: "TRIM_LIGHT",
      currentValue: 15000,
      currentPrice: 100,
      totalPortfolioValue: 100000,
      targetWeight: 0.10,
      classifierConfidence: 0.9,
    });
    expect(r.confidence).toBe("HIGH");
  });

  it("MEDIUM wanneer classifier-confidence laag is maar koers er is", () => {
    const r = computeRebalanceQuantity({
      symbol: "X",
      action: "TRIM_LIGHT",
      currentValue: 15000,
      currentPrice: 100,
      totalPortfolioValue: 100000,
      targetWeight: 0.10,
      classifierConfidence: 0.3,
    });
    expect(r.confidence).toBe("MEDIUM");
  });

  it("LOW zodra er geen koers is (ongeacht classifier)", () => {
    const r = computeRebalanceQuantity({
      symbol: "X",
      action: "TRIM_LIGHT",
      currentValue: 15000,
      currentPrice: null,
      totalPortfolioValue: 100000,
      targetWeight: 0.10,
      classifierConfidence: 1,
    });
    expect(r.confidence).toBe("LOW");
  });
});

describe("computeRebalanceQuantity — reason-pluralisatie", () => {
  it("1 aandeel (enkelvoud)", () => {
    const r = computeRebalanceQuantity({
      symbol: "X",
      action: "TRIM_LIGHT",
      currentValue: 10500,
      currentPrice: 500,
      totalPortfolioValue: 100000,
      targetWeight: 0.10,
    });
    expect(r.sharesToSell).toBe(1);
    expect(r.reason).toMatch(/\b1 aandeel\b/);
  });

  it("meervoud 'aandelen' bij sharesToSell > 1", () => {
    const r = computeRebalanceQuantity({
      symbol: "X",
      action: "TRIM_LIGHT",
      currentValue: 15000,
      currentPrice: 100,
      totalPortfolioValue: 100000,
      targetWeight: 0.10,
    });
    expect(r.sharesToSell).toBeGreaterThan(1);
    expect(r.reason).toMatch(/aandelen/);
  });
});
