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

export {
  scoreFactorsByAssetClass,
  type RouteFactorInput,
} from "./router";

// ETF-engine re-export voor convenience.
export {
  scoreEtfFactors,
  scoreEtfCost,
  scoreEtfScale,
  scoreEtfTrackRecord,
  scoreEtfFit,
  DEFAULT_ETF_WEIGHTS,
  isDistributionPolicyAligned,
  NULL_ETF_METADATA_PROVIDER,
  type DistributionPolicy,
  type EtfFactorScoringInput,
  type EtfMetadata,
  type EtfMetadataProvider,
  type ReplicationMethod,
} from "../etf-factors";
