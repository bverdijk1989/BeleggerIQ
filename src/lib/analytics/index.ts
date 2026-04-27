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
// Opportunity adapter: selectief om collisions met opportunity-radar
// te vermijden (beide modules definiëren bv. `OpportunityType`-achtige
// namen). De adapter exposeert de 5-signaal publieke shape.
export {
  scanOpportunityRadar,
  filterPublicSignals,
  mapSignalType,
  pickPrimarySignal,
  buildRationale,
  deriveConfidence,
  deriveRiskLevel,
  SIGNAL_TYPE_MAP,
  OPPORTUNITY_HORIZON,
  OPPORTUNITY_TYPE_LABELS,
  CONFIDENCE_TIER_TO_NUMBER,
  type OpportunityType,
  type OpportunityRiskLevel,
  type OpportunityResult,
  type OpportunityRadarReport,
  type ScanOpportunityRadarInput,
} from "./opportunity";
export * from "./mispricing";
export * from "./hunting-list";
export * from "./benchmark";
export * from "./business";
export * from "./macro";
export * from "./tax";
// Actions: selectief re-export. `holding-action.ts` exporteert al een
// constant `ACTION_THRESHOLDS` (andere semantiek), daarom heet die in
// de actions-submodule `DECISION_THRESHOLDS`.
export {
  classifyAction,
  resolveCap,
  resolveActionQuantity,
  runDecisionEngine,
  DECISION_THRESHOLDS,
  type ActionDecision,
  type ActionUrgency,
  type ActionSource,
  type PositionAction,
  type GlobalAdvice,
  type GlobalActionAdvice,
  type ActionPlan,
  type ActionPositionInput,
  type DecisionEngineInput,
  type ClassifyActionInput,
  type ClassifyActionResult,
  type ResolveQuantityInput,
  type ResolveQuantityResult,
} from "./actions";
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
