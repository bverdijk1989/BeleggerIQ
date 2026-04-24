import { NextResponse, type NextRequest } from "next/server";

import { resolveUser } from "@/lib/auth";
import {
  expectObject,
  jsonError,
  jsonServerError,
  parseString,
  parseStringArray,
  parseTickerStrict,
  safeJson,
} from "@/lib/http";
import { snapshotFactors } from "@/lib/services/snapshot-service";

/**
 * POST /api/snapshots/factors
 *
 * Body (optioneel):
 * ```json
 * { "tickers": ["ASML.AS", "MSFT"], "model": "beleggeriq.v1" }
 * ```
 *
 * Zonder body scoort de route het default screener-universum. Idempotent
 * op (ticker, capturedAt, model). De ticker-array is gecapped op 100 items.
 *
 * Auth: factor snapshots zijn systeem-data (universum-breed), maar we
 * vereisen alsnog een ingelogde caller zodat een gescheduled worker een
 * service-cookie nodig heeft — anonieme triggers zijn niet toegestaan.
 * Productie kan dit endpoint ook alleen via een cron-caller met
 * `X-Vercel-Cron`-secret aanroepen (zie README).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TICKERS_PER_RUN = 100;

export async function POST(request: NextRequest) {
  const auth = resolveUser(request);
  if (!auth.ok) return jsonError(auth.error, auth.status, "UNAUTHENTICATED");

  try {
    const body = expectObject(await safeJson(request));
    if (!body.ok) return jsonError(body.error, 400);

    const tickers = parseStringArray(body.value.tickers, "tickers", {
      optional: true,
      maxItems: MAX_TICKERS_PER_RUN,
      itemOptions: { minLength: 1, maxLength: 24 },
    });
    if (!tickers.ok) return jsonError(tickers.error, 400);

    let validTickers: string[] | undefined;
    if (tickers.value) {
      validTickers = [];
      for (const t of tickers.value) {
        const parsed = parseTickerStrict(t, "tickers");
        if (!parsed.ok) return jsonError(parsed.error, 400);
        if (parsed.value) validTickers.push(parsed.value);
      }
    }

    const model = parseString(body.value.model, "model", {
      optional: true,
      minLength: 1,
      maxLength: 32,
      pattern: /^[a-zA-Z0-9._-]+$/,
    });
    if (!model.ok) return jsonError(model.error, 400);

    const result = await snapshotFactors({
      tickers: validTickers,
      model: model.value,
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonServerError(
      "api:snapshots:factors",
      error,
      "Kon factor-snapshots niet wegschrijven.",
    );
  }
}
