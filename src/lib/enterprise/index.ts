/**
 * Enterprise / Advisor — public API.
 *
 * **Status**: voorbereidende laag. Types + helpers, nog geen Prisma-
 * tabellen of UI-flows die productie-data raken. Migratie-pad in
 * `docs/ADVISOR_ENTERPRISE_FOUNDATION.md`.
 */

export * from "./types";
export * from "./roles";
export * from "./feature-flags";
export * from "./disclaimers";
export * from "./report-spec";
export { recordAdvisorAudit } from "./audit-context";
export type { AdvisorAuditInput } from "./audit-context";
