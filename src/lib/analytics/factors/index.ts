export {
  scoreFromSignals,
  buildSignal,
  rampUp,
  rampDown,
  clamp,
  formatPct,
  formatRatio,
  NEUTRAL_SCORE,
  type FactorSignal,
  type ScoreFromSignalsResult,
  type SignalKind,
  type SignalSpec,
} from "./shared";

export { scoreQuality } from "./quality";
export { scoreValue } from "./value";
export {
  scoreMomentum,
  scoreMomentumFromMetrics,
  computeMomentumMetrics,
  type MomentumMetrics,
} from "./momentum";
export { scoreRisk, type RiskFactorInput } from "./risk";
export {
  DEFAULT_FACTOR_WEIGHTS,
  weightsForObjective,
  scoreFactors,
  computeComposite,
  applyFactorScore,
  scoreHoldings,
  type FactorScoringInput,
} from "./composite";
