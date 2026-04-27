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

describe("scoreFactors — min-coverage floor (Asness/Simons)", () => {
  it("zonder fundamentals én zonder priceHistory → composite 50 + lage confidence", () => {
    const score = scoreFactors({ ticker: "X" });
    expect(score.composite).toBe(50);
    expect(score.confidence).toBeLessThanOrEqual(0.3);
  });

  it("alleen risk-pillar (1 van 4) → composite 50 + confidence ≤ 0.3", () => {
    const score = scoreFactors({
      ticker: "X",
      volatility: 0.25,
      maxDrawdown: -0.2,
      beta: 1.0,
    });
    expect(score.composite).toBe(50);
    expect(score.confidence).toBeLessThanOrEqual(0.3);
    expect(
      score.rationales?.composite?.some((r) =>
        r.toLowerCase().includes("onvoldoende data"),
      ),
    ).toBe(true);
  });

  it("twee pillars met voldoende coverage → composite gerespecteerd", () => {
    const score = scoreFactors({
      ticker: "X",
      fundamentals: fundamentals(),
      volatility: 0.18,
      maxDrawdown: -0.12,
      beta: 0.9,
    });
    // quality + value uit fundamentals + risk uit vol/dd → ≥ 2 pillars
    expect(score.composite).not.toBe(50);
    expect(score.confidence).toBeGreaterThan(0.3);
  });

  it("volledige coverage → confidence dichtbij 1", () => {
    // Gegenereerde 12-maands prijshistorie zodat momentum-pillar ook telt
    const history = Array.from({ length: 14 }).map((_, i) => {
      const d = new Date(2025, i, 1);
      return {
        date: d.toISOString().slice(0, 10),
        open: 100,
        close: 100 + i * 1.5,
        high: 100 + i * 1.5,
        low: 100 + i * 1.5,
        volume: 0,
      };
    });
    const score = scoreFactors({
      ticker: "X",
      fundamentals: fundamentals(),
      priceHistory: history,
      volatility: 0.18,
      maxDrawdown: -0.12,
      beta: 0.9,
    });
    expect(score.confidence).toBeGreaterThanOrEqual(0.6);
  });
});

describe("computeComposite — reliable-pillar filter", () => {
  it("alleen reliable pillars tellen mee in de gewogen som", () => {
    const sub = { quality: 80, value: 80, momentum: 20, lowVol: 20 };
    const w = { quality: 0.25, value: 0.25, momentum: 0.25, lowVol: 0.25 };
    // quality+value = 80 (gemiddelde), unreliable momentum/lowVol weggefilterd
    const result = computeComposite(sub, w, {
      quality: true,
      value: true,
      momentum: false,
      lowVol: false,
    });
    expect(result).toBe(80);
  });

  it("backwards-compat: zonder reliable-arg gedraagt computeComposite zich als voorheen", () => {
    const sub = { quality: 80, value: 80, momentum: 20, lowVol: 20 };
    const w = { quality: 0.25, value: 0.25, momentum: 0.25, lowVol: 0.25 };
    expect(computeComposite(sub, w)).toBe(50);
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
