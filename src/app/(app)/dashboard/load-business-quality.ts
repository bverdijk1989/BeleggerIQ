import {
  computeBusinessQualityBatch,
  type BusinessQualityBatchResult,
} from "@/lib/analytics";
import type { PortfolioView } from "@/lib/analytics/portfolio-view";
import { getFundamentals } from "@/lib/data/fundamentals";
import type { Portfolio } from "@/types/portfolio";

/**
 * Server-only loader voor de Business Quality Layer.
 *
 * Haalt fundamentals parallel op (cache dedupliceert), roept de pure
 * batch-engine aan en levert ranked + lookup-map. Faal-safe: per
 * ticker fundamentals=null → score = 50 (neutrale fallback).
 */

export interface LoadBusinessQualityInput {
  portfolio: Portfolio;
  view: PortfolioView;
}

export async function loadBusinessQualityBatch(
  input: LoadBusinessQualityInput,
): Promise<BusinessQualityBatchResult> {
  const tickers = input.portfolio.holdings.map((h) => h.ticker);
  const fundamentalsList = await Promise.all(
    tickers.map((t) => getFundamentals(t).catch(() => null)),
  );
  const entries = input.portfolio.holdings.map((holding, i) => ({
    ticker: holding.ticker,
    fundamentals: fundamentalsList[i] ?? null,
    holding,
  }));
  return computeBusinessQualityBatch(entries);
}
