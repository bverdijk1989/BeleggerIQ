import { NextResponse, type NextRequest } from "next/server";

import { getFxRate } from "@/lib/data/fx";
import { jsonError, jsonServerError } from "@/lib/http";

import { MARKET_CACHE_HEADERS, parseCurrency } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const from = parseCurrency(params.get("from"));
    const to = parseCurrency(params.get("to"));

    if (!from || !to) {
      return jsonError(
        "Query parameters `from` en `to` moeten supported currencies zijn (EUR, USD, GBP, CHF, JPY).",
        400,
      );
    }

    const rate = await getFxRate(from, to);
    return NextResponse.json({ rate }, { headers: MARKET_CACHE_HEADERS });
  } catch (error) {
    return jsonServerError("api:market:fx", error, "Kon FX-rate niet ophalen.");
  }
}
