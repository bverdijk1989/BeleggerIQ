import { describe, expect, it } from "vitest";

import type { FundamentalsSnapshot } from "@/types/factor";

import { scoreFactorsByAssetClass } from "./router";

const NOW = new Date("2026-04-27T00:00:00.000Z");

function fundamentals(): FundamentalsSnapshot {
  return {
    ticker: "ASML",
    asOf: NOW.toISOString(),
    currency: "EUR",
    roic: 0.22,
    roe: 0.25,
    debtToEquity: 0.4,
    operatingMargin: 0.28,
    grossMargin: 0.5,
    fcfYield: 0.06,
    pe: 22,
    pb: 6,
    evEbitda: 18,
  };
}

describe("scoreFactorsByAssetClass — router", () => {
  it("EQUITY → stock-engine, kind blijft default (geen ETF-tag)", () => {
    const score = scoreFactorsByAssetClass({
      ticker: "ASML",
      assetClass: "EQUITY",
      stockInput: { fundamentals: fundamentals() },
    });
    expect(score).not.toBeNull();
    expect(score!.kind).not.toBe("ETF");
    expect(score!.etfBreakdown).toBeUndefined();
    expect(score!.model).toBe("beleggeriq.v1");
  });

  it("REIT → stock-engine", () => {
    const score = scoreFactorsByAssetClass({
      ticker: "PLD",
      assetClass: "REIT",
      stockInput: { fundamentals: fundamentals() },
    });
    expect(score).not.toBeNull();
    expect(score!.kind).not.toBe("ETF");
  });

  it("ETF → ETF-engine, kind='ETF', etfBreakdown gevuld", () => {
    const score = scoreFactorsByAssetClass({
      ticker: "VWCE",
      assetClass: "ETF",
      etfMetadata: {
        ticker: "VWCE",
        asOf: NOW.toISOString(),
        ter: 0.0022,
        aum: 12_000_000_000,
        inceptionDate: "2019-07-23",
        trackingErrorYearly: 0.0008,
        distributionPolicy: "ACCUMULATING",
        replicationMethod: "PHYSICAL_FULL",
        topSectorWeight: 0.22,
      },
      objective: "GROWTH",
      now: NOW,
    });
    expect(score).not.toBeNull();
    expect(score!.kind).toBe("ETF");
    expect(score!.etfBreakdown).toBeDefined();
    expect(score!.model).toBe("beleggeriq.etf.v1");
  });

  it("BOND → ETF-pad (typische particuliere bond-holding via fund)", () => {
    const score = scoreFactorsByAssetClass({
      ticker: "IB01",
      assetClass: "BOND",
      etfMetadata: null,
      objective: "RETIREMENT",
      now: NOW,
    });
    expect(score).not.toBeNull();
    expect(score!.kind).toBe("ETF");
    expect(score!.composite).toBe(50); // null metadata → neutraal
    expect(score!.confidence ?? 0).toBeLessThanOrEqual(0.3);
  });

  it("EQUITY zonder stockInput → null (geen verzonnen score)", () => {
    const score = scoreFactorsByAssetClass({
      ticker: "XYZ",
      assetClass: "EQUITY",
    });
    expect(score).toBeNull();
  });

  it("ETF zonder metadata → score met composite=50 + lage confidence (geen hallucinatie)", () => {
    const score = scoreFactorsByAssetClass({
      ticker: "UNKNOWN",
      assetClass: "ETF",
      etfMetadata: null,
      objective: "GROWTH",
      now: NOW,
    });
    expect(score).not.toBeNull();
    expect(score!.kind).toBe("ETF");
    expect(score!.composite).toBe(50);
    expect(score!.confidence ?? 0).toBeLessThanOrEqual(0.3);
  });

  it("ETF-rationales bevatten geen company-fundamental termen", () => {
    const score = scoreFactorsByAssetClass({
      ticker: "VWCE",
      assetClass: "ETF",
      etfMetadata: {
        ticker: "VWCE",
        asOf: NOW.toISOString(),
        ter: 0.0007,
        aum: 12_000_000_000,
        inceptionDate: "2019-07-23",
        trackingErrorYearly: 0.0006,
        distributionPolicy: "ACCUMULATING",
        replicationMethod: "PHYSICAL_FULL",
        topSectorWeight: 0.20,
      },
      objective: "GROWTH",
      now: NOW,
    });
    const all = JSON.stringify(score!.rationales).toLowerCase();
    expect(all).not.toContain("roic");
    expect(all).not.toContain("p/e");
    expect(all).not.toContain("fcf-yield");
  });
});
