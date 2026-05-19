/**
 * Signal Performance Lab — types (Module 27).
 *
 * **Doel**: meet hoe goed elke signaal-component historisch werkt over
 * verschillende horizons, regimes, en in welke "verkeerde" gevallen
 * (false positives / false negatives).
 *
 * **Filosofie — geen overfit-magie**:
 *  - Geen training, geen optimizer, geen "fit"-stap
 *  - Pure-function engine, alle drempels `const`
 *  - Bij <30 observaties → expliciete sample-size warning (UI rendert
 *    "beperkte sample, niet statistisch significant")
 *  - Disclaimer: "Historische prestaties geven geen garantie voor
 *    toekomstige resultaten" — verplicht in UI-footer
 *
 * **Risicoanalist-laag**: onzekerheid expliciet — sample size, horizon,
 * regime-bucket size; geen false-precision percentages.
 */

import type { ISODateString } from "@/types/common";

/** Welke 6 signal-componenten uit spec. */
export type SignalComponentKey =
  | "quality"
  | "valuation"
  | "momentum"
  | "volatility"
  | "macrofit"
  | "portfoliofit";

/** Forward-return horizons in maanden. */
export type ReturnHorizon = "1m" | "3m" | "6m" | "12m";

/** Macro-regime labels — herbruikt uit MarketRegimeStance. */
export type RegimeBucket = "RISK_ON" | "NEUTRAL" | "DEFENSIVE" | "UNKNOWN";

/**
 * Eén observatie: snapshot van signaal-scores plus de feitelijke
 * forward-returns op verschillende horizons. Caller (loader) bouwt
 * deze uit FactorSnapshot + price history + MarketSnapshot.
 */
export interface SignalObservation {
  ticker: string;
  asOf: ISODateString;
  /** 0..100 per component; null = geen data. */
  scores: Partial<Record<SignalComponentKey, number | null>>;
  /** Macro-regime op asOf-datum. */
  regime: RegimeBucket;
  /** Feitelijke return per horizon, fractie (0.05 = +5%). null = onbeschikbaar (te recent). */
  forwardReturns: Partial<Record<ReturnHorizon, number | null>>;
}

/**
 * Per-component performance-metrics — over één horizon.
 */
export interface SignalComponentPerformance {
  component: SignalComponentKey;
  horizon: ReturnHorizon;
  /** Aantal observaties gebruikt in deze meting. */
  sampleSize: number;
  /** Information Coefficient: Spearman-rank correlatie score ↔ forward-return.
   *  Range -1..+1; > 0.05 = positief signaal, < -0.05 = invers. */
  informationCoefficient: number | null;
  /** Hit-rate: fractie observaties waar score>50 → return≥0 OF score<50 → return<0.
   *  > 0.50 = beter dan random. */
  hitRate: number | null;
  /** Long-short-spread: gemiddelde return top-quintile (score>=80) MINUS bottom-quintile (score<20). */
  longShortSpread: number | null;
  /** Gemiddelde return van top-quintile (score>=80). */
  topQuintileReturn: number | null;
  /** Gemiddelde return van bottom-quintile (score<20). */
  bottomQuintileReturn: number | null;
  /** False-positive count: score>=70 + forward-return<-0.05. */
  falsePositiveCount: number;
  /** False-negative count: score<=30 + forward-return>+0.05. */
  falseNegativeCount: number;
  /** Sample-size warning gerendert wanneer < 30 observaties. */
  warning: string | null;
}

/**
 * Per-component breakdown over alle horizons — toont signal-decay.
 */
export interface SignalComponentReport {
  component: SignalComponentKey;
  /** Per-horizon metrics; 1m → 12m. */
  byHorizon: SignalComponentPerformance[];
  /** Tag uit decay-analyse. */
  decayPattern: SignalDecayPattern;
  /** Plain-language samenvatting (NL). */
  summary: string;
}

/**
 * Decay-pattern classificatie. Pure functie van per-horizon hit-rates.
 *  - `monotonic_decay`  hit-rate daalt monotoon naar lange horizon (typisch momentum)
 *  - `monotonic_growth` hit-rate stijgt naar langere horizon (typisch quality)
 *  - `peak_mid`         piek in 3m/6m (typisch valuation)
 *  - `flat`             hit-rate stabiel (consistent signaal)
 *  - `insufficient`     te weinig data om te classificeren
 */
export type SignalDecayPattern =
  | "monotonic_decay"
  | "monotonic_growth"
  | "peak_mid"
  | "flat"
  | "insufficient";

/**
 * Per-regime performance — toont waar elk signaal sterker/zwakker werkt.
 */
export interface RegimePerformanceCell {
  regime: RegimeBucket;
  sampleSize: number;
  hitRate: number | null;
  meanReturn: number | null;
}

export interface SignalRegimeBreakdown {
  component: SignalComponentKey;
  /** Voor 12m horizon (langste-zicht). */
  horizon: ReturnHorizon;
  byRegime: RegimePerformanceCell[];
  /** Welk regime is het sterkst voor dit signaal? */
  bestRegime: RegimeBucket | null;
  /** Welk regime is het zwakst? */
  worstRegime: RegimeBucket | null;
  warning: string | null;
}

/**
 * Hoofd-output van de engine.
 */
export interface SignalPerformanceReport {
  generatedAt: ISODateString;
  /** Totaal aantal observaties in dataset. */
  totalObservations: number;
  /** Per-component report met decay-analyse. */
  components: SignalComponentReport[];
  /** Per-component regime-breakdown (op 12m horizon). */
  regimeBreakdowns: SignalRegimeBreakdown[];
  /** Sample-size kritisch laag? Globale warning. */
  globalWarning: string | null;
  /** Disclaimer-tekst (vast — UI rendert verplicht). */
  disclaimer: string;
}

/** UI-labels NL. */
export const SIGNAL_COMPONENT_LABELS: Record<SignalComponentKey, string> = {
  quality: "Fundamentele kwaliteit",
  valuation: "Waardering",
  momentum: "Momentum",
  volatility: "Volatiliteit",
  macrofit: "Macro-fit",
  portfoliofit: "Portfolio-fit",
};

export const HORIZON_LABELS: Record<ReturnHorizon, string> = {
  "1m": "1 maand",
  "3m": "3 maanden",
  "6m": "6 maanden",
  "12m": "12 maanden",
};

export const REGIME_LABELS: Record<RegimeBucket, string> = {
  RISK_ON: "Risk-on",
  NEUTRAL: "Neutraal",
  DEFENSIVE: "Defensief",
  UNKNOWN: "Onbekend",
};

export const DECAY_PATTERN_LABELS: Record<SignalDecayPattern, string> = {
  monotonic_decay: "Verzwakt over tijd (typisch momentum)",
  monotonic_growth: "Werkt sterker op lange termijn",
  peak_mid: "Werkt het best op middellange termijn",
  flat: "Consistent over alle horizons",
  insufficient: "Te weinig data voor decay-analyse",
};

/** Drempel: onder dit aantal observaties → warning. */
export const MIN_SAMPLE_SIZE = 30;
/** Drempel voor false-positive (hoge score, negatieve return). */
export const HIGH_SCORE_THRESHOLD = 70;
/** Drempel voor false-negative (lage score, positieve return). */
export const LOW_SCORE_THRESHOLD = 30;
/** Quintile-grenzen voor long-short spread. */
export const TOP_QUINTILE_THRESHOLD = 80;
export const BOTTOM_QUINTILE_THRESHOLD = 20;

/** Verplichte disclaimer onder rapport. */
export const SIGNAL_PERFORMANCE_DISCLAIMER =
  "Historische prestaties bieden geen garantie voor toekomstige resultaten. Backtests zijn gebaseerd op beschikbare snapshot-data; selectie-bias, survivorship-bias en regime-shifts kunnen reële uitkomsten substantieel beïnvloeden. Gebruik deze cijfers om beter te begrijpen WANNEER een signaal historisch werkte, niet als koop/verkoop-advies.";
