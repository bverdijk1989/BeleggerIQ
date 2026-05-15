/**
 * Server-side loader: run alle 9 vooraf-gedefinieerde scenarios tegen
 * de primaire portefeuille van de gebruiker.
 *
 * Pure orchestrator — geen extra I/O bovenop wat het dashboard al heeft
 * opgehaald.
 */

import type { ISODateString } from "@/types/common";

import { buildPortfolioView } from "../portfolio-view";

import { STRESS_SCENARIO_CATALOG } from "./catalog";
import { runStressTest, type StressPositionInput } from "./engine";
import type { StressTestReport } from "./types";
import { STRESS_DISCLAIMER } from "./types";

import { portfolioRepository } from "@/lib/data";

export interface LoadStressTestReportInput {
  userEmail: string;
  asOf?: ISODateString;
}

export interface LoadStressTestReportResult {
  report: StressTestReport | null;
  noPortfolio: boolean;
}

export async function loadStressTestReport(
  input: LoadStressTestReportInput,
): Promise<LoadStressTestReportResult> {
  const portfolio = await portfolioRepository
    .findPrimaryByEmail(input.userEmail)
    .catch(() => null);
  if (!portfolio) return { report: null, noPortfolio: true };

  const view = await buildPortfolioView(portfolio, {
    includeFundamentals: false,
    includeFactorScores: false,
    cashBalance: portfolio.cashBalance,
  }).catch(() => null);
  if (!view) return { report: null, noPortfolio: true };

  const positions: StressPositionInput[] = view.valuations.map((v) => ({
    ticker: v.holding.ticker,
    name: v.holding.name,
    sector: v.holding.sector ?? null,
    marketValueBase: v.marketValueBase,
    assetClass: v.holding.assetClass,
    currency: v.holding.currency,
    beta: typeof v.holding.beta === "number" ? v.holding.beta : null,
  }));

  const cashBalance = view.summary.cashBalance ?? 0;
  const totalValue = view.summary.totalValue;
  const baseCurrency = view.summary.baseCurrency;

  const results = STRESS_SCENARIO_CATALOG.map((scenario) =>
    runStressTest({
      scenario,
      positions,
      cashBalance,
      baseCurrency,
      totalValue,
    }),
  );

  // Worst-case = laagste portfolioImpactPct; best-case = hoogste.
  const sorted = [...results].sort(
    (a, b) => a.portfolioImpactPct - b.portfolioImpactPct,
  );
  const worst = sorted[0] ?? null;
  const best = sorted[sorted.length - 1] ?? null;

  const report: StressTestReport = {
    generatedAt: input.asOf ?? new Date().toISOString(),
    baseCurrency,
    totalValue,
    results,
    worst,
    best,
    disclaimer: STRESS_DISCLAIMER,
  };

  return { report, noPortfolio: false };
}
