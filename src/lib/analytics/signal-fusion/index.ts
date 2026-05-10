/**
 * Public API voor de Signal Fusion Engine.
 */

export {
  DEFAULT_SIGNAL_WEIGHTS,
  SIGNAL_LABELS,
  SIGNAL_ORDER,
  type ConfidenceTier,
  type InvestmentConfidenceScore,
  type SignalContribution,
  type SignalDataQuality,
  type SignalKey,
} from "./types";
export type {
  SignalEarningsRevisions,
  SignalFusionInput,
  SignalInsiderAnalyst,
  SignalInstrumentContext,
  SignalPortfolioContext,
  SignalSentiment,
} from "./input";
export {
  ALL_EXTRACTORS,
  extractDividendQuality,
  extractEarningsRevisions,
  extractFundamentalQuality,
  extractInsiderAnalyst,
  extractMacroSensitivity,
  extractMomentum,
  extractPortfolioFit,
  extractSentiment,
  extractValuation,
  extractVolatility,
} from "./extractors";
export {
  computeConfidenceScore,
  type ComputeConfidenceScoreOptions,
} from "./engine";
export {
  loadConfidenceScore,
  type LoadConfidenceScoreInput,
} from "./loader";
