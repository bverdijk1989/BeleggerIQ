import type { PortfolioSummary } from "@/types/summary";
import type { PortfolioRiskSummary } from "@/types/risk";

/**
 * Risicoanalyse-engine.
 *
 * Deze module bevat uitsluitend pure helpers. De rijkere `PortfolioRiskSummary`
 * wordt elders samengesteld (repository + history); hier leveren we alleen de
 * concentratiemetrics, zodat dashboard en risk-pagina direct iets kunnen tonen
 * zonder prijsdata.
 */

/**
 * Subset van `PortfolioRiskSummary` die uit enkel een `PortfolioSummary`
 * afgeleid kan worden — zonder prijshistorie, zonder betas.
 */
export type ConcentrationMetrics = Pick<
  PortfolioRiskSummary,
  | "concentrationHhi"
  | "largestPositionWeight"
  | "sectorConcentrationHhi"
  | "regionConcentrationHhi"
>;

/**
 * Herfindahl-Hirschman index over een set gewichten.
 * 1/n = gelijk verdeeld, 1 = volledig geconcentreerd.
 */
export function computeConcentration(weights: number[]): number {
  return weights.reduce((sum, w) => sum + w * w, 0);
}

export function computeConcentrationMetrics(
  summary: PortfolioSummary,
): ConcentrationMetrics {
  const positionWeights = summary.topPositions.map((p) => p.weight);
  const sectorWeights = summary.allocationBySector.map((s) => s.weight);
  const regionWeights = summary.allocationByRegion.map((r) => r.weight);

  return {
    concentrationHhi: computeConcentration(positionWeights),
    largestPositionWeight: positionWeights[0] ?? 0,
    sectorConcentrationHhi: computeConcentration(sectorWeights),
    regionConcentrationHhi: computeConcentration(regionWeights),
  };
}

/**
 * Backward-compatible alias. Nieuwe code: gebruik `computeConcentrationMetrics`.
 */
export const computeRiskSnapshot = computeConcentrationMetrics;
