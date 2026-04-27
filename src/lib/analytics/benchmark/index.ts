export * from "./types";
export {
  fetchBenchmark,
  resampleMonthly,
  type FetchBenchmarkOptions,
  type FetchBenchmarkResult,
} from "./benchmark-fetcher";
export {
  computeBenchmarkPerformance,
  excessReturns,
  type ComputeBenchmarkPerformanceInput,
  type PortfolioValuePoint,
} from "./performance";
export {
  computeAttribution,
  type ComputeAttributionInput,
  type PositionPerformance,
} from "./attribution";
export {
  annualizedTrackingError,
  informationRatio,
} from "./tracking-error";
export {
  buildBenchmarkReport,
  type BuildBenchmarkReportInput,
} from "./engine";
