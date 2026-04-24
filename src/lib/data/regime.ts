import type { RegimeScoreInput } from "@/lib/analytics/regime/scoring";
import { toFiniteNumber } from "@/lib/http/validate";
import { log } from "@/lib/log";
import type { ISODateString } from "@/types/common";

import { buildCacheKey, marketDataCache } from "./cache";
import { prisma } from "./prisma";

/**
 * Regime-data fetcher.
 *
 * Primaire bron: `MarketSnapshot` (seed + productie). De typed kolommen
 * dekken volatility, rente en breadth; minder gangbare signalen zoals
 * valuation-percentile en credit-spread lezen we uit de flexibele
 * `indicators` Json.
 *
 * Cached met een korte TTL (5 min) — regime verandert niet per seconde.
 */

const REGIME_TTL_SECONDS = 300;
const NAMESPACE = "regime";

export interface RegimeFetchResult {
  input: RegimeScoreInput;
  asOf: ISODateString;
  source: string;
}

export async function fetchRegimeInputs(): Promise<RegimeFetchResult | null> {
  return marketDataCache.getOrSet(
    buildCacheKey(NAMESPACE, "latest"),
    REGIME_TTL_SECONDS,
    async () => {
      try {
        const snapshot = await prisma.marketSnapshot.findFirst({
          orderBy: { capturedAt: "desc" },
        });
        if (!snapshot) return null;

        const indicators = extractIndicators(snapshot.indicators);

        const input: RegimeScoreInput = {
          valuationPercentile:
            toFiniteNumber(indicators.valuationPercentile) ?? null,
          marketPe: toFiniteNumber(indicators.marketPe) ?? null,
          breadthScore: toFiniteNumber(snapshot.breadthScore) ?? null,
          index12mReturn:
            toFiniteNumber(indicators.index12mReturn) ?? null,
          volatilityIndex: toFiniteNumber(snapshot.volatilityIndex) ?? null,
          interestRate10y: toFiniteNumber(snapshot.interestRate10y) ?? null,
          rateChange1y: toFiniteNumber(indicators.rateChange1y) ?? null,
          creditSpreadBps: toFiniteNumber(indicators.creditSpreadBps) ?? null,
        };

        return {
          input,
          asOf: snapshot.capturedAt.toISOString(),
          source: snapshot.source ?? "MarketSnapshot",
        };
      } catch (error) {
        log.warn("regime", "fetch failed", { error });
        return null;
      }
    },
  );
}

// ============================================================
//  Internals
// ============================================================

function extractIndicators(
  raw: unknown,
): Record<string, unknown> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}
