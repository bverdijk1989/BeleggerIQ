import { NextResponse, type NextRequest } from "next/server";

import { getFundamentals } from "@/lib/data/fundamentals";
import { jsonError, jsonServerError } from "@/lib/http";

import { MARKET_CACHE_HEADERS, parseTicker } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const ticker = parseTicker(request.nextUrl.searchParams.get("ticker"));
    if (!ticker) {
      return jsonError("Query parameter `ticker` is verplicht.", 400);
    }

    const fundamentals = await getFundamentals(ticker);
    return NextResponse.json(
      { fundamentals },
      { headers: MARKET_CACHE_HEADERS },
    );
  } catch (error) {
    return jsonServerError(
      "api:market:fundamentals",
      error,
      "Kon fundamentals niet ophalen.",
    );
  }
}
