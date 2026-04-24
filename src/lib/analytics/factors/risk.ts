import {
  buildSignal,
  formatPct,
  formatRatio,
  scoreFromSignals,
  type FactorSignal,
  type ScoreFromSignalsResult,
} from "./shared";

/**
 * Risk / low-volatility factor. Penaliseert hoge volatiliteit, diepe
 * drawdowns en hoge beta. Een hogere score betekent een "veiliger" profiel
 * en is consistent met de andere factoren (hoger = beter vanuit portefeuille-perspectief).
 */

export interface RiskFactorInput {
  /** Geannualiseerde volatility, fractie (0.18 = 18%). */
  volatility?: number | null;
  /** Grootste historische drawdown, fractie. Mag als negatief getal aangeleverd worden. */
  maxDrawdown?: number | null;
  /** Beta t.o.v. benchmark. */
  beta?: number | null;
}

export function scoreRisk(input: RiskFactorInput): ScoreFromSignalsResult {
  const drawdownMagnitude =
    input.maxDrawdown !== null && input.maxDrawdown !== undefined
      ? Math.abs(input.maxDrawdown)
      : null;

  const signals: FactorSignal[] = [
    buildSignal({
      key: "volatility",
      label: "Volatility (ann.)",
      value: input.volatility ?? null,
      weight: 1.2,
      kind: "rampDown",
      min: 0.15,
      max: 0.6,
      rationale: (score, value) =>
        score >= 70
          ? `Lage volatiliteit (${formatPct(value)}).`
          : score <= 30
            ? `Hoge volatiliteit (${formatPct(value)}).`
            : `Volatility gemiddeld (${formatPct(value)}).`,
    }),
    buildSignal({
      key: "maxDrawdown",
      label: "Max drawdown",
      value: drawdownMagnitude,
      weight: 1.1,
      kind: "rampDown",
      min: 0.1,
      max: 0.6,
      rationale: (score, value) =>
        score >= 70
          ? `Beperkte historische drawdown (−${formatPct(value)}).`
          : score <= 30
            ? `Diepe drawdown (−${formatPct(value)}).`
            : `Matige drawdown (−${formatPct(value)}).`,
    }),
    buildSignal({
      key: "beta",
      label: "Beta",
      value: input.beta ?? null,
      weight: 0.8,
      kind: "rampDown",
      min: 0.6,
      max: 1.8,
      rationale: (score, value) =>
        score >= 70
          ? `Lage beta (${formatRatio(value, 2)}) — defensief profiel.`
          : score <= 30
            ? `Hoge beta (${formatRatio(value, 2)}) — agressief profiel.`
            : `Beta rond markt (${formatRatio(value, 2)}).`,
    }),
  ];

  return scoreFromSignals(signals);
}
