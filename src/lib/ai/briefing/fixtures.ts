/**
 * Test-fixtures voor de briefing-tests. Niet voor productiegebruik.
 */

import type { BriefingContext } from "./types";

export function makeBriefingContext(
  overrides: Partial<BriefingContext> = {},
): BriefingContext {
  const base: BriefingContext = {
    portfolioId: "p-1",
    briefingDate: "2026-05-10",
    baseCurrency: "EUR",
    totals: {
      totalValue: 100000,
      cashBalance: 5000,
      cashShare: 0.05,
      positionCount: 12,
    },
    movement: {
      dayChangePct: 0.012,
      weekChangePct: 0.034,
      monthChangePct: -0.018,
      sincePurchasePct: 0.085,
    },
    winnersLosers: {
      winners: [
        {
          ticker: "ASML",
          name: "ASML Holding",
          pnlPct: 0.42,
          marketValueBase: 18000,
          weight: 0.18,
        },
        {
          ticker: "MSFT",
          name: "Microsoft",
          pnlPct: 0.31,
          marketValueBase: 12000,
          weight: 0.12,
        },
      ],
      losers: [
        {
          ticker: "BMW.DE",
          name: "BMW",
          pnlPct: -0.16,
          marketValueBase: 7000,
          weight: 0.07,
        },
      ],
    },
    risks: [
      {
        title: "Concentratie ASML",
        severity: "elevated",
        impact: "ASML weegt 18% van de portefeuille; single-name fout heeft grote impact.",
        recommendedAction: "Trim ASML met circa 1 aandeel",
        confidence: 0.78,
      },
    ],
    macro: {
      stance: "NEUTRAL",
      score: 55,
      confidence: 0.7,
      narrative: "Markt is gebalanceerd; geen extreme tilt.",
    },
    concentration: {
      largestPositionTicker: "ASML",
      largestPositionWeight: 0.18,
      largestSectorLabel: "Technology",
      largestSectorWeight: 0.42,
      portfolioVolatility: 0.21,
      maxDrawdown: 0.15,
    },
    focusAction: {
      title: "Trim ASML met 1 aandeel",
      description:
        "Engine-prioriteit op concentratie-reductie; herinvestering naar VWCE voorgesteld.",
      confidence: 0.78,
      sourceEngine: "action-engine",
    },
    earningsNews: { available: false, items: [] },
    dataSources: {
      snapshots: 60,
      factorScored: 8,
      regimeAvailable: true,
      riskActionsAvailable: 1,
    },
  };
  return { ...base, ...overrides };
}
