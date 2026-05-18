/**
 * Admin-action audit wrapper (Module 15).
 *
 * Elke admin-actie schrijft een audit-entry met category="system" en
 * extra metadata.adminAction=true zodat downstream filters 'em kunnen
 * onderscheiden. **Geen nieuwe DB-tabel** — bestaande AuditEntry blijft
 * de bron van waarheid, category="system" is breed genoeg voor admin-
 * acties zonder schema-migratie te vereisen.
 */

import { audit } from "@/lib/audit";

export interface AdminAuditInput {
  /** Email van de admin die de actie deed. Wordt door audit-laag omgezet
   *  naar userId. */
  adminEmail: string;
  /** Korte actie-key (admin.view_dashboard, admin.lookup_user, ...). */
  action: string;
  /** 1-zin NL samenvatting voor in de log-row. */
  summary: string;
  /** Optionele resource-type ("user") + id voor traceability. */
  resourceType?: string | null;
  resourceId?: string | null;
  /** Extra context. Vrije meta-bag — gebruik geen secrets/PII. */
  metadata?: Record<string, unknown> | null;
}

/**
 * Append-only schrijven van een admin-actie. Faalt silently (audit-laag
 * mag nooit een admin-flow blokkeren).
 */
export async function recordAdminAction(
  input: AdminAuditInput,
): Promise<void> {
  await audit.record({
    userEmail: input.adminEmail,
    category: "system",
    action: input.action,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    summary: input.summary,
    metadata: {
      ...(input.metadata ?? {}),
      adminAction: true,
    },
  });
}
