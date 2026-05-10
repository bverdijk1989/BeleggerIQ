import { NextResponse, type NextRequest } from "next/server";

import { buildResearchNarrative } from "@/lib/ai/research-narrative";
import { loadResearchDossier } from "@/lib/ai/research-dossier-loader";
import { resolveUser } from "@/lib/auth";
import {
  expectObject,
  jsonError,
  jsonServerError,
  parseString,
  parseTickerStrict,
  safeJson,
} from "@/lib/http";

/**
 * POST /api/ai/research-dossier
 *
 * Body:
 * ```json
 * { "ticker": "ASML.AS" }
 * ```
 *
 * Retourneert `{ dossier, diagnostics }`. De dossier-shape is volledig
 * deterministisch opgebouwd uit engine-output (zie
 * `@/lib/ai/research-dossier`); deze route voegt geen extra cijfers toe.
 *
 * Auth: dossiers zijn user-specifiek (gebruiken portfolio + holding-
 * context van de ingelogde user). Geen anonymous toegang.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = resolveUser(request);
  if (!auth.ok) {
    return jsonError(auth.error, auth.status, "UNAUTHENTICATED");
  }

  try {
    const raw = await safeJson(request);
    if (raw === undefined) return jsonError("Ongeldige JSON body.", 400);
    const body = expectObject(raw);
    if (!body.ok) return jsonError(body.error, 400);

    const tickerCheck = parseString(body.value.ticker, "ticker", {
      minLength: 1,
      maxLength: 24,
    });
    if (!tickerCheck.ok) return jsonError(tickerCheck.error, 400);
    const tickerStrict = parseTickerStrict(tickerCheck.value, "ticker");
    if (!tickerStrict.ok) return jsonError(tickerStrict.error, 400);
    if (!tickerStrict.value) return jsonError("Ticker ontbreekt.", 400);

    const result = await loadResearchDossier({
      userEmail: auth.user.email,
      ticker: tickerStrict.value,
    });

    // AI-uplift: voegt een rijkere narrative toe wanneer een AI-provider
    // beschikbaar is. Faalt gracefully terug op deterministische
    // fallback bij elke fout. Niet-blocking — dossier-output blijft
    // intact ongeacht narrative-status.
    const narrative = await buildResearchNarrative(result.dossier).catch(
      () => null,
    );

    return NextResponse.json(
      { ...result, narrative },
      {
        headers: {
          // Dossier per (user, ticker) — korte cache, in lijn met de
          // andere AI-routes.
          "Cache-Control":
            "private, max-age=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    return jsonServerError(
      "api:ai:research-dossier",
      error,
      "Kon research-dossier niet genereren.",
    );
  }
}
