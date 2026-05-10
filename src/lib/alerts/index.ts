/**
 * Public API voor de alerts engine.
 */

export {
  ALERT_CATALOG,
  ALERT_CATEGORY_LABELS,
  getAlertTypeDefinition,
} from "./catalog";
export {
  generateAiBriefingReadyAlerts,
  generateBehavioralAlerts,
  generateConcentrationAlerts,
  generateDividendEventAlerts,
  generateEarningsEventAlerts,
  generateHealthDropAlerts,
  generateMacroRegimeChangeAlerts,
  generatePriceMoveAlerts,
  generateValuationSignalAlerts,
  generateWatchlistAlerts,
  type AiBriefingReadyInput,
  type BehavioralWarningInput,
  type ConcentrationRisingInput,
  type DividendEventInput,
  type EarningsEventInput,
  type HealthDropInput,
  type MacroRegimeChangeInput,
  type PriceMoveInput,
  type ValuationSignalInput,
  type WatchlistOpportunityInput,
} from "./generators";
export {
  buildDefaultAlertPreferences,
  mergeAlertPreferences,
  parseAlertPreferences,
  shouldDeliverAlert,
  type AlertPreferences,
  type AlertTypePreference,
} from "./preferences";
export {
  evaluateAlerts,
  type AlertsRunInput,
  type AlertsRunResult,
} from "./service";
export type {
  Alert,
  AlertCandidate,
  AlertCategory,
  AlertSeverity,
  AlertStatus,
  AlertType,
  AlertTypeDefinition,
} from "./types";
