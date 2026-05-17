import { describe, expect, it } from "vitest";

import { buildCryptoRiskReport, classifyCryptoTicker } from "./engine";
import { computeCryptoMetrics } from "./metrics";
import type { CryptoAssetMetrics, CryptoPosition } from "./types";

const ASOF = "2026-05-10T00:00:00.000Z";

function buildClosesUp(n: number, start = 10_000, drift = 0.005): number[] {
  const out: number[] = [];
  let v = start;
  for (let i = 0; i < n; i++) {
    out.push(v);
    v *= 1 + drift;
  }
  return out;
}

function makePosition(over: Partial<CryptoPosition> = {}): CryptoPosition {
  return {
    ticker: "BTC-USD",
    name: "Bitcoin",
    marketValueBase: 5_000,
    weight: 0.05,
    asset: "BTC",
    ...over,
  };
}

function makeMetrics(over: Partial<CryptoAssetMetrics> = {}): CryptoAssetMetrics {
  return computeCryptoMetrics({
    asset: "BTC",
    closes: buildClosesUp(252, 10_000, 0.004),
    ...over,
  });
}

describe("buildCryptoRiskReport — allocation tier", () => {
  it("0% → tier none, geen speculation-warning", () => {
    const report = buildCryptoRiskReport({
      asOf: ASOF,
      totalPortfolioValue: 100_000,
      positions: [],
      assetMetrics: [],
    });
    expect(report.allocationTier).toBe("none");
    expect(report.warnings.some((w) => /speculatief|speculation/i.test(w))).toBe(
      false,
    );
  });

  it("5% → tier moderate", () => {
    const report = buildCryptoRiskReport({
      asOf: ASOF,
      totalPortfolioValue: 100_000,
      positions: [makePosition({ marketValueBase: 5_000, weight: 0.05 })],
      assetMetrics: [makeMetrics()],
    });
    expect(report.allocationTier).toBe("moderate");
  });

  it(">30% → tier very_high + warning", () => {
    const report = buildCryptoRiskReport({
      asOf: ASOF,
      totalPortfolioValue: 100_000,
      positions: [makePosition({ marketValueBase: 35_000, weight: 0.35 })],
      assetMetrics: [makeMetrics()],
    });
    expect(report.allocationTier).toBe("very_high");
    expect(report.warnings.some((w) => /drawdown|hoofdsom/i.test(w))).toBe(true);
  });
});

describe("buildCryptoRiskReport — sizing", () => {
  it(">30% positie → sizing critical", () => {
    const report = buildCryptoRiskReport({
      asOf: ASOF,
      totalPortfolioValue: 100_000,
      positions: [makePosition({ weight: 0.32 })],
      assetMetrics: [makeMetrics()],
    });
    expect(report.sizing.tier).toBe("critical");
  });

  it("15-30% → sizing warning", () => {
    const report = buildCryptoRiskReport({
      asOf: ASOF,
      totalPortfolioValue: 100_000,
      positions: [makePosition({ weight: 0.20 })],
      assetMetrics: [makeMetrics()],
    });
    expect(report.sizing.tier).toBe("warning");
  });

  it("<5% → sizing comfortable", () => {
    const report = buildCryptoRiskReport({
      asOf: ASOF,
      totalPortfolioValue: 100_000,
      positions: [makePosition({ weight: 0.02 })],
      assetMetrics: [makeMetrics()],
    });
    expect(report.sizing.tier).toBe("comfortable");
  });
});

describe("buildCryptoRiskReport — speculation-score", () => {
  it("hoge allocatie + hoge vol → hoge speculation-score", () => {
    // Volatiele series: sterke afwisseling tussen +6% en -5% per dag
    // produceert ~80%+ annualized vol — referentie-niveau "hoog".
    const highVolMetrics = computeCryptoMetrics({
      asset: "BTC",
      closes: Array.from({ length: 252 }, (_, i) =>
        10_000 * (1 + (i % 2 === 0 ? 0.06 : -0.05) * Math.sin(i)),
      ),
    });
    const report = buildCryptoRiskReport({
      asOf: ASOF,
      totalPortfolioValue: 100_000,
      positions: [makePosition({ weight: 0.40, marketValueBase: 40_000 })],
      assetMetrics: [highVolMetrics],
    });
    expect(report.speculationScore).toBeGreaterThanOrEqual(55);
  });

  it("lage allocatie → lage speculation-score", () => {
    const report = buildCryptoRiskReport({
      asOf: ASOF,
      totalPortfolioValue: 100_000,
      positions: [makePosition({ weight: 0.01, marketValueBase: 1_000 })],
      assetMetrics: [makeMetrics()],
    });
    expect(report.speculationScore).toBeLessThanOrEqual(40);
  });
});

describe("classifyCryptoTicker", () => {
  it("BTC-USD → BTC", () => {
    expect(classifyCryptoTicker("BTC-USD")).toBe("BTC");
  });
  it("ETH-EUR → ETH", () => {
    expect(classifyCryptoTicker("ETH-EUR")).toBe("ETH");
  });
  it("BITCOIN-USD → BTC", () => {
    expect(classifyCryptoTicker("BITCOIN-USD")).toBe("BTC");
  });
  it("AAPL → null (geen crypto)", () => {
    expect(classifyCryptoTicker("AAPL")).toBeNull();
  });
  it("naam-based fallback voor ethereum", () => {
    expect(classifyCryptoTicker("XYZ", "Ethereum-tracker")).toBe("ETH");
  });
});
