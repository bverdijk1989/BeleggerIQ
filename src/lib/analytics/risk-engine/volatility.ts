import {
  classify,
  continuousRiskScore,
  type CoreRiskClass,
  type RiskThresholds,
} from "./thresholds";

/**
 * Volatility-module. Werkt op geannualiseerde volatility als fractie
 * (0.18 = 18%). Bij ontbrekende waarde retourneert de classifier
 * "moderate" zodat de portefeuille-score niet onterecht wegzakt.
 */

export function classifyVolatility(
  volatility: number | null | undefined,
  thresholds: RiskThresholds,
): CoreRiskClass {
  if (
    volatility === null ||
    volatility === undefined ||
    !Number.isFinite(volatility)
  ) {
    return "moderate";
  }
  return classify(volatility, thresholds.volatility);
}

export function volatilityRiskScore(
  volatility: number | null | undefined,
  thresholds: RiskThresholds,
): number {
  if (
    volatility === null ||
    volatility === undefined ||
    !Number.isFinite(volatility)
  ) {
    return 50;
  }
  return continuousRiskScore(volatility, thresholds.volatility);
}

export function classifyBeta(
  beta: number | null | undefined,
  thresholds: RiskThresholds,
): CoreRiskClass {
  if (beta === null || beta === undefined || !Number.isFinite(beta)) {
    return "moderate";
  }
  return classify(beta, thresholds.beta);
}
