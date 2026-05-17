/**
 * Input-shape voor de watchlist-intelligence-engine.
 *
 * Type-only, geen Prisma. De `loader.ts` hydrateert dit uit factor-engine,
 * fundamentals, snapshots en macro-regime.
 */

import type { ISODateString } from "@/types/common";
import type { FactorScore, FundamentalsSnapshot } from "@/types/factor";
import type {
  AssetClassKey,
  MacroRegimeReport,
} from "@/lib/analytics/macro-regime";
import type { InvestorType, RiskTolerance } from "@/types/profile";

export interface WatchlistTickerContext {
  ticker: string;
  name: string;
  sector: string | null;
  /** Asset-class voor macro-fit lookup. */
  assetClassKey: AssetClassKey | null;
  /** Huidige factor-score; null = geen data. */
  factorScore: FactorScore | null;
  /** Vorige factor-snapshot — voor delta's. Mag null. */
  previousFactorScore: FactorScore | null;
  /** Fundamentals; null = geen data. */
  fundamentals: FundamentalsSnapshot | null;
  /** Vorige fundamentals (~30d-90d eerder); voor dividend-yield-delta. */
  previousFundamentals: FundamentalsSnapshot | null;
  /** Optionele earnings-datum (toekomst-feed). */
  nextEarningsDate?: ISODateString | null;
  /** Optionele sentiment-score -1..+1 (toekomst-feed). */
  sentimentScore?: number | null;
  /** Optionele sentiment-delta over recente periode. */
  sentimentDelta?: number | null;
  /** Geannualiseerde volatiliteit (0..1, bv. 0.21 = 21%). Module 9. */
  volatility?: number | null;
  /** Vorige volatiliteit-meting voor delta-detectie. Module 9. */
  previousVolatility?: number | null;
  /** Beta vs benchmark — voor opportunity-vs-risk afweging. Module 9. */
  beta?: number | null;
}

/**
 * User-profiel-context voor PROFILE_FIT-signaal (Module 9).
 * Optioneel — bij null fallt het signaal terug op "geen data".
 */
export interface WatchlistUserProfile {
  investorType: InvestorType;
  riskTolerance: RiskTolerance;
  investmentHorizonYrs: number;
}

export interface SimilarUniverseEntry {
  ticker: string;
  name: string;
  sector: string | null;
  compositeScore: number;
  source: "portfolio" | "watchlist";
}

export interface WatchlistIntelligenceInput {
  current: WatchlistTickerContext;
  /** Andere posities + watchlist-items om "alternatives" uit te kiezen. */
  universe: ReadonlyArray<SimilarUniverseEntry>;
  /** Macro-regime report (Module 6). */
  macro: MacroRegimeReport | null;
  /** Optioneel user-profiel voor PROFILE_FIT (Module 9). */
  userProfile?: WatchlistUserProfile | null;
  /** ISO-tijdstip wanneer de berekening plaatsvindt. */
  asOf: ISODateString;
}
