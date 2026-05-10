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
  /** Macro-regime report (Module 5). */
  macro: MacroRegimeReport | null;
  /** ISO-tijdstip wanneer de berekening plaatsvindt. */
  asOf: ISODateString;
}
