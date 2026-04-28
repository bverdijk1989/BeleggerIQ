/**
 * Pure ownership-check.
 *
 * Hoort als helper bij elke server-action die een `portfolioId` accepteert.
 * Het is geen vervanging voor de session-resolve — die loopt apart in
 * `resolveUserFromServer`. Dit is de tweede laag: zelfs ALS de user
 * is ingelogd, mag 'ie niet aan een portefeuille van iemand anders.
 *
 * Returnt een result-shape (geen throw) zodat callsites netjes met
 * `if (!ok) return jsonError(...)` kunnen werken.
 */

import { matchesSessionUser } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";

export type OwnershipResult =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 404; reason: string };

export async function assertPortfolioOwnership(
  user: { email: string; source: "session-cookie" | "dev-header" | "demo-fallback" },
  portfolioId: string,
): Promise<OwnershipResult> {
  const ownerEmail = await portfolioRepository.findOwnerEmailById(portfolioId);
  if (!ownerEmail) {
    return { ok: false, status: 404, reason: "Portefeuille bestaat niet." };
  }
  if (!matchesSessionUser(user, ownerEmail)) {
    return {
      ok: false,
      status: 403,
      reason: "Geen rechten op deze portefeuille.",
    };
  }
  return { ok: true };
}
