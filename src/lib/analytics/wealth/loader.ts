/**
 * Long-Term Wealth Dashboard — server-side loader (Module 21).
 *
 * Hergebruikt:
 *  - portfolioRepository.findUserContextByEmail → profile + monthlyContribution
 *  - buildPortfolioView → totalValue + rebalance-target voor drift
 *  - loadGoalsForUser (Module 5) → goals + projections (incl. live-sync)
 *  - transactionRepository.list → maandelijkse DEPOSIT-sommatie
 *  - getFundamentals → dividend yield per ticker
 *
 * Faal-safe: elke sub-fetch met try/catch → sensible defaults.
 */

import { buildPortfolioView } from "@/lib/analytics";
import { loadGoalsForUser } from "@/lib/analytics/goals";
import { getFundamentals } from "@/lib/data/fundamentals";
import { portfolioRepository, transactionRepository } from "@/lib/data";
import type { RiskTolerance } from "@/types/profile";

import {
  buildWealthDashboardReport,
  type BuildWealthReportInput,
} from "./engine";
import type { WealthDashboardReport } from "./types";

export interface LoadWealthDashboardInput {
  userEmail: string;
  asOf?: Date;
}

export async function loadWealthDashboard(
  input: LoadWealthDashboardInput,
): Promise<WealthDashboardReport | null> {
  const asOf = input.asOf ?? new Date();
  const asOfIso = asOf.toISOString();

  const ctx = await portfolioRepository
    .findUserContextByEmail(input.userEmail)
    .catch(() => null);
  if (!ctx?.userId || !ctx.portfolio) {
    return null;
  }

  const view = await buildPortfolioView(ctx.portfolio, {
    includeFundamentals: true,
    includeFactorScores: true,
  });

  const goalsResult = await loadGoalsForUser({
    userEmail: input.userEmail,
    asOf,
  });

  // Maandelijkse contributed = som van DEPOSIT-transactions in deze
  // kalendermaand.
  const contributedThisMonth = await sumDepositsThisMonth({
    portfolioId: ctx.portfolio.id,
    asOf,
  });

  // Drift: huidige weight vs target weight uit rebalance.recommendations.
  // Posities zonder target krijgen target = current (geen drift).
  const driftRows = view.rebalance.recommendations.map((r) => ({
    ticker: r.ticker,
    name: r.name,
    currentWeight: r.currentWeight,
    targetWeight: r.targetWeight,
  }));

  // Dividend-data per ticker (faal-safe).
  const dividendData = await loadDividendData(view).catch(() => null);

  const reportInput: BuildWealthReportInput = {
    asOf: asOfIso,
    baseCurrency: view.summary.baseCurrency,
    totalValue: view.summary.totalValue,
    plannedMonthlyContribution: ctx.monthlyContribution ?? 0,
    riskTolerance: (ctx.profile?.riskTolerance ?? "BALANCED") as RiskTolerance,
    goalsWithProjection: goalsResult.combined,
    contributedThisMonth,
    driftRows,
    dividendData,
  };

  return buildWealthDashboardReport(reportInput);
}

// ============================================================
//  Helpers
// ============================================================

async function sumDepositsThisMonth(args: {
  portfolioId: string;
  asOf: Date;
}): Promise<number> {
  try {
    const year = args.asOf.getUTCFullYear();
    const month = args.asOf.getUTCMonth(); // 0-indexed
    const monthStart = new Date(Date.UTC(year, month, 1));
    const monthEnd = new Date(Date.UTC(year, month + 1, 1));

    // Module 21: inleg = CASH-transacties met positief signedAmount.
    // (Geen aparte DEPOSIT-type in deze codebase.) Filter op type=CASH
    // + executedAt in deze maand + signedAmount > 0.
    const all = await transactionRepository.list({
      portfolioId: args.portfolioId,
      year,
      type: "CASH",
      take: 500,
    });

    let total = 0;
    for (const tx of all) {
      const txDate = new Date(tx.executedAt);
      if (
        txDate >= monthStart &&
        txDate < monthEnd &&
        typeof tx.signedAmount === "number" &&
        tx.signedAmount > 0
      ) {
        total += tx.signedAmount;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

async function loadDividendData(view: {
  valuations: ReadonlyArray<{
    holding: { ticker: string };
    marketValueBase: number;
  }>;
}) {
  const out: Array<{
    ticker: string;
    marketValue: number;
    dividendYield: number | null;
  }> = [];
  for (const v of view.valuations) {
    let dividendYield: number | null = null;
    try {
      const f = await getFundamentals(v.holding.ticker);
      dividendYield = f?.dividendYield ?? null;
    } catch {
      dividendYield = null;
    }
    out.push({
      ticker: v.holding.ticker,
      marketValue: v.marketValueBase,
      dividendYield,
    });
  }
  return out;
}
