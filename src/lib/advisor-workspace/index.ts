/**
 * Advisor Pilot Workspace — public API (Module 24).
 */

export {
  recordAdvisorAccessDenied,
  recordAdvisorClientOpened,
  recordAdvisorClientReportExported,
} from "./audit";
export {
  checkClientAccess,
  getWorkspaceLinksForAdvisor,
  isWorkspaceAdvisor,
  parseWorkspaceLinks,
} from "./resolver";
export {
  clientEmailHash,
  clientIdFromEmail,
  loadAdvisorClientDetail,
  loadAdvisorWorkspace,
  resolveClientIdInWorkspace,
  workspaceHeaderStats,
} from "./service";
export type {
  AccessDecision,
  AdvisorClientDetail,
  AdvisorClientSummary,
  AdvisorWorkspace,
  LoadWorkspaceResult,
  WorkspaceLink,
} from "./types";
export { WORKSPACE_LINKS_ENV } from "./types";
