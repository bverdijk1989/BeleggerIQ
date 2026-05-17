/**
 * Goal-loader: haalt alle actieve doelen voor één user en berekent de
 * projectie + scenarios per doel.
 *
 * **Pure aggregator** boven de DB-fetch — geen extra projectie-state in
 * de DB; we recomputen op elke pageload (deterministisch + goedkoop).
 *
 * **Live-sync uit gekoppelde portefeuilles (Module 5-uitbreiding)**:
 * doelen met `portfolioId` krijgen hun `currentAmount` automatisch uit
 * `buildPortfolioView(linkedPortfolio).summary.totalValue` zodat de
 * voortgang meebeweegt met de echte marktwaarde — geen handmatige
 * "Huidige stand"-update meer nodig.
 */

import { goalRepository, portfolioRepository } from "@/lib/data";

import { buildPortfolioView } from "../portfolio-view";
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
  /** Set van goal-ids waarvoor currentAmount uit gekoppelde portefeuille
   *  is afgeleid (in plaats van het handmatige veld). */
  liveSyncedGoalIds: Set<string>;
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
      liveSyncedGoalIds: new Set(),
      noUser: true,
    };
  }
  const rawGoals = await goalRepository.listForUser(ctx.userId, {
    activeOnly: true,
  });

  // Live-sync: voor elke unieke gekoppelde portfolioId pakken we de
  // huidige totalValue uit buildPortfolioView. Faalt market-data → val
  // terug op de handmatige currentAmount (graceful degradation).
  const linkedIds = new Set(
    rawGoals
      .map((g) => g.portfolioId)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  const liveValueById = new Map<string, number>();
  if (linkedIds.size > 0) {
    const portfolios = await portfolioRepository
      .findByUserId(ctx.userId)
      .catch(() => []);
    for (const p of portfolios) {
      if (!linkedIds.has(p.id)) continue;
      try {
        const view = await buildPortfolioView(p, {
          includeFundamentals: false,
          includeFactorScores: false,
        });
        liveValueById.set(p.id, view.summary.totalValue);
      } catch {
        // Skip — fall back to handmatige currentAmount.
      }
    }
  }

  const { goals, liveSyncedGoalIds } = applyLivePortfolioValues(
    rawGoals,
    liveValueById,
  );

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
    liveSyncedGoalIds,
    noUser: false,
  };
}

/**
 * Pure helper: overschrijf `currentAmount` voor doelen die aan een
 * portefeuille gekoppeld zijn met de live portefeuille-waarde uit
 * `liveValueById`. Goals zonder koppeling of zonder bekende live-waarde
 * blijven onveranderd. Geretourneerd: nieuwe goals-array + de set van
 * goal-ids die werden gesynchroniseerd.
 *
 * Export voor unit-tests; productiecode gaat via `loadGoalsForUser`.
 */
export function applyLivePortfolioValues(
  rawGoals: ReadonlyArray<FinancialGoal>,
  liveValueById: ReadonlyMap<string, number>,
): { goals: FinancialGoal[]; liveSyncedGoalIds: Set<string> } {
  const liveSyncedGoalIds = new Set<string>();
  const goals: FinancialGoal[] = rawGoals.map((g) => {
    if (g.portfolioId && liveValueById.has(g.portfolioId)) {
      liveSyncedGoalIds.add(g.id);
      return { ...g, currentAmount: liveValueById.get(g.portfolioId)! };
    }
    return g;
  });
  return { goals, liveSyncedGoalIds };
}
