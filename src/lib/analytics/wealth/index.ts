/**
 * Long-Term Wealth Dashboard — public API (Module 21).
 */

export {
  buildWealthDashboardReport,
  type BuildWealthReportInput,
} from "./engine";
export {
  loadWealthDashboard,
  type LoadWealthDashboardInput,
} from "./loader";
export {
  WEALTH_DISCLAIMER,
  type AllocationDriftRow,
  type AllocationDriftSummary,
  type DecadeProjection,
  type ExpectedDividendIncome,
  type MonthlyDiscipline,
  type WealthCourseStatus,
  type WealthCourseSummary,
  type WealthDashboardReport,
} from "./types";
