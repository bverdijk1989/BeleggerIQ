/**
 * Data-Depth Engine — types (Module 26).
 *
 * **Doel**: meet HOEVEEL betrouwbare data we hebben per asset en per
 * portefeuille, los van metadata-coverage (sector/region/etc — die zit
 * al in `src/lib/analytics/data-quality.ts`).
 *
 * **Wat meten we hier**:
 *  - Live-prijs aanwezig? (vs lastKnown / costBasis)
 *  - Fundamentals aanwezig? (PE / yield / margins → factor-scoring werkt)
 *  - Macro-context aanwezig? (regime-state geclassificeerd, niet "unknown")
 *  - Dividend-data aanwezig? (yield + groei voor dividendbeleggers)
 *
 * **Buffett-laag**: lage datakwaliteit moet eerlijk gecommuniceerd worden;
 * we maken een 0..100 depth-score met expliciete tier (excellent/good/
 * fair/limited/poor). UI rendert badge + plain-language uitleg.
 *
 * **Lynch-laag**: per asset is er één enkele "depth"-uitspraak; gebruikers
 * met >5 holdings hoeven niet 5 sub-metrics te interpreteren.
 *
 * **Simons-laag**: pure-function engine; deterministische thresholds;
 * volledige test-coverage.
 */

import type { ISODateString } from "@/types/common";

/**
 * Per-dimensie data-flag — wat we per asset wel/niet hebben.
 * Stable keys — audit + i18n koppelen hieraan.
 */
export type DataDepthDimension =
  | "live_price" // actuele koers
  | "fundamentals" // PE / margins / yield (factor-scoring)
  | "dividend" // yield + growth (voor dividend-strategy)
  | "macro" // regime-state aanwezig
  | "history"; // genoeg history voor vol/drawdown

/**
 * Tier-classificatie 0..100. Drempels:
 *  - excellent ≥ 85
 *  - good     ≥ 70
 *  - fair     ≥ 50
 *  - limited  ≥ 25
 *  - poor      < 25
 */
export type DataDepthTier =
  | "excellent"
  | "good"
  | "fair"
  | "limited"
  | "poor";

/** Per-asset depth-rapport. */
export interface AssetDataDepth {
  ticker: string;
  /** 0..100 — gewogen som over dimensies. */
  score: number;
  tier: DataDepthTier;
  /** Welke dimensies ZIJN er; welke ontbreken. */
  present: ReadonlyArray<DataDepthDimension>;
  missing: ReadonlyArray<DataDepthDimension>;
  /** Eén-zin plain-language verklaring. */
  explanation: string;
  /** Optionele bron-attributie ("yahoo+manual"). */
  sources: ReadonlyArray<string>;
}

/** Per-portfolio coverage-rapport. */
export interface PortfolioDataCoverage {
  generatedAt: ISODateString;
  /** Aantal assets in de portefeuille. */
  assetCount: number;
  /** 0..100 — weight-gewogen gemiddelde depth-score. */
  weightedScore: number;
  tier: DataDepthTier;
  /** Per-dimensie: aantal assets met data + gewogen-coverage. */
  dimensions: Record<
    DataDepthDimension,
    { presentCount: number; weightedCoverage: number }
  >;
  /** Top-3 assets met laagste depth (voor de UI "verbeter eerst"). */
  weakestAssets: ReadonlyArray<AssetDataDepth>;
  /** Plain-language samenvatting voor banner. */
  summary: string;
  /** UI-warnings (max 5) bij specifieke gaps. */
  warnings: ReadonlyArray<string>;
}

/** UI-labels per dimensie (NL). */
export const DIMENSION_LABELS: Record<DataDepthDimension, string> = {
  live_price: "Live koers",
  fundamentals: "Fundamentals",
  dividend: "Dividend",
  macro: "Macro-context",
  history: "Koersgeschiedenis",
};

/** UI-labels per tier (NL). */
export const TIER_LABELS: Record<DataDepthTier, string> = {
  excellent: "Uitstekend",
  good: "Goed",
  fair: "Acceptabel",
  limited: "Beperkt",
  poor: "Onvoldoende",
};

/**
 * Eén-zin plain-language uitleg per tier — voor in UI tooltip of card
 * caption. **Lynch-laag**: geen jargon, geen percentages, geen tech-praat.
 */
export const TIER_EXPLANATIONS: Record<DataDepthTier, string> = {
  excellent:
    "Alle belangrijke databronnen zijn aanwezig — scores en signalen zijn betrouwbaar.",
  good: "Bijna alle data is aanwezig — analyses zijn solide; één of twee bronnen ontbreken.",
  fair: "Voldoende data voor basis-analyses; sommige geavanceerde signalen kunnen incompleet zijn.",
  limited:
    "Beperkte data — gebruik scores als richting, niet als beslissingsbasis.",
  poor: "Onvoldoende data — scores zijn slechts indicatief en kunnen wijzigen zodra meer bekend is.",
};

/** Gewichten per dimensie — som = 1.0. */
export const DIMENSION_WEIGHTS: Record<DataDepthDimension, number> = {
  live_price: 0.30,
  fundamentals: 0.25,
  dividend: 0.10,
  macro: 0.15,
  history: 0.20,
};
