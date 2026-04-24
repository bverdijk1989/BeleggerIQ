import { describe, expect, it } from "vitest";

import { computeRegimeScore, stanceFromScore } from "./engine";
import {
  scoreRates,
  scoreSpread,
  scoreTrend,
  scoreValuation,
  scoreVolatility,
} from "./scoring";

describe("stanceFromScore", () => {
  it("mapt score naar stance met drempels 35/65", () => {
    expect(stanceFromScore(20)).toBe("DEFENSIVE");
    expect(stanceFromScore(35)).toBe("DEFENSIVE");
    expect(stanceFromScore(50)).toBe("NEUTRAL");
    expect(stanceFromScore(65)).toBe("RISK_ON");
    expect(stanceFromScore(80)).toBe("RISK_ON");
  });
});

describe("driver scorers — single signals", () => {
  it("valuation: goedkoop = hoge score, duur = lage score", () => {
    expect(scoreValuation({ valuationPercentile: 0.1 }).score).toBeGreaterThan(
      70,
    );
    expect(scoreValuation({ valuationPercentile: 0.9 }).score).toBeLessThan(
      35,
    );
    expect(scoreValuation({}).score).toBeNull();
  });

  it("trend combineert breadth en 12m return", () => {
    const bullish = scoreTrend({ breadthScore: 0.75, index12mReturn: 0.2 });
    const bearish = scoreTrend({ breadthScore: 0.2, index12mReturn: -0.25 });
    expect(bullish.score).toBeGreaterThan(65);
    expect(bearish.score).toBeLessThan(35);
  });

  it("volatility: laag VIX = hoog, hoog VIX = laag", () => {
    expect(scoreVolatility({ volatilityIndex: 12 }).score).toBeGreaterThan(80);
    expect(scoreVolatility({ volatilityIndex: 40 }).score).toBeLessThan(25);
  });

  it("rates: lage rente supportief, rising high rate restrictief", () => {
    const low = scoreRates({ interestRate10y: 0.015 });
    const high = scoreRates({ interestRate10y: 0.06, rateChange1y: 0.02 });
    expect(low.score).toBeGreaterThan(70);
    expect(high.score).toBeLessThan(30);
  });

  it("spread: tight = risk-on, wide = stress", () => {
    expect(scoreSpread({ creditSpreadBps: 120 }).score).toBeGreaterThan(80);
    expect(scoreSpread({ creditSpreadBps: 700 }).score).toBeLessThan(25);
  });
});

describe("computeRegimeScore — orchestration", () => {
  it("geeft NEUTRAL + confidence 0 bij geen data", () => {
    const result = computeRegimeScore({});
    expect(result.stance).toBe("NEUTRAL");
    expect(result.confidence).toBe(0);
    expect(result.score).toBe(50);
    expect(result.narrative).toMatch(/neutraal/i);
  });

  it("volledige risk-on inputs → RISK_ON", () => {
    const result = computeRegimeScore({
      valuationPercentile: 0.35,
      breadthScore: 0.72,
      index12mReturn: 0.18,
      volatilityIndex: 13,
      interestRate10y: 0.022,
      creditSpreadBps: 130,
    });
    expect(result.stance).toBe("RISK_ON");
    expect(result.score).toBeGreaterThanOrEqual(65);
    expect(result.confidence).toBeCloseTo(1, 5);
    expect(result.narrative).toMatch(/risk-on/i);
  });

  it("volledige defensieve inputs → DEFENSIVE", () => {
    const result = computeRegimeScore({
      valuationPercentile: 0.88,
      breadthScore: 0.25,
      index12mReturn: -0.22,
      volatilityIndex: 38,
      interestRate10y: 0.055,
      rateChange1y: 0.02,
      creditSpreadBps: 620,
    });
    expect(result.stance).toBe("DEFENSIVE");
    expect(result.score).toBeLessThanOrEqual(35);
    expect(result.narrative).toMatch(/defensief/i);
  });

  it("partiële data levert confidence < 1 en blijft stabiel", () => {
    const result = computeRegimeScore({
      volatilityIndex: 16,
      interestRate10y: 0.03,
    });
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThan(1);
    expect(result.subDrivers.some((d) => d.score === null)).toBe(true);
  });

  it("narrative noemt zowel supportive als drag driver als beide aanwezig", () => {
    const result = computeRegimeScore({
      valuationPercentile: 0.2,          // supportive
      volatilityIndex: 35,               // drag
      interestRate10y: 0.03,
      creditSpreadBps: 250,
      breadthScore: 0.5,
    });
    expect(result.narrative.toLowerCase()).toContain("ondersteunend");
    expect(result.narrative.toLowerCase()).toContain("tegenwind");
  });
});
