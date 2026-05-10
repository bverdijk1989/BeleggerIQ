/**
 * Public API voor de Financial Goals module.
 */

export {
  type FeasibilityAssessment,
  type FeasibilityTier,
  type FinancialGoal,
  type GoalProjection,
  type GoalType,
  type ProjectionPoint,
  type ScenarioKey,
  type ScenarioProjection,
  DEFAULT_EXPECTED_RETURN,
  GOAL_TYPE_DESCRIPTIONS,
  GOAL_TYPE_LABELS,
  SCENARIO_SPREAD,
} from "./types";
export { computeGoalProjection } from "./engine";
export {
  annualToMonthly,
  buildProjectionSeries,
  monthsBetween,
  projectFutureValue,
  solveRequiredAnnualReturn,
  solveRequiredMonthlyContribution,
  yearsBetween,
} from "./projection";
export {
  loadGoalsForUser,
  type LoadGoalsForUserInput,
  type LoadGoalsForUserResult,
} from "./loader";
