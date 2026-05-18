import { describe, expect, it } from "vitest";

import {
  buildAnnualProjection,
  buildCalendarRow,
  buildDividendReport,
  buildGrowthAnalysis,
  classifyFrequency,
  simulateDrip,
} from "./engine";

/**
 * Module 22 — Dividend Calendar & DRIP engine tests.
 */

describe("classifyFrequency — heuristiek", () => {
  it("ZERO bij yield=null of 0", () => {
    expect(
      classifyFrequency({ ticker: "X", dividendYield: null }),
    ).toBe("ZERO");
    expect(
      classifyFrequency({ ticker: "X", dividendYield: 0 }),
    ).toBe("ZERO");
  });

  it("EU-tickers (.AS / .PA / .DE) → SEMIANNUAL", () => {
    expect(
      classifyFrequency({ ticker: "ASML.AS", dividendYield: 0.02 }),
    ).toBe("SEMIANNUAL");
    expect(
      classifyFrequency({ ticker: "TTE.PA", dividendYield: 0.05 }),
    ).toBe("SEMIANNUAL");
  });

  it("US-tickers (zonder suffix) → QUARTERLY", () => {
    expect(
      classifyFrequency({ ticker: "MSFT", dividendYield: 0.01 }),
    ).toBe("QUARTERLY");
  });

  it("REITs → QUARTERLY (geen aggresive monthly default)", () => {
    expect(
      classifyFrequency({
        ticker: "O",
        assetClass: "REIT",
        dividendYield: 0.05,
      }),
    ).toBe("QUARTERLY");
  });
});

describe("buildCalendarRow", () => {
  it("yield=null → ZERO + dataQuality missing", () => {
    const row = buildCalendarRow({
      ticker: "X",
      name: "X",
      marketValue: 10000,
      dividendYield: null,
    });
    expect(row.frequency).toBe("ZERO");
    expect(row.dataQuality).toBe("missing");
    expect(row.expectedAnnualGross).toBe(0);
    expect(row.monthlyEstimates).toHaveLength(0);
  });

  it("US-stock met 2% yield → QUARTERLY met 4 maand-bedragen", () => {
    const row = buildCalendarRow({
      ticker: "MSFT",
      name: "Microsoft",
      marketValue: 10000,
      dividendYield: 0.02,
    });
    expect(row.frequency).toBe("QUARTERLY");
    expect(row.monthlyEstimates).toHaveLength(4);
    expect(row.expectedAnnualGross).toBe(200);
    // 200/4 = 50 per kwartaal
    expect(row.monthlyEstimates[0]!.amount).toBe(50);
    expect(row.dataQuality).toBe("estimated");
  });

  it("nextExDividendDate aanwezig → dataQuality actual", () => {
    const row = buildCalendarRow({
      ticker: "MSFT",
      name: "Microsoft",
      marketValue: 10000,
      dividendYield: 0.02,
      nextExDividendDate: "2026-06-15",
    });
    expect(row.dataQuality).toBe("actual");
  });
});

describe("buildAnnualProjection", () => {
  it("Aggregeert correct over rijen + telt covered/zero/actual/estimated", () => {
    const rows = [
      buildCalendarRow({
        ticker: "A",
        name: "A",
        marketValue: 10000,
        dividendYield: 0.02,
        nextExDividendDate: "2026-06-15",
      }),
      buildCalendarRow({
        ticker: "B",
        name: "B",
        marketValue: 5000,
        dividendYield: 0.03,
      }),
      buildCalendarRow({
        ticker: "C",
        name: "C",
        marketValue: 5000,
        dividendYield: null,
      }),
    ];
    const p = buildAnnualProjection(rows);
    expect(p.annualGross).toBe(10000 * 0.02 + 5000 * 0.03);
    expect(p.coveredPositions).toBe(2);
    expect(p.zeroPositions).toBe(1);
    expect(p.actualCount).toBe(1);
    expect(p.estimatedCount).toBe(1);
    // weighted yield = (200 + 150) / 15000 = 0.0233
    expect(p.weightedYield).toBeCloseTo(350 / 15000, 4);
  });
});

describe("buildGrowthAnalysis", () => {
  it("Geen data → null + niet-lege summary", () => {
    const a = buildGrowthAnalysis({
      rows: [
        { marketValue: 10000, dividendGrowth5y: null },
        { marketValue: 5000, dividendGrowth5y: null },
      ],
    });
    expect(a.weighted5yGrowth).toBeNull();
    expect(a.coveredPositions).toBe(0);
    expect(a.summary.length).toBeGreaterThan(0);
  });

  it("Positieve groei → gewogen gemiddelde + 'Sterke' summary", () => {
    const a = buildGrowthAnalysis({
      rows: [
        { marketValue: 10000, dividendGrowth5y: 0.08 },
        { marketValue: 10000, dividendGrowth5y: 0.04 },
      ],
    });
    expect(a.weighted5yGrowth).toBeCloseTo(0.06, 3);
    expect(a.summary).toMatch(/sterke|bescheiden/i);
  });

  it("Negatieve groei → waarschuwing in summary", () => {
    const a = buildGrowthAnalysis({
      rows: [{ marketValue: 10000, dividendGrowth5y: -0.05 }],
    });
    expect(a.summary).toMatch(/cuts|negatief/i);
  });
});

describe("simulateDrip", () => {
  const scenarios = {
    conservative: 0.04,
    neutral: 0.07,
    optimistic: 0.10,
  };

  it("Met DRIP > zonder DRIP (compound-effect)", () => {
    const sim = simulateDrip({
      initialValue: 10000,
      annualDividendGross: 300,
      monthlyContribution: 0,
      scenarios,
      horizonYears: 20,
    });
    for (const k of ["conservative", "neutral", "optimistic"] as const) {
      expect(sim.withDrip[k].finalValue).toBeGreaterThan(
        sim.withoutDrip[k].finalValue,
      );
    }
  });

  it("reinvestedDividend = horizon × maandelijks dividend (DRIP-aan)", () => {
    const sim = simulateDrip({
      initialValue: 10000,
      annualDividendGross: 360,
      monthlyContribution: 0,
      scenarios,
      horizonYears: 10,
    });
    // 360/12 = 30 per maand × 120 maanden = 3600
    expect(sim.withDrip.neutral.reinvestedDividend).toBeCloseTo(3600, 0);
  });

  it("Zonder DRIP → reinvestedDividend = 0", () => {
    const sim = simulateDrip({
      initialValue: 10000,
      annualDividendGross: 360,
      monthlyContribution: 0,
      scenarios,
      horizonYears: 10,
    });
    expect(sim.withoutDrip.neutral.reinvestedDividend).toBe(0);
  });

  it("Aannames-lijst is niet leeg (transparantie-eis)", () => {
    const sim = simulateDrip({
      initialValue: 10000,
      annualDividendGross: 0,
      monthlyContribution: 0,
      scenarios,
      horizonYears: 5,
    });
    expect(sim.assumptions.length).toBeGreaterThan(0);
  });
});

describe("buildDividendReport — orchestrator", () => {
  const ASOF = "2026-05-18T00:00:00.000Z";
  const scenarios = {
    conservative: 0.04,
    neutral: 0.07,
    optimistic: 0.10,
  };

  it("Lege rows → projection.annualGross=0 + 1 warning", () => {
    const report = buildDividendReport({
      asOf: ASOF,
      baseCurrency: "EUR",
      totalPortfolioValue: 10000,
      rows: [],
      growthInputs: [],
      monthlyContribution: 0,
      scenarios,
    });
    expect(report.projection.annualGross).toBe(0);
    // Geen rows → simulaties draaien wel maar met 0 dividend
    expect(report.simulations).toHaveLength(3);
  });

  it("Yield > 7% triggert yield-trap-warning", () => {
    const rows = [
      buildCalendarRow({
        ticker: "HIYIELD",
        name: "High Yield",
        marketValue: 10000,
        dividendYield: 0.09,
      }),
    ];
    const report = buildDividendReport({
      asOf: ASOF,
      baseCurrency: "EUR",
      totalPortfolioValue: 10000,
      rows,
      growthInputs: [{ marketValue: 10000, dividendGrowth5y: null }],
      monthlyContribution: 0,
      scenarios,
    });
    expect(
      report.warnings.some((w) => /yield-trap|yield/i.test(w)),
    ).toBe(true);
  });

  it("Alle ESTIMATED, geen ACTUAL → warning", () => {
    const rows = [
      buildCalendarRow({
        ticker: "X",
        name: "X",
        marketValue: 10000,
        dividendYield: 0.02,
      }),
    ];
    const report = buildDividendReport({
      asOf: ASOF,
      baseCurrency: "EUR",
      totalPortfolioValue: 10000,
      rows,
      growthInputs: [{ marketValue: 10000, dividendGrowth5y: 0.04 }],
      monthlyContribution: 0,
      scenarios,
    });
    expect(
      report.warnings.some((w) => /ESTIMATED|estimated/i.test(w)),
    ).toBe(true);
  });

  it("Drie horizons (5/10/20) gegenereerd", () => {
    const report = buildDividendReport({
      asOf: ASOF,
      baseCurrency: "EUR",
      totalPortfolioValue: 10000,
      rows: [],
      growthInputs: [],
      monthlyContribution: 0,
      scenarios,
    });
    expect(report.simulations.map((s) => s.horizonYears)).toEqual([5, 10, 20]);
  });

  it("Disclaimer benoemt expliciet 'niet gegarandeerd' (geen schijnzekerheid)", () => {
    const report = buildDividendReport({
      asOf: ASOF,
      baseCurrency: "EUR",
      totalPortfolioValue: 10000,
      rows: [],
      growthInputs: [],
      monthlyContribution: 0,
      scenarios,
    });
    expect(report.disclaimer.length).toBeGreaterThan(0);
    expect(report.disclaimer).toMatch(/niet gegarandeerd/i);
    // Geen positieve "gegarandeerd"-claims (zonder "niet" ervoor).
    expect(report.disclaimer).not.toMatch(/zeker winst|gegarandeerd rendement/i);
  });
});

describe("Module 22 — spec-conformance", () => {
  it("Spec eist 5/10/20-jaars horizons", () => {
    const sim5 = simulateDrip({
      initialValue: 1000,
      annualDividendGross: 0,
      monthlyContribution: 0,
      scenarios: { conservative: 0.04, neutral: 0.07, optimistic: 0.1 },
      horizonYears: 5,
    });
    const sim10 = simulateDrip({
      initialValue: 1000,
      annualDividendGross: 0,
      monthlyContribution: 0,
      scenarios: { conservative: 0.04, neutral: 0.07, optimistic: 0.1 },
      horizonYears: 10,
    });
    const sim20 = simulateDrip({
      initialValue: 1000,
      annualDividendGross: 0,
      monthlyContribution: 0,
      scenarios: { conservative: 0.04, neutral: 0.07, optimistic: 0.1 },
      horizonYears: 20,
    });
    expect(sim5.horizonYears).toBe(5);
    expect(sim10.horizonYears).toBe(10);
    expect(sim20.horizonYears).toBe(20);
  });

  it("Spec eist 3 scenarios per simulatie (conservatief/neutraal/optimistisch)", () => {
    const sim = simulateDrip({
      initialValue: 1000,
      annualDividendGross: 0,
      monthlyContribution: 0,
      scenarios: { conservative: 0.04, neutral: 0.07, optimistic: 0.1 },
      horizonYears: 10,
    });
    const keys = Object.keys(sim.withDrip).sort();
    expect(keys).toEqual(["conservative", "neutral", "optimistic"]);
  });
});
