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
} from "./input";
export {
  ALL_EXTRACTORS,
  asUniverseEntry,
  extractAlternativesSignal,
  extractDividendSignal,
  extractEarningsSignal,
  extractMacroFitSignal,
  extractMomentumSignal,
  extractSentimentSignal,
  extractValuationSignal,
  findSimilarAlternatives,
} from "./signals";
export { buildWatchlistIntelligenceReport } from "./engine";
