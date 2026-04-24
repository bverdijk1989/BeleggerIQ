export * from "./valuation";
export * from "./portfolio-summary";
// NOTE: `./factor-scoring` is een backward-compat shim (legacy signature).
// Niet re-exporten vanuit de barrel om naming-collisions met `./factors` te
// vermijden. Importeer direct vanaf het pad indien nodig.
export * from "./factors";
export * from "./risk";
export * from "./risk-engine";
export * from "./enrichment";
export * from "./health";
export * from "./holding-action";
export * from "./attention";
// Selectief re-export van rebalance-engine om naming-collisions te vermijden
// (beide engines exporteren een eigen `thresholdsFromPolicy`). Imports van die
// helper kunnen direct via `@/lib/analytics/rebalance-engine/thresholds`.
export {
  buildRebalancePlan,
  classifyConcentrationType,
  sectorCyclicality,
  isCyclical,
  DEFAULT_REBALANCE_THRESHOLDS,
  type BuildRebalancePlanInput,
  type ClassifyConcentrationInput,
  type ConcentrationClassification,
  type RebalanceThresholds,
} from "./rebalance-engine";
// Allocation engine: selectief re-export om collision op `thresholdsFromPolicy`
// met risk- en rebalance-engine te vermijden.
export {
  generateAllocationPlan,
  determineBuyCandidates,
  scoreAllocationPriority,
  simulatePostBuyPortfolio,
  regimeAdjustment,
  objectiveTilt,
  DEFAULT_ALLOCATION_THRESHOLDS,
  DEFAULT_CORE_ETF,
  type GenerateAllocationPlanInput,
  type BuyCandidate,
  type CoreEtfConfig,
  type PriorityContext,
  type PriorityResult,
  type PriorityBreakdown,
  type AllocationThresholds,
  type RegimeAdjustment,
  type ObjectiveTilt,
  type SimulatePostBuyInput,
} from "./allocation-engine";
export * from "./portfolio-view";
export * from "./scenario";
export * from "./snapshot";
export * from "./screener";
export * from "./regime";
export * from "./instruments";
export * from "./policy-engine";
export * from "./rebalance";
export * from "./opportunity-radar";
export * from "./mispricing";
export * from "./hunting-list";
// Backtest: selectief re-export om collision op `computeMaxDrawdown` met
// risk-engine te vermijden. `computeMaxDrawdown(values: number[])` blijft
// bereikbaar via `@/lib/analytics/backtest/metrics`.
export {
  runBacktest,
  STRATEGIES,
  getStrategyBySlug,
  computeBacktestMetrics,
  equalWeightStrategy,
  qualityStrategy,
  qualityValueStrategy,
  qualityMomentumStrategy,
  regimeAwareStrategy,
  computeMomentum12m,
  topNEqualWeight,
  monthlyReturnsFromValues,
  computeCagrFromReturns,
  computeCagrFromValues,
  computeSharpeRatio,
  computeSortinoRatio,
  computeCalmarRatio,
  computeWinRate,
  computeAnnualizedVolatility,
  computeTotalReturn,
  type BacktestMetrics,
  type MonthlyBar,
  type UniverseMember,
  type StrategyContext,
  type StrategyDecision,
  type StrategyFn,
  type StrategyDefinition,
  type BacktestUniverseEntry,
  type BacktestBenchmark,
  type RunBacktestInput,
  buildCustomStrategy,
  type CustomStrategyConfig,
  type CustomStrategyWeights,
  // Evidence module
  buildEvidenceReport,
  buildEvidenceVerdict,
  computeRollingReturns,
  computeRegimeBreakdown,
  detectUnderperformancePeriods,
  computeDcaSimulation,
  computeBenchmarkRegret,
  computeDrawdownRecovery,
  type StrategyEvidenceReport,
  type EvidenceVerdict,
  type RegimeBreakdownRow,
  type RollingWindowSummary,
  type RollingWindowEntry,
  type UnderperformancePeriod,
  type DcaContributionSimulation,
  type BenchmarkRegretScore,
  type DrawdownRecoveryEntry,
  type DrawdownRecoverySummary,
  type BuildEvidenceReportInput,
} from "./backtest";
