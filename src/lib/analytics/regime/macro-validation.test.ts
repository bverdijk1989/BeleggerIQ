import { describe, expect, it } from "vitest";

import { computeRegimeScore } from "./engine";
import {
  scoreCurveSlope,
  scoreInflation,
  type RegimeScoreInput,
} from "./scoring";

/**
 * Regime-engine — macro-validatie tests (Dalio / Krugman / El-Erian).
 *
 * Doel: bevestigen dat de toegevoegde inflatie- en curve-slope-drivers
 * de score laten reageren op klassieke recessie- en stagflatie-signalen.
 */

const HEALTHY_BULL: RegimeScoreInput = {
  valuationPercentile: 0.55,
  breadthScore: 0.72,
  index12mReturn: 0.18,
  volatilityIndex: 14,
  interestRate10y: 0.03,
  rateChange1y: 0,
  creditSpreadBps: 130,
  inflationYoy: 0.022,
  yieldCurveSlope: 0.012,
};

describe("scoreInflation", () => {
  it("CB-target inflatie (2-3%) → hoge score (~80)", () => {
    expect(scoreInflation({ inflationYoy: 0.022 }).score).toBe(80);
  });

  it("hoge inflatie (≥7%) → lage score (~15)", () => {
    expect(scoreInflation({ inflationYoy: 0.085 }).score).toBe(15);
  });

  it("verhoogde inflatie (5-7%) → matig (~30)", () => {
    expect(scoreInflation({ inflationYoy: 0.06 }).score).toBe(30);
  });

  it("ontbrekende data → null score", () => {
    expect(scoreInflation({}).score).toBe(null);
  });
});

describe("scoreCurveSlope", () => {
  it("steile curve (≥+1%) → hoog (~80)", () => {
    expect(scoreCurveSlope({ yieldCurveSlope: 0.015 }).score).toBe(80);
  });

  it("diepe inversie (≤-50bps) → laag (~15) — Dalio/Krugman recessie-signaal", () => {
    expect(scoreCurveSlope({ yieldCurveSlope: -0.008 }).score).toBe(15);
  });

  it("vlakke curve (~0%) → neutraal (~60)", () => {
    expect(scoreCurveSlope({ yieldCurveSlope: 0.002 }).score).toBe(60);
  });

  it("ontbrekende data → null score", () => {
    expect(scoreCurveSlope({}).score).toBe(null);
  });
});

describe("computeRegimeScore — macro-validatie scenario's", () => {
  it("gezond bull-klimaat → RISK_ON of hoge NEUTRAL", () => {
    const r = computeRegimeScore(HEALTHY_BULL);
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(["RISK_ON", "NEUTRAL"]).toContain(r.stance);
  });

  it("inflatie-shock duwt score omlaag (stagflatie-tilt)", () => {
    const baseline = computeRegimeScore(HEALTHY_BULL);
    const stagflation = computeRegimeScore({
      ...HEALTHY_BULL,
      inflationYoy: 0.075,
    });
    expect(stagflation.score).toBeLessThan(baseline.score);
  });

  it("yield-curve-inversie duwt score omlaag (recessie-signaal)", () => {
    const baseline = computeRegimeScore(HEALTHY_BULL);
    const inverted = computeRegimeScore({
      ...HEALTHY_BULL,
      yieldCurveSlope: -0.01,
    });
    expect(inverted.score).toBeLessThan(baseline.score);
  });

  it("gecombineerde stagflatie+inversie+spread-stress → DEFENSIVE", () => {
    const r = computeRegimeScore({
      valuationPercentile: 0.85,
      breadthScore: 0.32,
      index12mReturn: -0.12,
      volatilityIndex: 32,
      interestRate10y: 0.055,
      rateChange1y: 0.025,
      creditSpreadBps: 520,
      inflationYoy: 0.075,
      yieldCurveSlope: -0.012,
    });
    expect(r.stance).toBe("DEFENSIVE");
    expect(r.score).toBeLessThanOrEqual(35);
  });

  it("'Japanificatie' (lage rente, lage groei, deflatie) → score blijft gematigd", () => {
    const r = computeRegimeScore({
      valuationPercentile: 0.45,
      breadthScore: 0.5,
      index12mReturn: -0.02,
      volatilityIndex: 16,
      interestRate10y: 0.005,
      rateChange1y: 0,
      creditSpreadBps: 250,
      inflationYoy: 0.005,
      yieldCurveSlope: 0.005,
    });
    // Ondanks lage rente niet bullish — deflatie + zwakke trend houden
    // de score in de neutrale zone. Voorkomt bull-bias bij ZIRP.
    expect(r.score).toBeLessThan(70);
    expect(["NEUTRAL", "DEFENSIVE"]).toContain(r.stance);
  });

  it("partiële data — engine blijft draaien zonder inflation/curve input", () => {
    const r = computeRegimeScore({
      valuationPercentile: 0.5,
      breadthScore: 0.5,
      index12mReturn: 0.05,
    });
    expect(r.score).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThan(1); // partiële coverage
  });
});
