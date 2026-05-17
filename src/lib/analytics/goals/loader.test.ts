import { describe, expect, it } from "vitest";

import { applyLivePortfolioValues } from "./loader";
import type { FinancialGoal } from "./types";

/**
 * Module 5-uitbreiding — live-sync helper test.
 *
 * Verifieert dat `applyLivePortfolioValues` de `currentAmount` van
 * gelinkte doelen vervangt door de live portfolio-waarde, en doelen
 * zonder koppeling onaangetast laat. Pure functie, geen DB / market-
 * data nodig.
 */

function makeGoal(overrides: Partial<FinancialGoal> = {}): FinancialGoal {
  return {
    id: "g-1",
    userId: "u-1",
    type: "WEALTH_GROWTH",
    name: "Vermogensgroei",
    targetAmount: 500_000,
    targetDate: "2046-01-01",
    monthlyContribution: 500,
    currentAmount: 30_576, // Het handmatige veld — wat de bug zichtbaar maakte.
    expectedAnnualReturn: 0.06,
    riskProfile: "BALANCED",
    baseCurrency: "EUR",
    description: null,
    portfolioId: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("applyLivePortfolioValues", () => {
  it("overschrijft currentAmount met live portfolio-waarde bij gekoppeld doel", () => {
    const goal = makeGoal({ portfolioId: "p-1", currentAmount: 30_576 });
    const live = new Map([["p-1", 80_874.05]]);

    const { goals, liveSyncedGoalIds } = applyLivePortfolioValues([goal], live);

    expect(goals).toHaveLength(1);
    expect(goals[0]!.currentAmount).toBe(80_874.05);
    expect(liveSyncedGoalIds.has("g-1")).toBe(true);
  });

  it("laat doel zonder portfolioId onaangetast", () => {
    const goal = makeGoal({ portfolioId: null, currentAmount: 30_576 });
    const live = new Map([["p-1", 80_874.05]]);

    const { goals, liveSyncedGoalIds } = applyLivePortfolioValues([goal], live);

    expect(goals[0]!.currentAmount).toBe(30_576);
    expect(liveSyncedGoalIds.size).toBe(0);
  });

  it("laat doel met onbekende portfolioId onaangetast (graceful)", () => {
    // Bv. market-data faalde voor die portfolio → live-value Map heeft 'm niet.
    const goal = makeGoal({ portfolioId: "p-missing", currentAmount: 30_576 });
    const live = new Map<string, number>([["p-1", 80_874.05]]);

    const { goals, liveSyncedGoalIds } = applyLivePortfolioValues([goal], live);

    expect(goals[0]!.currentAmount).toBe(30_576);
    expect(liveSyncedGoalIds.size).toBe(0);
  });

  it("muteert input-goals niet (immutability-contract)", () => {
    const goal = makeGoal({ portfolioId: "p-1", currentAmount: 30_576 });
    const input = [goal];
    const live = new Map([["p-1", 80_874.05]]);

    applyLivePortfolioValues(input, live);

    expect(input[0]!.currentAmount).toBe(30_576);
  });

  it("verschillende doelen + verschillende portefeuilles tegelijk", () => {
    const live = new Map([
      ["p-1", 80_874.05],
      ["p-2", 25_000],
    ]);
    const goals = [
      makeGoal({ id: "g-1", portfolioId: "p-1", currentAmount: 1 }),
      makeGoal({ id: "g-2", portfolioId: "p-2", currentAmount: 2 }),
      makeGoal({ id: "g-3", portfolioId: null, currentAmount: 999 }),
    ];

    const { goals: out, liveSyncedGoalIds } = applyLivePortfolioValues(
      goals,
      live,
    );

    expect(out[0]!.currentAmount).toBe(80_874.05);
    expect(out[1]!.currentAmount).toBe(25_000);
    expect(out[2]!.currentAmount).toBe(999);
    expect(liveSyncedGoalIds).toEqual(new Set(["g-1", "g-2"]));
  });
});
