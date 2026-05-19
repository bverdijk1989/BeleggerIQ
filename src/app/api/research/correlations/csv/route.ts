import { NextResponse, type NextRequest } from "next/server";

import { resolveUser } from "@/lib/auth";
import {
  buildCorrelationCsv,
  loadCorrelationReport,
} from "@/lib/analytics/correlation";
import { portfolioRepository } from "@/lib/data";
import { canUseFeature, resolveCurrentTier } from "@/lib/entitlements";
import { jsonError, jsonServerError } from "@/lib/http/errors";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * GET /api/research/correlations/csv
 *
 * CSV-export van Correlation Studio rapport (Module 28).
 *
 * **Entitlement**: `research.correlations` (ELITE + ADVISOR).
 * **Cache**: private, no-store — rapport bevat user-portfolio-context.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = resolveUser(request);
  if (!auth.ok) return jsonError(auth.error, auth.status, "UNAUTHENTICATED");

  try {
    const tier = await resolveCurrentTier(auth.user.email);
    const ent = canUseFeature(tier.tier, "research.correlations", {
      overrideActive: tier.overrideActive,
    });
    if (!ent.allowed) {
      return jsonError(
        "Correlation Studio vereist Elite of Advisor.",
        403,
        "FEATURE_NOT_ENTITLED",
      );
    }

    const portfolio = await portfolioRepository
      .findPrimaryByEmail(auth.user.email)
      .catch(() => null);
    if (!portfolio || portfolio.holdings.length === 0) {
      return jsonError(
        "Geen portefeuille met posities gevonden.",
        404,
        "NO_PORTFOLIO",
      );
    }

    const report = await loadCorrelationReport({ portfolio });
    const csv = buildCorrelationCsv(report);

    log.info("research:correlations", "csv_generated", {
      tier: tier.tier,
      assetCount: report.assets.length,
      diversificationScore: report.diversificationScore,
      hasWarning: report.warning !== null,
    });

    const filename = `beleggeriq-correlations-${report.generatedAt.slice(0, 10)}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return jsonServerError("research_correlations_csv_failed", error);
  }
}
