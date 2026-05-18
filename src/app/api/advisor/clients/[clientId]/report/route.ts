import { NextResponse, type NextRequest } from "next/server";

import {
  isWorkspaceAdvisor,
  loadAdvisorClientDetail,
  recordAdvisorAccessDenied,
  recordAdvisorClientReportExported,
} from "@/lib/advisor-workspace";
import { resolveUser } from "@/lib/auth";
import { jsonError, jsonServerError } from "@/lib/http/errors";
import { log } from "@/lib/log";
import {
  loadAdvisorReport,
  renderAdvisorReportHtml,
} from "@/lib/reports/advisor-pdf";

export const dynamic = "force-dynamic";

/**
 * GET /api/advisor/clients/[clientId]/report
 *
 * Genereert het Advisor PDF Report (Module 23) voor een cliënt binnen
 * de advisor's pilot-workspace (Module 24).
 *
 * **Boundary** — drie lagen:
 *   1. Auth (`resolveUser`)
 *   2. Advisor-allowlist (`isWorkspaceAdvisor`)
 *   3. Client-link (`loadAdvisorClientDetail` → `resolveClientIdInWorkspace`)
 *
 * Faalt één laag, dan 403 + `advisor_access_denied`-audit-event.
 *
 * **Audit**: succesvolle generatie → `advisor_client_report_exported`.
 *
 * **Privacy**: clientLabel in het rapport is de gemaskeerde e-mail
 * (b***@example.com), niet de raw e-mail.
 */
interface RouteParams {
  params: Promise<{ clientId: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { clientId } = await params;

  const auth = resolveUser(request);
  if (!auth.ok) return jsonError(auth.error, auth.status, "UNAUTHENTICATED");

  if (!isWorkspaceAdvisor(auth.user.email)) {
    await recordAdvisorAccessDenied({
      advisorEmail: auth.user.email,
      attemptedClientId: clientId,
      reason: "not_an_advisor",
    });
    return jsonError(
      "Geen advisor-workspace voor dit account.",
      403,
      "NOT_AN_ADVISOR",
    );
  }

  try {
    const detailResult = await loadAdvisorClientDetail({
      advisorEmail: auth.user.email,
      clientId,
    });

    if (!detailResult.detail) {
      await recordAdvisorAccessDenied({
        advisorEmail: auth.user.email,
        attemptedClientId: clientId,
        reason: detailResult.decision.reason,
      });
      return jsonError(
        "Cliënt niet beschikbaar in jouw workspace.",
        403,
        "CLIENT_NOT_LINKED",
      );
    }

    const detail = detailResult.detail;
    const url = new URL(request.url);
    const wantsDownload = url.searchParams.get("download") === "1";
    const note = (url.searchParams.get("note") ?? "").slice(0, 500) || null;

    // Hergebruik Module 23 loader — maar voor de CLIËNT-email.
    // `generatedBy` is de advisor; `clientLabel` is de gemaskeerde mail.
    const result = await loadAdvisorReport({
      userEmail: detail.unsafeEmail,
      clientLabel: detail.maskedEmail,
      generatedBy: "Advisor (pilot)",
      advisorNote: note,
    });
    if (!result.ok || !result.data) {
      return jsonError(
        result.reason === "no_portfolio"
          ? "Cliënt heeft nog geen portefeuille."
          : "Cliënt-context kon niet geladen worden.",
        404,
        result.reason === "no_portfolio" ? "NO_PORTFOLIO" : "NO_USER",
      );
    }

    const html = renderAdvisorReportHtml(result.data);

    // Audit-event — gehaste e-mail, geen PII.
    await recordAdvisorClientReportExported({
      advisorEmail: auth.user.email,
      clientEmail: detail.unsafeEmail,
      format: "html",
      schemaVersion: result.data.schemaVersion,
      metadata: { download: wantsDownload },
    });

    log.info("advisor:workspace", "advisor_report_generated", {
      tier: detail.tier,
      positionsTotal: result.data.dataQuality.totalPositions,
      actionItemCount: result.data.actionItems.items.length,
      download: wantsDownload,
    });

    const filename = `beleggeriq-advisor-${detail.clientId}-${result.data.asOf.slice(
      0,
      10,
    )}.html`;
    const disposition = wantsDownload
      ? `attachment; filename="${filename}"`
      : `inline; filename="${filename}"`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": disposition,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return jsonServerError("advisor_client_report_failed", error);
  }
}
