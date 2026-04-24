import { describe, expect, it } from "vitest";

import type { FactorScore } from "@/types/factor";
import type { HistoricalPoint } from "@/types/market";

import {
  detectDefensiveBargain,
  detectEarningsSentiment,
  detectEtfCoreRebalance,
  detectMomentumReversal,
  detectQualityPullback,
  detectUnderweightConviction,
  detectValueDislocation,
  detectWatchlistTarget,
} from "./signals";

// ============================================================
//  Helpers — pure fixture-builders
// ============================================================

function factorScore(
  overrides: Partial<FactorScore["subScores"]> & {
    composite?: number;
    confidence?: number;
  } = {},
): FactorScore {
  return {
    ticker: "X",
    asOf: "2026-04-24T00:00:00.000Z",
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

/**
 * Bouw een oplopend-gesorteerde daily history.
 * `days` = 252 geeft ~12m; `pattern` transformeert close per index.
 */
function history(days: number, closeAt: (i: number) => number): HistoricalPoint[] {
  const out: HistoricalPoint[] = [];
  const base = new Date("2025-01-01");
  for (let i = 0; i < days; i++) {
    const d = new Date(base.getTime() + i * 24 * 3600 * 1000);
    out.push({
      date: d.toISOString().slice(0, 10),
      close: closeAt(i),
    });
  }
  return out;
}

// ============================================================
//  1) Quality pullback
// ============================================================

describe("detectQualityPullback", () => {
  it("triggert bij quality ≥ 70 en 3m return ≤ -10%", () => {
    // Koers zakt van 100 → 80 in laatste 63 dagen.
    const h = history(252, (i) => (i < 189 ? 100 : 100 - ((i - 189) / 63) * 20));
    const sig = detectQualityPullback({
      factorScore: factorScore({ quality: 80 }),
      priceHistory: h,
    });
    expect(sig).not.toBeNull();
    expect(sig!.type).toBe("quality-pullback");
    expect(sig!.strength).toBeGreaterThan(0);
    expect(sig!.rationale.some((r) => r.toLowerCase().includes("quality"))).toBe(
      true,
    );
    expect(sig!.riskNote).toMatch(/pullback/i);
  });

  it("triggert bij lager 52-weeks high (-15%) zelfs zonder 3m drawdown", () => {
    // High van ~120 halverwege, zakt daarna naar 100 (= -17% van high).
    const h = history(252, (i) => (i < 126 ? 80 + (i / 126) * 40 : 120 - ((i - 126) / 126) * 20));
    const sig = detectQualityPullback({
      factorScore: factorScore({ quality: 78 }),
      priceHistory: h,
    });
    expect(sig).not.toBeNull();
    expect(sig!.rationale.some((r) => /52.?weeks?-high/i.test(r))).toBe(true);
  });

  it("retourneert null bij quality < 70", () => {
    const h = history(252, () => 100);
    expect(
      detectQualityPullback({
        factorScore: factorScore({ quality: 65 }),
        priceHistory: h,
      }),
    ).toBeNull();
  });

  it("retourneert null zonder history", () => {
    expect(
      detectQualityPullback({
        factorScore: factorScore({ quality: 85 }),
        priceHistory: [],
      }),
    ).toBeNull();
  });

  it("retourneert null zonder trigger (hoge quality, geen drawdown)", () => {
    const h = history(252, (i) => 100 + i * 0.1); // mild stijgend
    expect(
      detectQualityPullback({
        factorScore: factorScore({ quality: 80 }),
        priceHistory: h,
      }),
    ).toBeNull();
  });
});

// ============================================================
//  2) Value dislocation
// ============================================================

describe("detectValueDislocation", () => {
  it("triggert bij value ≥ 65 AND momentum ≤ 45", () => {
    const sig = detectValueDislocation({
      factorScore: factorScore({ value: 75, momentum: 35 }),
    });
    expect(sig).not.toBeNull();
    expect(sig!.strength).toBeGreaterThan(0);
    expect(sig!.rationale.some((r) => r.toLowerCase().includes("value"))).toBe(true);
  });

  it("sterker bij grotere value-momentum spread", () => {
    const narrow = detectValueDislocation({
      factorScore: factorScore({ value: 66, momentum: 44 }),
    });
    const wide = detectValueDislocation({
      factorScore: factorScore({ value: 90, momentum: 20 }),
    });
    expect(wide!.strength).toBeGreaterThan(narrow!.strength);
  });

  it("retourneert null bij lage value", () => {
    expect(
      detectValueDislocation({
        factorScore: factorScore({ value: 55, momentum: 40 }),
      }),
    ).toBeNull();
  });

  it("retourneert null bij hoge momentum (al door markt herontdekt)", () => {
    expect(
      detectValueDislocation({
        factorScore: factorScore({ value: 80, momentum: 60 }),
      }),
    ).toBeNull();
  });
});

// ============================================================
//  3) Momentum reversal
// ============================================================

describe("detectMomentumReversal", () => {
  it("triggert bij 12m negatief en 3m positief", () => {
    // Koers: 100 → 70 in eerste 189 dagen, daarna 70 → 85 in laatste 63 dagen.
    const h = history(252, (i) =>
      i < 189
        ? 100 - (i / 189) * 30
        : 70 + ((i - 189) / 63) * 15,
    );
    const sig = detectMomentumReversal({ priceHistory: h });
    expect(sig).not.toBeNull();
    expect(sig!.type).toBe("momentum-reversal");
    expect(sig!.strength).toBeGreaterThan(0);
    expect(sig!.strength).toBeLessThanOrEqual(75); // plafond
  });

  it("niet triggert bij 12m positief", () => {
    const h = history(252, (i) => 100 + (i / 252) * 30);
    expect(detectMomentumReversal({ priceHistory: h })).toBeNull();
  });

  it("niet triggert bij 3m ook negatief (geen reversal)", () => {
    const h = history(252, (i) => 100 - (i / 252) * 30);
    expect(detectMomentumReversal({ priceHistory: h })).toBeNull();
  });

  it("null bij te weinig history", () => {
    const h = history(100, (i) => 100 - i);
    expect(detectMomentumReversal({ priceHistory: h })).toBeNull();
  });
});

// ============================================================
//  4) Watchlist target
// ============================================================

describe("detectWatchlistTarget", () => {
  it("triggert wanneer koers ≤ target (BUY signal)", () => {
    const sig = detectWatchlistTarget({ targetPrice: 100, currentPrice: 92 });
    expect(sig).not.toBeNull();
    expect(sig!.confidence).toBe("HIGH");
    expect(sig!.strength).toBeGreaterThanOrEqual(80);
  });

  it("binnen 5% marge boven target telt nog", () => {
    const sig = detectWatchlistTarget({ targetPrice: 100, currentPrice: 103 });
    expect(sig).not.toBeNull();
    expect(sig!.strength).toBeGreaterThanOrEqual(40);
    expect(sig!.strength).toBeLessThan(80);
  });

  it("niet triggert ver boven target", () => {
    expect(
      detectWatchlistTarget({ targetPrice: 100, currentPrice: 120 }),
    ).toBeNull();
  });

  it("null bij ontbrekend target of negatieve prijs", () => {
    expect(detectWatchlistTarget({ targetPrice: null, currentPrice: 80 })).toBeNull();
    expect(detectWatchlistTarget({ targetPrice: 100, currentPrice: null })).toBeNull();
    expect(detectWatchlistTarget({ targetPrice: 0, currentPrice: 50 })).toBeNull();
  });
});

// ============================================================
//  5) Underweight high conviction
// ============================================================

describe("detectUnderweightConviction", () => {
  it("triggert bij composite ≥ 70 én currentWeight ≤ 70% van target", () => {
    const sig = detectUnderweightConviction({
      factorScore: factorScore({ composite: 78, confidence: 0.8 }),
      currentWeight: 0.02,
      targetWeight: 0.08,
    });
    expect(sig).not.toBeNull();
    expect(sig!.confidence).toBe("HIGH");
    expect(sig!.rationale.some((r) => /Composite/i.test(r))).toBe(true);
  });

  it("niet triggert bij lage composite", () => {
    expect(
      detectUnderweightConviction({
        factorScore: factorScore({ composite: 60 }),
        currentWeight: 0.02,
        targetWeight: 0.08,
      }),
    ).toBeNull();
  });

  it("niet triggert bij voldoende gewicht", () => {
    expect(
      detectUnderweightConviction({
        factorScore: factorScore({ composite: 80 }),
        currentWeight: 0.06,
        targetWeight: 0.08,
      }),
    ).toBeNull();
  });

  it("MEDIUM confidence bij lage factor-confidence", () => {
    const sig = detectUnderweightConviction({
      factorScore: factorScore({ composite: 78, confidence: 0.4 }),
      currentWeight: 0.02,
      targetWeight: 0.08,
    });
    expect(sig?.confidence).toBe("MEDIUM");
  });
});

// ============================================================
//  6) ETF core rebalance
// ============================================================

describe("detectEtfCoreRebalance", () => {
  it("triggert bij broad-market ETF met underweight < 90% van target", () => {
    const sig = detectEtfCoreRebalance({
      isBroadMarketEtf: true,
      currentWeight: 0.25,
      targetWeight: 0.40,
    });
    expect(sig).not.toBeNull();
    expect(sig!.confidence).toBe("HIGH");
  });

  it("niet triggert wanneer niet broad-market ETF", () => {
    expect(
      detectEtfCoreRebalance({
        isBroadMarketEtf: false,
        currentWeight: 0.1,
        targetWeight: 0.4,
      }),
    ).toBeNull();
  });

  it("niet triggert als al bijna op target (≥ 90%)", () => {
    expect(
      detectEtfCoreRebalance({
        isBroadMarketEtf: true,
        currentWeight: 0.38,
        targetWeight: 0.40,
      }),
    ).toBeNull();
  });
});

// ============================================================
//  7) Defensive bargain
// ============================================================

describe("detectDefensiveBargain", () => {
  it("triggert bij lowVol ≥ 70 AND 3m return ≤ -8%", () => {
    const h = history(252, (i) => (i < 189 ? 100 : 100 - ((i - 189) / 63) * 12));
    const sig = detectDefensiveBargain({
      factorScore: factorScore({ lowVol: 75 }),
      priceHistory: h,
    });
    expect(sig).not.toBeNull();
    expect(sig!.type).toBe("defensive-bargain");
  });

  it("extra sterkte in DEFENSIVE regime", () => {
    const h = history(252, (i) => (i < 189 ? 100 : 100 - ((i - 189) / 63) * 12));
    const noRegime = detectDefensiveBargain({
      factorScore: factorScore({ lowVol: 75 }),
      priceHistory: h,
    });
    const defensive = detectDefensiveBargain({
      factorScore: factorScore({ lowVol: 75 }),
      priceHistory: h,
      regime: {
        asOf: "2026-04-24T00:00:00.000Z",
        score: 25,
        stance: "DEFENSIVE",
        confidence: 0.8,
        narrative: "test",
        subDrivers: [],
      },
    });
    expect(defensive!.strength).toBeGreaterThan(noRegime!.strength);
    expect(defensive!.confidence === "HIGH" || defensive!.confidence === "MEDIUM").toBe(
      true,
    );
  });

  it("null bij lowVol te laag", () => {
    const h = history(252, (i) => (i < 189 ? 100 : 90));
    expect(
      detectDefensiveBargain({
        factorScore: factorScore({ lowVol: 55 }),
        priceHistory: h,
      }),
    ).toBeNull();
  });
});

// ============================================================
//  8) Earnings / sentiment placeholder
// ============================================================

describe("detectEarningsSentiment", () => {
  it("retourneert altijd null zolang er geen earnings-feed is", () => {
    expect(detectEarningsSentiment()).toBeNull();
  });
});
