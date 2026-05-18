import { NextResponse } from "next/server";

import { resolveUserFromServer } from "@/lib/auth";
import { parseTickerStrict } from "@/lib/http/validate";
import type { Currency } from "@/types/common";

/**
 * Gedeelde helpers voor de /api/market routes. Houdt validatie en
 * response-shaping consistent. Alle input-validatie leunt op
 * `@/lib/http/validate` zodat de regels centraal liggen.
 */

/**
 * Auth-guard voor /api/market/*. Module 16 §4.3: deze routes raken de
 * upstream provider-quota (Yahoo, Alpha Vantage). Een eenvoudige
 * resolveUser-check voorkomt dat derden onze quota kunnen leegtrekken.
 *
 * Returnt `null` bij geauthenticeerde user (mag doorgaan), anders een
 * 401-response die de route direct kan terugsturen.
 */
export async function requireMarketAuth(): Promise<NextResponse | null> {
  const auth = await resolveUserFromServer();
  if (auth.ok) return null;
  return NextResponse.json(
    { error: "Authenticatie vereist.", code: "UNAUTHENTICATED" },
    { status: 401 },
  );
}

const SUPPORTED_CURRENCIES: ReadonlySet<string> = new Set([
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "JPY",
]);

/** Max aantal tickers in één `?tickers=a,b,c` request — beperkt DOS-risico. */
export const MAX_TICKERS_PER_REQUEST = 50;

export function parseCurrency(value: string | null): Currency | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  return SUPPORTED_CURRENCIES.has(upper) ? (upper as Currency) : null;
}

export function parseTicker(value: string | null): string | null {
  const parsed = parseTickerStrict(value, "ticker", { optional: true });
  return parsed.ok && parsed.value ? parsed.value : null;
}

export interface ParsedTickers {
  ok: boolean;
  tickers: string[];
  error?: string;
}

export function parseTickers(value: string | null): ParsedTickers {
  if (!value) return { ok: true, tickers: [] };
  const raw = value
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (raw.length > MAX_TICKERS_PER_REQUEST) {
    return {
      ok: false,
      tickers: [],
      error: `Max ${MAX_TICKERS_PER_REQUEST} tickers per request.`,
    };
  }
  const tickers: string[] = [];
  for (const t of raw) {
    const parsed = parseTickerStrict(t, "tickers", { optional: false });
    if (!parsed.ok) return { ok: false, tickers: [], error: parsed.error };
    if (parsed.value) tickers.push(parsed.value);
  }
  return { ok: true, tickers };
}

/** Short-lived private cache header voor browser + CDN edge. */
export const MARKET_CACHE_HEADERS = {
  "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
} as const;
