import { NextResponse, type NextRequest } from "next/server";

import { resolveUser } from "@/lib/auth";
import { canUseFeature, resolveCurrentTier } from "@/lib/entitlements";
import { jsonError, jsonServerError } from "@/lib/http/errors";
import { log } from "@/lib/log";
import {
  loadAdvisorReport,
  renderAdvisorReportHtml,
} from "@/lib/reports/advisor-pdf";

export const dynamic = "force-dynamic";

/**
 * GET /api/advisor/report
 *
 * Genereert het Advisor PDF Report (Module 23) als print-friendly HTML.
 *
 * **Entitlement**: `report.advisor_pdf` (Elite + Advisor).
 *
 * **Query-params**:
 *   - `download=1` → `Content-Disposition: attachment` (browser download)
 *                    anders → `inline` (browser opent het rapport en
 *                    gebruiker kan via Ctrl/⌘+P → "Opslaan als PDF").
 *   - `note=<string>` → optionele advisor-notitie (max 500 chars).
 *
 * **Privacy**: geen PII in logs (alleen counts + status).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = resolveUser(request);
  if (!auth.ok) return jsonError(auth.error, auth.status, "UNAUTHENTICATED");

  try {
    const tierResult = await resolveCurrentTier(auth.user.email);
    const ent = canUseFeature(tierResult.tier, "report.advisor_pdf", {
      overrideActive: tierResult.overrideActive,
    });
    if (!ent.allowed) {
      return jsonError(
        "Advisor-rapport vereist Elite of Advisor.",
        403,
        "FEATURE_NOT_ENTITLED",
      );
    }

    const url = new URL(request.url);
    const wantsDownload = url.searchParams.get("download") === "1";
    const note = (url.searchParams.get("note") ?? "").slice(0, 500) || null;

    const result = await loadAdvisorReport({
      userEmail: auth.user.email,
      advisorNote: note,
    });

    if (!result.ok || !result.data) {
      return jsonError(
        result.reason === "no_portfolio"
          ? "Geen portefeuille gevonden — voeg eerst posities toe."
          : "Account-context kon niet worden geladen.",
        404,
        result.reason === "no_portfolio" ? "NO_PORTFOLIO" : "NO_USER",
      );
    }

    const html = renderAdvisorReportHtml(result.data);

    log.info("advisor:report", "advisor_pdf_html_generated", {
      tier: tierResult.tier,
      positionsTotal: result.data.dataQuality.totalPositions,
      positionsWithPrice: result.data.dataQuality.positionsWithPrice,
      actionItemCount: result.data.actionItems.items.length,
      download: wantsDownload,
    });

    const filename = `beleggeriq-advisor-report-${result.data.asOf.slice(
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
    return jsonServerError("advisor_report_generate_failed", error);
  }
}
