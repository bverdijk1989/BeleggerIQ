import { describe, expect, it } from "vitest";

import type { GoalProjection } from "@/lib/analytics/goals";
import type { FinancialGoal } from "@/lib/analytics/goals";

import { buildWealthDashboardReport } from "./engine";
import { WEALTH_DISCLAIMER } from "./types";

/**
 * Module 21 — Wealth Dashboard engine tests.
 */

const ASOF = "2026-05-18T00:00:00.000Z";

function makeGoal(over: Partial<FinancialGoal> = {}): FinancialGoal {
  return {
    id: "g-1",
    userId: "u-1",
    type: "RETIREMENT",
    name: "Pensioen",
    targetAmount: 500_000,
    targetDate: "2056-01-01",
    monthlyContribution: 500,
    currentAmount: 50_000,
    expectedAnnualReturn: 0.06,
    riskProfile: "BALANCED",
    baseCurrency: "EUR",
    description: null,
    portfolioId: null,
    isActive: true,
    createdAt: ASOF,
    updatedAt: ASOF,
    ...over,
  };
}

function makeProjection(
  tier: GoalProjection["feasibility"]["tier"],
  progress = 0.5,
): GoalProjection {
  return {
    goalId: "g-1",
    computedAt: ASOF,
    yearsToTarget: 30,
    progress,
    scenarios: {
      pessimistic: {
        key: "pessimistic",
        annualReturn: 0.04,
        finalValue: 400_000,
        series: [],
        surplus: -100_000,
        meetsTarget: false,
      },
      neutral: {
        key: "neutral",
        annualReturn: 0.06,
        finalValue: 600_000,
        series: [],
        surplus: 100_000,
        meetsTarget: true,
      },
      optimistic: {
        key: "optimistic",
        annualReturn: 0.08,
        finalValue: 900_000,
        series: [],
        surplus: 400_000,
        meetsTarget: true,
      },
    },
    feasibility: {
      tier,
      summary: "",
      requiredMonthlyContribution: null,
      contributionGap: null,
      requiredAnnualReturn: null,
    },
  };
}

describe("Module 21 — buildWealthDashboardReport — course-status", () => {
  it("no goals → status no_goals", () => {
    const report = buildWealthDashboardReport({
      asOf: ASOF,
      baseCurrency: "EUR",
      totalValue: 50_000,
      plannedMonthlyContribution: 500,
      riskTolerance: "BALANCED",
      goalsWithProjection: [],
      contributedThisMonth: 500,
      driftRows: [],
      dividendData: null,
    });
    expect(report.course.status).toBe("no_goals");
    expect(report.course.totalGoals).toBe(0);
  });

  it("alle goals haalbaar → on_track", () => {
    const report = buildWealthDashboardReport({
      asOf: ASOF,
      baseCurrency: "EUR",
      totalValue: 50_000,
      plannedMonthlyContribution: 500,
      riskTolerance: "BALANCED",
      goalsWithProjection: [
        { goal: makeGoal(), projection: makeProjection("ON_TRACK") },
        {
          goal: makeGoal({ id: "g-2" }),
          projection: makeProjection("ACHIEVABLE"),
        },
      ],
      contributedThisMonth: 500,
      driftRows: [],
      dividendData: null,
    });
    expect(report.course.status).toBe("on_track");
    expect(report.course.achievableGoals).toBe(2);
  });

  it("≥80% haalbaar → mostly_on_track", () => {
    const report = buildWealthDashboardReport({
      asOf: ASOF,
      baseCurrency: "EUR",
      totalValue: 50_000,
      plannedMonthlyContribution: 500,
      riskTolerance: "BALANCED",
      goalsWithProjection: [
        { goal: makeGoal({ id: "g-1" }), projection: makeProjection("ON_TRACK") },
        { goal: makeGoal({ id: "g-2" }), projection: makeProjection("ON_TRACK") },
        { goal: makeGoal({ id: "g-3" }), projection: makeProjection("ON_TRACK") },
        { goal: makeGoal({ id: "g-4" }), projection: makeProjection("ON_TRACK") },
        { goal: makeGoal({ id: "g-5" }), projection: makeProjection("UNLIKELY") },
      ],
      contributedThisMonth: 500,
      driftRows: [],
      dividendData: null,
    });
    expect(report.course.status).toBe("mostly_on_track");
  });

  it("<50% haalbaar → off_track", () => {
    const report = buildWealthDashboardReport({
      asOf: ASOF,
      baseCurrency: "EUR",
      totalValue: 50_000,
      plannedMonthlyContribution: 500,
      riskTolerance: "BALANCED",
      goalsWithProjection: [
        { goal: makeGoal({ id: "g-1" }), projection: makeProjection("UNLIKELY") },
        { goal: makeGoal({ id: "g-2" }), projection: makeProjection("AT_RISK") },
      ],
      contributedThisMonth: 500,
      driftRows: [],
      dividendData: null,
    });
    expect(report.course.status).toBe("off_track");
  });
});

describe("Module 21 — 10-jaars projectie scenarios", () => {
  it("3 scenarios: pess/neutral/optim met oplopende returns", () => {
    const report = buildWealthDashboardReport({
      asOf: ASOF,
      baseCurrency: "EUR",
      totalValue: 50_000,
      plannedMonthlyContribution: 500,
      riskTolerance: "BALANCED",
      goalsWithProjection: [],
      contributedThisMonth: 500,
      driftRows: [],
      dividendData: null,
    });
    const s = report.projection.scenarios;
    expect(s.pessimistic.annualReturn).toBeLessThan(s.neutral.annualReturn);
    expect(s.neutral.annualReturn).toBeLessThan(s.optimistic.annualReturn);
    expect(s.optimistic.finalValue).toBeGreaterThan(s.neutral.finalValue);
    expect(s.neutral.finalValue).toBeGreaterThan(s.pessimistic.finalValue);
  });

  it("aannames-lijst is niet leeg (Module 21 transparantie-eis)", () => {
    const report = buildWealthDashboardReport({
      asOf: ASOF,
      baseCurrency: "EUR",
      totalValue: 50_000,
      plannedMonthlyContribution: 500,
      riskTolerance: "BALANCED",
      goalsWithProjection: [],
      contributedThisMonth: 500,
      driftRows: [],
      dividendData: null,
    });
    expect(report.projection.assumptions.length).toBeGreaterThan(0);
    expect(
      report.projection.assumptions.some((a) =>
        /inflatie|sequence|kosten/i.test(a),
      ),
    ).toBe(true);
  });

  it("horizon is 120 maanden (10 jaar)", () => {
    const report = buildWealthDashboardReport({
      asOf: ASOF,
      baseCurrency: "EUR",
      totalValue: 50_000,
      plannedMonthlyContribution: 500,
      riskTolerance: "BALANCED",
      goalsWithProjection: [],
      contributedThisMonth: 500,
      driftRows: [],
      dividendData: null,
    });
    expect(report.projection.horizonMonths).toBe(120);
  });
});

describe("Module 21 — maandelijkse discipline", () => {
  it("ingelegd ≥ gepland → onTrack=true, delta ≥ 0", () => {
    const report = buildWealthDashboardReport({
      asOf: ASOF,
      baseCurrency: "EUR",
      totalValue: 50_000,
      plannedMonthlyContribution: 500,
      riskTolerance: "BALANCED",
      goalsWithProjection: [],
      contributedThisMonth: 600,
      driftRows: [],
      dividendData: null,
    });
    expect(report.discipline.onTrack).toBe(true);
    expect(report.discipline.delta).toBe(100);
  });

  it("ingelegd << gepland → onTrack=false", () => {
    const report = buildWealthDashboardReport({
      asOf: ASOF,
      baseCurrency: "EUR",
      totalValue: 50_000,
      plannedMonthlyContribution: 500,
      riskTolerance: "BALANCED",
      goalsWithProjection: [],
      contributedThisMonth: 100,
      driftRows: [],
      dividendData: null,
    });
    expect(report.discipline.onTrack).toBe(false);
    expect(report.discipline.delta).toBe(-400);
  });

  it("delta binnen 10%-tolerance → nog onTrack", () => {
    const report = buildWealthDashboardReport({
      asOf: ASOF,
      baseCurrency: "EUR",
      totalValue: 50_000,
      plannedMonthlyContribution: 500,
      riskTolerance: "BALANCED",
      goalsWithProjection: [],
      contributedThisMonth: 470, // -6% van planned
      driftRows: [],
      dividendData: null,
    });
    expect(report.discipline.onTrack).toBe(true);
  });
});

describe("Module 21 — drift-summary", () => {
  it("top-3 grootste afwijkingen worden gemarkeerd", () => {
    const report = buildWealthDashboardReport({
      asOf: ASOF,
      baseCurrency: "EUR",
      totalValue: 50_000,
      plannedMonthlyContribution: 500,
      riskTolerance: "BALANCED",
      goalsWithProjection: [],
      contributedThisMonth: 500,
      driftRows: [
        { ticker: "A", name: "A", currentWeight: 0.30, targetWeight: 0.20 }, // +10pp
        { ticker: "B", name: "B", currentWeight: 0.10, targetWeight: 0.15 }, // -5pp
        { ticker: "C", name: "C", currentWeight: 0.05, targetWeight: 0.10 }, // -5pp
        { ticker: "D", name: "D", currentWeight: 0.05, targetWeight: 0.05 }, // 0pp
      ],
      dividendData: null,
    });
    expect(report.drift.topRows).toHaveLength(3);
    expect(report.drift.topRows[0]!.ticker).toBe("A"); // grootste delta
    expect(report.drift.significantDrifts).toBe(3); // 3 rows met |delta|>2pp
  });
});

describe("Module 21 — dividend-inkomen", () => {
  it("null data → null card", () => {
    const report = buildWealthDashboardReport({
      asOf: ASOF,
      baseCurrency: "EUR",
      totalValue: 50_000,
      plannedMonthlyContribution: 500,
      riskTolerance: "BALANCED",
      goalsWithProjection: [],
      contributedThisMonth: 500,
      driftRows: [],
      dividendData: null,
    });
    expect(report.dividendIncome).toBeNull();
  });

  it("mix van covered + uncovered → correcte counts", () => {
    const report = buildWealthDashboardReport({
      asOf: ASOF,
      baseCurrency: "EUR",
      totalValue: 50_000,
      plannedMonthlyContribution: 500,
      riskTolerance: "BALANCED",
      goalsWithProjection: [],
      contributedThisMonth: 500,
      driftRows: [],
      dividendData: [
        { ticker: "ASML", marketValue: 10_000, dividendYield: 0.02 },
        { ticker: "MSFT", marketValue: 5_000, dividendYield: 0.01 },
        { ticker: "X", marketValue: 5_000, dividendYield: null },
      ],
    });
    expect(report.dividendIncome).not.toBeNull();
    expect(report.dividendIncome!.coveredPositions).toBe(2);
    expect(report.dividendIncome!.uncoveredPositions).toBe(1);
    // 10_000 × 0.02 + 5_000 × 0.01 = 250
    expect(report.dividendIncome!.annualGross).toBe(250);
  });
});

describe("Module 21 — disclaimer + transparantie", () => {
  it("Disclaimer benoemt 'indicatief / referentie / niet als voorspelling'", () => {
    expect(WEALTH_DISCLAIMER).toMatch(/indicatief|referentie|voorspelling/i);
  });

  it("Disclaimer bevat geen 'gegarandeerd' of 'zeker'-taal", () => {
    expect(WEALTH_DISCLAIMER).not.toMatch(/gegarandeerd|\bzeker\b/i);
  });
});
