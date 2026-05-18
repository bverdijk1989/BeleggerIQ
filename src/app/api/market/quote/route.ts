import { NextResponse, type NextRequest } from "next/server";

import { getQuote, getQuotes } from "@/lib/data/quotes";
import { jsonError, jsonServerError } from "@/lib/http";

import {
  MARKET_CACHE_HEADERS,
  parseTicker,
  parseTickers,
  requireMarketAuth,
} from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unauth = await requireMarketAuth();
  if (unauth) return unauth;
  try {
    const params = request.nextUrl.searchParams;
    const parsedTickers = parseTickers(params.get("tickers"));
    if (!parsedTickers.ok) {
      return jsonError(parsedTickers.error ?? "Ongeldige tickers.", 400);
    }

    if (parsedTickers.tickers.length > 0) {
      const quotes = await getQuotes(parsedTickers.tickers);
      return NextResponse.json({ quotes }, { headers: MARKET_CACHE_HEADERS });
    }

    const ticker = parseTicker(params.get("ticker"));
    if (!ticker) {
      return jsonError(
        "Query parameter `ticker` of `tickers` is verplicht.",
        400,
      );
    }

    const quote = await getQuote(ticker);
    return NextResponse.json({ quote }, { headers: MARKET_CACHE_HEADERS });
  } catch (error) {
    return jsonServerError(
      "api:market:quote",
      error,
      "Kon quote niet ophalen.",
    );
  }
}
