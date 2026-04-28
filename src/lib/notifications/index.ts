export {
  detectNewRiskFlags,
  detectPositionCapExceeded,
  detectRegimeSwitch,
  detectWatchlistPriceAlerts,
  categoryOf,
  type NotificationEvent,
  type NotificationEventType,
  type NotificationSeverity,
  type RiskFlag,
  type RegimeLabel,
} from "./events";
export {
  DEFAULT_PREFERENCES,
  isCategoryAllowed,
  parsePreferences,
  type NotificationPreferences,
  type NotificationCategory,
} from "./preferences";
export {
  renderDigestEmail,
  renderEventEmail,
  type DigestBullet,
  type DigestRenderInput,
  type RenderedEmail,
} from "./templates";
export {
  buildWeeklyDigest,
  type DigestInput,
  type BuiltDigest,
  type PortfolioWeekDelta,
} from "./digest";
export {
  dispatchInstantAlerts,
  type DispatchInput,
  type DispatchResult,
  type NotificationStore,
} from "./dispatcher";
