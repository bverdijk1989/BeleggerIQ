import type { ISODateString } from "@/types/common";

/**
 * Instrument-classificatie types.
 *
 * Doel: onderscheid tussen single stocks, brede ETFs, sector ETFs,
 * factor ETFs, theme ETFs, income ETFs (incl. covered call), bond ETFs,
 * commodities, crypto, cash en leveraged/inverse instrumenten.
 *
 * Deze laag zit boven `AssetClass` (uit `@/types/portfolio`) en verfijnt
 * dat grove onderscheid. Waar `AssetClass` grofweg zegt *"dit is een
 * ETF"*, zegt `InstrumentType` *"het is een covered-call income-ETF"*
 * zodat risk/policy/rebalance-engines andere regels kunnen toepassen.
 */

/**
 * Canonieke lijst van instrument-types. Gebruikt als string literal
 * union — geen TS `enum` zodat tree-shaking werkt en geen extra runtime
 * overhead ontstaat.
 */
export const INSTRUMENT_TYPES = [
  "SINGLE_STOCK",
  "BROAD_MARKET_ETF",
  "SECTOR_ETF",
  "FACTOR_ETF",
  "THEME_ETF",
  "INCOME_ETF",
  "BOND_ETF",
  "COMMODITY_ETF",
  "CRYPTO",
  "CASH",
  "LEVERAGED_OR_INVERSE",
  "UNKNOWN_ETF",
  "UNKNOWN",
] as const;

export type InstrumentType = (typeof INSTRUMENT_TYPES)[number];

/**
 * Income-strategie binnen `INCOME_ETF`. Covered-call ETFs vragen om een
 * hele andere evaluatie dan high-dividend stock baskets of bond-heavy
 * income trackers.
 */
export type IncomeStrategy =
  | "covered-call"
  | "high-dividend"
  | "bond-heavy"
  | "other";

/** Confidence-niveau van de classificatie. Enum-achtige waarde zodat de
 *  UI er direct mee kan branchen (kleur-codering per niveau). */
export type ClassificationConfidence = "HIGH" | "MEDIUM" | "LOW";

/**
 * Metadata die downstream engines nodig hebben om instrument-gedrag te
 * differentiëren. Wordt gezet door de classifier op basis van de
 * `instrumentType` — callers hoeven niet zelf te switchen op type.
 */
export interface InstrumentMetadata {
  /** Breed gespreid instrument (true voor IWDA/VWCE/S&P 500, false voor sector ETFs en single stocks). */
  isBroadMarket: boolean;
  /** Enkelvoudige sector-focus (bv. "Technology"), `null` wanneer n.v.t. of mixed. */
  sectorFocus: string | null;
  /** Income-focused (dividend / covered-call / bond ladder). */
  isIncomeFocused: boolean;
  /** Specifieke income-strategie — alleen gezet wanneer `isIncomeFocused` true is. */
  incomeStrategy: IncomeStrategy | null;
  /** Speculatief instrument (leveraged, inverse, short). Policy-caps gelden hier harder. */
  isSpeculative: boolean;
  /** Of company-level factor-scoring (Quality/Value op ROIC, P/E, etc.) zinvol is. */
  supportsFactorScoring: boolean;
  /** Of de rebalance-engine dit mag behandelen als "winner to let run" (typisch false voor sector/theme ETFs). */
  eligibleForWinnerRule: boolean;
}

export interface InstrumentClassification {
  instrumentType: InstrumentType;
  confidence: ClassificationConfidence;
  /** Verklarende bullets zodat de UI kan tonen *waarom* deze classificatie — pure provenance, geen verzonnen cijfers. */
  rationale: string[];
  metadata: InstrumentMetadata;
  classifiedAt: ISODateString;
}

/**
 * Helper: lege default-metadata. Classifier vult die waar relevant aan.
 * Handig als startpunt zodat we niet per-branch alle velden hoeven
 * op te sommen.
 */
export function defaultMetadata(): InstrumentMetadata {
  return {
    isBroadMarket: false,
    sectorFocus: null,
    isIncomeFocused: false,
    incomeStrategy: null,
    isSpeculative: false,
    supportsFactorScoring: false,
    eligibleForWinnerRule: false,
  };
}
