/**
 * Goal-engine: combineert projectie + scenario's + feasibility tot
 * een complete `GoalProjection` per doel.
 *
 * **Pure functie**: zelfde input → identieke output. Geen DB.
 */

import {
  buildProjectionSeries,
  monthsBetween,
  projectFutureValue,
  solveRequiredAnnualReturn,
  solveRequiredMonthlyContribution,
  yearsBetween,
} from "./projection";
import type {
  FeasibilityAssessment,
  FeasibilityTier,
  FinancialGoal,
  GoalProjection,
  ScenarioKey,
  ScenarioProjection,
} from "./types";
import { SCENARIO_SPREAD } from "./types";

export interface ComputeGoalProjectionInput {
  goal: FinancialGoal;
  /** Wanneer de berekening wordt gedaan — typisch `new Date()`. */
  asOf: Date;
}

export function computeGoalProjection(
  input: ComputeGoalProjectionInput,
): GoalProjection {
  const { goal, asOf } = input;
  const targetDate = new Date(goal.targetDate);

  // Edge case: target-datum in verleden → 0-jaar projectie met huidige stand.
  const yearsToTarget = Math.max(0, yearsBetween(asOf, targetDate));
  const months = Math.max(0, monthsBetween(asOf, targetDate));
  const progress =
    goal.targetAmount > 0 ? goal.currentAmount / goal.targetAmount : 0;

  const spread = SCENARIO_SPREAD[goal.riskProfile] ?? 0.03;
  const neutralRate = goal.expectedAnnualReturn;
  const pessimisticRate = Math.max(0, neutralRate - spread);
  const optimisticRate = neutralRate + spread;

  const scenarios: Record<ScenarioKey, ScenarioProjection> = {
    pessimistic: buildScenario(
      goal,
      asOf,
      months,
      pessimisticRate,
      "pessimistic",
    ),
    neutral: buildScenario(goal, asOf, months, neutralRate, "neutral"),
    optimistic: buildScenario(goal, asOf, months, optimisticRate, "optimistic"),
  };

  const feasibility = assessFeasibility(goal, asOf, months, scenarios);

  return {
    goalId: goal.id,
    computedAt: asOf.toISOString(),
    yearsToTarget,
    progress: clamp01(progress),
    scenarios,
    feasibility,
  };
}

// ============================================================
//  Scenario-builder
// ============================================================

function buildScenario(
  goal: FinancialGoal,
  asOf: Date,
  months: number,
  annualReturn: number,
  key: ScenarioKey,
): ScenarioProjection {
  const fv = projectFutureValue({
    initialAmount: goal.currentAmount,
    monthlyContribution: goal.monthlyContribution,
    annualReturn,
    months,
  });
  const series = buildProjectionSeries({
    initialAmount: goal.currentAmount,
    monthlyContribution: goal.monthlyContribution,
    annualReturn,
    months,
    startDate: asOf,
  });
  return {
    key,
    annualReturn,
    finalValue: fv.finalValue,
    series,
    surplus: fv.finalValue - goal.targetAmount,
    meetsTarget: fv.finalValue >= goal.targetAmount,
  };
}

// ============================================================
//  Feasibility
// ============================================================

/**
 * Tier-logica:
 *  - ON_TRACK    — pessimistic-scenario haalt het al (zeer comfortabel)
 *  - ACHIEVABLE  — neutral haalt het, pessimistic niet
 *  - AT_RISK     — alleen optimistic haalt het
 *  - UNLIKELY    — zelfs optimistic haalt het niet
 *
 * Daarbij berekenen we de gap-velden zodat de UI concrete acties kan
 * tonen ("verhoog inleg met €X" of "alternatief: zoek hoger rendement").
 */
function assessFeasibility(
  goal: FinancialGoal,
  asOf: Date,
  months: number,
  scenarios: Record<ScenarioKey, ScenarioProjection>,
): FeasibilityAssessment {
  const tier = deriveTier(scenarios);
  const requiredMonthly = solveRequiredMonthlyContribution({
    targetAmount: goal.targetAmount,
    initialAmount: goal.currentAmount,
    annualReturn: goal.expectedAnnualReturn,
    months,
  });
  const requiredAnnualReturn = solveRequiredAnnualReturn({
    targetAmount: goal.targetAmount,
    initialAmount: goal.currentAmount,
    monthlyContribution: goal.monthlyContribution,
    months,
  });
  const contributionGap = Math.max(0, requiredMonthly - goal.monthlyContribution);

  // We voeren jaarberekening + datum check ook uit zodat de tekst niet
  // afhankelijk is van NaN-edge-cases.
  const summary = buildSummary(goal, tier, asOf, scenarios, contributionGap);

  return {
    tier,
    summary,
    requiredMonthlyContribution: requiredMonthly,
    contributionGap,
    requiredAnnualReturn,
  };
}

function deriveTier(
  scenarios: Record<ScenarioKey, ScenarioProjection>,
): FeasibilityTier {
  if (scenarios.pessimistic.meetsTarget) return "ON_TRACK";
  if (scenarios.neutral.meetsTarget) return "ACHIEVABLE";
  if (scenarios.optimistic.meetsTarget) return "AT_RISK";
  return "UNLIKELY";
}

function buildSummary(
  goal: FinancialGoal,
  tier: FeasibilityTier,
  asOf: Date,
  scenarios: Record<ScenarioKey, ScenarioProjection>,
  contributionGap: number,
): string {
  const target = formatCurrency(goal.targetAmount, goal.baseCurrency);
  const neutral = formatCurrency(scenarios.neutral.finalValue, goal.baseCurrency);

  if (tier === "ON_TRACK") {
    return `Doel ${target} ligt comfortabel binnen bereik — zelfs in een pessimistisch scenario kom je uit op ${formatCurrency(scenarios.pessimistic.finalValue, goal.baseCurrency)}.`;
  }
  if (tier === "ACHIEVABLE") {
    return `Bij het verwachte rendement haal je ${neutral}. In een pessimistisch scenario blijft het achter — overweeg een buffer of iets hogere maandinleg.`;
  }
  if (tier === "AT_RISK") {
    const gapStr =
      contributionGap > 0
        ? ` Met ongeveer ${formatCurrency(contributionGap, goal.baseCurrency)}/maand extra zou het doel ook in een neutraal scenario haalbaar zijn.`
        : "";
    return `Het doel is alleen haalbaar bij optimistisch rendement.${gapStr}`;
  }
  return `Zelfs in een optimistisch scenario kom je niet aan ${target}. Overweeg het doel, de horizon of de maandelijkse inleg bij te stellen.`;
}

// ============================================================
//  Helpers
// ============================================================

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function formatCurrency(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}
