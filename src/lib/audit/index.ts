import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/data/prisma";
import { log } from "@/lib/log";

/**
 * Audit-log helpers.
 *
 * Append-only schrijflaag bovenop `AuditEntry`. Doelen:
 *  - "Wie wijzigde wat wanneer?" voor security + compliance.
 *  - Multi-user-discovery: zonder log heb je geen idee of een
 *    gebruiker iets gewijzigd heeft of dat er een script-bug is.
 *
 * Gebruik:
 * ```ts
 * await audit.record({
 *   userEmail: auth.user.email,
 *   category: "policy",
 *   action: "update",
 *   resourceType: "UserProfile",
 *   resourceId: userId,
 *   summary: "Cap geüpdatet van 10% naar 12%",
 *   metadata: { before: { maxPositionWeight: 0.10 }, after: { maxPositionWeight: 0.12 } },
 * });
 * ```
 *
 * **PII-regels** (handhaaf je zelf bij callsites):
 *  - GEEN raw email/IP in `metadata`. Hash 'em vóór je 'em meegeeft.
 *  - GEEN tokens, secrets, of cookies.
 *  - GEEN bedragen die buiten een audit-context staan
 *    (bv. portefeuille-totaalwaarde) — die horen al in snapshots.
 *
 * Failures **verstopt** — een audit-write die faalt mag de hoofdactie
 * (bv. een policy-update) NOOIT blokkeren. We loggen 'em wel zodat
 * monitoring het oppikt.
 */

export type AuditCategory =
  | "auth"
  | "policy"
  | "tax"
  | "watchlist"
  | "transactions"
  | "notifications"
  | "system";

export interface AuditInput {
  /** Email van de session-user; wordt intern omgezet naar userId. */
  userEmail?: string | null;
  category: AuditCategory;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
  ipHash?: string | null;
}

async function userIdByEmail(email: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export const audit = {
  async record(input: AuditInput): Promise<void> {
    try {
      const userId = input.userEmail
        ? await userIdByEmail(input.userEmail)
        : null;
      await prisma.auditEntry.create({
        data: {
          userId,
          category: input.category,
          action: input.action,
          resourceType: input.resourceType ?? null,
          resourceId: input.resourceId ?? null,
          summary: input.summary.slice(0, 500),
          metadata: (input.metadata ?? null) as Prisma.InputJsonValue,
          ipHash: input.ipHash ?? null,
        },
      });
    } catch (error) {
      // Audit-write mag de hoofdactie niet blokkeren — log de fout
      // structured zodat monitoring 'em ziet.
      log.warn("audit", "audit_write_failed", {
        error,
        category: input.category,
        action: input.action,
      });
    }
  },
};
