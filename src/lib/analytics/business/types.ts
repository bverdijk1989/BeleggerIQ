import type { ISODateString } from "@/types/common";

/**
 * Business Quality Layer — types.
 *
 * Beoordeelt elke positie als **bedrijf**, niet alleen als ticker.
 * Drie deelscores (moat / earnings-quality / capital-efficiency)
 * worden gewogen tot een composite `businessQualityScore`. Pure
 * heuristieken bovenop `FundamentalsSnapshot`.
 *
 * Geen AI, geen externe state. Alle drempels staan als constants in de
 * submodules zodat de scores reproduceerbaar zijn.
 */

export type BusinessLabel = "COMPOUNDER" | "CYCLICAL" | "SPECULATIVE";

export interface BusinessSubScore {
  /** 0..100 — hoger = beter. */
  score: number;
  /** Lijst NL-bullets; bron-getallen letterlijk uit fundamentals. */
  rationale: string[];
  /** 0..1 — coverage, daalt bij missende velden. */
  coverage: number;
}

export interface BusinessQualityResult {
  ticker: string;
  asOf: ISODateString;

  /** Moat-score: gross margin, ROIC, prijsmacht-proxies. */
  moatScore: number;
  /** Earnings-quality: marge-stabiliteit + groei-consistentie. */
  earningsStability: number;
  /** Capital-efficiency: ROIC + ROE + leverage. */
  capitalEfficiency: number;

  /** Composite 0..100. */
  businessQualityScore: number;

  label: BusinessLabel;
  /**
   * 10-year hold indicator. True als alle drie deelscores ≥ 60 én
   * label = COMPOUNDER én coverage voldoende.
   */
  canHoldLongTerm: boolean;

  /** 0..1 — gemiddelde coverage over de drie subscores. */
  confidence: number;

  /** UI-tooltip met bullet-list per deelscore. */
  rationale: {
    moat: string[];
    earnings: string[];
    capital: string[];
  };

  /** Lijst met data-quality issues. */
  warnings: string[];
}

/**
 * Default-gewichten van de composite. Som = 1.
 */
export const BUSINESS_WEIGHTS = {
  moat: 0.4,
  earnings: 0.35,
  capital: 0.25,
} as const;

export const BUSINESS_THRESHOLDS = {
  /** Minimum composite voor COMPOUNDER. */
  compounderMin: 70,
  /** Maximum composite voor SPECULATIVE. */
  speculativeMax: 40,
  /** Per-subscore drempel voor 10y-hold. */
  longTermPerScore: 60,
  /** Minimum coverage (0..1) voor 10y-hold. */
  longTermMinConfidence: 0.5,
} as const;
