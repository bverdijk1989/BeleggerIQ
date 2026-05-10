import { NextResponse, type NextRequest } from "next/server";

import { resolveUser } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
import { deleteUserAccount, DELETE_CONFIRMATION_PHRASE } from "@/lib/gdpr";
import { jsonError, jsonServerError } from "@/lib/http/errors";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * POST /api/user/delete
 *
 * AVG art. 17 — Recht op vergetelheid. Verwijdert het volledige account
 * inclusief portefeuille, transacties, watchlist, etc. via Prisma cascade.
 *
 * Body-shape:
 * ```json
 * { "confirmation": "VERWIJDER MIJN ACCOUNT" }
 * ```
 *
 * De confirmation-tekst MOET letterlijk kloppen — preventief tegen
 * accidentele deletes (bv. door een script-aanroep zonder UI-flow).
 *
 * Audit-trail blijft bewaard (zonder PII) zodat we voor compliance
 * kunnen aantonen dat de delete plaatsvond.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = resolveUser(request);
  if (!auth.ok) return jsonError(auth.error, auth.status, "UNAUTHENTICATED");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const confirmation =
    typeof body === "object" &&
    body !== null &&
    "confirmation" in body &&
    typeof (body as Record<string, unknown>).confirmation === "string"
      ? ((body as Record<string, unknown>).confirmation as string)
      : "";

  if (confirmation !== DELETE_CONFIRMATION_PHRASE) {
    return jsonError(
      `Bevestiging-tekst klopt niet. Tik exact: "${DELETE_CONFIRMATION_PHRASE}"`,
      400,
      "CONFIRMATION_REQUIRED",
    );
  }

  try {
    const ctx = await portfolioRepository
      .findUserContextByEmail(auth.user.email)
      .catch(() => null);
    if (!ctx?.userId) {
      return jsonError("Geen user-context.", 404, "USER_NOT_FOUND");
    }

    const result = await deleteUserAccount(ctx.userId, { confirmation });
    if (!result.ok) {
      return jsonError(result.error ?? "Verwijderen mislukt.", 400);
    }

    log.info("gdpr:delete", "user_account_deleted", {
      accountHash: result.deletedAccountHash,
    });

    // Verwijder de session-cookie zodat de user direct uitgelogd is.
    return NextResponse.json(
      {
        ok: true,
        message: "Account is verwijderd. Bedankt voor je vertrouwen.",
      },
      {
        status: 200,
        headers: {
          "Set-Cookie": [
            "biq_session=",
            "Path=/",
            "HttpOnly",
            "SameSite=Lax",
            "Max-Age=0",
            ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
          ].join("; "),
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    return jsonServerError("user_delete_failed", error);
  }
}
