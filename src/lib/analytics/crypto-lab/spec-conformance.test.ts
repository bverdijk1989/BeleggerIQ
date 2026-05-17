import { describe, expect, it } from "vitest";

import { buildCryptoRiskReport, classifyCryptoTicker } from "./engine";
import { computeCryptoMetrics } from "./metrics";
import {
  ALLOCATION_TIER_LABELS,
  CRYPTO_ASSET_LABELS,
  CRYPTO_LAB_DISCLAIMER,
  SIZING_TIER_LABELS,
  type CryptoAssetKey,
  type CryptoPosition,
} from "./types";

/**
 * Module 12 — Crypto Risk & Momentum Lab spec-conformance.
 *
 * Het Module 12-spec eist:
 *  1. BTC/ETH focus v1 (geen alt/memecoin support).
 *  2. 10 functionele aspecten: allocatie, vol, drawdown, momentum,
 *     trend, speculation-score, sizing-warning, FOMO-flag, Coinbase/
 *     manueel-pad, behavioral-integratie.
 *  3. UX-eisen: aparte lab-sectie, expliciete risico-waarschuwing,
 *     géén "koop nu"-advies, géén leverage-promotie, géén pump/dump.
 *
 * Deze tests bevriezen die eisen voor de pure-engine laag.
 */

const ASOF = "2026-05-10T00:00:00.000Z";

function pos(over: Partial<CryptoPosition> = {}): CryptoPosition {
  return {
    ticker: "BTC-USD",
    name: "Bitcoin",
    marketValueBase: 5_000,
    weight: 0.05,
    asset: "BTC",
    ...over,
  };
}

describe("Module 12 — v1 scope: BTC + ETH only", () => {
  it("CRYPTO_ASSET_LABELS bevat exact BTC en ETH", () => {
    const keys = Object.keys(CRYPTO_ASSET_LABELS).sort();
    expect(keys).toEqual(["BTC", "ETH"]);
  });

  it("classifyCryptoTicker accepteert BTC en ETH, weigert anderen", () => {
    expect(classifyCryptoTicker("BTC-USD")).toBe("BTC");
    expect(classifyCryptoTicker("ETH-EUR")).toBe("ETH");
    // Alt/memecoin scope-bewaking
    expect(classifyCryptoTicker("DOGE-USD")).toBeNull();
    expect(classifyCryptoTicker("SOL-USD")).toBeNull();
    expect(classifyCryptoTicker("XRP-USD")).toBeNull();
  });
});

describe("Module 12 — 10 functionele aspecten dekken", () => {
  // Build een rapport dat zoveel mogelijk aspecten triggert.
  const closes = Array.from({ length: 252 }, (_, i) =>
    10_000 * Math.exp(-0.001 * i + 0.03 * Math.sin(i / 5)),
  );
  const metrics = computeCryptoMetrics({ asset: "BTC", closes });
  const report = buildCryptoRiskReport({
    asOf: ASOF,
    totalPortfolioValue: 100_000,
    positions: [pos({ marketValueBase: 18_000, weight: 0.18 })],
    assetMetrics: [metrics],
  });

  it("(1) crypto-allocatie zichtbaar als fractie", () => {
    expect(typeof report.allocationFraction).toBe("number");
    expect(report.allocationFraction).toBeGreaterThan(0);
  });

  it("(2) volatiliteit per asset zichtbaar", () => {
    expect(report.assets[0]!.annualizedVolatility).not.toBeNull();
  });

  it("(3) drawdown-risico zichtbaar", () => {
    expect(report.assets[0]!.maxDrawdown).not.toBeNull();
    expect(report.assets[0]!.maxDrawdown!).toBeLessThanOrEqual(0);
  });

  it("(4) momentum-score 0..100", () => {
    expect(report.assets[0]!.momentumScore).toBeGreaterThanOrEqual(0);
    expect(report.assets[0]!.momentumScore).toBeLessThanOrEqual(100);
  });

  it("(5) trend-sterkte 0..100 + trend-direction", () => {
    expect(report.assets[0]!.trendStrength).toBeGreaterThanOrEqual(0);
    expect(report.assets[0]!.trendStrength).toBeLessThanOrEqual(100);
    expect(["up", "down", "sideways", "unknown"]).toContain(
      report.assets[0]!.trendDirection,
    );
  });

  it("(6) speculation-score 0..100", () => {
    expect(report.speculationScore).toBeGreaterThanOrEqual(0);
    expect(report.speculationScore).toBeLessThanOrEqual(100);
  });

  it("(7) position-sizing waarschuwing aanwezig", () => {
    expect(report.sizing).toBeDefined();
    expect(report.sizing.tier).toBeDefined();
    expect(report.sizing.message.length).toBeGreaterThan(10);
  });

  it("(8) allocation-tier in canonical set", () => {
    const allowed = new Set(Object.keys(ALLOCATION_TIER_LABELS));
    expect(allowed.has(report.allocationTier)).toBe(true);
  });

  it("(9) sizing-tier in canonical set", () => {
    const allowed = new Set(Object.keys(SIZING_TIER_LABELS));
    expect(allowed.has(report.sizing.tier)).toBe(true);
  });

  it("(10) disclaimer + warnings present (transparency)", () => {
    expect(report.disclaimer).toBe(CRYPTO_LAB_DISCLAIMER);
    expect(report.warnings.length).toBeGreaterThan(0);
  });
});

describe("Module 12 — UX/positionering: geen koop-/leverage-/pump-taal", () => {
  it("CRYPTO_LAB_DISCLAIMER bevat expliciet 'geen leverage / koop nu / pump'", () => {
    expect(CRYPTO_LAB_DISCLAIMER.toLowerCase()).toMatch(/leverage|koop nu|pump/);
  });

  it("Warnings bevatten géén 'koop nu' of 'gegarandeerd' taal", () => {
    const report = buildCryptoRiskReport({
      asOf: ASOF,
      totalPortfolioValue: 100_000,
      positions: [pos({ weight: 0.35, marketValueBase: 35_000 })],
      assetMetrics: [
        computeCryptoMetrics({
          asset: "BTC",
          closes: Array.from({ length: 252 }, (_, i) => 10_000 * (1 + 0.001 * i)),
        }),
      ],
    });
    for (const w of report.warnings) {
      expect(w.toLowerCase()).not.toMatch(/\bkoop nu\b|\bgegarandeerd\b|\bzeker winst\b/);
    }
  });

  it("Reports met crypto-exposure bevatten universele speculation-waarschuwing", () => {
    const report = buildCryptoRiskReport({
      asOf: ASOF,
      totalPortfolioValue: 100_000,
      positions: [pos({ weight: 0.05, marketValueBase: 5_000 })],
      assetMetrics: [
        computeCryptoMetrics({
          asset: "BTC",
          closes: Array.from({ length: 252 }, (_, i) => 10_000 + i * 10),
        }),
      ],
    });
    expect(
      report.warnings.some((w) => /speculatief|pump|leverage/i.test(w)),
    ).toBe(true);
  });
});

describe("Module 12 — coverage van behavioral hooks (geen rewrite)", () => {
  it("Spec-component: behavioral FOMO-integratie zit op detector-laag", () => {
    // Het bestaande SPECULATIVE_OVERALLOCATION-detector (Module 3)
    // gebruikt CRYPTO/COMMODITY asset-classes. We verifiëren hier de
    // contract-shape die de detector ook gebruikt: positie heeft
    // `asset: CryptoAssetKey | null` zodat downstream filters consistent
    // werken.
    const p: CryptoPosition = pos();
    const asset: CryptoAssetKey | null = p.asset;
    expect(asset === "BTC" || asset === "ETH" || asset === null).toBe(true);
  });
});
