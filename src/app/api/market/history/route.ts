import { NextResponse, type NextRequest } from "next/server";

import { getHistory } from "@/lib/data/history";
import { jsonError, jsonServerError, parseEnum, parseIsoDate } from "@/lib/http";
import type { HistoryInterval } from "@/types/market";

import { MARKET_CACHE_HEADERS, parseTicker } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_INTERVALS = ["1d", "1wk", "1mo"] as const satisfies readonly HistoryInterval[];

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const ticker = parseTicker(params.get("ticker"));
    if (!ticker) return jsonError("Query parameter `ticker` is verplicht.", 400);

    const from = parseIsoDate(params.get("from"), "from");
    if (!from.ok) return jsonError(from.error, 400);
    const to = parseIsoDate(params.get("to"), "to");
    if (!to.ok) return jsonError(to.error, 400);
    if (!from.value || !to.value) {
      return jsonError("Query parameters `from` en `to` (ISO date) zijn verplicht.", 400);
    }
    if (from.value > to.value) {
      return jsonError("`from` moet vóór of gelijk aan `to` liggen.", 400);
    }

    const interval = parseEnum(
      params.get("interval"),
      "interval",
      VALID_INTERVALS,
      { fallback: "1d" },
    );
    if (!interval.ok) return jsonError(interval.error, 400);

    const history = await getHistory({
      ticker,
      startDate: from.value,
      endDate: to.value,
      interval: interval.value,
    });

    return NextResponse.json(
      { history, interval: interval.value },
      { headers: MARKET_CACHE_HEADERS },
    );
  } catch (error) {
    return jsonServerError(
      "api:market:history",
      error,
      "Kon history niet ophalen.",
    );
  }
}
