import { log } from "@/lib/log";
import type { FundamentalsSnapshot } from "@/types/factor";

import { buildCacheKey, marketDataCache } from "./cache";
import { getMarketDataProvider } from "./providers";
import { withRetry, withTimeout } from "./resilience";

// Fundamentals is grotere payload en wijzigt minder vaak; iets royaler
// timeout dan quote/fx.
const PROVIDER_TIMEOUT_MS = 8_000;

/**
 * Fundamentals service. Relatief lange TTL omdat fundamentals slechts
 * enkele keren per jaar wijzigen (kwartaalcijfers) — ruwe provider-data
 * wordt ook elders in FactorSnapshot gepersisteerd.
 */

const FUNDAMENTALS_TTL_SECONDS = 60 * 60 * 6; // 6 uur
const NAMESPACE = "fundamentals";

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

export async function getFundamentals(
  ticker: string,
): Promise<FundamentalsSnapshot | null> {
  const normalized = normalizeTicker(ticker);
  if (!normalized) return null;

  const key = buildCacheKey(NAMESPACE, normalized);
  return marketDataCache.getOrSet(
    key,
    FUNDAMENTALS_TTL_SECONDS,
    async () => {
      try {
        return await withRetry(
          () =>
            withTimeout(
              getMarketDataProvider().getFundamentals(normalized),
              PROVIDER_TIMEOUT_MS,
            ),
          { scope: "market:fundamentals", retries: 2, baseDelayMs: 200, maxDelayMs: 1500 },
        );
      } catch (error) {
        log.warn("market:fundamentals", "provider fetch failed after retries", {
          ticker: normalized,
          error,
        });
        return null;
      }
    },
  );
}
