import { NextResponse, type NextRequest } from "next/server";

import { computeRegimeScore } from "@/lib/analytics/regime/engine";
import { fetchRegimeInputs } from "@/lib/data/regime";
import { jsonServerError } from "@/lib/http";

import { MARKET_CACHE_HEADERS, requireMarketAuth } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/market/regime
 * Retourneert de huidige MarketRegimeScore + de ruwe inputs zodat clients
 * desgewenst zelf kunnen ranken of hergewichten.
 */
export async function GET(_request: NextRequest) {
  const unauth = await requireMarketAuth();
  if (unauth) return unauth;
  try {
    const fetched = await fetchRegimeInputs();
    if (!fetched) {
      const regime = computeRegimeScore({});
      return NextResponse.json(
        { regime, inputs: {}, source: null },
        { headers: MARKET_CACHE_HEADERS },
      );
    }
    const regime = computeRegimeScore(fetched.input, {
      asOf: fetched.asOf,
      source: fetched.source,
    });
    return NextResponse.json(
      { regime, inputs: fetched.input, source: fetched.source },
      { headers: MARKET_CACHE_HEADERS },
    );
  } catch (error) {
    return jsonServerError(
      "api:market:regime",
      error,
      "Kon regime-score niet bepalen.",
    );
  }
}
