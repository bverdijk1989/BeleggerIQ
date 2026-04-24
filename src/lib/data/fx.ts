import { log } from "@/lib/log";
import type { Currency } from "@/types/common";
import type { FxRate } from "@/types/market";

import { buildCacheKey, marketDataCache } from "./cache";
import { getMarketDataProvider } from "./providers";
import { withRetry, withTimeout } from "./resilience";

const PROVIDER_TIMEOUT_MS = 5_000;

/**
 * FX service. TTL staat hoger dan quotes omdat wisselkoersen voor
 * portfolio-analytics meestal in intraday-granulariteit volstaan.
 */

const FX_TTL_SECONDS = 300;
const NAMESPACE = "fx";

export async function getFxRate(
  from: Currency,
  to: Currency,
): Promise<FxRate | null> {
  if (from === to) {
    return {
      from,
      to,
      rate: 1,
      asOf: new Date().toISOString(),
      source: "identity",
    };
  }

  const key = buildCacheKey(NAMESPACE, from, to);
  return marketDataCache.getOrSet(key, FX_TTL_SECONDS, async () => {
    try {
      return await withRetry(
        () => withTimeout(getMarketDataProvider().getRate(from, to), PROVIDER_TIMEOUT_MS),
        { scope: "market:fx", retries: 2, baseDelayMs: 150, maxDelayMs: 1000 },
      );
    } catch (error) {
      log.warn("market:fx", "provider fetch failed after retries", { from, to, error });
      return null;
    }
  });
}

/**
 * Zet een bedrag om naar een andere currency. Retourneert het originele
 * bedrag als de FX-rate niet beschikbaar is en logt een warning (graceful
 * fallback zodat dashboard-widgets niet crashen).
 */
export async function convertAmount(
  amount: number,
  from: Currency,
  to: Currency,
): Promise<number> {
  if (from === to || amount === 0) return amount;
  const rate = await getFxRate(from, to);
  if (!rate) {
    log.warn("market:fx", "conversion unavailable; returning amount as-is", {
      from,
      to,
      amount,
    });
    return amount;
  }
  return amount * rate.rate;
}
