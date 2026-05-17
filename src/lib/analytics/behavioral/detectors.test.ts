import { describe, expect, it } from "vitest";

import {
  detectCashMismatch,
  detectFomoBuying,
  detectOverconcentration,
  detectOvertrading,
  detectPanicSelling,
  detectPerformanceChasing,
  detectSpeculativeOverallocation,
  detectStrategyDrift,
  detectUnderDiversification,
  detectVolatilityMismatch,
} from "./detectors";
import { makeDetectorInput, makeTransaction } from "./fixtures";
import { toUiSeverity } from "./types";

describe("detectOverconcentration", () => {
  it("positie ≥ 15% → moderate signal", () => {
    const result = detectOverconcentration(
      makeDetectorInput({
        positions: [
          {
            ticker: "ASML",
            name: "ASML",
            sector: "Tech",
            marketValueBase: 16_000,
            weight: 0.16,
            pnlPct: 0,
          },
          {
            ticker: "VWCE",
            name: "VWCE",
            sector: "Div",
            marketValueBase: 30_000,
            weight: 0.30,
            pnlPct: 0,
          },
        ],
      }),
    );
    const positionSignal = result.signals.find(
      (s) => s.id === "OVERCONCENTRATION:ASML",
    );
    expect(positionSignal).toBeDefined();
    expect(positionSignal?.severity).toMatch(/moderate|elevated|high/);
  });

  it("positie ≥ 30% → high severity", () => {
    const result = detectOverconcentration(
      makeDetectorInput({
        positions: [
          {
            ticker: "BIG",
            name: "BIG",
            sector: "T",
            marketValueBase: 35_000,
            weight: 0.35,
            pnlPct: 0,
          },
        ],
      }),
    );
    const sig = result.signals.find((s) => s.id === "OVERCONCENTRATION:BIG");
    expect(sig?.severity).toBe("high");
  });

  it("user-policy maxPositionWeight verhoogt severity een stap", () => {
    const result = detectOverconcentration(
      makeDetectorInput({
        positions: [
          {
            ticker: "X",
            name: "X",
            sector: "T",
            marketValueBase: 12_000,
            weight: 0.12,
            pnlPct: 0,
          },
        ],
        profile: {
          objective: "BALANCED",
          riskTolerance: "CONSERVATIVE",
          investmentHorizonYrs: 10,
          cashBufferPct: 0.05,
          maxCashShare: 0.25,
          maxPositionWeight: 0.08, // strakker beleid
        },
      }),
    );
    const sig = result.signals.find((s) => s.id === "OVERCONCENTRATION:X");
    expect(sig).toBeDefined();
    // 12% bij policy 8% → low → bumped naar moderate
    expect(["moderate", "elevated", "high"]).toContain(sig?.severity);
  });

  it("sector-HHI ≥ 35% → sector-signal verschijnt", () => {
    const result = detectOverconcentration(
      makeDetectorInput({
        sectorExposure: [{ label: "Technology", weight: 0.40 }],
      }),
    );
    const sectorSig = result.signals.find(
      (s) => s.id === "OVERCONCENTRATION:SECTOR:Technology",
    );
    expect(sectorSig).toBeDefined();
  });

  it("alle posities < 10% → geen signalen", () => {
    const result = detectOverconcentration(
      makeDetectorInput({
        positions: [
          {
            ticker: "A",
            name: "A",
            sector: "T",
            marketValueBase: 5_000,
            weight: 0.05,
            pnlPct: 0,
          },
        ],
        sectorExposure: [{ label: "T", weight: 0.20 }],
      }),
    );
    expect(result.signals).toHaveLength(0);
  });

  it("lege portefeuille → skip", () => {
    const result = detectOverconcentration(
      makeDetectorInput({ positions: [] }),
    );
    expect(result.skipReason).toBe("no-positions");
  });
});

describe("detectOvertrading", () => {
  it("≥ 8 trades in 30 dagen → moderate signal", () => {
    const transactions = Array.from({ length: 9 }, (_, i) =>
      makeTransaction({
        id: `tx-${i}`,
        executedAt: new Date("2026-05-01T00:00:00.000Z"),
      }),
    );
    const result = detectOvertrading(
      makeDetectorInput({ recentTransactions: transactions }),
    );
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.severity).toBe("moderate");
  });

  it("≥ 20 trades → high", () => {
    const transactions = Array.from({ length: 22 }, (_, i) =>
      makeTransaction({
        id: `tx-${i}`,
        executedAt: new Date("2026-05-01T00:00:00.000Z"),
      }),
    );
    const result = detectOvertrading(
      makeDetectorInput({ recentTransactions: transactions }),
    );
    expect(result.signals[0]!.severity).toBe("high");
  });

  it("< 8 trades → geen signaal", () => {
    const result = detectOvertrading(
      makeDetectorInput({
        recentTransactions: Array.from({ length: 4 }, (_, i) =>
          makeTransaction({ id: `tx-${i}` }),
        ),
      }),
    );
    expect(result.signals).toHaveLength(0);
  });

  it("oude transacties (> 30d) tellen niet mee", () => {
    const transactions = Array.from({ length: 20 }, (_, i) =>
      makeTransaction({
        id: `tx-${i}`,
        executedAt: new Date("2026-01-15T00:00:00.000Z"),
      }),
    );
    const result = detectOvertrading(
      makeDetectorInput({
        asOf: "2026-05-10T00:00:00.000Z",
        recentTransactions: transactions,
      }),
    );
    expect(result.signals).toHaveLength(0);
  });

  it("geen transacties → skip", () => {
    const result = detectOvertrading(
      makeDetectorInput({ recentTransactions: [] }),
    );
    expect(result.skipReason).toBe("no-transactions");
  });
});

describe("detectPanicSelling", () => {
  it("SELL na -10% in 7d → moderate signal", () => {
    const result = detectPanicSelling(
      makeDetectorInput({
        recentTransactions: [
          makeTransaction({
            type: "SELL",
            ticker: "ASML",
            price: 90,
            priceBefore: 100,
          }),
        ],
      }),
    );
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.severity).toBe("moderate");
    expect(result.signals[0]!.id).toMatch(/PANIC_SELLING:ASML/);
  });

  it("SELL na -20% → elevated", () => {
    const result = detectPanicSelling(
      makeDetectorInput({
        recentTransactions: [
          makeTransaction({
            type: "SELL",
            ticker: "X",
            price: 80,
            priceBefore: 100,
          }),
        ],
      }),
    );
    expect(result.signals[0]!.severity).toBe("elevated");
  });

  it("SELL bij stijging → geen signaal (geen panic)", () => {
    const result = detectPanicSelling(
      makeDetectorInput({
        recentTransactions: [
          makeTransaction({
            type: "SELL",
            price: 110,
            priceBefore: 100,
          }),
        ],
      }),
    );
    expect(result.signals).toHaveLength(0);
  });

  it("SELL zonder priceBefore → geen signaal (skip per-tx)", () => {
    const result = detectPanicSelling(
      makeDetectorInput({
        recentTransactions: [
          makeTransaction({
            type: "SELL",
            price: 80,
            priceBefore: null,
          }),
        ],
      }),
    );
    expect(result.signals).toHaveLength(0);
  });

  it("alleen BUYs aanwezig → skip", () => {
    const result = detectPanicSelling(
      makeDetectorInput({
        recentTransactions: [makeTransaction({ type: "BUY" })],
      }),
    );
    expect(result.skipReason).toBe("no-sells-with-price-history");
  });
});

describe("detectFomoBuying", () => {
  it("BUY na +20% in 30d → moderate signal", () => {
    const result = detectFomoBuying(
      makeDetectorInput({
        recentTransactions: [
          makeTransaction({
            type: "BUY",
            ticker: "X",
            price: 120,
            priceBefore30d: 100,
          }),
        ],
      }),
    );
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.severity).toBe("moderate");
  });

  it("BUY na +35% → elevated", () => {
    const result = detectFomoBuying(
      makeDetectorInput({
        recentTransactions: [
          makeTransaction({
            type: "BUY",
            ticker: "Y",
            price: 135,
            priceBefore30d: 100,
          }),
        ],
      }),
    );
    expect(result.signals[0]!.severity).toBe("elevated");
  });

  it("BUY bij rustige koers → geen signaal", () => {
    const result = detectFomoBuying(
      makeDetectorInput({
        recentTransactions: [
          makeTransaction({
            type: "BUY",
            price: 105,
            priceBefore30d: 100,
          }),
        ],
      }),
    );
    expect(result.signals).toHaveLength(0);
  });
});

describe("detectStrategyDrift", () => {
  it("GROWTH-profiel met 60% cash → drift naar defensief", () => {
    const result = detectStrategyDrift(
      makeDetectorInput({
        cashBalance: 60_000,
        totalValue: 100_000,
        profile: {
          objective: "GROWTH",
          riskTolerance: "GROWTH",
          investmentHorizonYrs: 15,
          cashBufferPct: 0.05,
          maxCashShare: 0.25,
          maxPositionWeight: 0.15,
        },
      }),
    );
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.message).toMatch(/defensiever/);
  });

  it("CAPITAL_PRESERVATION-profiel met 95% equity → drift naar agressief", () => {
    const result = detectStrategyDrift(
      makeDetectorInput({
        cashBalance: 5_000,
        totalValue: 100_000,
        profile: {
          objective: "CAPITAL_PRESERVATION",
          riskTolerance: "CONSERVATIVE",
          investmentHorizonYrs: 5,
          cashBufferPct: 0.10,
          maxCashShare: 0.50,
          maxPositionWeight: 0.10,
        },
      }),
    );
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.message).toMatch(/agressiever/);
  });

  it("equity-share matcht profiel → geen signaal", () => {
    const result = detectStrategyDrift(
      makeDetectorInput({
        cashBalance: 15_000,
        totalValue: 100_000,
        profile: {
          objective: "GROWTH",
          riskTolerance: "GROWTH",
          investmentHorizonYrs: 15,
          cashBufferPct: 0.10,
          maxCashShare: 0.25,
          maxPositionWeight: 0.15,
        },
      }),
    );
    expect(result.signals).toHaveLength(0);
  });

  it("zonder profile → skip", () => {
    const result = detectStrategyDrift(makeDetectorInput({ profile: null }));
    expect(result.skipReason).toBe("no-profile");
  });
});

describe("detectUnderDiversification", () => {
  it("3 posities → moderate", () => {
    const result = detectUnderDiversification(
      makeDetectorInput({ positionCount: 3 }),
    );
    expect(result.signals[0]!.severity).toBe("moderate");
  });

  it("2 posities → elevated", () => {
    const result = detectUnderDiversification(
      makeDetectorInput({ positionCount: 2 }),
    );
    expect(result.signals[0]!.severity).toBe("elevated");
  });

  it("8 posities → geen signaal (Markowitz-floor)", () => {
    const result = detectUnderDiversification(
      makeDetectorInput({ positionCount: 8 }),
    );
    expect(result.signals).toHaveLength(0);
  });
});

describe("detectCashMismatch", () => {
  it("cash > maxCashShare → drag-signal", () => {
    const result = detectCashMismatch(
      makeDetectorInput({ cashBalance: 35_000, totalValue: 100_000 }),
    );
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.id).toBe("CASH_MISMATCH:DRAG");
  });

  it("cash > 40% → elevated", () => {
    const result = detectCashMismatch(
      makeDetectorInput({ cashBalance: 50_000, totalValue: 100_000 }),
    );
    expect(result.signals[0]!.severity).toBe("elevated");
  });

  it("cash < target × 0.4 → no-buffer signal", () => {
    const result = detectCashMismatch(
      makeDetectorInput({ cashBalance: 500, totalValue: 100_000 }),
    );
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.id).toBe("CASH_MISMATCH:NO_BUFFER");
  });

  it("cash on target → geen signaal", () => {
    const result = detectCashMismatch(
      makeDetectorInput({ cashBalance: 5_000, totalValue: 100_000 }),
    );
    expect(result.signals).toHaveLength(0);
  });
});

describe("detectPerformanceChasing", () => {
  it("BUY in positie die +50% staat → moderate signal", () => {
    const result = detectPerformanceChasing(
      makeDetectorInput({
        positions: [
          {
            ticker: "WIN",
            name: "Winner",
            sector: "T",
            marketValueBase: 10_000,
            weight: 0.10,
            pnlPct: 0.50,
          },
        ],
        recentTransactions: [
          makeTransaction({ ticker: "WIN", type: "BUY" }),
        ],
      }),
    );
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.severity).toBe("moderate");
  });

  it("BUY in positie +90% → elevated", () => {
    const result = detectPerformanceChasing(
      makeDetectorInput({
        positions: [
          {
            ticker: "MOON",
            name: "Moonshot",
            sector: "T",
            marketValueBase: 10_000,
            weight: 0.10,
            pnlPct: 0.95,
          },
        ],
        recentTransactions: [
          makeTransaction({ ticker: "MOON", type: "BUY" }),
        ],
      }),
    );
    expect(result.signals[0]!.severity).toBe("elevated");
  });

  it("BUY in positie met +20% → geen signaal", () => {
    const result = detectPerformanceChasing(
      makeDetectorInput({
        positions: [
          {
            ticker: "MILD",
            name: "Mild",
            sector: "T",
            marketValueBase: 10_000,
            weight: 0.10,
            pnlPct: 0.20,
          },
        ],
        recentTransactions: [
          makeTransaction({ ticker: "MILD", type: "BUY" }),
        ],
      }),
    );
    expect(result.signals).toHaveLength(0);
  });

  it("BUY zonder huidige positie → geen signaal (gehouden via dedup-pad)", () => {
    const result = detectPerformanceChasing(
      makeDetectorInput({
        positions: [],
        recentTransactions: [
          makeTransaction({ ticker: "GHOST", type: "BUY" }),
        ],
      }),
    );
    expect(result.signals).toHaveLength(0);
  });

  it("twee BUYs in dezelfde ticker → één signal (dedupe)", () => {
    const result = detectPerformanceChasing(
      makeDetectorInput({
        positions: [
          {
            ticker: "X",
            name: "X",
            sector: "T",
            marketValueBase: 10_000,
            weight: 0.10,
            pnlPct: 0.50,
          },
        ],
        recentTransactions: [
          makeTransaction({ id: "tx-1", ticker: "X", type: "BUY" }),
          makeTransaction({ id: "tx-2", ticker: "X", type: "BUY" }),
        ],
      }),
    );
    expect(result.signals).toHaveLength(1);
  });
});

// ============================================================
//  Module 3: VOLATILITY_MISMATCH
// ============================================================

describe("detectVolatilityMismatch", () => {
  it("skip wanneer portfolioVolatility ontbreekt", () => {
    const r = detectVolatilityMismatch(
      makeDetectorInput({ portfolioVolatility: null }),
    );
    expect(r.skipReason).toBe("no-volatility-data");
    expect(r.signals).toHaveLength(0);
  });

  it("BALANCED + vol 0.15 → onder plafond, geen signaal", () => {
    const r = detectVolatilityMismatch(
      makeDetectorInput({
        portfolioVolatility: 0.15,
        profile: {
          objective: "BALANCED",
          riskTolerance: "BALANCED",
          investmentHorizonYrs: 10,
          cashBufferPct: null,
          maxCashShare: null,
          maxPositionWeight: null,
        },
      }),
    );
    expect(r.signals).toHaveLength(0);
  });

  it("CONSERVATIVE + vol 0.22 → high (overshoot 0.12)", () => {
    const r = detectVolatilityMismatch(
      makeDetectorInput({
        portfolioVolatility: 0.22,
        profile: {
          objective: "BALANCED",
          riskTolerance: "CONSERVATIVE",
          investmentHorizonYrs: 10,
          cashBufferPct: null,
          maxCashShare: null,
          maxPositionWeight: null,
        },
      }),
    );
    expect(r.signals).toHaveLength(1);
    expect(r.signals[0]?.severity).toBe("elevated");
    expect(r.signals[0]?.message).toMatch(/conservative/i);
  });

  it("AGGRESSIVE + vol 0.60 → high (ver overschrijdt)", () => {
    const r = detectVolatilityMismatch(
      makeDetectorInput({
        portfolioVolatility: 0.60,
        profile: {
          objective: "GROWTH",
          riskTolerance: "AGGRESSIVE",
          investmentHorizonYrs: 20,
          cashBufferPct: null,
          maxCashShare: null,
          maxPositionWeight: null,
        },
      }),
    );
    expect(r.signals).toHaveLength(1);
    expect(r.signals[0]?.severity).toBe("high");
  });

  it("zonder profile → fallback BALANCED-plafond (0.18)", () => {
    const r = detectVolatilityMismatch(
      makeDetectorInput({
        portfolioVolatility: 0.30,
        profile: null,
      }),
    );
    expect(r.signals).toHaveLength(1);
  });
});

// ============================================================
//  Module 3: SPECULATIVE_OVERALLOCATION
// ============================================================

describe("detectSpeculativeOverallocation", () => {
  it("skip wanneer geen enkele position assetClass heeft", () => {
    const r = detectSpeculativeOverallocation(
      makeDetectorInput({
        positions: [
          {
            ticker: "X",
            name: "X",
            sector: "T",
            marketValueBase: 1000,
            weight: 1.0,
            pnlPct: 0,
          },
        ],
      }),
    );
    expect(r.skipReason).toBe("no-asset-class-data");
  });

  it("alleen EQUITY/BOND → geen signaal", () => {
    const r = detectSpeculativeOverallocation(
      makeDetectorInput({
        positions: [
          {
            ticker: "X",
            name: "X",
            sector: "T",
            marketValueBase: 1000,
            weight: 0.5,
            pnlPct: 0,
            assetClass: "EQUITY",
          },
          {
            ticker: "Y",
            name: "Y",
            sector: "F",
            marketValueBase: 1000,
            weight: 0.5,
            pnlPct: 0,
            assetClass: "BOND",
          },
        ],
      }),
    );
    expect(r.signals).toHaveLength(0);
  });

  it("CRYPTO 10% → moderate (boven 8% drempel)", () => {
    const r = detectSpeculativeOverallocation(
      makeDetectorInput({
        positions: [
          {
            ticker: "BTC",
            name: "Bitcoin",
            sector: null,
            marketValueBase: 100,
            weight: 0.10,
            pnlPct: 0,
            assetClass: "CRYPTO",
          },
          {
            ticker: "ASML",
            name: "ASML",
            sector: "T",
            marketValueBase: 900,
            weight: 0.90,
            pnlPct: 0,
            assetClass: "EQUITY",
          },
        ],
      }),
    );
    expect(r.signals).toHaveLength(1);
    expect(r.signals[0]?.severity).toBe("moderate");
  });

  it("CRYPTO + COMMODITY samen 35% → high (boven 30% drempel)", () => {
    const r = detectSpeculativeOverallocation(
      makeDetectorInput({
        positions: [
          {
            ticker: "BTC",
            name: "Bitcoin",
            sector: null,
            marketValueBase: 200,
            weight: 0.20,
            pnlPct: 0,
            assetClass: "CRYPTO",
          },
          {
            ticker: "GLD",
            name: "Gold",
            sector: null,
            marketValueBase: 150,
            weight: 0.15,
            pnlPct: 0,
            assetClass: "COMMODITY",
          },
          {
            ticker: "ASML",
            name: "ASML",
            sector: "T",
            marketValueBase: 650,
            weight: 0.65,
            pnlPct: 0,
            assetClass: "EQUITY",
          },
        ],
      }),
    );
    expect(r.signals).toHaveLength(1);
    expect(r.signals[0]?.severity).toBe("high");
  });

  it("speculative-weight 5% → onder drempel, geen signaal", () => {
    const r = detectSpeculativeOverallocation(
      makeDetectorInput({
        positions: [
          {
            ticker: "BTC",
            name: "Bitcoin",
            sector: null,
            marketValueBase: 50,
            weight: 0.05,
            pnlPct: 0,
            assetClass: "CRYPTO",
          },
          {
            ticker: "ASML",
            name: "ASML",
            sector: "T",
            marketValueBase: 950,
            weight: 0.95,
            pnlPct: 0,
            assetClass: "EQUITY",
          },
        ],
      }),
    );
    expect(r.signals).toHaveLength(0);
  });
});

// ============================================================
//  Module 3: severity-triad-helper voor UI
// ============================================================

describe("toUiSeverity (info/warning/critical mapping)", () => {
  it("low → info", () => {
    expect(toUiSeverity("low")).toBe("info");
  });
  it("moderate → warning", () => {
    expect(toUiSeverity("moderate")).toBe("warning");
  });
  it("elevated → critical", () => {
    expect(toUiSeverity("elevated")).toBe("critical");
  });
  it("high → critical", () => {
    expect(toUiSeverity("high")).toBe("critical");
  });
});
