/**
 * Cross-Asset Correlation Studio — public API (Module 28).
 */

export {
  buildCorrelationReport,
  classifyPair,
  pearson,
  type BuildCorrelationReportInput,
} from "./engine";
export { buildCorrelationCsv } from "./csv";
export {
  loadCorrelationReport,
  type LoadCorrelationReportInput,
} from "./loader";
export {
  CORRELATION_DISCLAIMER,
  HIGHLY_CORRELATED_THRESHOLD,
  INSIGHT_LABELS,
  MIN_SAMPLE_TRADING_DAYS,
  MODERATE_CORRELATED_THRESHOLD,
  NEGATIVE_CORRELATED_THRESHOLD,
  UNCORRELATED_BAND,
  type CorrelationAsset,
  type CorrelationAssetKind,
  type CorrelationCell,
  type CorrelationInsight,
  type CorrelationInsightKind,
  type CorrelationReport,
} from "./types";
