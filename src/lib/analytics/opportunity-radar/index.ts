export {
  OPPORTUNITY_SIGNAL_TYPES,
  SIGNAL_LABELS,
  SIGNAL_TONE,
  type OpportunityCandidate,
  type OpportunityConfidence,
  type OpportunityReport,
  type OpportunitySignal,
  type OpportunitySignalType,
  type OpportunitySource,
} from "./types";

export {
  detectDefensiveBargain,
  detectEarningsSentiment,
  detectEtfCoreRebalance,
  detectMomentumReversal,
  detectQualityPullback,
  detectUnderweightConviction,
  detectValueDislocation,
  detectWatchlistTarget,
  SIGNAL_DETECTORS,
  type DefensiveBargainInput,
  type EtfCoreRebalanceInput,
  type MomentumReversalInput,
  type QualityPullbackInput,
  type UnderweightConvictionInput,
  type ValueDislocationInput,
  type WatchlistTargetInput,
} from "./signals";

export {
  buildCandidate,
  type BuildCandidateInput,
} from "./scoring";

export {
  scanOpportunities,
  type PortfolioCandidateInput,
  type ScanOpportunitiesInput,
  type ScreenerCandidateInput,
  type WatchlistCandidateInput,
} from "./engine";
