/**
 * Public API voor de admin-console (Module 15).
 */

export { isAdminEmail, maskEmail } from "./guards";
export { recordAdminAction, type AdminAuditInput } from "./audit";
export {
  loadAdminDashboard,
  type LoadAdminDashboardInput,
} from "./dashboard";
export type {
  ActiveUsersSummary,
  AdminContext,
  AdminDashboardData,
  AiCostSummary,
  ErrorLogSummary,
  FailedJobsSummary,
  FeatureFlagStatus,
  ImportStatusSummary,
  ProviderHealthSummary,
  SecurityEventsSummary,
  SubscriptionSummary,
  SupportUserInfo,
} from "./types";
