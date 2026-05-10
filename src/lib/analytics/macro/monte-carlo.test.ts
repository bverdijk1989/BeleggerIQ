import { describe, expect, it } from "vitest";

import {
  MONTE_CARLO_DEFAULTS,
  formatScenarioWithBand,
  simulateScenarioDistribution,
} from "./monte-carlo";

const POSITIONS = [
  { ticker: "ASML", name: "ASML", weight: 0.30, expectedShock: -0.25 },
  { ticker: "VWCE", name: "Vanguard FTSE", weight: 0.40, expectedShock: -0.15 },
  { ticker: "RHM", name: "Rheinmetall", weight: 0.10, expectedShock: 0.05 },
  { ticker: "CASH", name: "Cash", weight: 0.20, expectedShock: 0 },
];

describe("simulateScenarioDistribution — basics", () => {
  it("seed=42 → reproduceerbare output (zelfde p10/p50/p90 bij re-run)", () => {
    const a = simulateScenarioDistribution({
      scenario: "RECESSION",
      positions: POSITIONS,
      seed: 42,
    });
    const b = simulateScenarioDistribution({
      scenario: "RECESSION",
      positions: POSITIONS,
      seed: 42,
    });
    expect(a.mean).toBeCloseTo(b.mean, 6);
    expect(a.p10).toBeCloseTo(b.p10, 6);
    expect(a.p50).toBeCloseTo(b.p50, 6);
    expect(a.p90).toBeCloseTo(b.p90, 6);
  });

  it("verschillende seeds → andere realisaties (geen vaste output)", () => {
    const a = simulateScenarioDistribution({
      scenario: "RECESSION",
      positions: POSITIONS,
      seed: 1,
    });
    const b = simulateScenarioDistribution({
      scenario: "RECESSION",
      positions: POSITIONS,
      seed: 2,
    });
    // Means moeten in dezelfde buurt zitten (zelfde scenario), maar
    // niet identiek (verschillende seeds).
    expect(a.mean).not.toBeCloseTo(b.mean, 4);
    expect(a.mean).toBeGreaterThan(-0.20);
    expect(a.mean).toBeLessThan(-0.05);
  });

  it("p10 < p50 < p90 (sortering klopt)", () => {
    const r = simulateScenarioDistribution({
      scenario: "MARKET_CRASH",
      positions: POSITIONS,
      seed: 7,
    });
    expect(r.p10).toBeLessThan(r.p50);
    expect(r.p50).toBeLessThan(r.p90);
  });

  it("BLACK_SWAN heeft wijdere band dan RATES_UP_2 (sigma-tabel werkt)", () => {
    const blackSwan = simulateScenarioDistribution({
      scenario: "BLACK_SWAN",
      positions: POSITIONS,
      seed: 42,
    });
    const ratesUp = simulateScenarioDistribution({
      scenario: "RATES_UP_2",
      positions: POSITIONS,
      seed: 42,
    });
    // BLACK_SWAN sigma = 0.30, RATES_UP_2 = 0.10 → 3× breder
    expect(blackSwan.stdDev).toBeGreaterThan(ratesUp.stdDev);
  });

  it("default iterations = 2000", () => {
    const r = simulateScenarioDistribution({
      scenario: "RECESSION",
      positions: POSITIONS,
      seed: 42,
    });
    expect(r.iterations).toBe(MONTE_CARLO_DEFAULTS.iterations);
  });

  it("custom iterations werken (50)", () => {
    const r = simulateScenarioDistribution({
      scenario: "RECESSION",
      positions: POSITIONS,
      seed: 42,
      iterations: 50,
    });
    expect(r.iterations).toBe(50);
  });

  it("lege positions → mean = 0, stdDev = 0", () => {
    const r = simulateScenarioDistribution({
      scenario: "RECESSION",
      positions: [],
      seed: 42,
    });
    expect(r.mean).toBe(0);
    expect(r.stdDev).toBe(0);
    expect(r.p10).toBe(0);
    expect(r.p50).toBe(0);
    expect(r.p90).toBe(0);
  });

  it("perfectly defensive portfolio (cash only) → mean = 0", () => {
    const r = simulateScenarioDistribution({
      scenario: "MARKET_CRASH",
      positions: [{ ticker: "CASH", name: "Cash", weight: 1, expectedShock: 0 }],
      seed: 42,
    });
    // Cash heeft expected shock 0; gepertubeerd door log-normaal → 0×exp = 0
    expect(r.mean).toBe(0);
    expect(r.p10).toBe(0);
    expect(r.p90).toBe(0);
  });

  it("mean ligt rond expected portfolio impact (sanity check)", () => {
    // Expected portfolio impact = Σ (weight × expectedShock):
    // 0.30×(-0.25) + 0.40×(-0.15) + 0.10×0.05 + 0.20×0 = -0.075 - 0.060 + 0.005 = -0.130
    const expectedMean = -0.130;
    const r = simulateScenarioDistribution({
      scenario: "RECESSION",
      positions: POSITIONS,
      seed: 42,
    });
    // Met log-normale perturbatie zit er een lichte bias: E[X·exp(σZ)] = X·exp(σ²/2)
    // voor σ=0.18 (RECESSION) is dat ×1.016 — small drift naar groter (-)
    expect(r.mean).toBeLessThan(0);
    expect(r.mean).toBeGreaterThan(expectedMean * 1.5);
  });
});

describe("formatScenarioWithBand", () => {
  it("formatteert positief expected + bands", () => {
    const out = formatScenarioWithBand(0.05, {
      mean: 0.05,
      p50: 0.05,
      p10: -0.02,
      p90: 0.12,
      stdDev: 0.05,
      iterations: 2000,
    });
    expect(out).toContain("+5.0%");
    expect(out).toContain("P10");
    expect(out).toContain("P90");
  });

  it("formatteert negatief verlies met − teken (typografisch)", () => {
    const out = formatScenarioWithBand(-0.22, {
      mean: -0.22,
      p50: -0.22,
      p10: -0.30,
      p90: -0.15,
      stdDev: 0.05,
      iterations: 2000,
    });
    expect(out).toContain("−22.0%");
    expect(out).toContain("−30.0%");
    expect(out).toContain("−15.0%");
  });
});
