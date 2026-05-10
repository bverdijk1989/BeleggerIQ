"use server";

import {
  buildPortfolioView,
  type PortfolioView,
} from "@/lib/analytics/portfolio-view";
import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";

import { buildCustomScenario } from "./custom";
import { runStressTest, type StressPositionInput } from "./engine";
import type { CustomStressScenarioInput, StressTestResult } from "./types";

export interface RunCustomStressTestResult {
  ok: boolean;
  error?: string;
  result?: StressTestResult;
}

/**
 * Server action: bouw + run een custom stress-scenario tegen de
 * primaire portefeuille van de ingelogde user.
 *
 * Pure server-side; geen DB-write — custom scenarios worden niet
 * gepersisteerd in v1 (ad-hoc gebruik).
 */
export async function runCustomStressTestAction(
  input: CustomStressScenarioInput,
): Promise<RunCustomStressTestResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, error: "Niet ingelogd" };

  const portfolio = await portfolioRepository
    .findPrimaryByEmail(auth.user.email)
    .catch(() => null);
  if (!portfolio) return { ok: false, error: "Geen portefeuille" };

  const view: PortfolioView | null = await buildPortfolioView(portfolio, {
    includeFundamentals: false,
    includeFactorScores: false,
  }).catch(() => null);
  if (!view) return { ok: false, error: "Portfolio-view kon niet geladen worden" };

  const positions: StressPositionInput[] = view.valuations.map((v) => ({
    ticker: v.holding.ticker,
    name: v.holding.name,
    sector: v.holding.sector ?? null,
    marketValueBase: v.marketValueBase,
    assetClass: v.holding.assetClass,
    currency: v.holding.currency,
    beta: typeof v.holding.beta === "number" ? v.holding.beta : null,
  }));

  const scenario = buildCustomScenario(input);
  const result = runStressTest({
    scenario,
    positions,
    cashBalance: view.summary.cashBalance ?? 0,
    baseCurrency: view.summary.baseCurrency,
    totalValue: view.summary.totalValue,
  });

  return { ok: true, result };
}
