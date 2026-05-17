/**
 * Public API voor watchlist-intelligence.
 */

export {
  WATCHLIST_SIGNAL_LABELS,
  WATCHLIST_SIGNAL_ORDER,
  type SignalDirection,
  type WatchlistAlternative,
  type WatchlistIntelligenceReport,
  type WatchlistSignal,
  type WatchlistSignalKey,
} from "./types";
export type {
  SimilarUniverseEntry,
  WatchlistIntelligenceInput,
  WatchlistTickerContext,
  WatchlistUserProfile,
} from "./input";
export {
  ALL_EXTRACTORS,
  asUniverseEntry,
  extractAlternativesSignal,
  extractDataQualitySignal,
  extractDividendSignal,
  extractEarningsSignal,
  extractMacroFitSignal,
  extractMomentumSignal,
  extractOpportunityVsRiskSignal,
  extractProfileFitSignal,
  extractSentimentSignal,
  extractValuationSignal,
  extractVolatilitySignal,
  findSimilarAlternatives,
} from "./signals";
export { buildWatchlistIntelligenceReport } from "./engine";
