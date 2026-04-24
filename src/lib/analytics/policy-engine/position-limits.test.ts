import { describe, expect, it } from "vitest";

import type { InstrumentClassification } from "@/lib/analytics/instruments";

import type { InstrumentRiskAssessment } from "./classify-risk";
import { resolvePositionLimitByAssetType } from "./position-limits";
import { DEFAULT_LIMITS_BY_TYPE } from "./types";

function cls(overrides: Partial<InstrumentClassification> = {}): InstrumentClassification {
  return {
    instrumentType: "SINGLE_STOCK",
    confidence: "HIGH",
    rationale: [],
    metadata: {
      isBroadMarket: false,
      sectorFocus: null,
      isIncomeFocused: false,
      incomeStrategy: null,
      isSpeculative: false,
      supportsFactorScoring: true,
      eligibleForWinnerRule: true,
    },
    classifiedAt: "2026-04-24T00:00:00.000Z",
    ...overrides,
  };
}

function risk(level: InstrumentRiskAssessment["level"]): InstrumentRiskAssessment {
  return { level, rationale: [] };
}

describe("resolvePositionLimitByAssetType — defaults per type", () => {
  it("SINGLE_STOCK → 10%", () => {
    const r = resolvePositionLimitByAssetType({
      classification: cls({ instrumentType: "SINGLE_STOCK" }),
      risk: risk("MODERATE"),
    });
    expect(r.allowedMaxWeight).toBe(0.10);
    expect(r.basis).toBe("default");
  });

  it("BROAD_MARKET_ETF → 40% (hoger dan single stock)", () => {
    const r = resolvePositionLimitByAssetType({
      classification: cls({ instrumentType: "BROAD_MARKET_ETF" }),
      risk: risk("LOW"),
    });
    expect(r.allowedMaxWeight).toBe(0.40);
  });

  it("SECTOR_ETF → 15% (lager dan broad-market, hoger dan theme)", () => {
    const r = resolvePositionLimitByAssetType({
      classification: cls({ instrumentType: "SECTOR_ETF" }),
      risk: risk("MODERATE"), // geen risk-penalty hier
    });
    expect(r.allowedMaxWeight).toBe(0.15);
  });

  it("THEME_ETF → 10% baseline", () => {
    const r = resolvePositionLimitByAssetType({
      classification: cls({ instrumentType: "THEME_ETF" }),
      risk: risk("MODERATE"),
    });
    expect(r.allowedMaxWeight).toBe(0.10);
  });

  it("INCOME_ETF (covered-call) → 25%", () => {
    const r = resolvePositionLimitByAssetType({
      classification: cls({ instrumentType: "INCOME_ETF" }),
      risk: risk("MODERATE"),
    });
    expect(r.allowedMaxWeight).toBe(0.25);
  });

  it("LEVERAGED_OR_INVERSE → 3%, HIGH risk halveert tot 1.5%", () => {
    const r = resolvePositionLimitByAssetType({
      classification: cls({ instrumentType: "LEVERAGED_OR_INVERSE" }),
      risk: risk("HIGH"),
    });
    expect(r.allowedMaxWeight).toBeCloseTo(0.015, 5);
  });

  it("CASH → geen cap (Infinity)", () => {
    const r = resolvePositionLimitByAssetType({
      classification: cls({ instrumentType: "CASH" }),
      risk: risk("LOW"),
    });
    expect(r.allowedMaxWeight).toBe(Number.POSITIVE_INFINITY);
    expect(r.reason).toMatch(/geen.*cap/i);
  });

  it("UNKNOWN → 5% conservatieve cap", () => {
    const r = resolvePositionLimitByAssetType({
      classification: cls({ instrumentType: "UNKNOWN" }),
      risk: risk("ELEVATED"),
    });
    // 0.05 * 0.75 (elevated) = 0.0375
    expect(r.allowedMaxWeight).toBeCloseTo(0.0375, 5);
  });
});

describe("resolvePositionLimitByAssetType — risk-adjustment", () => {
  it("HIGH risk halveert de cap", () => {
    const r = resolvePositionLimitByAssetType({
      classification: cls({ instrumentType: "SINGLE_STOCK" }),
      risk: risk("HIGH"),
    });
    expect(r.allowedMaxWeight).toBeCloseTo(0.05, 5);
    expect(r.basis).toBe("risk-adjusted");
    expect(r.reason.toLowerCase()).toContain("risk-adjustment");
  });

  it("ELEVATED × 0.75", () => {
    const r = resolvePositionLimitByAssetType({
      classification: cls({ instrumentType: "SECTOR_ETF" }),
      risk: risk("ELEVATED"),
    });
    // 0.15 * 0.75 = 0.1125
    expect(r.allowedMaxWeight).toBeCloseTo(0.1125, 5);
  });

  it("LOW laat cap ongemoeid", () => {
    const r = resolvePositionLimitByAssetType({
      classification: cls({ instrumentType: "BROAD_MARKET_ETF" }),
      risk: risk("LOW"),
    });
    expect(r.allowedMaxWeight).toBe(0.40);
  });
});

describe("resolvePositionLimitByAssetType — user overrides", () => {
  it("Per-type override vervangt default", () => {
    const r = resolvePositionLimitByAssetType({
      classification: cls({ instrumentType: "SINGLE_STOCK" }),
      risk: risk("MODERATE"),
      context: { overrides: { limitsByType: { SINGLE_STOCK: 0.05 } } },
    });
    expect(r.allowedMaxWeight).toBe(0.05);
    expect(r.basis).toBe("user-override");
  });

  it("Override naar null = cap uitzetten", () => {
    const r = resolvePositionLimitByAssetType({
      classification: cls({ instrumentType: "CRYPTO" }),
      risk: risk("HIGH"),
      context: { overrides: { limitsByType: { CRYPTO: null } } },
    });
    expect(r.allowedMaxWeight).toBe(Number.POSITIVE_INFINITY);
  });

  it("Globale tightening multiplier", () => {
    const r = resolvePositionLimitByAssetType({
      classification: cls({ instrumentType: "SINGLE_STOCK" }),
      risk: risk("MODERATE"),
      context: { overrides: { globalTightening: 0.8 } },
    });
    // 0.10 * 0.8 = 0.08
    expect(r.allowedMaxWeight).toBe(0.08);
  });

  it("User `maxPositionWeight` kan ALLEEN verlagen op SINGLE_STOCK", () => {
    const lower = resolvePositionLimitByAssetType({
      classification: cls({ instrumentType: "SINGLE_STOCK" }),
      risk: risk("MODERATE"),
      context: { userMaxSinglePositionWeight: 0.06 },
    });
    expect(lower.allowedMaxWeight).toBe(0.06);

    // Hogere poging wordt geïgnoreerd (default 0.10 blijft)
    const higher = resolvePositionLimitByAssetType({
      classification: cls({ instrumentType: "SINGLE_STOCK" }),
      risk: risk("MODERATE"),
      context: { userMaxSinglePositionWeight: 0.20 },
    });
    expect(higher.allowedMaxWeight).toBe(0.10);
  });

  it("User single-stock cap heeft geen effect op ETF-posities", () => {
    const r = resolvePositionLimitByAssetType({
      classification: cls({ instrumentType: "BROAD_MARKET_ETF" }),
      risk: risk("LOW"),
      context: { userMaxSinglePositionWeight: 0.05 },
    });
    expect(r.allowedMaxWeight).toBe(0.40);
  });
});

describe("DEFAULT_LIMITS_BY_TYPE (sanity)", () => {
  it("broad-market > sector > theme (conform ontwerp)", () => {
    expect(DEFAULT_LIMITS_BY_TYPE.BROAD_MARKET_ETF!).toBeGreaterThan(
      DEFAULT_LIMITS_BY_TYPE.SECTOR_ETF!,
    );
    expect(DEFAULT_LIMITS_BY_TYPE.SECTOR_ETF!).toBeGreaterThanOrEqual(
      DEFAULT_LIMITS_BY_TYPE.THEME_ETF!,
    );
  });

  it("leveraged < crypto < single stock (risk-ladder)", () => {
    expect(DEFAULT_LIMITS_BY_TYPE.LEVERAGED_OR_INVERSE!).toBeLessThan(
      DEFAULT_LIMITS_BY_TYPE.CRYPTO!,
    );
    expect(DEFAULT_LIMITS_BY_TYPE.CRYPTO!).toBeLessThan(
      DEFAULT_LIMITS_BY_TYPE.SINGLE_STOCK!,
    );
  });
});
