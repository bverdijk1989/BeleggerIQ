import { log } from "@/lib/log";

import { yahooClient } from "./providers/yahoo-client";
import { withRetry, withTimeout } from "./resilience";

/**
 * Symbol-resolver voor de Yahoo provider. Vertaalt een user-facing ticker
 * (zoals DEGIRO die exporteert — vaak een verkorte naam als "VANGUARD" of
 * "NVIDIA") naar een echt Yahoo-symbool ("VUSA.AS", "NVDA") op basis van
 * bij voorkeur de ISIN.
 *
 * Zonder deze laag faalt elke Yahoo-call voor DEGIRO-imports omdat hun
 * "symbool"-kolom geen echte beurs-ticker is.
 *
 * Resolutie-volgorde:
 *   1. Cache-hit op (ticker, isin) → direct terug.
 *   2. ISIN-zoekopdracht via Yahoo search → eerste resultaat is kanonieke symbool.
 *   3. Fallback: ticker-zoekopdracht. Minder accuraat (kan verkeerde beurs
 *      opleveren), maar beter dan niets.
 *   4. Alles faalt → retourneer originele ticker zodat bestaand gedrag
 *      (incl. "quote not found"-pad) intact blijft.
 *
 * De cache leeft per-process. Voor productie met 1 VPS is dat voldoende;
 * voor multi-instance setups zou dit naar Redis moeten.
 */

type ResolverCacheValue = string | null;

const resolverCache = new Map<string, ResolverCacheValue>();

const RESOLVE_TIMEOUT_MS = 8_000;

function cacheKey(ticker: string, isin?: string | null): string {
  return isin ? `isin:${isin.toUpperCase()}` : `ticker:${ticker.toUpperCase()}`;
}

interface YahooSearchResult {
  quotes?: Array<{ symbol?: string; exchange?: string; quoteType?: string }>;
}

async function searchYahoo(query: string): Promise<string | null> {
  try {
    const raw = await withRetry(
      () => withTimeout(yahooClient.search(query), RESOLVE_TIMEOUT_MS),
      { scope: "yahoo:resolve", retries: 1, baseDelayMs: 200, maxDelayMs: 500 },
    );
    const result = raw as YahooSearchResult | undefined;
    const first = result?.quotes?.find((q) => typeof q.symbol === "string");
    return first?.symbol ?? null;
  } catch (error) {
    log.warn("symbol-resolver", "search failed", { query, error });
    return null;
  }
}

/**
 * Resolve één ticker+ISIN naar een Yahoo-symbool. Retourneert altijd een
 * waarde: op een lookup-miss wordt de originele ticker teruggegeven zodat
 * downstream code dezelfde fallback-paden kan volgen als voorheen.
 */
export async function resolveYahooSymbol(
  ticker: string,
  isin?: string | null,
): Promise<string> {
  // Alleen actief wanneer Yahoo de huidige provider is — anders is resolution
  // zinloos (stub/none lezen toch niet van Yahoo).
  if (process.env.MARKET_DATA_PROVIDER !== "yahoo") return ticker;

  const key = cacheKey(ticker, isin);
  if (resolverCache.has(key)) {
    return resolverCache.get(key) ?? ticker;
  }

  // 1) ISIN-prioriteit.
  if (isin) {
    const bySymbol = await searchYahoo(isin);
    if (bySymbol) {
      resolverCache.set(key, bySymbol);
      return bySymbol;
    }
  }

  // 2) Fallback: zoek op de ticker/naam zelf.
  const byTicker = await searchYahoo(ticker);
  if (byTicker) {
    resolverCache.set(key, byTicker);
    return byTicker;
  }

  // 3) Niks gevonden — cache miss, fallback original.
  resolverCache.set(key, null);
  return ticker;
}

/**
 * Bulk-variant. Parallel met Promise.all; per item doet dezelfde lookup.
 * Handig in enrichment waar we in één pass alle holdings resolven voordat
 * we quotes/fundamentals/history fetchen.
 */
export async function resolveYahooSymbols(
  items: Array<{ ticker: string; isin?: string | null }>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (process.env.MARKET_DATA_PROVIDER !== "yahoo") {
    for (const item of items) out.set(item.ticker, item.ticker);
    return out;
  }

  await Promise.all(
    items.map(async (item) => {
      const resolved = await resolveYahooSymbol(item.ticker, item.isin);
      out.set(item.ticker, resolved);
    }),
  );
  return out;
}

/** Testhaak — leegt de in-memory cache. */
export function resetSymbolResolverCache(): void {
  resolverCache.clear();
}
