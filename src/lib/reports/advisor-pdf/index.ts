/**
 * Advisor PDF Report — public API (Module 23).
 */

export { buildAdvisorReportData, type BuildAdvisorReportInput } from "./builder";
export { renderAdvisorReportHtml } from "./html";
export {
  loadAdvisorReport,
  type LoadAdvisorReportInput,
  type LoadAdvisorReportResult,
} from "./loader";
export type {
  AdvisorReportData,
  AdvisorReportFormat,
  AdvisorReportSectionId,
  ReportActionItem,
  ReportActionItemsSection,
  ReportAllocationSection,
  ReportBehavioralSection,
  ReportDataQualitySection,
  ReportGoalRow,
  ReportGoalsSection,
  ReportHealthSection,
  ReportRisksSection,
  ReportScenarioRow,
  ReportScenariosSection,
  ReportTitleSection,
} from "./types";
