import { describe, expect, it } from "vitest";

import type { FactorScore } from "@/types/factor";
import type { HistoricalPoint } from "@/types/market";

import { detectSentimentPriceDivergence } from "./sentiment-price-divergence";

const NOW = "2026-04-24T00:00:00.000Z";

function factorScore(lowVol: number, composite = 50): FactorScore {
  return {
    ticker: "X",
    asOf: NOW,
    subScores: { quality: 50, value: 50, momentum: 50, lowVol },
    composite,
    confidence: 0.7,
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

// Stabiele, lichte ruis-koers — lage realized vol op 200d.
function stableHistory(days: number, final: number = 100): HistoricalPoint[] {
  return history(days, (i) => {
    // kleine sinusoidale ruis rond 100
    const drift = (i / days) * (final - 100);
    const noise = Math.sin(i / 7) * 0.2;
    return 100 + drift + noise;
  });
}

// Sluit af met een volatiele terugval in de laatste `spikeDays`.
function spikyHistory(
  days: number,
  spikeDays: number,
  drop: number,
): HistoricalPoint[] {
  return history(days, (i) => {
    if (i < days - spikeDays) {
      return 100 + Math.sin(i / 7) * 0.2;
    }
    // In de spike periode wisselen we +/- flink met een netto daling.
    const t = (i - (days - spikeDays)) / spikeDays;
    const swing = Math.sin(i) * 3;
    return 100 + swing - drop * t;
  });
}

describe("detectSentimentPriceDivergence — expliciete sentiment-route", () => {
  it("triggert bij sentiment ≥ 0.7 en 20d-return ≤ -5%", () => {
    const sig = detectSentimentPriceDivergence({
      ticker: "X",
      priceHistory: spikyHistory(230, 20, 10),
      sentimentScore: 0.85,
      now: NOW,
    });
    expect(sig).not.toBeNull();
    expect(sig!.type).toBe("sentiment-price-divergence");
    expect(sig!.expectedHoldingPeriodDays).toBe(90);
    expect(sig!.rationale.some((r) => /Sentiment-score/.test(r))).toBe(true);
  });

  it("null bij te lage sentiment-score", () => {
    const sig = detectSentimentPriceDivergence({
      ticker: "X",
      priceHistory: spikyHistory(230, 20, 10),
      sentimentScore: 0.5,
      now: NOW,
    });
    expect(sig).toBeNull();
  });

  it("null als koers niet genoeg gedaald is", () => {
    const sig = detectSentimentPriceDivergence({
      ticker: "X",
      priceHistory: stableHistory(230, 101),
      sentimentScore: 0.9,
      now: NOW,
    });
    expect(sig).toBeNull();
  });
});

describe("detectSentimentPriceDivergence — proxy-route", () => {
  it("triggert bij hoog lowVol + vol-spike", () => {
    const sig = detectSentimentPriceDivergence({
      ticker: "X",
      priceHistory: spikyHistory(230, 20, 10),
      factorScore: factorScore(72),
      now: NOW,
    });
    expect(sig).not.toBeNull();
    expect(sig!.riskFlags.map((f) => f.code)).toContain(
      "sentiment-proxy-only",
    );
    expect(sig!.confidence).toBeLessThanOrEqual(0.6);
  });

  it("null als lowVol te laag is", () => {
    const sig = detectSentimentPriceDivergence({
      ticker: "X",
      priceHistory: spikyHistory(230, 20, 10),
      factorScore: factorScore(55),
      now: NOW,
    });
    expect(sig).toBeNull();
  });

  it("null zonder vol-spike", () => {
    const sig = detectSentimentPriceDivergence({
      ticker: "X",
      priceHistory: stableHistory(230, 100),
      factorScore: factorScore(75),
      now: NOW,
    });
    expect(sig).toBeNull();
  });
});

describe("detectSentimentPriceDivergence — algemeen", () => {
  it("null bij te weinig history", () => {
    const sig = detectSentimentPriceDivergence({
      ticker: "X",
      priceHistory: history(100, (i) => 100 + Math.sin(i)),
      sentimentScore: 0.9,
      now: NOW,
    });
    expect(sig).toBeNull();
  });

  it("expliciet signaal heeft geen proxy-only flag", () => {
    const sig = detectSentimentPriceDivergence({
      ticker: "X",
      priceHistory: spikyHistory(230, 20, 10),
      sentimentScore: 0.85,
      now: NOW,
    })!;
    const codes = sig.riskFlags.map((f) => f.code);
    expect(codes).not.toContain("sentiment-proxy-only");
  });

  it("sentiment > 1 of < 0 wordt als invalid behandeld en forceert proxy-route", () => {
    const sig = detectSentimentPriceDivergence({
      ticker: "X",
      priceHistory: spikyHistory(230, 20, 10),
      sentimentScore: 1.5, // invalid
      factorScore: factorScore(75),
      now: NOW,
    });
    expect(sig).not.toBeNull();
    expect(sig!.riskFlags.map((f) => f.code)).toContain(
      "sentiment-proxy-only",
    );
  });
});
