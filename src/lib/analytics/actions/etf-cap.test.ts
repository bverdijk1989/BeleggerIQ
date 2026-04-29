import { describe, expect, it } from "vitest";

import { classifyAction, resolveCap } from "./action-classifier";

/**
 * Tests die specifiek de Bogle/Buffett-laag pinnen: een BROAD_MARKET_ETF
 * met cap 60% mag NIET met een SELL/TRIM-advies komen wanneer 'em op
 * 30% staat. Voorheen kreeg 'em dat door de platte 10%-cap.
 */

const baseInput = {
  ticker: "VWCE",
  composite: 50, // average — exactly what an index ETF should score
  factorConfidence: 0.7,
  qualitySubScore: 50,
  targetWeight: 0.6,
  cashAvailable: 1000,
  marketValueBase: 30_000,
} as const;

describe("resolveCap — type-bewust", () => {
  it("instrumentLimit overruled policy.maxPositionWeight", () => {
    const cap = resolveCap(
      { maxPositionWeight: 0.10 },
      { allowedMaxWeight: 0.60 },
    );
    expect(cap).toBe(0.60);
  });

  it("zonder instrumentLimit valt terug op policy.maxPositionWeight", () => {
    const cap = resolveCap({ maxPositionWeight: 0.10 });
    expect(cap).toBe(0.10);
  });

  it("zonder beide → conservatieve default 10%", () => {
    expect(resolveCap()).toBe(0.10);
  });
});

describe("classifyAction — BROAD_MARKET_ETF op 30% met cap 60%", () => {
  it("genereert GEEN SELL/TRIM (Bogle/Buffett-laag)", () => {
    const r = classifyAction({
      ...baseInput,
      currentWeight: 0.30, // 30% allocatie naar Vanguard S&P 500
      instrumentLimit: { allowedMaxWeight: 0.60, runMultiplier: 1.10 },
    });
    expect(r.action).not.toBe("SELL");
    expect(r.action).not.toBe("TRIM");
  });

  it("genereert HOLD bij gemiddelde score (50/100)", () => {
    const r = classifyAction({
      ...baseInput,
      currentWeight: 0.30,
      instrumentLimit: { allowedMaxWeight: 0.60, runMultiplier: 1.10 },
    });
    expect(r.action).toBe("HOLD");
  });

  it("zonder instrumentLimit → de oude 10%-cap zou TRIM-pad triggeren — bewijst de bug-state", () => {
    const r = classifyAction({
      ...baseInput,
      currentWeight: 0.30, // 3× over de platte 10% cap
      composite: 40, // matig
    });
    // Dit is de bestaande oude bug-state. De fix zit in de caller (page)
    // die instrumentLimit moet doorgeven. Deze test pin de bug-status
    // zodat een regressie zichtbaar wordt.
    expect(["SELL", "TRIM"]).toContain(r.action);
  });
});

describe("classifyAction — SINGLE_STOCK behoudt 10% cap", () => {
  it("13% gewicht single-stock + zwakke score → SELL/TRIM (terecht)", () => {
    const r = classifyAction({
      ...baseInput,
      ticker: "RHM",
      currentWeight: 0.13,
      composite: 40,
      instrumentLimit: { allowedMaxWeight: 0.10, runMultiplier: 2.00 },
    });
    expect(["SELL", "TRIM"]).toContain(r.action);
  });

  it("8% gewicht single-stock binnen 10% cap → géén TRIM", () => {
    const r = classifyAction({
      ...baseInput,
      ticker: "ASML",
      currentWeight: 0.08,
      composite: 80, // sterk
      instrumentLimit: { allowedMaxWeight: 0.10, runMultiplier: 2.00 },
    });
    expect(r.action).not.toBe("SELL");
    expect(r.action).not.toBe("TRIM");
  });
});

describe("classifyAction — BROAD_MARKET_ETF op 70% (boven cap)", () => {
  it("op 65% (binnen run-multiplier 60% × 1.10 = 66%) → géén TRIM", () => {
    const r = classifyAction({
      ...baseInput,
      currentWeight: 0.65,
      instrumentLimit: { allowedMaxWeight: 0.60, runMultiplier: 1.10 },
    });
    expect(r.action).not.toBe("TRIM");
  });

  it("op 75% (boven sellWeightMultiplier × cap = 72%) → kan SELL/TRIM zijn (legitiem; ook Bogle vond 70%+ in één fonds aan de hoge kant)", () => {
    const r = classifyAction({
      ...baseInput,
      currentWeight: 0.75,
      composite: 50,
      instrumentLimit: { allowedMaxWeight: 0.60, runMultiplier: 1.10 },
    });
    // 0.75 > 0.60 × 1.2 = 0.72 → triggert SELL-pad
    expect(["SELL", "TRIM"]).toContain(r.action);
  });
});
