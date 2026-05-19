/**
 * Signal Performance Lab — public API (Module 27).
 */

export {
  buildSignalPerformanceReport,
  classifyDecay,
  computeComponentPerformance,
  computeSpearmanRank,
  type BuildPerformanceReportInput,
} from "./engine";
export { buildSignalPerformanceCsv } from "./csv";
export {
  loadSignalPerformanceReport,
  type LoadSignalPerformanceInput,
} from "./loader";
export {
  BOTTOM_QUINTILE_THRESHOLD,
  DECAY_PATTERN_LABELS,
  HIGH_SCORE_THRESHOLD,
  HORIZON_LABELS,
  LOW_SCORE_THRESHOLD,
  MIN_SAMPLE_SIZE,
  REGIME_LABELS,
  SIGNAL_COMPONENT_LABELS,
  SIGNAL_PERFORMANCE_DISCLAIMER,
  TOP_QUINTILE_THRESHOLD,
  type RegimeBucket,
  type RegimePerformanceCell,
  type ReturnHorizon,
  type SignalComponentKey,
  type SignalComponentPerformance,
  type SignalComponentReport,
  type SignalDecayPattern,
  type SignalObservation,
  type SignalPerformanceReport,
  type SignalRegimeBreakdown,
} from "./types";
