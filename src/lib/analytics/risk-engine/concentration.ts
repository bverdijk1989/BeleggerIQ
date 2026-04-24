import {
  classify,
  continuousRiskScore,
  type CoreRiskClass,
  type RiskThresholds,
} from "./thresholds";

/**
 * Concentration-module. Pure functies over gewichten (0..1).
 */

export function computeHhi(weights: number[]): number {
  return weights.reduce((sum, w) => sum + w * w, 0);
}

export function computeTop5Weight(positionWeights: number[]): number {
  return positionWeights
    .slice()
    .sort((a, b) => b - a)
    .slice(0, 5)
    .reduce((sum, w) => sum + w, 0);
}

export function classifyPositionWeight(
  weight: number,
  thresholds: RiskThresholds,
): CoreRiskClass {
  return classify(weight, thresholds.positionWeight);
}

export function classifyConcentrationHhi(
  hhi: number,
  thresholds: RiskThresholds,
): CoreRiskClass {
  return classify(hhi, thresholds.concentrationHhi);
}

export function classifyTop5Weight(
  top5: number,
  thresholds: RiskThresholds,
): CoreRiskClass {
  return classify(top5, thresholds.top5Weight);
}

export function positionConcentrationRiskScore(
  weight: number,
  thresholds: RiskThresholds,
): number {
  return continuousRiskScore(weight, thresholds.positionWeight);
}
