/**
 * Dividend Calendar & DRIP Simulator — server-side loader (Module 22).
 *
 * Hergebruikt:
 *  - portfolioRepository.findUserContextByEmail → profile + monthlyContribution
 *  - buildPortfolioView → totalValue + valuations
 *  - getFundamentals → dividendYield + dividendGrowth5y per ticker
 *  - DEFAULT_EXPECTED_RETURN + SCENARIO_SPREAD uit goals/types
 *
 * Faal-safe: market-data failures → row valt op `low` dataQuality terug.
 */

import { buildPortfolioView } from "@/lib/analytics";
import {
  DEFAULT_EXPECTED_RETURN,
  SCENARIO_SPREAD,
} from "@/lib/analytics/goals";
import { getFundamentals } from "@/lib/data/fundamentals";
import { portfolioRepository } from "@/lib/data";
import type { RiskTolerance } from "@/types/profile";

import {
  buildCalendarRow,
  buildDividendReport,
} from "./engine";
import type { DividendReport, DripScenario } from "./types";

export interface LoadDividendReportInput {
  userEmail: string;
  asOf?: Date;
}

export async function loadDividendReport(
  input: LoadDividendReportInput,
): Promise<DividendReport | null> {
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
  });

  // Fetch fundamentals per holding (faal-safe per call).
  const rows = [];
  const growthInputs = [];
  for (const v of view.valuations) {
    let dividendYield: number | null = null;
    let dividendGrowth5y: number | null = null;
    try {
      const f = await getFundamentals(v.holding.ticker);
      dividendYield = f?.dividendYield ?? null;
      dividendGrowth5y = f?.dividendGrowth5y ?? null;
    } catch {
      // ignore — row blijft op missing/low.
    }
    rows.push(
      buildCalendarRow({
        ticker: v.holding.ticker,
        name: v.holding.name,
        marketValue: v.marketValueBase,
        dividendYield,
        assetClass: v.holding.assetClass,
      }),
    );
    growthInputs.push({
      marketValue: v.marketValueBase,
      dividendGrowth5y,
    });
  }

  // DRIP-scenarios uit risk-profile (consistent met goals/wealth module).
  const risk = (ctx.profile?.riskTolerance ?? "BALANCED") as RiskTolerance;
  const base = DEFAULT_EXPECTED_RETURN[risk];
  const spread = SCENARIO_SPREAD[risk];
  const scenarios: Record<DripScenario, number> = {
    conservative: Math.max(0, base - spread),
    neutral: base,
    optimistic: base + spread,
  };

  return buildDividendReport({
    asOf: asOfIso,
    baseCurrency: view.summary.baseCurrency,
    totalPortfolioValue: view.summary.totalValue,
    rows,
    growthInputs,
    monthlyContribution: ctx.monthlyContribution ?? 0,
    scenarios,
  });
}
