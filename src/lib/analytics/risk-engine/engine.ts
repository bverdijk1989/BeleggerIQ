import type { Currency, ISODateString } from "@/types/common";
import type {
  PortfolioRiskSummary,
  PositionRiskAnalysis,
  RiskFlag,
  RiskSeverity,
} from "@/types/risk";

import { aggregateAllocation } from "../valuation";
import type { HoldingValuation } from "../valuation";

import {
  classifyConcentrationHhi,
  classifyPositionWeight,
  classifyTop5Weight,
  computeHhi,
  computeTop5Weight,
  positionConcentrationRiskScore,
} from "./concentration";
import {
  classifyForeignCurrencyExposure,
  computeCurrencyAllocation,
  computeForeignCurrencyExposure,
  currencyContribution,
  currencyRiskScore,
} from "./currency";
import {
  classifyTopSectorWeight,
  computeSectorAllocation,
  sectorRiskScore,
  topSector,
} from "./sector";
import {
  DEFAULT_RISK_THRESHOLDS,
  classFromScore,
  type CoreRiskClass,
  type RiskThresholds,
} from "./thresholds";
import {
  classifyVolatility,
  volatilityRiskScore,
} from "./volatility";
import { buildPortfolioWarnings } from "./warnings";

/**
 * Risk engine orchestrator. Combineert alle sub-modules tot één
 * `PortfolioRiskSummary` met ge-inlinede per-positie analyses.
 * Pure, sync — werkt op al verrijkte `HoldingValuation[]`.
 */

export interface BuildRiskReportInput {
  portfolioId: string;
  baseCurrency: Currency;
  valuations: HoldingValuation[];
  /** Totale portefeuille-waarde incl. cash, in base currency. */
  totalValue: number;
  asOf?: ISODateString;
  thresholds?: RiskThresholds;
}

// Gewichten voor de positierisicoscore. Samen 1.0.
const POSITION_SCORE_WEIGHTS = {
  concentration: 0.4,
  volatility: 0.4,
  currency: 0.2,
} as const;

// Gewichten voor de portfolio risicoscore.
const PORTFOLIO_SCORE_WEIGHTS = {
  concentrationHhi: 0.3,
  top5: 0.2,
  sector: 0.2,
  currency: 0.2,
  volatility: 0.1,
} as const;

export function buildRiskReport(
  input: BuildRiskReportInput,
): PortfolioRiskSummary {
  const thresholds = input.thresholds ?? DEFAULT_RISK_THRESHOLDS;
  const asOf = input.asOf ?? new Date().toISOString();
  const { valuations, totalValue, baseCurrency } = input;

  // Positieweging op basis van marketValueBase t.o.v. totalValue.
  const positionWeights = totalValue > 0
    ? valuations.map((v) => v.marketValueBase / totalValue)
    : valuations.map(() => 0);

  const concentrationHhi = computeHhi(positionWeights);
  const top5Weight = computeTop5Weight(positionWeights);
  const largestPositionWeight =
    positionWeights.length > 0 ? Math.max(...positionWeights) : 0;

  const sectorSlices = computeSectorAllocation(valuations, totalValue);
  const regionSlices = aggregateAllocation(
    valuations,
    (v) => v.holding.region ?? null,
    totalValue,
  );
  const assetClassSlices = aggregateAllocation(
    valuations,
    (v) => v.holding.assetClass,
    totalValue,
  );
  const currencySlices = computeCurrencyAllocation(valuations, totalValue);

  const top = topSector(sectorSlices);
  const foreignCurrencyExposure = computeForeignCurrencyExposure(
    valuations,
    totalValue,
    baseCurrency,
  );

  // ---- Position-level breakdowns ----
  const positions: PositionRiskAnalysis[] = valuations.map((valuation, i) => {
    const weight = positionWeights[i] ?? 0;
    const volatility = valuation.holding.volatility ?? null;
    const currencyShare = currencyContribution(valuation, totalValue, baseCurrency);

    const concentrationScore = positionConcentrationRiskScore(weight, thresholds);
    const volScore = volatilityRiskScore(volatility, thresholds);
    const currencyScore = currencyRiskScore(currencyShare, thresholds);

    const riskScore = Math.round(
      POSITION_SCORE_WEIGHTS.concentration * concentrationScore +
        POSITION_SCORE_WEIGHTS.volatility * volScore +
        POSITION_SCORE_WEIGHTS.currency * currencyScore,
    );
    const riskClass = classFromScore(riskScore);

    const positionFlags = buildPositionFlags({
      ticker: valuation.holding.ticker,
      name: valuation.holding.name,
      weight,
      thresholds,
      currencyShare,
      baseCurrency,
    });

    return {
      ticker: valuation.holding.ticker,
      asOf,
      concentrationWeight: weight,
      beta: valuation.holding.beta ?? undefined,
      volatility: volatility ?? undefined,
      concentrationClass: classifyPositionWeight(weight, thresholds),
      volatilityClass: classifyVolatility(volatility, thresholds),
      currencyRiskContribution: currencyShare,
      riskScore,
      riskClass,
      flags: positionFlags,
    };
  });

  // ---- Portfolio-level scores ----
  const hhiScore = continuousFromBand(concentrationHhi, thresholds.concentrationHhi);
  const top5Score = continuousFromBand(top5Weight, thresholds.top5Weight);
  const sectorScore = sectorRiskScore(top?.weight ?? 0, thresholds);
  const currencyScore = currencyRiskScore(foreignCurrencyExposure, thresholds);

  // Portfolio volatility is een gewogen gemiddelde van per-positie volatility,
  // gewogen op marketValueBase. Negeer posities zonder vol-data.
  const portfolioVolatility = computeWeightedVolatility(valuations, totalValue);
  const volScore = volatilityRiskScore(portfolioVolatility ?? null, thresholds);

  const riskScore = Math.round(
    PORTFOLIO_SCORE_WEIGHTS.concentrationHhi * hhiScore +
      PORTFOLIO_SCORE_WEIGHTS.top5 * top5Score +
      PORTFOLIO_SCORE_WEIGHTS.sector * sectorScore +
      PORTFOLIO_SCORE_WEIGHTS.currency * currencyScore +
      PORTFOLIO_SCORE_WEIGHTS.volatility * volScore,
  );

  const overallSeverity: RiskSeverity = classFromScore(riskScore);

  const warnings: RiskFlag[] = buildPortfolioWarnings({
    positionCount: valuations.length,
    largestPosition: largestPositionName(valuations, positionWeights),
    top5Weight,
    concentrationHhi,
    topSector: top,
    foreignCurrencyExposure,
    baseCurrency,
    thresholds,
  });

  return {
    portfolioId: input.portfolioId,
    asOf,
    overallSeverity,
    concentrationHhi,
    largestPositionWeight,
    top5Weight,
    sectorConcentrationHhi: computeHhi(sectorSlices.map((s) => s.weight)),
    regionConcentrationHhi: computeHhi(regionSlices.map((s) => s.weight)),
    portfolioVolatility: portfolioVolatility ?? undefined,
    topSector: top,
    foreignCurrencyExposure,
    exposures: {
      byAssetClass: assetClassSlices,
      bySector: sectorSlices,
      byRegion: regionSlices,
      byCurrency: currencySlices,
    },
    riskScore,
    positions,
    flags: warnings,
  };
}

// ============================================================
//  Internals
// ============================================================

function continuousFromBand(
  value: number,
  band: { low: number; high: number },
): number {
  if (!Number.isFinite(value)) return 50;
  if (value <= band.low) return 15;
  if (value >= band.high) return 85;
  return 15 + ((value - band.low) / (band.high - band.low)) * 70;
}

function largestPositionName(
  valuations: HoldingValuation[],
  weights: number[],
): { ticker: string; name: string; weight: number } | null {
  if (valuations.length === 0) return null;
  let bestIdx = 0;
  let bestWeight = -Infinity;
  for (let i = 0; i < valuations.length; i++) {
    const w = weights[i] ?? 0;
    if (w > bestWeight) {
      bestWeight = w;
      bestIdx = i;
    }
  }
  const v = valuations[bestIdx];
  if (!v) return null;
  return { ticker: v.holding.ticker, name: v.holding.name, weight: bestWeight };
}

function computeWeightedVolatility(
  valuations: HoldingValuation[],
  totalValue: number,
): number | null {
  if (totalValue <= 0) return null;
  let numerator = 0;
  let weightSum = 0;
  for (const v of valuations) {
    const vol = v.holding.volatility;
    if (vol === undefined || vol === null || !Number.isFinite(vol)) continue;
    const w = v.marketValueBase / totalValue;
    numerator += vol * w;
    weightSum += w;
  }
  if (weightSum === 0) return null;
  return numerator / weightSum;
}

function buildPositionFlags({
  ticker,
  name,
  weight,
  thresholds,
  currencyShare,
  baseCurrency,
}: {
  ticker: string;
  name: string;
  weight: number;
  thresholds: RiskThresholds;
  currencyShare: number;
  baseCurrency: Currency;
}): RiskFlag[] {
  const flags: RiskFlag[] = [];
  if (weight >= thresholds.positionWeight.high) {
    flags.push({
      code: "position.concentration",
      label: "Positie te zwaar",
      severity: "high",
      message: `${name} is ${Math.round(weight * 100)}% — overschrijdt drempel ${Math.round(thresholds.positionWeight.high * 100)}%.`,
      metric: weight,
      threshold: thresholds.positionWeight.high,
    });
  } else if (weight >= thresholds.positionWeight.low) {
    flags.push({
      code: "position.concentration",
      label: "Gemiddelde concentratie",
      severity: "moderate",
      message: `${name} weegt ${Math.round(weight * 100)}% — binnen bandbreedte maar monitoren.`,
      metric: weight,
      threshold: thresholds.positionWeight.high,
    });
  }

  if (currencyShare > 0) {
    flags.push({
      code: "position.currency",
      label: "Valuta-exposure",
      severity: "low",
      message: `${ticker} staat in vreemde valuta (niet-${baseCurrency}).`,
      metric: currencyShare,
    });
  }

  return flags;
}

export type { CoreRiskClass };
