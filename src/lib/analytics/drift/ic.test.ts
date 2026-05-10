import { describe, expect, it } from "vitest";

import { buildDriftNarrative, computeFactorIc } from "./ic";

describe("computeFactorIc — basics", () => {
  it("perfect positieve correlatie → IC ≈ 1", () => {
    const r = computeFactorIc([
      { factorScore: 80, realizedReturn: 0.20 },
      { factorScore: 60, realizedReturn: 0.10 },
      { factorScore: 40, realizedReturn: 0.05 },
      { factorScore: 20, realizedReturn: -0.10 },
      { factorScore: 10, realizedReturn: -0.20 },
    ]);
    expect(r).not.toBeNull();
    expect(r!.ic).toBeCloseTo(1, 1);
    expect(r!.hitRate).toBe(1);
    expect(r!.sampleSize).toBe(5);
  });

  it("perfect negatieve correlatie → IC ≈ -1", () => {
    const r = computeFactorIc([
      { factorScore: 80, realizedReturn: -0.20 },
      { factorScore: 60, realizedReturn: -0.10 },
      { factorScore: 40, realizedReturn: 0.05 },
      { factorScore: 20, realizedReturn: 0.10 },
      { factorScore: 10, realizedReturn: 0.20 },
    ]);
    expect(r!.ic).toBeCloseTo(-1, 1);
  });

  it("random correlatie → IC ≈ 0", () => {
    const r = computeFactorIc([
      { factorScore: 80, realizedReturn: 0.05 },
      { factorScore: 60, realizedReturn: -0.05 },
      { factorScore: 40, realizedReturn: 0.05 },
      { factorScore: 20, realizedReturn: -0.05 },
      { factorScore: 10, realizedReturn: 0.0 },
    ]);
    expect(Math.abs(r!.ic)).toBeLessThan(0.6);
  });

  it("sample-size onder drempel → null", () => {
    const r = computeFactorIc([
      { factorScore: 80, realizedReturn: 0.10 },
      { factorScore: 60, realizedReturn: 0.05 },
    ]);
    expect(r).toBeNull();
  });

  it("filtered NaN/Infinity uit de input — sample-size telt alleen valide rijen", () => {
    const r = computeFactorIc([
      { factorScore: 80, realizedReturn: 0.20 },
      { factorScore: 70, realizedReturn: 0.15 },
      { factorScore: 60, realizedReturn: Number.NaN },
      { factorScore: 50, realizedReturn: 0.08 },
      { factorScore: 40, realizedReturn: 0.05 },
      { factorScore: 30, realizedReturn: -0.05 },
      { factorScore: 20, realizedReturn: -0.10 },
      { factorScore: 10, realizedReturn: -0.20 },
      { factorScore: Number.POSITIVE_INFINITY, realizedReturn: 0.5 },
    ]);
    expect(r).not.toBeNull();
    expect(r!.sampleSize).toBe(7);
  });

  it("ties in scores worden correct gerangd (geen artificial IC=1)", () => {
    const r = computeFactorIc([
      { factorScore: 50, realizedReturn: 0.10 },
      { factorScore: 50, realizedReturn: 0.05 },
      { factorScore: 50, realizedReturn: -0.05 },
      { factorScore: 50, realizedReturn: -0.10 },
      { factorScore: 50, realizedReturn: 0.0 },
    ]);
    // Alle factor-scores gelijk → geen variantie → IC = 0
    expect(r!.ic).toBe(0);
  });
});

describe("buildDriftNarrative", () => {
  it("hoge IC → 'sterk signaal'", () => {
    const n = buildDriftNarrative({
      factor: "quality",
      window: "12m",
      ic: 0.15,
      hitRate: 0.62,
    });
    expect(n).toMatch(/sterk signaal/i);
  });

  it("near-zero IC → 'drift'", () => {
    const n = buildDriftNarrative({
      factor: "value",
      window: "12m",
      ic: 0.01,
      hitRate: 0.50,
    });
    expect(n).toMatch(/niet meer voorspellend|drift/i);
  });

  it("sterk negatieve IC → 'omgekeerd'", () => {
    const n = buildDriftNarrative({
      factor: "momentum",
      window: "6m",
      ic: -0.15,
      hitRate: 0.40,
    });
    expect(n).toMatch(/omgekeerd/i);
  });

  it("matige IC → 'gemengd signaal'", () => {
    const n = buildDriftNarrative({
      factor: "lowVol",
      window: "12m",
      ic: 0.05,
      hitRate: 0.52,
    });
    expect(n).toMatch(/gemengd/i);
  });
});
