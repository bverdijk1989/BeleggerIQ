/**
 * Advisor-audit wrapper rond `audit.record`.
 *
 * Wanneer een advisor namens een cliënt een actie uitvoert, willen we
 * IN DE LOG zien:
 *  - welke organisatie de actor toebehoort
 *  - welke advisor (userId) de actie deed
 *  - voor welke cliënt
 *  - met welke rol op dat moment
 *
 * Dit is een dunne wrapper die deze metadata structureel toevoegt aan
 * `metadata` zodat we niet bij elke audit-call hoeven te onthouden om
 * 'em mee te sturen. Bestaande `audit.record`-callsites blijven werken.
 */

import { audit, type AuditCategory, type AuditInput } from "@/lib/audit";

import type { AdvisorAuditContext } from "./types";

export interface AdvisorAuditInput
  extends Omit<AuditInput, "metadata" | "category"> {
  category: AuditCategory;
  metadata?: Record<string, unknown> | null;
  advisor: AdvisorAuditContext;
}

/**
 * Append-only schrijven met advisor-context. Zelfde failure-mode als
 * `audit.record` (silently swallow).
 */
export async function recordAdvisorAudit(input: AdvisorAuditInput): Promise<void> {
  const merged: Record<string, unknown> = {
    ...(input.metadata ?? {}),
    advisor: {
      organizationId: input.advisor.organizationId,
      advisorUserId: input.advisor.advisorUserId,
      onBehalfOfUserId: input.advisor.onBehalfOfUserId,
      role: input.advisor.role,
    },
  };
  await audit.record({
    userEmail: input.userEmail ?? null,
    category: input.category,
    action: input.action,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    summary: input.summary,
    metadata: merged,
    ipHash: input.ipHash ?? null,
  });
}
