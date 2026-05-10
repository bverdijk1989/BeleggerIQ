/**
 * Public API voor de stress-tests module.
 */

export {
  STRESS_DISCLAIMER,
  STRESS_SCENARIO_ORDER,
  type CustomStressScenarioInput,
  type StressPositionImpact,
  type StressScenarioDefinition,
  type StressScenarioId,
  type StressSeverity,
  type StressTestReport,
  type StressTestResult,
} from "./types";
export { STRESS_SCENARIO_CATALOG, getStressScenario } from "./catalog";
export {
  runStressTest,
  type RunStressTestInput,
  type StressPositionInput,
} from "./engine";
export { buildCustomScenario } from "./custom";
export {
  loadStressTestReport,
  type LoadStressTestReportInput,
  type LoadStressTestReportResult,
} from "./loader";
