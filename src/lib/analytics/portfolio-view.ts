import type { Currency, ISODateString } from "@/types/common";
import type { FactorScore, FactorWeights } from "@/types/factor";
import type { Portfolio } from "@/types/portfolio";
import type { PolicySettings } from "@/types/profile";
import type { RebalancePlan } from "@/types/rebalance";
import type { PortfolioRiskSummary } from "@/types/risk";
import type {
  PortfolioHealthSummary,
  PortfolioSummary,
} from "@/types/summary";

import { enrichHoldings } from "./enrichment";
import { computeBasicHealthSummary } from "./health";
import { computePortfolioSummaryFromValuations } from "./portfolio-summary";
import { buildRebalancePlan } from "./rebalance-engine/engine";
import { type RebalanceThresholds } from "./rebalance-engine/thresholds";
import { buildRiskReport } from "./risk-engine/engine";
import { type RiskThresholds } from "./risk-engine/thresholds";
import type { HoldingValuation } from "./valuation";

/**
 * High-level orchestrator voor de UI: één call die quotes/FX ophaalt,
 * valuations bouwt, een PortfolioSummary genereert én een basic health-grade
 * produceert. Server-only (gebruikt market-data services).
 */

export interface PortfolioView {
  summary: PortfolioSummary;
  health: PortfolioHealthSummary;
  risk: PortfolioRiskSummary;
  rebalance: RebalancePlan;
  valuations: HoldingValuation[];
  factorScores: Map<string, FactorScore>;
  lastUpdated: ISODateString;
}

export interface BuildPortfolioViewOptions {
  baseCurrency?: Currency;
  cashBalance?: number;
  topN?: number;
  includeFundamentals?: boolean;
  includeFactorScores?: boolean;
  factorWeights?: FactorWeights;
  /** Overschrijf risk-engine thresholds (bv. vanuit PolicySettings). */
  riskThresholds?: RiskThresholds;
  /** Overschrijf rebalance-engine thresholds. */
  rebalanceThresholds?: RebalanceThresholds;
  /** PolicySettings uit het gebruikersprofiel, voor zowel risk als rebalance. */
  policy?: PolicySettings | null;
}

export async function buildPortfolioView(
  portfolio: Portfolio,
  options: BuildPortfolioViewOptions = {},
): Promise<PortfolioView> {
  const baseCurrency = options.baseCurrency ?? portfolio.baseCurrency;
  const { valuations, asOf, factorScores } = await enrichHoldings(
    portfolio.holdings,
    {
      baseCurrency,
      includeFundamentals: options.includeFundamentals,
      includeFactorScores: options.includeFactorScores,
      factorWeights: options.factorWeights,
    },
  );

  // Koppel factor scores aan valuations zodat downstream consumers ze
  // als denormalisatie op het Holding kunnen consumeren.
  const valuationsWithScores: HoldingValuation[] = valuations.map((v) => {
    const score = factorScores.get(v.holding.ticker);
    if (!score) return v;
    return { ...v, holding: { ...v.holding, factorScore: score } };
  });

  const summary = computePortfolioSummaryFromValuations(
    portfolio.id,
    baseCurrency,
    valuationsWithScores,
    {
      cashBalance: options.cashBalance ?? portfolio.cashBalance,
      cashCurrency: baseCurrency,
      topN: options.topN,
    },
  );

  const health = computeBasicHealthSummary({
    summary,
    valuations: valuationsWithScores,
    asOf,
  });

  const risk = buildRiskReport({
    portfolioId: portfolio.id,
    baseCurrency,
    valuations: valuationsWithScores,
    totalValue: summary.totalValue,
    asOf,
    thresholds: options.riskThresholds,
  });

  const rebalance = buildRebalancePlan({
    portfolioId: portfolio.id,
    baseCurrency,
    valuations: valuationsWithScores,
    totalValue: summary.totalValue,
    asOf,
    policy: options.policy ?? null,
    thresholds: options.rebalanceThresholds,
  });

  return {
    summary,
    health,
    risk,
    rebalance,
    valuations: valuationsWithScores,
    factorScores,
    lastUpdated: asOf,
  };
}
