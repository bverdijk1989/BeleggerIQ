/**
 * Cross-Asset Correlation Studio — types (Module 28).
 *
 * **Doel**: research-laag voor Elite/Professional die per portefeuille
 * de paarsgewijze correlaties zichtbaar maakt + diversificatie-score +
 * concrete inzichten (concentratie-paren, hedge-kandidaten).
 *
 * **Geen overfit-magie**: alle drempels zijn gepubliceerde quant-conventie
 *   (0.85 = "highly correlated", < -0.30 = "negatieve correlatie /
 *   potentiële hedge"). Sample-size warning < 30 trading days.
 *
 * **Risicoanalist-laag**: disclaimer in UI + CSV — historische
 * correlaties zijn niet stabiel onder stress (correlation-spikes tijdens
 * crisis).
 */

import type { ISODateString } from "@/types/common";

/** Eén asset in de matrix — holding of benchmark. */
export type CorrelationAssetKind = "holding" | "benchmark";

export interface CorrelationAsset {
  /** Ticker (genormaliseerd, uppercase). */
  ticker: string;
  /** Display-naam ("Microsoft" of "S&P 500"). */
  name: string;
  kind: CorrelationAssetKind;
  /** Optionele sector — voor color-coding in UI. */
  sector?: string | null;
  /** Optioneel gewicht in portefeuille (0..1). null bij benchmarks. */
  weight: number | null;
}

/** Eén cell in de matrix: paar (i, j) met correlation + sample size. */
export interface CorrelationCell {
  i: number;
  j: number;
  /** Pearson correlation -1..+1. null = onvoldoende overlap. */
  correlation: number | null;
  /** Aantal gepaarde return-observaties. */
  sampleSize: number;
}

/**
 * Insight-categorie — pure classificatie uit een correlation-paar.
 *  - `highly_correlated`: cor ≥ 0.85 → concentratie-risico
 *  - `moderately_correlated`: cor ∈ [0.50, 0.85)
 *  - `uncorrelated_diversifier`: |cor| < 0.20 → goede diversifier
 *  - `negatively_correlated`: cor ≤ -0.30 → potentiële hedge
 */
export type CorrelationInsightKind =
  | "highly_correlated"
  | "moderately_correlated"
  | "uncorrelated_diversifier"
  | "negatively_correlated";

export interface CorrelationInsight {
  kind: CorrelationInsightKind;
  /** Display "MSFT × AAPL". */
  pairLabel: string;
  tickerA: string;
  tickerB: string;
  correlation: number;
  /** Plain-language uitleg (NL). */
  rationale: string;
}

/** Volledig rapport. */
export interface CorrelationReport {
  generatedAt: ISODateString;
  /** Lookback in trading days die de loader heeft gebruikt. */
  lookbackTradingDays: number;
  /** Welke assets staan in de matrix? Volgorde = matrix-rij/kol-index. */
  assets: ReadonlyArray<CorrelationAsset>;
  /** Flat-list van cells. Geen redundante (i,j) en (j,i) — alleen i<j. */
  cells: ReadonlyArray<CorrelationCell>;
  /** 0..100, hoger = beter gediversificeerd. */
  diversificationScore: number;
  /** Plain-language verdict bij diversification score. */
  diversificationVerdict: "uitstekend" | "goed" | "matig" | "geconcentreerd";
  /** Top inzichten — gesorteerd op |correlation| descending. */
  insights: ReadonlyArray<CorrelationInsight>;
  /** Globale warning bij te kleine sample. */
  warning: string | null;
  /** Verplichte disclaimer-tekst. */
  disclaimer: string;
}

/** Verplichte disclaimer onder rapport. */
export const CORRELATION_DISCLAIMER =
  "Correlaties zijn historisch gemeten en niet stabiel onder marktstress — tijdens crises stijgen correlaties typisch sterk, juist op het moment dat diversificatie het hardst nodig is. Gebruik deze cijfers om concentratie en hedge-kandidaten te identificeren, niet als garantie voor toekomstige spreiding.";

/** Drempels (vast — gepubliceerde quant-conventie). */
export const HIGHLY_CORRELATED_THRESHOLD = 0.85;
export const MODERATE_CORRELATED_THRESHOLD = 0.5;
export const UNCORRELATED_BAND = 0.2;
export const NEGATIVE_CORRELATED_THRESHOLD = -0.3;
export const MIN_SAMPLE_TRADING_DAYS = 30;

/** UI-labels voor insight-kinds. */
export const INSIGHT_LABELS: Record<CorrelationInsightKind, string> = {
  highly_correlated: "Sterk gecorreleerd",
  moderately_correlated: "Matig gecorreleerd",
  uncorrelated_diversifier: "Diversifier",
  negatively_correlated: "Hedge-kandidaat",
};
