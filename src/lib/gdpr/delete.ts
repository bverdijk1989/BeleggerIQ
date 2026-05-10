/**
 * GDPR Recht op vergetelheid (AVG art. 17) — server-side account-delete.
 *
 * **Filosofie**:
 *  - Cascade-delete via Prisma (al geconfigureerd op meeste tabellen)
 *  - Audit-trail blijft bewaard (auditEntry.userId → SetNull) zodat we
 *    voor compliance kunnen aantonen dat de delete heeft plaatsgevonden,
 *    zonder de identificerende data terug te vinden
 *  - Confirmation-stap via expliciete `confirmation`-string match
 *    voorkomt accidentele deletes
 */

import { hashIdentifier } from "@/lib/security/redact";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/data/prisma";

export const DELETE_CONFIRMATION_PHRASE = "VERWIJDER MIJN ACCOUNT";

export interface DeleteResult {
  ok: boolean;
  error?: string;
  /** Hash van het oude account-id voor traceerbaarheid in audit-log
   *  zonder PII. */
  deletedAccountHash?: string;
}

export interface DeleteOptions {
  /** Moet exact `DELETE_CONFIRMATION_PHRASE` zijn. */
  confirmation: string;
}

/**
 * Verwijdert een gebruiker + alle gecascadede data.
 *
 * **Wat wordt verwijderd** (via Prisma onDelete: Cascade):
 *  - UserProfile, Portfolios + Holdings, Transactions, WatchlistItems,
 *    StrategyPresets (eigenaar), DecisionSnapshots, Alerts, FinancialGoals,
 *    NotificationDeliveries, TaxValuations, MagicLinkTokens, etc.
 *
 * **Wat blijft staan** (via SetNull):
 *  - AuditEntry rijen — `userId` wordt null, summary blijft. Voor
 *    compliance-trail zonder PII.
 *  - StrategyPreset rijen waar de user niet de owner is.
 *
 * **Idempotent**: een delete op een al-verwijderde user retourneert ok
 * met error "Account bestond niet meer".
 */
export async function deleteUserAccount(
  userId: string,
  opts: DeleteOptions,
): Promise<DeleteResult> {
  if (opts.confirmation !== DELETE_CONFIRMATION_PHRASE) {
    return {
      ok: false,
      error: `Bevestiging-tekst klopt niet. Tik exact: "${DELETE_CONFIRMATION_PHRASE}"`,
    };
  }

  const accountHash = hashIdentifier(userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) {
    return { ok: true, error: "Account bestond niet meer.", deletedAccountHash: accountHash };
  }

  // Audit-record VOOR de delete zodat we 'em vastleggen ook al verdwijnt
  // de userId daarna.
  await audit.record({
    userEmail: user.email,
    category: "system",
    action: "account_delete",
    resourceType: "User",
    resourceId: userId,
    summary: "Gebruiker verwijderde eigen account (AVG art. 17)",
    metadata: { accountHash },
  });

  // Prisma cascadeert het meeste; user-row zelf gaat plat.
  await prisma.user.delete({ where: { id: userId } });

  return { ok: true, deletedAccountHash: accountHash };
}
