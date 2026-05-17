/**
 * Crypto-lab loader — server-side hydratie.
 *
 * Bouwt een `CryptoRiskReport` uit het portfolio (filtert CRYPTO-positions)
 * + 1 jaar dagelijkse history voor BTC-USD en ETH-USD. Faal-safe: market
 * data fouten → metrics op missing/low; engine produceert wel een rapport.
 */

import { getHistory } from "@/lib/data";
import type { Portfolio } from "@/types/portfolio";

import { buildCryptoRiskReport, classifyCryptoTicker } from "./engine";
import { computeCryptoMetrics } from "./metrics";
import type {
  CryptoAssetKey,
  CryptoAssetMetrics,
  CryptoPosition,
  CryptoRiskReport,
} from "./types";

const HISTORY_TICKERS: Record<CryptoAssetKey, string> = {
  BTC: "BTC-USD",
  ETH: "ETH-USD",
};

const HISTORY_DAYS = 380; // ~1 jaar marge voor weekends

export interface LoadCryptoRiskReportInput {
  portfolio: Portfolio;
  totalPortfolioValue: number;
  /** Override `now` — alleen voor tests. */
  asOf?: Date;
}

export async function loadCryptoRiskReport(
  input: LoadCryptoRiskReportInput,
): Promise<CryptoRiskReport> {
  const asOf = input.asOf ?? new Date();
  const asOfIso = asOf.toISOString();

  // 1. Filter user-positions tot CRYPTO + classificeer BTC/ETH.
  const positions = buildPositions(input);

  // 2. Voor elke unieke BTC/ETH asset → fetch 1y daily history.
  const uniqueAssets = unique(
    positions
      .map((p) => p.asset)
      .filter((a): a is CryptoAssetKey => a !== null),
  );
  const startDate = new Date(asOf.getTime() - HISTORY_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const endDate = asOfIso.slice(0, 10);

  const assetMetrics: CryptoAssetMetrics[] = [];
  for (const asset of uniqueAssets) {
    const closes = await fetchCloses(HISTORY_TICKERS[asset], startDate, endDate);
    assetMetrics.push(
      computeCryptoMetrics({ asset, closes }),
    );
  }

  // 3. Bouw report.
  return buildCryptoRiskReport({
    asOf: asOfIso,
    totalPortfolioValue: input.totalPortfolioValue,
    positions,
    assetMetrics,
  });
}

// ============================================================
//  Helpers
// ============================================================

function buildPositions(
  input: LoadCryptoRiskReportInput,
): CryptoPosition[] {
  const out: CryptoPosition[] = [];
  const total = input.totalPortfolioValue;
  for (const h of input.portfolio.holdings) {
    if (h.assetClass !== "CRYPTO") continue;
    const price = h.currentPrice ?? h.avgCostPrice;
    const marketValueBase = Number.isFinite(price) ? price * h.quantity : 0;
    out.push({
      ticker: h.ticker,
      name: h.name,
      marketValueBase,
      weight: total > 0 ? marketValueBase / total : 0,
      asset: classifyCryptoTicker(h.ticker, h.name),
    });
  }
  return out;
}

async function fetchCloses(
  ticker: string,
  startDate: string,
  endDate: string,
): Promise<number[]> {
  try {
    const points = await getHistory({
      ticker,
      startDate,
      endDate,
      interval: "1d",
    });
    return points
      .map((p) => p.adjustedClose ?? p.close)
      .filter((c): c is number => typeof c === "number" && c > 0);
  } catch {
    return [];
  }
}

function unique<T>(xs: ReadonlyArray<T>): T[] {
  return Array.from(new Set(xs));
}
