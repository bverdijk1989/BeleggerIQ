import type { AssetClass } from "./portfolio";
import type { FactorSubScores } from "./factor";

/**
 * Defensiveness-voorkeur die door allocation en screener wordt meegewogen.
 * `balanced` is de neutrale default; de engines mappen dit naar beta- en
 * volatility-targets.
 */
export type DefensivenessLevel = "offensive" | "balanced" | "defensive";

/**
 * Filters voor de screener. Alles optioneel zodat een user progressief
 * kan filteren. `factorMin` is partieel zodat niet alle factor-sub-scores
 * verplicht zijn.
 */
export interface ScreenerFilters {
  minMarketCap?: number;
  maxMarketCap?: number;
  maxPe?: number;
  minDividendYield?: number;
  /** Cap op debt/equity ratio (bv. 2 = max 200%). */
  maxDebtToEquity?: number;
  minFactorComposite?: number;
  /** Per-factor drempels (0..100). */
  factorMin?: Partial<FactorSubScores>;
  sectors?: string[];
  regions?: string[];
  assetClasses?: AssetClass[];
  /** Exclude tickers (bv. uit policy). */
  excludedTickers?: string[];
  esgOnly?: boolean;
  dividendOnly?: boolean;
}
