import { log } from "@/lib/log";
import type { Quote } from "@/types/market";

import { buildCacheKey, marketDataCache } from "./cache";
import { getMarketDataProvider } from "./providers";
import { withRetry, withTimeout } from "./resilience";

/**
 * Quote service. Wrapt de provider met cache + defensive error handling.
 * Server-only: importeer uitsluitend vanuit server components, server
 * actions of route handlers.
 */

const QUOTE_TTL_SECONDS = 60;
const NAMESPACE = "quote";

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

export async function getQuote(ticker: string): Promise<Quote | null> {
  const normalized = normalizeTicker(ticker);
  if (!normalized) return null;

  const key = buildCacheKey(NAMESPACE, normalized);
  return marketDataCache.getOrSet(key, QUOTE_TTL_SECONDS, async () => {
    try {
      const quote = await withRetry(
        () =>
          withTimeout(getMarketDataProvider().getQuote(normalized), PROVIDER_TIMEOUT_MS),
        { scope: "market:quote", retries: 2, baseDelayMs: 150, maxDelayMs: 1000 },
      );
      return quote;
    } catch (error) {
      log.warn("market:quote", "provider fetch failed after retries", {
        ticker: normalized,
        error,
      });
      return null;
    }
  });
}

const PROVIDER_TIMEOUT_MS = 5_000;

export async function getQuotes(tickers: string[]): Promise<Quote[]> {
  const unique = Array.from(
    new Set(tickers.map(normalizeTicker).filter(Boolean)),
  );
  if (unique.length === 0) return [];

  const results = await Promise.all(unique.map((t) => getQuote(t)));
  return results.filter((q): q is Quote => q !== null);
}
