/**
 * Dividend Calendar & DRIP Simulator — public API (Module 22).
 */

export {
  buildAnnualProjection,
  buildCalendarRow,
  buildDividendReport,
  buildGrowthAnalysis,
  classifyFrequency,
  simulateDrip,
  type BuildCalendarRowInput,
  type BuildDividendReportInput,
  type BuildGrowthAnalysisInput,
  type SimulateDripInput,
} from "./engine";
export {
  loadDividendReport,
  type LoadDividendReportInput,
} from "./loader";
export {
  DIVIDEND_DISCLAIMER,
  FREQUENCY_LABELS,
  MONTH_LABELS_NL,
  type AnnualDividendProjection,
  type DistributionFrequency,
  type DividendCalendarRow,
  type DividendDataQuality,
  type DividendGrowthAnalysis,
  type DividendReport,
  type DripHorizonYears,
  type DripScenario,
  type DripScenarioResult,
  type DripSimulation,
} from "./types";
