import { describe, expect, it } from "vitest";

import {
  DEFAULT_FACTOR_WEIGHTS,
  applyFactorScore,
  computeComposite,
  scoreFactors,
  scoreHoldings,
  weightsForObjective,
} from "./composite";
import type { FundamentalsSnapshot } from "@/types/factor";
import type { Holding } from "@/types/portfolio";

function fundamentals(
  overrides: Partial<FundamentalsSnapshot> = {},
): FundamentalsSnapshot {
  return {
    ticker: "ASML",
    asOf: "2026-04-01T00:00:00.000Z",
    currency: "EUR",
    roic: 0.22,
    roe: 0.25,
    debtToEquity: 0.4,
    operatingMargin: 0.28,
    grossMargin: 0.5,
    fcfYield: 0.06,
    pe: 22,
    pb: 6,
    evEbitda: 18,
    ...overrides,
  };
}

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: "h1",
    portfolioId: "p1",
    ticker: "ASML",
    name: "ASML Holding",
    assetClass: "EQUITY",
    currency: "EUR",
    quantity: 10,
    avgCostPrice: 500,
    currentPrice: 720,
    ...overrides,
  };
}

describe("computeComposite", () => {
  it("normaliseert tegen som van weights", () => {
    const composite = computeComposite(
      { quality: 80, value: 60, momentum: 40, lowVol: 20 },
      { quality: 1, value: 1, momentum: 1, lowVol: 1 },
    );
    expect(composite).toBe(50);
  });

  it("geeft 50 bij totaalgewicht 0", () => {
    expect(
      computeComposite(
        { quality: 80, value: 80, momentum: 80, lowVol: 80 },
        { quality: 0, value: 0, momentum: 0, lowVol: 0 },
      ),
    ).toBe(50);
  });
});

describe("weightsForObjective", () => {
  it("retourneert gedifferentieerde presets per objective", () => {
    expect(weightsForObjective("GROWTH").momentum).toBeGreaterThan(
      DEFAULT_FACTOR_WEIGHTS.momentum,
    );
    expect(weightsForObjective("CAPITAL_PRESERVATION").quality).toBeGreaterThan(
      DEFAULT_FACTOR_WEIGHTS.quality,
    );
    expect(weightsForObjective("INCOME").dividend).toBe(0.2);
    expect(weightsForObjective("BALANCED")).toEqual(DEFAULT_FACTOR_WEIGHTS);
  });
});

describe("scoreFactors", () => {
  it("bouwt een volledige FactorScore met rationales", () => {
    const score = scoreFactors({
      ticker: "ASML",
      fundamentals: fundamentals(),
      volatility: 0.2,
      maxDrawdown: -0.15,
      beta: 0.9,
    });

    expect(score.composite).toBeGreaterThan(50);
    expect(score.subScores.quality).toBeGreaterThan(60);
    expect(score.rationales?.composite?.length).toBeGreaterThan(0);
    expect(score.weights).toEqual(DEFAULT_FACTOR_WEIGHTS);
    expect(score.confidence).toBeGreaterThan(0);
    expect(score.model).toBe("beleggeriq.v1");
  });

  it("respecteert custom weights", () => {
    const growthScore = scoreFactors(
      {
        ticker: "ASML",
        fundamentals: fundamentals(),
        volatility: 0.4,
        maxDrawdown: -0.4,
        beta: 1.5,
      },
      { quality: 0.05, value: 0.05, momentum: 0.05, lowVol: 0.85 },
    );
    // Met low-vol zwaar gewogen én slechte risk-input zakt de composite.
    expect(growthScore.composite).toBeLessThan(50);
  });
});

describe("applyFactorScore + scoreHoldings", () => {
  it("applyFactorScore levert een nieuw Holding object met factorScore", () => {
    const score = scoreFactors({
      ticker: "ASML",
      fundamentals: fundamentals(),
    });
    const h = holding();
    const enriched = applyFactorScore(h, score);
    expect(enriched).not.toBe(h);
    expect(enriched.factorScore?.composite).toBe(score.composite);
    expect(h.factorScore).toBeUndefined();
  });

  it("scoreHoldings gebruikt inputs map per ticker", () => {
    const h1 = holding({ id: "h1", ticker: "ASML" });
    const h2 = holding({ id: "h2", ticker: "MSFT" });
    const inputs = new Map([
      [
        "ASML",
        { ticker: "ASML", fundamentals: fundamentals({ roic: 0.22 }) },
      ],
    ]);
    const out = scoreHoldings([h1, h2], inputs);
    expect(out[0]?.factorScore).toBeDefined();
    // MSFT heeft geen input → blijft onveranderd
    expect(out[1]?.factorScore).toBeUndefined();
  });
});
