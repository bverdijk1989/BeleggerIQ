import { describe, expect, it } from "vitest";

import { buildCorrelationCsv } from "./csv";
import {
  buildCorrelationReport,
  classifyPair,
  pearson,
} from "./engine";
import {
  HIGHLY_CORRELATED_THRESHOLD,
  MIN_SAMPLE_TRADING_DAYS,
  NEGATIVE_CORRELATED_THRESHOLD,
  type CorrelationAsset,
} from "./types";

/**
 * Module 28 — Cross-Asset Correlation Studio tests.
 *
 * Pure-function engine: deterministisch, fixture-vrij (we genereren
 * series met sin/cos/noise in-test).
 */

const ASOF = "2026-05-19T00:00:00.000Z";

function asset(
  ticker: string,
  name: string,
  kind: "holding" | "benchmark" = "holding",
  weight: number | null = 0.1,
): CorrelationAsset {
  return { ticker, name, kind, sector: null, weight };
}

function dateRange(n: number, startIso = "2025-01-01"): string[] {
  const out: string[] = [];
  const start = new Date(startIso);
  for (let i = 0; i < n; i++) {
    out.push(new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

describe("pearson — Pearson correlation", () => {
  it("perfect positive → +1", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 4, 6, 8, 10];
    expect(pearson(xs, ys)).toBe(1);
  });

  it("perfect negative → -1", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [5, 4, 3, 2, 1];
    expect(pearson(xs, ys)).toBe(-1);
  });

  it("uncorrelated → ~0", () => {
    // Sin vs cos zijn ortogonaal over volle periode.
    const xs = Array.from({ length: 100 }, (_, i) =>
      Math.sin((i * 2 * Math.PI) / 100),
    );
    const ys = Array.from({ length: 100 }, (_, i) =>
      Math.cos((i * 2 * Math.PI) / 100),
    );
    const r = pearson(xs, ys);
    expect(r).not.toBeNull();
    expect(Math.abs(r!)).toBeLessThan(0.1);
  });

  it("ongelijke lengte → null", () => {
    expect(pearson([1, 2, 3], [1, 2])).toBeNull();
  });

  it("nul-variantie → null", () => {
    expect(pearson([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull();
  });

  it("clamps numerieke output binnen [-1, 1]", () => {
    const r = pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    expect(r).toBeGreaterThanOrEqual(-1);
    expect(r).toBeLessThanOrEqual(1);
  });
});

describe("classifyPair — drempel-classificatie", () => {
  it("cor ≥ 0.85 → highly_correlated", () => {
    expect(classifyPair(0.85)).toBe("highly_correlated");
    expect(classifyPair(0.95)).toBe("highly_correlated");
  });
  it("cor ∈ [0.5, 0.85) → moderately_correlated", () => {
    expect(classifyPair(0.5)).toBe("moderately_correlated");
    expect(classifyPair(0.7)).toBe("moderately_correlated");
  });
  it("|cor| < 0.2 → uncorrelated_diversifier", () => {
    expect(classifyPair(0.1)).toBe("uncorrelated_diversifier");
    expect(classifyPair(-0.15)).toBe("uncorrelated_diversifier");
    expect(classifyPair(0)).toBe("uncorrelated_diversifier");
  });
  it("cor ≤ -0.3 → negatively_correlated", () => {
    expect(classifyPair(-0.3)).toBe("negatively_correlated");
    expect(classifyPair(-0.8)).toBe("negatively_correlated");
  });
});

describe("buildCorrelationReport — orchestrator", () => {
  it("lege input → leeg rapport + warning + disclaimer", () => {
    const r = buildCorrelationReport({
      generatedAt: ASOF,
      lookbackTradingDays: 252,
      assets: [],
    });
    expect(r.assets).toHaveLength(0);
    expect(r.cells).toHaveLength(0);
    expect(r.diversificationScore).toBe(0);
    expect(r.warning).toMatch(/Onvoldoende|niet|geen/i);
    expect(r.disclaimer).toMatch(/correlaties|historisch/i);
  });

  it("filtert assets met < 30 returns uit", () => {
    const dates10 = dateRange(10);
    const r = buildCorrelationReport({
      generatedAt: ASOF,
      lookbackTradingDays: 252,
      assets: [
        {
          asset: asset("A", "A"),
          dailyReturns: Array.from({ length: 10 }, (_, i) => 0.01 * i),
          dates: dates10,
        },
        {
          asset: asset("B", "B"),
          dailyReturns: Array.from({ length: 10 }, (_, i) => 0.01 * i),
          dates: dates10,
        },
      ],
    });
    expect(r.assets).toHaveLength(0);
  });

  it("twee identieke assets → correlation = 1, score = 0", () => {
    const n = 100;
    const dates = dateRange(n);
    const series = Array.from({ length: n }, (_, i) =>
      Math.sin(i * 0.2) * 0.02,
    );
    const r = buildCorrelationReport({
      generatedAt: ASOF,
      lookbackTradingDays: n,
      assets: [
        { asset: asset("A", "A"), dailyReturns: series, dates },
        { asset: asset("B", "B"), dailyReturns: series, dates },
      ],
    });
    expect(r.assets).toHaveLength(2);
    expect(r.cells).toHaveLength(1);
    expect(r.cells[0]!.correlation).toBe(1);
    expect(r.diversificationScore).toBe(0);
    expect(r.diversificationVerdict).toBe("geconcentreerd");
  });

  it("negatief gecorreleerde assets → score richting 100, hedge-insight", () => {
    const n = 100;
    const dates = dateRange(n);
    const s1 = Array.from({ length: n }, (_, i) => Math.sin(i * 0.2) * 0.02);
    const s2 = s1.map((x) => -x); // perfecte negatieve corr
    const r = buildCorrelationReport({
      generatedAt: ASOF,
      lookbackTradingDays: n,
      assets: [
        { asset: asset("A", "Apple"), dailyReturns: s1, dates },
        { asset: asset("B", "Bonds"), dailyReturns: s2, dates },
      ],
    });
    expect(r.cells[0]!.correlation).toBe(-1);
    expect(r.diversificationScore).toBeGreaterThanOrEqual(80);
    expect(r.insights.some((i) => i.kind === "negatively_correlated")).toBe(
      true,
    );
  });

  it("aligned by date — verschillende holiday-skips matchen toch", () => {
    const dates1 = dateRange(60);
    // Asset B mist enkele datums (holidays).
    const dates2 = dates1.filter((_, i) => i % 7 !== 0);
    const s1 = dates1.map((_, i) => Math.sin(i * 0.1) * 0.01);
    const s2 = dates2.map((_, i) => Math.sin(i * 0.1) * 0.01);

    const r = buildCorrelationReport({
      generatedAt: ASOF,
      lookbackTradingDays: 60,
      assets: [
        { asset: asset("A", "A"), dailyReturns: s1, dates: dates1 },
        { asset: asset("B", "B"), dailyReturns: s2, dates: dates2 },
      ],
    });
    expect(r.cells[0]!.correlation).not.toBeNull();
    expect(r.cells[0]!.sampleSize).toBeGreaterThanOrEqual(30);
  });

  it("insight-lijst gesorteerd op |correlation| descending", () => {
    const n = 50;
    const dates = dateRange(n);
    const base = Array.from({ length: n }, (_, i) => Math.sin(i * 0.1) * 0.02);
    const negStrong = base.map((x) => -x);
    const uncorrelated = Array.from({ length: n }, (_, i) =>
      Math.cos(i * 0.7) * 0.02,
    );

    const r = buildCorrelationReport({
      generatedAt: ASOF,
      lookbackTradingDays: n,
      assets: [
        { asset: asset("A", "A"), dailyReturns: base, dates },
        { asset: asset("B", "B"), dailyReturns: negStrong, dates },
        { asset: asset("C", "C"), dailyReturns: uncorrelated, dates },
      ],
    });
    // Eerste insight moet de strongste (negatief, |cor|=1) zijn
    expect(r.insights[0]!.kind).toBe("negatively_correlated");
  });

  it("warning bij weinig bruikbare paren", () => {
    // Eén asset → 0 paren → warning
    const n = 50;
    const dates = dateRange(n);
    const s = dates.map((_, i) => Math.sin(i * 0.1) * 0.01);
    const r = buildCorrelationReport({
      generatedAt: ASOF,
      lookbackTradingDays: n,
      assets: [{ asset: asset("A", "A"), dailyReturns: s, dates }],
    });
    expect(r.warning).not.toBeNull();
  });
});

describe("buildCorrelationCsv — export", () => {
  it("bevat 3 secties + disclaimer", () => {
    const r = buildCorrelationReport({
      generatedAt: ASOF,
      lookbackTradingDays: 252,
      assets: [],
    });
    const csv = buildCorrelationCsv(r);
    expect(csv).toMatch(/Sectie 1: correlation matrix/);
    expect(csv).toMatch(/Sectie 2: top inzichten/);
    expect(csv).toMatch(/DISCLAIMER/);
  });

  it("escape't strings met komma's correct", () => {
    const n = 50;
    const dates = dateRange(n);
    const s = dates.map((_, i) => Math.sin(i * 0.1) * 0.01);
    const r = buildCorrelationReport({
      generatedAt: ASOF,
      lookbackTradingDays: n,
      assets: [
        {
          asset: asset("A", "Naam, met komma", "holding"),
          dailyReturns: s,
          dates,
        },
        { asset: asset("B", "Tweede"), dailyReturns: s, dates },
      ],
    });
    const csv = buildCorrelationCsv(r);
    // De naam moet binnen quotes komen
    expect(csv).toMatch(/"Naam, met komma"/);
  });
});

describe("Module 28 — spec-conformance + risicoanalist-laag", () => {
  it("MIN_SAMPLE_TRADING_DAYS = 30 (vast)", () => {
    expect(MIN_SAMPLE_TRADING_DAYS).toBe(30);
  });

  it("HIGHLY_CORRELATED_THRESHOLD = 0.85 (gepubliceerde quant-conventie)", () => {
    expect(HIGHLY_CORRELATED_THRESHOLD).toBe(0.85);
  });

  it("NEGATIVE_CORRELATED_THRESHOLD = -0.30", () => {
    expect(NEGATIVE_CORRELATED_THRESHOLD).toBe(-0.3);
  });

  it("disclaimer noemt expliciet 'historisch' en 'crises'", () => {
    const r = buildCorrelationReport({
      generatedAt: ASOF,
      lookbackTradingDays: 252,
      assets: [],
    });
    expect(r.disclaimer).toMatch(/historisch/i);
    expect(r.disclaimer).toMatch(/crises|stress/i);
  });
});
