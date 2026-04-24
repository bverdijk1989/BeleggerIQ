import { log } from "@/lib/log";
import type {
  HistoricalPoint,
  HistoryInterval,
  HistoryRequest,
} from "@/types/market";

import { buildCacheKey, marketDataCache } from "./cache";
import { getMarketDataProvider } from "./providers";
import { withRetry, withTimeout } from "./resilience";

// History returns can be multi-MB; ruimere timeout.
const PROVIDER_TIMEOUT_MS = 12_000;

/**
 * History service. TTL is relatief hoog: historische data wijzigt niet
 * retrograad; alleen de `endDate` nadert het heden. Voor intra-day
 * refreshes gebruik de Quote service i.p.v. history.
 */

const HISTORY_TTL_SECONDS = 60 * 30; // 30 minuten
const NAMESPACE = "history";

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

function toIsoDate(value: string): string | null {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString().slice(0, 10);
}

function isValidInterval(value: unknown): value is HistoryInterval {
  return value === "1d" || value === "1wk" || value === "1mo";
}

export interface HistoryQuery {
  ticker: string;
  startDate: string;
  endDate: string;
  interval?: HistoryInterval;
}

export async function getHistory(
  query: HistoryQuery,
): Promise<HistoricalPoint[]> {
  const ticker = normalizeTicker(query.ticker);
  const startDate = toIsoDate(query.startDate);
  const endDate = toIsoDate(query.endDate);
  const interval: HistoryInterval = isValidInterval(query.interval)
    ? query.interval
    : "1d";

  if (!ticker || !startDate || !endDate) return [];
  if (endDate < startDate) return [];

  const request: HistoryRequest = { ticker, startDate, endDate, interval };
  const key = buildCacheKey(
    NAMESPACE,
    ticker,
    startDate,
    endDate,
    interval,
  );

  return marketDataCache.getOrSet(key, HISTORY_TTL_SECONDS, async () => {
    try {
      const points = await withRetry(
        () =>
          withTimeout(
            getMarketDataProvider().getHistory(request),
            PROVIDER_TIMEOUT_MS,
          ),
        { scope: "market:history", retries: 2, baseDelayMs: 200, maxDelayMs: 1500 },
      );
      // Defensive normalisation: sorteer op datum, filter NaN closes.
      return points
        .filter((p) => Number.isFinite(p.close))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    } catch (error) {
      log.warn("market:history", "provider fetch failed after retries", {
        ticker,
        startDate,
        endDate,
        interval,
        error,
      });
      return [];
    }
  });
}
