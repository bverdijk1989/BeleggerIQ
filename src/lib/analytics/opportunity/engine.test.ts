import { describe, expect, it } from "vitest";

import type { FactorScore } from "@/types/factor";
import type { HistoricalPoint } from "@/types/market";

import { scanOpportunityRadar } from "./engine";

const NOW = "2026-04-25T00:00:00.000Z";

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

function priceHistory(
  days: number,
  closeAt: (i: number) => number,
): HistoricalPoint[] {
  const out: HistoricalPoint[] = [];
  const base = new Date("2025-01-01");
  for (let i = 0; i < days; i++) {
    const d = new Date(base.getTime() + i * 24 * 3600 * 1000);
    out.push({ date: d.toISOString().slice(0, 10), close: closeAt(i) });
  }
  return out;
}

describe("scanOpportunityRadar — adapter", () => {
  it("retourneert lege lijst bij lege input", () => {
    const r = scanOpportunityRadar({ portfolio: [] });
    expect(r.results).toEqual([]);
    expect(r.countByType.QUALITY_PULLBACK).toBe(0);
  });

  it("transformeert quality-pullback → QUALITY_PULLBACK met juiste shape", () => {
    // Hoge quality + 12m drawdown → quality-pullback signaal
    const hist = priceHistory(252, (i) =>
      i < 189 ? 100 : 100 - ((i - 189) / 63) * 20,
    );
    const r = scanOpportunityRadar({
      portfolio: [
        {
          ticker: "ASML",
          name: "ASML Holding",
          factorScore: factorScore({ quality: 85, composite: 70 }),
          priceHistory: hist,
        },
      ],
    });
    expect(r.results.length).toBe(1);
    const result = r.results[0]!;
    expect(result.symbol).toBe("ASML");
    expect(result.opportunityType).toBe("QUALITY_PULLBACK");
    expect(result.score).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.expectedHorizon).toBe("6-18 maanden");
    expect(["LOW", "MEDIUM", "HIGH"]).toContain(result.riskLevel);
    expect(result.rationale.length).toBeGreaterThan(0);
  });

  it("filtert kandidaten zonder publiek signaal", () => {
    // Watchlist-target is niet publiek geëxposeerd via deze adapter.
    const r = scanOpportunityRadar({
      watchlist: [
        {
          item: {
            id: "w1",
            userId: "u1",
            ticker: "AAPL",
            targetPrice: 200,
            addedAt: NOW,
            updatedAt: NOW,
          },
          quote: { ticker: "AAPL", price: 180, currency: "USD", asOf: NOW },
        },
      ],
    });
    expect(r.results).toEqual([]);
  });

  it("sorteert aflopend op score", () => {
    const histStrong = priceHistory(252, (i) =>
      i < 189 ? 100 : 100 - ((i - 189) / 63) * 40,
    );
    const histMild = priceHistory(252, (i) =>
      i < 189 ? 100 : 100 - ((i - 189) / 63) * 25,
    );
    const r = scanOpportunityRadar({
      portfolio: [
        {
          ticker: "MILD",
          name: "Mild",
          factorScore: factorScore({ quality: 75 }),
          priceHistory: histMild,
        },
        {
          ticker: "STRONG",
          name: "Strong",
          factorScore: factorScore({ quality: 90 }),
          priceHistory: histStrong,
        },
      ],
    });
    expect(r.results.length).toBeGreaterThanOrEqual(1);
    if (r.results.length >= 2) {
      // Score moet aflopen — STRONG eerst.
      expect(r.results[0]!.score).toBeGreaterThanOrEqual(r.results[1]!.score);
    }
    expect(r.results[0]!.symbol).toBe("STRONG");
  });

  it("respecteert includeTypes filter", () => {
    const hist = priceHistory(252, (i) =>
      i < 189 ? 100 : 100 - ((i - 189) / 63) * 20,
    );
    const r = scanOpportunityRadar({
      portfolio: [
        {
          ticker: "ASML",
          name: "ASML",
          factorScore: factorScore({ quality: 85 }),
          priceHistory: hist,
        },
      ],
      includeTypes: ["VALUE_MISPRICING"], // andere type
    });
    expect(r.results).toEqual([]);
  });

  it("respecteert limit", () => {
    const hist = priceHistory(252, (i) =>
      i < 189 ? 100 : 100 - ((i - 189) / 63) * 30,
    );
    const r = scanOpportunityRadar({
      portfolio: Array.from({ length: 5 }, (_, i) => ({
        ticker: `T${i}`,
        name: `T${i}`,
        factorScore: factorScore({ quality: 85 }),
        priceHistory: hist,
      })),
      limit: 3,
    });
    expect(r.results.length).toBeLessThanOrEqual(3);
    expect(r.results.length).toBeGreaterThan(0);
  });

  it("countByType telt over de output", () => {
    const hist = priceHistory(252, (i) =>
      i < 189 ? 100 : 100 - ((i - 189) / 63) * 20,
    );
    const r = scanOpportunityRadar({
      portfolio: [
        {
          ticker: "ASML",
          name: "ASML",
          factorScore: factorScore({ quality: 85 }),
          priceHistory: hist,
        },
      ],
    });
    const total = Object.values(r.countByType).reduce((s, n) => s + n, 0);
    expect(total).toBe(r.results.length);
  });

  it("identieke input geeft identieke output (determinisme)", () => {
    const hist = priceHistory(252, (i) =>
      i < 189 ? 100 : 100 - ((i - 189) / 63) * 20,
    );
    const input = {
      portfolio: [
        {
          ticker: "ASML",
          name: "ASML",
          factorScore: factorScore({ quality: 85 }),
          priceHistory: hist,
        },
      ],
    };
    const a = scanOpportunityRadar(input);
    const b = scanOpportunityRadar(input);
    expect(a.results).toEqual(b.results);
    expect(a.countByType).toEqual(b.countByType);
  });

  it("expected horizon is consistent met type", () => {
    // Force een momentum-reversal pad
    const hist = priceHistory(252, (i) =>
      i < 189 ? 100 - (i / 189) * 30 : 70 + ((i - 189) / 63) * 15,
    );
    const r = scanOpportunityRadar({
      portfolio: [
        {
          ticker: "REV",
          name: "Reversal",
          priceHistory: hist,
        },
      ],
    });
    if (r.results.length > 0) {
      const reversal = r.results.find(
        (x) => x.opportunityType === "MOMENTUM_REVERSAL",
      );
      if (reversal) {
        expect(reversal.expectedHorizon).toBe("1-6 maanden");
        // Momentum reversal moet minimaal MEDIUM zijn.
        expect(["MEDIUM", "HIGH"]).toContain(reversal.riskLevel);
      }
    }
  });
});
