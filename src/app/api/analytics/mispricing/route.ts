import { NextResponse, type NextRequest } from "next/server";

import { loadMispricingReport } from "@/lib/analytics/mispricing/load";
import { resolveUser } from "@/lib/auth";
import { jsonError, jsonServerError } from "@/lib/http";

/**
 * GET /api/analytics/mispricing
 *
 * Query-params (optioneel):
 *   - `limit`           — max kandidaten in output (default 20, max 50)
 *   - `minScore`        — minimum mispricingScore (default 40, 0..100)
 *   - `ttl`             — signal-TTL in dagen (default 30, 1..180)
 *   - `universeLimit`   — breedte van de scan (default 40, 1..80)
 *
 * Response: `{ report, diagnostics }`. Zie `MispricingReport` voor het
 * volledige type.
 *
 * Auth: mispricing-signalen zijn niet user-specific, maar we vereisen
 * alsnog een geauthenticeerde sessie zodat anonymous scraping geen
 * optie is. Service-accounts (cron, snapshots) kunnen via dezelfde
 * cookie-resolver binnen.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const DEFAULT_MIN_SCORE = 40;
const DEFAULT_TTL_DAYS = 30;
const MAX_TTL_DAYS = 180;
const DEFAULT_UNIVERSE = 40;
const MAX_UNIVERSE = 80;

export async function GET(request: NextRequest) {
  const auth = resolveUser(request);
  if (!auth.ok) {
    return jsonError(auth.error, auth.status, "UNAUTHENTICATED");
  }

  try {
    const params = request.nextUrl.searchParams;
    const limit = clampInt(params.get("limit"), 1, MAX_LIMIT, DEFAULT_LIMIT);
    const minScore = clampInt(
      params.get("minScore"),
      0,
      100,
      DEFAULT_MIN_SCORE,
    );
    const ttlDays = clampInt(
      params.get("ttl"),
      1,
      MAX_TTL_DAYS,
      DEFAULT_TTL_DAYS,
    );
    const universeLimit = clampInt(
      params.get("universeLimit"),
      1,
      MAX_UNIVERSE,
      DEFAULT_UNIVERSE,
    );

    const result = await loadMispricingReport({
      universeLimit,
      minScore,
      maxCandidates: limit,
      signalTtlDays: ttlDays,
    });

    return NextResponse.json(result, {
      headers: {
        // Response bevat tijd-gevoelige signals — korte TTL, maar
        // gedeeltelijk shared-cacheable via de market-data layer.
        "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    return jsonServerError(
      "api:analytics:mispricing",
      error,
      "Kon mispricing-scan niet uitvoeren.",
    );
  }
}

function clampInt(
  raw: string | null,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
