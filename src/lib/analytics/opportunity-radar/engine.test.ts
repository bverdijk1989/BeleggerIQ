import { describe, expect, it } from "vitest";

import type { FactorScore } from "@/types/factor";
import type { HistoricalPoint } from "@/types/market";

import { scanOpportunities } from "./engine";

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

function history(days: number, closeAt: (i: number) => number): HistoricalPoint[] {
  const out: HistoricalPoint[] = [];
  const base = new Date("2025-01-01");
  for (let i = 0; i < days; i++) {
    const d = new Date(base.getTime() + i * 24 * 3600 * 1000);
    out.push({ date: d.toISOString().slice(0, 10), close: closeAt(i) });
  }
  return out;
}

describe("scanOpportunities — lege input", () => {
  it("retourneert leeg report zonder crash", () => {
    const r = scanOpportunities({});
    expect(r.candidateCount).toBe(0);
    expect(r.candidates).toEqual([]);
    expect(r.sourcesScanned).toEqual({
      portfolioHoldings: 0,
      screenerCandidates: 0,
      watchlistItems: 0,
    });
  });

  it("signaalverdeling heeft alle keys op 0", () => {
    const r = scanOpportunities({});
    expect(r.signalDistribution["quality-pullback"]).toBe(0);
    expect(r.signalDistribution["earnings-sentiment-placeholder"]).toBe(0);
  });
});

describe("scanOpportunities — portfolio signalen", () => {
  it("detecteert quality-pullback op een portfolio-holding", () => {
    const h = history(252, (i) => (i < 189 ? 100 : 100 - ((i - 189) / 63) * 20));
    const r = scanOpportunities({
      portfolio: [
        {
          ticker: "NVDA",
          name: "NVIDIA",
          factorScore: factorScore({ quality: 85 }),
          priceHistory: h,
        },
      ],
    });
    expect(r.candidateCount).toBe(1);
    expect(r.candidates[0]!.source).toBe("portfolio");
    expect(
      r.candidates[0]!.signals.some((s) => s.type === "quality-pullback"),
    ).toBe(true);
  });

  it("detecteert underweight-high-conviction alleen op portfolio, niet op screener", () => {
    const r = scanOpportunities({
      portfolio: [
        {
          ticker: "MSFT",
          name: "Microsoft",
          currentWeight: 0.02,
          targetWeight: 0.10,
          factorScore: factorScore({ composite: 80, confidence: 0.9 }),
        },
      ],
    });
    expect(r.candidateCount).toBe(1);
    expect(
      r.candidates[0]!.signals.some(
        (s) => s.type === "underweight-high-conviction",
      ),
    ).toBe(true);
  });
});

describe("scanOpportunities — screener-universum", () => {
  it("detecteert value-dislocation op screener-candidate", () => {
    const r = scanOpportunities({
      screener: [
        {
          ticker: "XYZ",
          name: "Acme Corp",
          factorScore: factorScore({ value: 80, momentum: 30 }),
        },
      ],
    });
    expect(r.candidateCount).toBe(1);
    expect(r.candidates[0]!.source).toBe("screener");
  });
});

describe("scanOpportunities — watchlist", () => {
  it("detecteert watchlist-target wanneer koers ≤ target", () => {
    const r = scanOpportunities({
      watchlist: [
        {
          item: {
            id: "w1",
            userId: "u1",
            ticker: "AAPL",
            name: "Apple",
            targetPrice: 200,
            addedAt: "2026-04-24T00:00:00.000Z",
            updatedAt: "2026-04-24T00:00:00.000Z",
          },
          quote: {
            ticker: "AAPL",
            price: 185,
            currency: "USD",
            asOf: "2026-04-24T00:00:00.000Z",
          },
        },
      ],
    });
    expect(r.candidateCount).toBe(1);
    expect(r.candidates[0]!.source).toBe("watchlist");
    expect(
      r.candidates[0]!.signals.find((s) => s.type === "watchlist-target"),
    ).toBeDefined();
  });

  it("skipt watchlist-items zonder targetPrice", () => {
    const r = scanOpportunities({
      watchlist: [
        {
          item: {
            id: "w1",
            userId: "u1",
            ticker: "AAPL",
            targetPrice: null,
            addedAt: "2026-04-24T00:00:00.000Z",
            updatedAt: "2026-04-24T00:00:00.000Z",
          },
          quote: {
            ticker: "AAPL",
            price: 180,
            currency: "USD",
            asOf: "2026-04-24T00:00:00.000Z",
          },
        },
      ],
    });
    expect(r.candidateCount).toBe(0);
  });
});

describe("scanOpportunities — deduplicatie", () => {
  it("ticker in zowel portfolio als watchlist → één candidate (portfolio source)", () => {
    const h = history(252, (i) => (i < 189 ? 100 : 100 - ((i - 189) / 63) * 20));
    const r = scanOpportunities({
      portfolio: [
        {
          ticker: "NVDA",
          name: "NVIDIA",
          factorScore: factorScore({ quality: 85 }),
          priceHistory: h,
        },
      ],
      watchlist: [
        {
          item: {
            id: "w1",
            userId: "u1",
            ticker: "NVDA",
            targetPrice: 200,
            addedAt: "2026-04-24T00:00:00.000Z",
            updatedAt: "2026-04-24T00:00:00.000Z",
          },
          quote: {
            ticker: "NVDA",
            price: 180,
            currency: "USD",
            asOf: "2026-04-24T00:00:00.000Z",
          },
        },
      ],
    });
    expect(r.candidateCount).toBe(1);
    const candidate = r.candidates[0]!;
    expect(candidate.source).toBe("portfolio");
    // Signalen uit beide bronnen worden bundeld
    expect(candidate.signals.length).toBeGreaterThanOrEqual(2);
    expect(candidate.signals.some((s) => s.type === "quality-pullback")).toBe(true);
    expect(candidate.signals.some((s) => s.type === "watchlist-target")).toBe(true);
  });
});

describe("scanOpportunities — sorting + limit", () => {
  it("sorteert kandidaten op score desc", () => {
    const strong = history(252, (i) =>
      i < 189 ? 100 : 100 - ((i - 189) / 63) * 25,
    );
    const mild = history(252, (i) =>
      i < 189 ? 100 : 100 - ((i - 189) / 63) * 12,
    );
    const r = scanOpportunities({
      portfolio: [
        {
          ticker: "MILD",
          name: "Mild",
          factorScore: factorScore({ quality: 72 }),
          priceHistory: mild,
        },
        {
          ticker: "STRONG",
          name: "Strong",
          factorScore: factorScore({ quality: 90 }),
          priceHistory: strong,
        },
      ],
    });
    expect(r.candidates[0]!.ticker).toBe("STRONG");
  });

  it("respecteert maxCandidates uit config", () => {
    const h = history(252, (i) => (i < 189 ? 100 : 100 - ((i - 189) / 63) * 25));
    const r = scanOpportunities({
      portfolio: [
        { ticker: "A", name: "A", factorScore: factorScore({ quality: 85 }), priceHistory: h },
        { ticker: "B", name: "B", factorScore: factorScore({ quality: 80 }), priceHistory: h },
        { ticker: "C", name: "C", factorScore: factorScore({ quality: 75 }), priceHistory: h },
      ],
      config: { maxCandidates: 2 },
    });
    expect(r.candidateCount).toBe(2);
    expect(r.candidates.map((c) => c.ticker)).toEqual(["A", "B"]);
  });
});

describe("scanOpportunities — signaalverdeling", () => {
  it("telt signalen over de getoonde kandidaten", () => {
    const h = history(252, (i) => (i < 189 ? 100 : 100 - ((i - 189) / 63) * 20));
    const r = scanOpportunities({
      portfolio: [
        {
          ticker: "A",
          name: "A",
          // Value-momentum spread moet > 40 zijn om boven minSignalStrength te komen:
          // scaleStrength(spread, 20, 70) · spread 60 → strength 80.
          factorScore: factorScore({ quality: 85, value: 90, momentum: 30 }),
          priceHistory: h,
        },
      ],
    });
    const dist = r.signalDistribution;
    expect(dist["quality-pullback"]).toBe(1);
    expect(dist["value-dislocation"]).toBe(1);
  });
});

describe("scanOpportunities — sourcesScanned", () => {
  it("rapporteert hoeveel items uit elke bron zijn gescand", () => {
    const r = scanOpportunities({
      portfolio: [{ ticker: "A", name: "A" }],
      screener: [{ ticker: "B", name: "B" }, { ticker: "C", name: "C" }],
      watchlist: [],
    });
    expect(r.sourcesScanned).toEqual({
      portfolioHoldings: 1,
      screenerCandidates: 2,
      watchlistItems: 0,
    });
  });
});
