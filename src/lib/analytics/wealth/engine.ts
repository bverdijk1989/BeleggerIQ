/**
 * Long-Term Wealth Dashboard — engine (Module 21).
 *
 * Pure functie: input zijn portfolio-summary + goals + transactions +
 * profile-risk-level; output is een `WealthDashboardReport`.
 *
 * Hergebruikt:
 *  - `projectFutureValue` + `buildProjectionSeries` uit goals/projection
 *  - `DEFAULT_EXPECTED_RETURN` + `SCENARIO_SPREAD` uit goals/types
 */

import type { ISODateString } from "@/types/common";
import type { RiskTolerance } from "@/types/profile";

import {
  buildProjectionSeries,
  projectFutureValue,
} from "../goals/projection";
import {
  DEFAULT_EXPECTED_RETURN,
  SCENARIO_SPREAD,
  type FinancialGoal,
  type GoalProjection,
  type ScenarioKey,
} from "../goals/types";
import type {
  AllocationDriftRow,
  AllocationDriftSummary,
  DecadeProjection,
  ExpectedDividendIncome,
  MonthlyDiscipline,
  WealthCourseStatus,
  WealthCourseSummary,
  WealthDashboardReport,
} from "./types";
import { WEALTH_DISCLAIMER } from "./types";

const DECADE_MONTHS = 10 * 12;
const DISCIPLINE_TOLERANCE = 0.10; // delta ≤ -10% van planned = off-track

export interface BuildWealthReportInput {
  asOf: ISODateString;
  baseCurrency: string;
  totalValue: number;
  /** Maandelijkse inleg uit profile (planned). */
  plannedMonthlyContribution: number;
  /** User-risicoprofiel — drijft default-rendement + spread. */
  riskTolerance: RiskTolerance;
  /** Alle actieve goals met projecties (gebruik goal-loader). */
  goalsWithProjection: ReadonlyArray<{
    goal: FinancialGoal;
    projection: GoalProjection;
  }>;
  /** Som van DEPOSIT-transacties in deze kalendermaand. */
  contributedThisMonth: number;
  /** Allocation-drift rijen: huidig vs target. */
  driftRows: ReadonlyArray<{
    ticker: string;
    name: string;
    currentWeight: number;
    targetWeight: number;
  }>;
  /** Optioneel: dividend-data per positie. Wanneer null = geen card. */
  dividendData: ReadonlyArray<{
    ticker: string;
    marketValue: number;
    dividendYield: number | null;
  }> | null;
}

export function buildWealthDashboardReport(
  input: BuildWealthReportInput,
): WealthDashboardReport {
  return {
    generatedAt: input.asOf,
    baseCurrency: input.baseCurrency,
    totalValue: input.totalValue,
    course: deriveCourse(input.goalsWithProjection),
    projection: buildDecadeProjection({
      asOf: input.asOf,
      totalValue: input.totalValue,
      plannedMonthlyContribution: input.plannedMonthlyContribution,
      riskTolerance: input.riskTolerance,
    }),
    drift: buildDriftSummary(input.driftRows),
    discipline: buildDiscipline({
      asOf: input.asOf,
      plannedMonthly: input.plannedMonthlyContribution,
      contributedThisMonth: input.contributedThisMonth,
    }),
    dividendIncome: buildDividendIncome(input.dividendData, input.totalValue),
    goals: input.goalsWithProjection.map(({ goal, projection }) => ({
      goal: {
        id: goal.id,
        name: goal.name,
        type: goal.type,
        targetAmount: goal.targetAmount,
        targetDate: goal.targetDate,
      },
      feasibilityTier: projection.feasibility.tier,
      progress: projection.progress,
    })),
    disclaimer: WEALTH_DISCLAIMER,
  };
}

// ============================================================
//  Sub-builders
// ============================================================

function deriveCourse(
  goalsWithProjection: ReadonlyArray<{
    goal: FinancialGoal;
    projection: GoalProjection;
  }>,
): WealthCourseSummary {
  const total = goalsWithProjection.length;
  if (total === 0) {
    return {
      status: "no_goals",
      message:
        "Geen financiële doelen ingesteld. Stel er één in om voortgang te zien.",
      totalGoals: 0,
      achievableGoals: 0,
    };
  }
  const achievable = goalsWithProjection.filter((g) => {
    const tier = g.projection.feasibility.tier;
    return tier === "ON_TRACK" || tier === "ACHIEVABLE";
  }).length;
  const ratio = achievable / total;

  let status: WealthCourseStatus;
  let message: string;
  if (ratio === 1) {
    status = "on_track";
    message =
      total === 1
        ? "Je doel ligt op koers."
        : `Alle ${total} doelen liggen op koers.`;
  } else if (ratio >= 0.8) {
    status = "mostly_on_track";
    message = `${achievable} van ${total} doelen op koers — kleine bijstellingen mogelijk.`;
  } else if (ratio >= 0.5) {
    status = "at_risk";
    message = `${achievable} van ${total} doelen op koers — sommige vragen aandacht.`;
  } else {
    status = "off_track";
    message = `Slechts ${achievable} van ${total} doelen op koers — bekijk inleg of horizon.`;
  }
  return { status, message, totalGoals: total, achievableGoals: achievable };
}

function buildDecadeProjection(input: {
  asOf: ISODateString;
  totalValue: number;
  plannedMonthlyContribution: number;
  riskTolerance: RiskTolerance;
}): DecadeProjection {
  const baseReturn = DEFAULT_EXPECTED_RETURN[input.riskTolerance];
  const spread = SCENARIO_SPREAD[input.riskTolerance];
  const startDate = new Date(input.asOf);
  const scenarios: DecadeProjection["scenarios"] = {
    pessimistic: buildScenario({
      ...input,
      annualReturn: Math.max(0, baseReturn - spread),
      startDate,
    }),
    neutral: buildScenario({
      ...input,
      annualReturn: baseReturn,
      startDate,
    }),
    optimistic: buildScenario({
      ...input,
      annualReturn: baseReturn + spread,
      startDate,
    }),
  };

  return {
    horizonMonths: DECADE_MONTHS,
    monthlyContribution: input.plannedMonthlyContribution,
    scenarios,
    assumptions: [
      `Verwacht rendement neutraal: ${(baseReturn * 100).toFixed(1)}%/jr (uit ${input.riskTolerance}-profiel).`,
      `Pessimistic / optimistic-spread: ±${(spread * 100).toFixed(1)}-punt.`,
      "Maandelijkse inleg is constant — geen indexatie of veranderende uitgaven.",
      "Geen inflatie-correctie: rendementen zijn nominaal, niet reëel.",
      "Geen belastingen of transactiekosten verwerkt.",
      "Sequence-of-returns wordt NIET gemodelleerd (linear compound).",
    ],
  };
}

function buildScenario(input: {
  totalValue: number;
  plannedMonthlyContribution: number;
  annualReturn: number;
  startDate: Date;
}) {
  const fv = projectFutureValue({
    initialAmount: input.totalValue,
    monthlyContribution: input.plannedMonthlyContribution,
    annualReturn: input.annualReturn,
    months: DECADE_MONTHS,
  });
  const series = buildProjectionSeries({
    initialAmount: input.totalValue,
    monthlyContribution: input.plannedMonthlyContribution,
    annualReturn: input.annualReturn,
    months: DECADE_MONTHS,
    startDate: input.startDate,
  }).map((p) => ({ yearOffset: p.yearOffset, value: p.value }));

  return {
    annualReturn: input.annualReturn,
    finalValue: fv.finalValue,
    series,
  };
}

function buildDriftSummary(
  rows: ReadonlyArray<{
    ticker: string;
    name: string;
    currentWeight: number;
    targetWeight: number;
  }>,
): AllocationDriftSummary {
  if (rows.length === 0) {
    return { topRows: [], significantDrifts: 0, alignmentScore: 100 };
  }
  const enriched: AllocationDriftRow[] = rows.map((r) => ({
    ...r,
    deltaWeight: r.currentWeight - r.targetWeight,
    top3: false,
  }));
  const sorted = [...enriched].sort(
    (a, b) => Math.abs(b.deltaWeight) - Math.abs(a.deltaWeight),
  );
  for (let i = 0; i < Math.min(3, sorted.length); i++) {
    sorted[i]!.top3 = true;
  }
  const significant = sorted.filter(
    (r) => Math.abs(r.deltaWeight) > 0.02,
  ).length;
  // Alignment-score: 100 - gemiddelde |delta| × 500 (5%-drift → -25 punten).
  const avgDelta =
    sorted.reduce((sum, r) => sum + Math.abs(r.deltaWeight), 0) /
    sorted.length;
  const alignmentScore = Math.max(0, Math.round(100 - avgDelta * 500));

  return {
    topRows: sorted.slice(0, 3),
    significantDrifts: significant,
    alignmentScore,
  };
}

function buildDiscipline(input: {
  asOf: ISODateString;
  plannedMonthly: number;
  contributedThisMonth: number;
}): MonthlyDiscipline {
  const month = input.asOf.slice(0, 7); // YYYY-MM
  const delta = input.contributedThisMonth - input.plannedMonthly;
  const tolerance = input.plannedMonthly * DISCIPLINE_TOLERANCE;
  const onTrack = delta >= -tolerance;
  return {
    month,
    contributedThisMonth: input.contributedThisMonth,
    plannedMonthly: input.plannedMonthly,
    delta,
    onTrack,
  };
}

function buildDividendIncome(
  data: ReadonlyArray<{
    ticker: string;
    marketValue: number;
    dividendYield: number | null;
  }> | null,
  totalValue: number,
): ExpectedDividendIncome | null {
  if (!data || data.length === 0) return null;
  let annualGross = 0;
  let coveredValue = 0;
  let coveredCount = 0;
  let uncoveredCount = 0;
  for (const d of data) {
    if (
      typeof d.dividendYield === "number" &&
      Number.isFinite(d.dividendYield) &&
      d.dividendYield > 0
    ) {
      annualGross += d.marketValue * d.dividendYield;
      coveredValue += d.marketValue;
      coveredCount += 1;
    } else {
      uncoveredCount += 1;
    }
  }
  const weightedYield =
    coveredValue > 0 ? annualGross / coveredValue : 0;
  return {
    annualGross,
    coveredPositions: coveredCount,
    uncoveredPositions: uncoveredCount,
    weightedYield,
  };
}

/** Re-export voor caller-convenience. */
export type { ScenarioKey };
