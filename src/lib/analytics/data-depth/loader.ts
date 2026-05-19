/**
 * Data-Depth loader — server-side aggregator (Module 26).
 *
 * Verzamelt de boolean-flags die de pure engine nodig heeft, vanuit
 * portfolio-view + macro + fundamentals. Faal-safe: missing data
 * resulteert in `flag=false`, niet in een crash.
 */

import type { PortfolioView } from "@/lib/analytics/portfolio-view";
import type { FundamentalsSnapshot } from "@/types/factor";

import { assessPortfolioCoverage, computeAssetDataDepth } from "./engine";
import type { AssetDataDepth, PortfolioDataCoverage } from "./types";

export interface BuildDataDepthInput {
  /** Geresolveerde portfolio-view (heeft valuations + factor-scores). */
  view: PortfolioView;
  /** Per-ticker fundamentals — optioneel. */
  fundamentalsByTicker?: ReadonlyMap<string, FundamentalsSnapshot | null>;
  /** Per-ticker history-aantal — voor `history`-flag. */
  historyPointsByTicker?: ReadonlyMap<string, number>;
  /** Is er een macro-regime classificatie geactiveerd? (Globaal.) */
  hasMacroRegime?: boolean;
}

/**
 * Bouw per-asset depth + portfolio-coverage uit een portfolio-view.
 *
 * **Heuristieken**:
 *  - `live_price` = priceSource === "market" (valuation.ts)
 *  - `fundamentals` = fundamentals.pe of fundamentals.roic gevuld
 *  - `dividend` = fundamentals.dividendYield gevuld (zelfs als 0)
 *  - `macro` = caller geeft `hasMacroRegime: true` (regime-engine actief)
 *  - `history` = historyPointsByTicker ≥ 60 (≈ 3 maanden trading days)
 */
export function buildPortfolioDepth(
  input: BuildDataDepthInput,
): {
  perAsset: ReadonlyArray<AssetDataDepth>;
  portfolio: PortfolioDataCoverage;
} {
  const totalValue = input.view.summary.totalValue;
  const hasMacro = input.hasMacroRegime === true;

  const perAsset: AssetDataDepth[] = [];
  const assetsForAggregate: Array<{ depth: AssetDataDepth; weight: number }> = [];

  for (const v of input.view.valuations) {
    const ticker = v.holding.ticker;
    const fundamentals = input.fundamentalsByTicker?.get(ticker) ?? null;
    const historyPoints = input.historyPointsByTicker?.get(ticker) ?? 0;
    const weight =
      totalValue > 0 ? v.marketValueBase / totalValue : 0;

    const livePrice = v.priceSource === "market";
    const hasFundamentals =
      fundamentals !== null &&
      (typeof fundamentals.pe === "number" ||
        typeof fundamentals.roic === "number" ||
        typeof fundamentals.pb === "number");
    const hasDividend =
      fundamentals !== null && typeof fundamentals.dividendYield === "number";
    const hasHistory = historyPoints >= 60;

    const sources: string[] = [];
    if (livePrice) sources.push("market");
    if (fundamentals) sources.push("fundamentals");

    const depth = computeAssetDataDepth({
      ticker,
      flags: {
        live_price: livePrice,
        fundamentals: hasFundamentals,
        dividend: hasDividend,
        macro: hasMacro,
        history: hasHistory,
      },
      sources,
    });
    perAsset.push(depth);
    assetsForAggregate.push({ depth, weight });
  }

  const portfolio = assessPortfolioCoverage({
    generatedAt: new Date().toISOString(),
    assets: assetsForAggregate,
  });

  return { perAsset, portfolio };
}
