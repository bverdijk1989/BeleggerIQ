import { describe, expect, it } from "vitest";

import {
  buildRiskControlTowerReport,
  type BuildRiskControlTowerInput,
} from "./engine";

/**
 * Module 29 — Risk Control Tower engine tests.
 *
 * Pure-function engine — deterministisch. Tests dekken:
 *  - 12 categorieën altijd aanwezig
 *  - severity-classifier (green/orange/red/gray)
 *  - missing-data → "gray"
 *  - risk-budget berekening
 *  - headline-generator
 *  - actiepunten zijn aandachtspunten (geen "verkoop X")
 */

const ASOF = "2026-05-19T00:00:00.000Z";

function input(
  overrides: Partial<BuildRiskControlTowerInput> = {},
): BuildRiskControlTowerInput {
  return { generatedAt: ASOF, ...overrides };
}

describe("buildRiskControlTowerReport — shape", () => {
  it("produceert altijd 12 categorieën, in vaste volgorde", () => {
    const r = buildRiskControlTowerReport(input());
    expect(r.categories).toHaveLength(12);
    expect(r.categories.map((c) => c.key)).toEqual([
      "concentration",
      "sector",
      "region",
      "currency",
      "interest_rate",
      "macro_regime",
      "drawdown",
      "volatility",
      "liquidity",
      "data_quality",
      "crypto_speculation",
      "behavioral",
    ]);
  });

  it("disclaimer altijd aanwezig en benoemt 'geen advies'", () => {
    const r = buildRiskControlTowerReport(input());
    expect(r.disclaimer).toMatch(/aandachtspunten/i);
    expect(r.disclaimer).toMatch(/advies/i);
  });

  it("lege input → alle categorieën grijs", () => {
    const r = buildRiskControlTowerReport(input());
    expect(r.counts.gray).toBe(12);
    expect(r.counts.red).toBe(0);
    expect(r.counts.orange).toBe(0);
    expect(r.counts.green).toBe(0);
    expect(r.budget.tone).toBe("gray");
  });
});

describe("Severity-classifier — green/orange/red/gray", () => {
  it("kleine concentratie + lage vola → green", () => {
    const r = buildRiskControlTowerReport(
      input({
        largestPositionWeight: 0.03,
        top5Weight: 0.3,
        concentrationHhi: 0.05,
        portfolioVolatility: 0.1,
      }),
    );
    const conc = r.categories.find((c) => c.key === "concentration")!;
    expect(conc.severity).toBe("green");
    const vola = r.categories.find((c) => c.key === "volatility")!;
    expect(vola.severity).toBe("green");
  });

  it("hoge concentratie → red", () => {
    const r = buildRiskControlTowerReport(
      input({
        largestPositionWeight: 0.4,
        top5Weight: 0.85,
        concentrationHhi: 0.4,
      }),
    );
    const conc = r.categories.find((c) => c.key === "concentration")!;
    expect(conc.severity).toBe("red");
  });

  it("missende metric → gray", () => {
    const r = buildRiskControlTowerReport(input());
    const conc = r.categories.find((c) => c.key === "concentration")!;
    expect(conc.severity).toBe("gray");
    expect(conc.score).toBeNull();
  });

  it("inverse-meting voor data-quality: lage depth → red", () => {
    const r = buildRiskControlTowerReport(
      input({ dataDepthScore: 15 }),
    );
    const dq = r.categories.find((c) => c.key === "data_quality")!;
    expect(dq.severity).toBe("red");
  });

  it("inverse-meting: hoge depth → green", () => {
    const r = buildRiskControlTowerReport(
      input({ dataDepthScore: 85 }),
    );
    const dq = r.categories.find((c) => c.key === "data_quality")!;
    expect(dq.severity).toBe("green");
  });

  it("regime-alignment 80 → green (goed aligned)", () => {
    const r = buildRiskControlTowerReport(
      input({ regimeAlignmentScore: 80, regimeStance: "RISK_ON" }),
    );
    const mr = r.categories.find((c) => c.key === "macro_regime")!;
    expect(mr.severity).toBe("green");
  });

  it("inverse yield-curve → score escaleert (interest_rate red)", () => {
    const r = buildRiskControlTowerReport(
      input({
        interestRate10y: 0.05,
        rateChange1y: 0.02,
        yieldCurveSlope: -0.01,
      }),
    );
    const rate = r.categories.find((c) => c.key === "interest_rate")!;
    expect(rate.severity).toBe("red");
  });
});

describe("Risk-budget berekening", () => {
  it("alle red → tone=red, hoge utilization", () => {
    const r = buildRiskControlTowerReport(
      input({
        largestPositionWeight: 0.4,
        top5Weight: 0.9,
        concentrationHhi: 0.5,
        topSector: { label: "Tech", weight: 0.6 },
        sectorConcentrationHhi: 0.5,
        topRegion: { label: "US", weight: 0.9 },
        regionConcentrationHhi: 0.7,
        foreignCurrencyExposure: 0.8,
        interestRate10y: 0.07,
        rateChange1y: 0.03,
        yieldCurveSlope: -0.01,
        regimeAlignmentScore: 25,
        maxDrawdown: -0.45,
        portfolioVolatility: 0.4,
        illiquidWeight: 0.4,
        dataDepthScore: 20,
        cryptoWeight: 0.3,
        behavioralActiveCount: 8,
        behavioralHighCount: 4,
      }),
    );
    expect(r.budget.tone).toBe("red");
    expect(r.budget.utilization).toBeGreaterThan(0.7);
    expect(r.counts.red).toBeGreaterThan(0);
  });

  it("alle green → tone=green, lage utilization", () => {
    const r = buildRiskControlTowerReport(
      input({
        largestPositionWeight: 0.04,
        top5Weight: 0.3,
        concentrationHhi: 0.08,
        topSector: { label: "Tech", weight: 0.2 },
        sectorConcentrationHhi: 0.15,
        topRegion: { label: "Wereld", weight: 0.4 },
        regionConcentrationHhi: 0.2,
        foreignCurrencyExposure: 0.2,
        interestRate10y: 0.02,
        rateChange1y: -0.001,
        yieldCurveSlope: 0.015,
        regimeAlignmentScore: 80,
        maxDrawdown: -0.1,
        portfolioVolatility: 0.12,
        illiquidWeight: 0.05,
        dataDepthScore: 90,
        cryptoWeight: 0.01,
        behavioralActiveCount: 0,
        behavioralHighCount: 0,
      }),
    );
    expect(r.budget.tone).toBe("green");
    expect(r.budget.utilization).toBeLessThan(0.4);
    expect(r.counts.green).toBeGreaterThan(0);
  });

  it("budget=gray bij alleen ontbrekende data", () => {
    const r = buildRiskControlTowerReport(input());
    expect(r.budget.tone).toBe("gray");
    expect(r.budget.maxBudget).toBe(0);
  });
});

describe("Headline-generator", () => {
  it("red flags > 0 → headline noemt 'aandacht'", () => {
    const r = buildRiskControlTowerReport(
      input({
        largestPositionWeight: 0.4,
        top5Weight: 0.9,
        concentrationHhi: 0.5,
      }),
    );
    expect(r.headline.toLowerCase()).toMatch(/rode|aandacht/);
  });

  it("alleen green → headline benoemt brede spreiding", () => {
    const r = buildRiskControlTowerReport(
      input({
        largestPositionWeight: 0.04,
        top5Weight: 0.3,
        concentrationHhi: 0.08,
        topSector: { label: "Tech", weight: 0.2 },
        sectorConcentrationHhi: 0.15,
        topRegion: { label: "Wereld", weight: 0.4 },
        regionConcentrationHhi: 0.2,
        foreignCurrencyExposure: 0.2,
        interestRate10y: 0.02,
        rateChange1y: -0.001,
        yieldCurveSlope: 0.015,
        regimeAlignmentScore: 80,
        maxDrawdown: -0.1,
        portfolioVolatility: 0.12,
        illiquidWeight: 0.05,
        dataDepthScore: 90,
        cryptoWeight: 0.01,
        behavioralActiveCount: 0,
        behavioralHighCount: 0,
      }),
    );
    expect(r.headline.toLowerCase()).toMatch(/spreiding|in orde/);
  });

  it("veel gray → headline benoemt datakwaliteit", () => {
    const r = buildRiskControlTowerReport(input());
    expect(r.headline.toLowerCase()).toMatch(/grijs|datakwaliteit/);
  });
});

describe("Module 29 — risicoanalist-laag: aandachtspunten geen orders", () => {
  it("Action suggestions bevatten geen 'verkoop X'-zinnen", () => {
    const r = buildRiskControlTowerReport(
      input({
        largestPositionWeight: 0.4,
        topSector: { label: "Tech", weight: 0.6 },
        regimeAlignmentScore: 25,
        maxDrawdown: -0.45,
        cryptoWeight: 0.3,
        behavioralActiveCount: 8,
        behavioralHighCount: 4,
      }),
    );
    for (const c of r.categories) {
      const ac = c.actionSuggestion.toLowerCase();
      // Geen "verkoop X" of "koop Y" — alleen "overweeg", "controleer", "bekijk".
      expect(ac).not.toMatch(/^verkoop /);
      expect(ac).not.toMatch(/^koop /);
    }
  });

  it("Categorie met severity=gray heeft 'Geen actie nodig' OF data-uitleg", () => {
    const r = buildRiskControlTowerReport(input());
    for (const c of r.categories) {
      expect(c.severity).toBe("gray");
      expect(c.explanation.length).toBeGreaterThan(0);
    }
  });
});

describe("Categorie-specifieke headline-metrics", () => {
  it("concentratie: toont ticker + percentage", () => {
    const r = buildRiskControlTowerReport(
      input({
        largestPositionWeight: 0.27,
        largestPositionTicker: "ASML",
        top5Weight: 0.7,
        concentrationHhi: 0.2,
      }),
    );
    const conc = r.categories.find((c) => c.key === "concentration")!;
    expect(conc.headlineMetric).toContain("ASML");
    expect(conc.headlineMetric).toContain("27%");
  });

  it("volatility: toont % per jaar", () => {
    const r = buildRiskControlTowerReport(
      input({ portfolioVolatility: 0.22 }),
    );
    const v = r.categories.find((c) => c.key === "volatility")!;
    expect(v.headlineMetric).toMatch(/22%/);
  });

  it("behavioral: toont signal-count", () => {
    const r = buildRiskControlTowerReport(
      input({ behavioralActiveCount: 3, behavioralHighCount: 1 }),
    );
    const b = r.categories.find((c) => c.key === "behavioral")!;
    expect(b.headlineMetric).toMatch(/3 signalen/);
    expect(b.headlineMetric).toMatch(/1 ernstig/);
  });

  it("data quality: depth score in headline", () => {
    const r = buildRiskControlTowerReport(
      input({ dataDepthScore: 65 }),
    );
    const dq = r.categories.find((c) => c.key === "data_quality")!;
    expect(dq.headlineMetric).toContain("65");
  });
});

describe("Module 29 — spec-conformance", () => {
  it("Severity-tones zijn exact 4: green/orange/red/gray", () => {
    const r = buildRiskControlTowerReport(
      input({
        largestPositionWeight: 0.4,
        portfolioVolatility: 0.2,
        dataDepthScore: 50,
      }),
    );
    const tones = new Set(r.categories.map((c) => c.severity));
    for (const t of tones) {
      expect(["green", "orange", "red", "gray"]).toContain(t);
    }
  });

  it("Each category heeft source-attribution voor traceability", () => {
    const r = buildRiskControlTowerReport(input());
    for (const c of r.categories) {
      expect(c.source.length).toBeGreaterThan(0);
    }
  });
});
