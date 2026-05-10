import { NextResponse, type NextRequest } from "next/server";

import { resolveUser } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
import { buildUserDataExport } from "@/lib/gdpr";
import { jsonError, jsonServerError } from "@/lib/http/errors";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * GET /api/user/export
 *
 * AVG art. 15 — Recht op inzage. Lever een volledige JSON-dump van alle
 * data die we over de ingelogde gebruiker hebben.
 *
 * Auth-gated. Geen rate-limit-override nodig (default policy is
 * acceptabel — een user heeft geen reden om dit 60×/min te doen).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = resolveUser(request);
  if (!auth.ok) return jsonError(auth.error, auth.status, "UNAUTHENTICATED");

  try {
    const ctx = await portfolioRepository
      .findUserContextByEmail(auth.user.email)
      .catch(() => null);
    if (!ctx?.userId) {
      return jsonError("Geen user-context.", 404, "USER_NOT_FOUND");
    }

    const exported = await buildUserDataExport(ctx.userId);
    if (!exported) {
      return jsonError("Account bestaat niet meer.", 404, "USER_NOT_FOUND");
    }

    log.info("gdpr:export", "user_export_built", {
      userIdHashFirst: ctx.userId.slice(0, 4),
      portfolioCount: exported.portfolios.length,
      transactionCount: exported.transactions.length,
    });

    // Content-Disposition zodat de browser 'em automatisch download.
    const filename = `beleggeriq-data-export-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(exported, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return jsonServerError("user_export_failed", error);
  }
}
