import { describe, expect, it } from "vitest";

import { getAssetMappingForRegime } from "./asset-mapping";
import { computePortfolioMacroImpact } from "./portfolio-impact";
import type { AssetClassKey, MacroRegime } from "./types";

function buildWeights(
  partial: Partial<Record<AssetClassKey, number>>,
): Map<AssetClassKey, number> {
  const m = new Map<AssetClassKey, number>();
  for (const [k, v] of Object.entries(partial)) {
    if (typeof v === "number") m.set(k as AssetClassKey, v);
  }
  return m;
}

function impact(regime: MacroRegime, partial: Partial<Record<AssetClassKey, number>>) {
  return computePortfolioMacroImpact({
    regime,
    weightsByAssetClass: buildWeights(partial),
    assetMapping: getAssetMappingForRegime(regime),
  });
}

describe("computePortfolioMacroImpact — output shape", () => {
  it("levert 10 buckets + max 4 topGaps", () => {
    const out = impact("GOLDILOCKS", { EQUITY_GROWTH: 0.5, CASH: 0.5 });
    expect(out.buckets).toHaveLength(10);
    expect(out.topGaps.length).toBeLessThanOrEqual(4);
  });

  it("alignmentScore is 0..100", () => {
    const out = impact("GOLDILOCKS", { EQUITY_GROWTH: 0.4 });
    expect(out.alignmentScore).toBeGreaterThanOrEqual(0);
    expect(out.alignmentScore).toBeLessThanOrEqual(100);
  });
});

describe("computePortfolioMacroImpact — alignment-edge-cases", () => {
  it("alignment hoog wanneer portfolio rond baseline ligt", () => {
    // Goldilocks-baseline heeft 35% growth, 20% cyclical, 10% value, 10% defensive.
    const aligned = impact("GOLDILOCKS", {
      EQUITY_GROWTH: 0.35,
      EQUITY_CYCLICAL: 0.20,
      EQUITY_VALUE: 0.10,
      EQUITY_DEFENSIVE: 0.10,
      BOND_CORPORATE: 0.10,
      BOND_GOVERNMENT: 0.05,
      REAL_ESTATE: 0.05,
      CASH: 0.05,
    });
    expect(aligned.alignmentScore).toBeGreaterThan(80);
  });

  it("alignment laag wanneer portfolio sterk afwijkt", () => {
    // Stagflation-regime, maar portefeuille zit in growth.
    const misaligned = impact("STAGFLATION", {
      EQUITY_GROWTH: 0.80,
      EQUITY_CYCLICAL: 0.20,
    });
    expect(misaligned.alignmentScore).toBeLessThan(60);
  });
});

describe("computePortfolioMacroImpact — direction-logica", () => {
  it("STAGFLATION + overgewicht in growth → headwind", () => {
    const out = impact("STAGFLATION", {
      EQUITY_GROWTH: 0.6,
      CASH: 0.4,
    });
    const growth = out.buckets.find((b) => b.assetClass === "EQUITY_GROWTH")!;
    expect(growth.direction).toBe("headwind");
  });

  it("STAGFLATION + overgewicht in goud → tailwind", () => {
    const out = impact("STAGFLATION", {
      GOLD: 0.5,
      CASH: 0.5,
    });
    const gold = out.buckets.find((b) => b.assetClass === "GOLD")!;
    expect(gold.direction).toBe("tailwind");
  });

  it("REFLATION + ondergewicht in commodities → headwind voor portfolio", () => {
    const out = impact("REFLATION", {
      EQUITY_GROWTH: 0.7,
      CASH: 0.3,
    });
    const commodities = out.buckets.find((b) => b.assetClass === "COMMODITIES")!;
    expect(commodities.gap).toBeLessThan(-0.1);
    expect(commodities.direction).toBe("headwind");
  });

  it("DEFLATION + overgewicht in government bonds → tailwind", () => {
    const out = impact("DEFLATION", {
      BOND_GOVERNMENT: 0.5,
      CASH: 0.5,
    });
    const bonds = out.buckets.find((b) => b.assetClass === "BOND_GOVERNMENT")!;
    expect(bonds.direction).toBe("tailwind");
  });
});

describe("computePortfolioMacroImpact — summary tekst", () => {
  it("STAGFLATION + groei-zware portefeuille → summary noemt regime", () => {
    const out = impact("STAGFLATION", {
      EQUITY_GROWTH: 0.6,
      EQUITY_CYCLICAL: 0.2,
      CASH: 0.2,
    });
    expect(out.summary.toLowerCase()).toContain("stagflation");
  });

  it("near-baseline portefeuille → summary 'redelijk dicht bij baseline'", () => {
    const out = impact("GOLDILOCKS", {
      EQUITY_GROWTH: 0.36,
      EQUITY_CYCLICAL: 0.21,
      EQUITY_VALUE: 0.11,
      EQUITY_DEFENSIVE: 0.11,
      BOND_CORPORATE: 0.10,
      BOND_GOVERNMENT: 0.05,
      REAL_ESTATE: 0.05,
      CASH: 0.01,
    });
    expect(out.summary.toLowerCase()).toMatch(/baseline|dicht/);
  });
});
