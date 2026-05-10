/**
 * Goal-loader: haalt alle actieve doelen voor één user en berekent de
 * projectie + scenarios per doel.
 *
 * **Pure aggregator** boven de DB-fetch — geen extra projectie-state in
 * de DB; we recomputen op elke pageload (deterministisch + goedkoop).
 */

import { goalRepository, portfolioRepository } from "@/lib/data";

import { computeGoalProjection } from "./engine";
import type { FinancialGoal, GoalProjection } from "./types";

export interface LoadGoalsForUserInput {
  userEmail: string;
  asOf?: Date;
}

export interface LoadGoalsForUserResult {
  goals: FinancialGoal[];
  projections: Map<string, GoalProjection>;
  /** Alle doelen + hun projectie in één lijst (UI-friendly). */
  combined: Array<{ goal: FinancialGoal; projection: GoalProjection }>;
  noUser: boolean;
}

export async function loadGoalsForUser(
  input: LoadGoalsForUserInput,
): Promise<LoadGoalsForUserResult> {
  const ctx = await portfolioRepository
    .findUserContextByEmail(input.userEmail)
    .catch(() => null);
  if (!ctx?.userId) {
    return {
      goals: [],
      projections: new Map(),
      combined: [],
      noUser: true,
    };
  }
  const goals = await goalRepository.listForUser(ctx.userId, { activeOnly: true });
  const asOf = input.asOf ?? new Date();
  const projections = new Map<string, GoalProjection>();
  for (const goal of goals) {
    projections.set(goal.id, computeGoalProjection({ goal, asOf }));
  }
  const combined = goals.map((goal) => ({
    goal,
    projection: projections.get(goal.id)!,
  }));
  return {
    goals,
    projections,
    combined,
    noUser: false,
  };
}
