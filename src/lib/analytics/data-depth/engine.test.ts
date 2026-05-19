import { describe, expect, it } from "vitest";

import {
  applyDataDepthToConfidence,
  assessPortfolioCoverage,
  computeAssetDataDepth,
  tierFromScore,
} from "./engine";
import { DIMENSION_WEIGHTS, TIER_EXPLANATIONS } from "./types";

/**
 * Module 26 — Data-Depth engine tests.
 */

const ASOF = "2026-05-19T00:00:00.000Z";

describe("tierFromScore — drempels", () => {
  it("85+ → excellent", () => {
    expect(tierFromScore(100)).toBe("excellent");
    expect(tierFromScore(85)).toBe("excellent");
  });
  it("70–85 → good", () => {
    expect(tierFromScore(70)).toBe("good");
    expect(tierFromScore(84)).toBe("good");
  });
  it("50–70 → fair", () => {
    expect(tierFromScore(50)).toBe("fair");
    expect(tierFromScore(69)).toBe("fair");
  });
  it("25–50 → limited", () => {
    expect(tierFromScore(25)).toBe("limited");
    expect(tierFromScore(49)).toBe("limited");
  });
  it("<25 → poor", () => {
    expect(tierFromScore(24)).toBe("poor");
    expect(tierFromScore(0)).toBe("poor");
    expect(tierFromScore(NaN)).toBe("poor");
  });
});

describe("computeAssetDataDepth", () => {
  it("alle flags true → score 100 + excellent", () => {
    const d = computeAssetDataDepth({
      ticker: "MSFT",
      flags: {
        live_price: true,
        fundamentals: true,
        dividend: true,
        macro: true,
        history: true,
      },
    });
    expect(d.score).toBe(100);
    expect(d.tier).toBe("excellent");
    expect(d.missing).toHaveLength(0);
    expect(d.present).toHaveLength(5);
    expect(d.explanation).toMatch(/aanwezig/i);
  });

  it("alleen live-price + history → ongeveer 50 (depending op weights)", () => {
    const d = computeAssetDataDepth({
      ticker: "X",
      flags: { live_price: true, history: true },
    });
    // live_price (0.30) + history (0.20) = 0.50 → 50
    expect(d.score).toBe(50);
    expect(d.tier).toBe("fair");
    expect(d.missing).toContain("fundamentals");
    expect(d.missing).toContain("macro");
    expect(d.missing).toContain("dividend");
  });

  it("geen enkele flag → score 0 + poor", () => {
    const d = computeAssetDataDepth({ ticker: "X", flags: {} });
    expect(d.score).toBe(0);
    expect(d.tier).toBe("poor");
    expect(d.missing).toHaveLength(5);
    expect(d.explanation).toBe(TIER_EXPLANATIONS.poor);
  });

  it("explanation noemt ontbrekende dimensies bij ≤3 missend", () => {
    const d = computeAssetDataDepth({
      ticker: "X",
      flags: {
        live_price: true,
        fundamentals: true,
        history: true,
      },
    });
    expect(d.missing).toEqual(["dividend", "macro"]);
    expect(d.explanation.toLowerCase()).toContain("dividend");
    expect(d.explanation.toLowerCase()).toContain("macro");
  });

  it("weights sommeren tot 1.0 (spec-conformance)", () => {
    const sum = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it("sources worden meegegeven", () => {
    const d = computeAssetDataDepth({
      ticker: "X",
      flags: { live_price: true },
      sources: ["yahoo", "manual"],
    });
    expect(d.sources).toEqual(["yahoo", "manual"]);
  });
});

describe("assessPortfolioCoverage — aggregator", () => {
  it("lege portefeuille → score 0 + tier poor + niet-lege summary", () => {
    const r = assessPortfolioCoverage({ generatedAt: ASOF, assets: [] });
    expect(r.assetCount).toBe(0);
    expect(r.weightedScore).toBe(0);
    expect(r.tier).toBe("poor");
    expect(r.summary.length).toBeGreaterThan(0);
    expect(r.weakestAssets).toHaveLength(0);
  });

  it("weight-gewogen score: één 100-asset + één 0-asset met 50/50 → 50", () => {
    const high = computeAssetDataDepth({
      ticker: "HIGH",
      flags: {
        live_price: true,
        fundamentals: true,
        dividend: true,
        macro: true,
        history: true,
      },
    });
    const low = computeAssetDataDepth({ ticker: "LOW", flags: {} });
    const r = assessPortfolioCoverage({
      generatedAt: ASOF,
      assets: [
        { depth: high, weight: 0.5 },
        { depth: low, weight: 0.5 },
      ],
    });
    expect(r.weightedScore).toBe(50);
    expect(r.tier).toBe("fair");
    expect(r.weakestAssets.map((a) => a.ticker)).toContain("LOW");
  });

  it("warning bij <50% live-price coverage", () => {
    const low = computeAssetDataDepth({ ticker: "X", flags: {} });
    const r = assessPortfolioCoverage({
      generatedAt: ASOF,
      assets: [{ depth: low, weight: 1.0 }],
    });
    expect(
      r.warnings.some((w) => /actuele koersen|live/i.test(w)),
    ).toBe(true);
  });

  it("weakestAssets capped op 3 + skipt assets met score ≥ 85", () => {
    const good = computeAssetDataDepth({
      ticker: "GOOD",
      flags: {
        live_price: true,
        fundamentals: true,
        dividend: true,
        macro: true,
        history: true,
      },
    });
    const weakAssets = Array.from({ length: 6 }, (_, i) =>
      computeAssetDataDepth({
        ticker: `W${i}`,
        flags: { live_price: true },
      }),
    );
    const r = assessPortfolioCoverage({
      generatedAt: ASOF,
      assets: [
        { depth: good, weight: 0.3 },
        ...weakAssets.map((depth, i) => ({ depth, weight: 0.1 + i * 0.01 })),
      ],
    });
    expect(r.weakestAssets.length).toBeLessThanOrEqual(3);
    expect(r.weakestAssets.find((a) => a.ticker === "GOOD")).toBeUndefined();
  });

  it("per-dimensie coverage tellingen kloppen", () => {
    const a = computeAssetDataDepth({
      ticker: "A",
      flags: { live_price: true, fundamentals: true },
    });
    const b = computeAssetDataDepth({
      ticker: "B",
      flags: { live_price: true, history: true },
    });
    const r = assessPortfolioCoverage({
      generatedAt: ASOF,
      assets: [
        { depth: a, weight: 0.5 },
        { depth: b, weight: 0.5 },
      ],
    });
    expect(r.dimensions.live_price.presentCount).toBe(2);
    expect(r.dimensions.live_price.weightedCoverage).toBe(1);
    expect(r.dimensions.fundamentals.presentCount).toBe(1);
    expect(r.dimensions.fundamentals.weightedCoverage).toBe(0.5);
    expect(r.dimensions.dividend.presentCount).toBe(0);
    expect(r.dimensions.dividend.weightedCoverage).toBe(0);
  });
});

describe("applyDataDepthToConfidence — multiplier", () => {
  it("depth=100 → confidence onveranderd", () => {
    expect(applyDataDepthToConfidence(0.8, 100)).toBe(0.8);
  });
  it("depth=0 → confidence × 0.5 (eroderen maar nooit naar 0)", () => {
    expect(applyDataDepthToConfidence(0.8, 0)).toBeCloseTo(0.4, 4);
  });
  it("depth=50 → confidence × 0.75 (midden van range)", () => {
    expect(applyDataDepthToConfidence(0.8, 50)).toBeCloseTo(0.6, 4);
  });
  it("confidence 0 of negatief → 0", () => {
    expect(applyDataDepthToConfidence(0, 50)).toBe(0);
    expect(applyDataDepthToConfidence(-1, 50)).toBe(0);
  });
  it("depth buiten 0..100 wordt geclamped", () => {
    expect(applyDataDepthToConfidence(1, -10)).toBeCloseTo(0.5, 4);
    expect(applyDataDepthToConfidence(1, 200)).toBeCloseTo(1, 4);
  });
});

describe("Module 26 — spec-conformance", () => {
  it("plain-language uitleg bevat geen technische jargon", () => {
    const d = computeAssetDataDepth({ ticker: "X", flags: {} });
    // Geen percentages, geen "API", geen tech-praat
    expect(d.explanation).not.toMatch(/api|provider|status|http|json/i);
    expect(d.explanation).not.toMatch(/\d{1,3}%/);
  });
  it("alle 5 dimensies (live_price/fundamentals/dividend/macro/history) zijn aanwezig in weights", () => {
    const keys = Object.keys(DIMENSION_WEIGHTS).sort();
    expect(keys).toEqual([
      "dividend",
      "fundamentals",
      "history",
      "live_price",
      "macro",
    ]);
  });
});
