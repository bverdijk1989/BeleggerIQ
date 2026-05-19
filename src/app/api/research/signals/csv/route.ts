import { NextResponse, type NextRequest } from "next/server";

import { resolveUser } from "@/lib/auth";
import {
  buildSignalPerformanceCsv,
  loadSignalPerformanceReport,
} from "@/lib/analytics/signal-performance";
import { canUseFeature, resolveCurrentTier } from "@/lib/entitlements";
import { jsonError, jsonServerError } from "@/lib/http/errors";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * GET /api/research/signals/csv
 *
 * CSV-export van Signal Performance Lab rapport (Module 27).
 *
 * **Entitlement**: `research.signal_performance` (ELITE + ADVISOR).
 * **Privacy**: rapport bevat geen ticker-namen, alleen geaggregeerde stats.
 * **Disclaimer**: laatste regel is verplichte disclaimer-tekst.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = resolveUser(request);
  if (!auth.ok) return jsonError(auth.error, auth.status, "UNAUTHENTICATED");

  try {
    const tier = await resolveCurrentTier(auth.user.email);
    const ent = canUseFeature(tier.tier, "research.signal_performance", {
      overrideActive: tier.overrideActive,
    });
    if (!ent.allowed) {
      return jsonError(
        "Signal Performance Lab vereist Elite of Advisor.",
        403,
        "FEATURE_NOT_ENTITLED",
      );
    }

    const report = await loadSignalPerformanceReport({});
    const csv = buildSignalPerformanceCsv(report);

    log.info("research:signals", "csv_generated", {
      tier: tier.tier,
      observations: report.totalObservations,
      hasGlobalWarning: report.globalWarning !== null,
    });

    const filename = `beleggeriq-signal-performance-${report.generatedAt.slice(0, 10)}.csv`;
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
    return jsonServerError("research_signals_csv_failed", error);
  }
}
