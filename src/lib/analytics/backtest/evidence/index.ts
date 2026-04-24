export * from "./types";
export { computeRollingReturns, type ComputeRollingInput } from "./rolling-windows";
export {
  computeRegimeBreakdown,
  type ComputeRegimeBreakdownInput,
} from "./regime-breakdown";
export {
  detectUnderperformancePeriods,
  type DetectUnderperformanceInput,
} from "./underperformance";
export {
  computeDcaSimulation,
  type ComputeDcaInput,
} from "./dca-simulation";
export {
  computeBenchmarkRegret,
  type ComputeBenchmarkRegretInput,
} from "./benchmark-regret";
export {
  computeDrawdownRecovery,
  type ComputeDrawdownRecoveryInput,
} from "./drawdown-recovery";
export {
  buildEvidenceReport,
  type BuildEvidenceReportInput,
} from "./engine";
export { buildEvidenceVerdict } from "./verdict";
