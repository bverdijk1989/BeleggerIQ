/**
 * Public API voor de Behavioral Finance Coach.
 *
 * **Pure laag**: `runBehavioralEngine`, `applyWarningStates`, types.
 * **Server laag**: `loadBehavioralCoach`, `actions.ts` (server actions).
 */

export {
  BEHAVIORAL_LABELS,
  BEHAVIORAL_SEVERITY_RANK,
  toUiSeverity,
  type BehavioralReflectionQuestion,
  type BehavioralReport,
  type BehavioralSeverity,
  type BehavioralSignal,
  type BehavioralSignalKey,
  type BehavioralSignalWithState,
  type BehavioralStatus,
  type BehavioralUiSeverity,
  type BehavioralWarningState,
} from "./types";
export type {
  BehavioralDetectorInput,
  BehavioralPosition,
  BehavioralProfile,
  BehavioralSectorExposure,
  BehavioralTransaction,
} from "./detector-types";
export { runBehavioralEngine } from "./engine";
export {
  detectCashMismatch,
  detectFomoBuying,
  detectOverconcentration,
  detectOvertrading,
  detectPanicSelling,
  detectPerformanceChasing,
  detectSpeculativeOverallocation,
  detectStrategyDrift,
  detectUnderDiversification,
  detectVolatilityMismatch,
  ALL_DETECTORS,
} from "./detectors";
export {
  applyWarningStates,
  deriveEffectiveStatus,
  partitionSignalsByStatus,
} from "./state";
export {
  loadBehavioralCoach,
  type LoadBehavioralCoachInput,
  type LoadBehavioralCoachResult,
} from "./loader";
