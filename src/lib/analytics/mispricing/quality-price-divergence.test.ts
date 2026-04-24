import { describe, expect, it } from "vitest";

import type { FactorScore } from "@/types/factor";
import type { HistoricalPoint } from "@/types/market";

import { detectQualityPriceDivergence } from "./quality-price-divergence";

const NOW = "2026-04-24T00:00:00.000Z";

function factorScore(
  overrides: Partial<FactorScore["subScores"]> & {
    composite?: number;
    confidence?: number;
  } = {},
): FactorScore {
  return {
    ticker: "X",
    asOf: NOW,
    subScores: {
      quality: overrides.quality ?? 50,
      value: overrides.value ?? 50,
      momentum: overrides.momentum ?? 50,
      lowVol: overrides.lowVol ?? 50,
    },
    composite: overrides.composite ?? 50,
    confidence: overrides.confidence ?? 0.7,
  };
}

function history(days: number, closeAt: (i: number) => number): HistoricalPoint[] {
  const out: HistoricalPoint[] = [];
  const base = new Date("2025-01-01");
  for (let i = 0; i < days; i++) {
    const d = new Date(base.getTime() + i * 24 * 3600 * 1000);
    out.push({ date: d.toISOString().slice(0, 10), close: closeAt(i) });
  }
  return out;
}

describe("detectQualityPriceDivergence — happy paths", () => {
  it("triggert bij quality ≥ 70 en 12m-return ≤ -10%", () => {
    const sig = detectQualityPriceDivergence({
      ticker: "X",
      factorScore: factorScore({ quality: 82 }),
      priceHistory: history(260, (i) => 100 - (i / 260) * 20),
      now: NOW,
    });
    expect(sig).not.toBeNull();
    expect(sig!.type).toBe("quality-price-divergence");
    expect(sig!.mispricingScore).toBeGreaterThan(0);
    expect(sig!.expectedHoldingPeriodDays).toBe(270);
  });

  it("sterker bij diepere drawdown + hoger quality", () => {
    const mild = detectQualityPriceDivergence({
      ticker: "X",
      factorScore: factorScore({ quality: 72 }),
      priceHistory: history(260, (i) => 100 - (i / 260) * 12),
      now: NOW,
    })!;
    const severe = detectQualityPriceDivergence({
      ticker: "X",
      factorScore: factorScore({ quality: 88 }),
      priceHistory: history(260, (i) => 100 - (i / 260) * 30),
      now: NOW,
    })!;
    expect(severe.mispricingScore).toBeGreaterThan(mild.mispricingScore);
    expect(severe.confidence).toBeGreaterThan(mild.confidence);
  });

  it("confidence hoger met historische factor-snapshot", () => {
    const withPrior = detectQualityPriceDivergence({
      ticker: "X",
      factorScore: factorScore({ quality: 82 }),
      priorFactorScore: factorScore({ quality: 80 }),
      priceHistory: history(260, (i) => 100 - (i / 260) * 20),
      now: NOW,
    })!;
    const withoutPrior = detectQualityPriceDivergence({
      ticker: "X",
      factorScore: factorScore({ quality: 82 }),
      priceHistory: history(260, (i) => 100 - (i / 260) * 20),
      now: NOW,
    })!;
    expect(withPrior.confidence).toBeGreaterThan(withoutPrior.confidence);
  });
});

describe("detectQualityPriceDivergence — null-paden", () => {
  it("null bij quality < 70", () => {
    const sig = detectQualityPriceDivergence({
      ticker: "X",
      factorScore: factorScore({ quality: 65 }),
      priceHistory: history(260, (i) => 100 - (i / 260) * 20),
      now: NOW,
    });
    expect(sig).toBeNull();
  });

  it("null bij drawdown kleiner dan -10%", () => {
    const sig = detectQualityPriceDivergence({
      ticker: "X",
      factorScore: factorScore({ quality: 82 }),
      priceHistory: history(260, (i) => 100 + (i / 260) * 5),
      now: NOW,
    });
    expect(sig).toBeNull();
  });

  it("null bij te weinig history", () => {
    const sig = detectQualityPriceDivergence({
      ticker: "X",
      factorScore: factorScore({ quality: 82 }),
      priceHistory: history(100, (i) => 100 - i),
      now: NOW,
    });
    expect(sig).toBeNull();
  });

  it("null bij duidelijke quality-verslechtering t.o.v. prior", () => {
    const sig = detectQualityPriceDivergence({
      ticker: "X",
      factorScore: factorScore({ quality: 72 }),
      priorFactorScore: factorScore({ quality: 88 }), // -16pt → geen divergentie, echte degradatie
      priceHistory: history(260, (i) => 100 - (i / 260) * 20),
      now: NOW,
    });
    expect(sig).toBeNull();
  });
});

describe("detectQualityPriceDivergence — risk-flags", () => {
  it("quality-degradation-unknown flag bij ontbrekende prior", () => {
    const sig = detectQualityPriceDivergence({
      ticker: "X",
      factorScore: factorScore({ quality: 82 }),
      priceHistory: history(260, (i) => 100 - (i / 260) * 20),
      now: NOW,
    })!;
    expect(sig.riskFlags.map((f) => f.code)).toContain(
      "quality-degradation-unknown",
    );
  });

  it("value-trap flag bij quality 70-79 (onder safe-drempel)", () => {
    const sig = detectQualityPriceDivergence({
      ticker: "X",
      factorScore: factorScore({ quality: 72 }),
      priceHistory: history(260, (i) => 100 - (i / 260) * 20),
      now: NOW,
    })!;
    expect(sig.riskFlags.map((f) => f.code)).toContain("value-trap");
  });
});
