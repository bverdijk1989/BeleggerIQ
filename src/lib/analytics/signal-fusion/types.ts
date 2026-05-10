/**
 * Signal Fusion Engine — types.
 *
 * Combineert 10 signaal-bronnen tot één **Investment Confidence Score**
 * 0..100 per instrument. Géén black box: elke component levert score +
 * rationale + data-quality, en wordt 1-op-1 in de UI getoond.
 *
 * **Topbelegger-laag**:
 *  - Buffett: quality + valuation samen 35% gewicht — bewust het zwaarst.
 *  - Dalio: macro_sensitivity + portfolio_fit samen 25% — risico/diversificatie.
 *  - Lynch: per signaal een NL-rationale met concrete getallen.
 *  - Simons: pure-functie laag, deterministisch, ≥ 30 unit tests.
 *  - Wood: extra signalen (innovation_growth, esg, …) zijn drop-in via
 *    `SignalKey` + extractor-registratie.
 */

import type { ISODateString } from "@/types/common";

export type SignalKey =
  | "fundamental_quality"
  | "valuation"
  | "momentum"
  | "volatility"
  | "earnings_revisions"
  | "dividend_quality"
  | "macro_sensitivity"
  | "sentiment"
  | "insider_analyst"
  | "portfolio_fit";

export type SignalDataQuality = "high" | "medium" | "low" | "missing";

export type ConfidenceTier =
  | "STRONG"
  | "POSITIVE"
  | "NEUTRAL"
  | "WEAK"
  | "AVOID";

/**
 * Eén signaal-bijdrage. `score` is `null` wanneer er onvoldoende data
 * beschikbaar is — het signaal telt dan niet mee in de composite, maar
 * wordt wél in de UI getoond met een "Geen data"-pill (transparantie-eis).
 */
export interface SignalContribution {
  key: SignalKey;
  /** UI-label NL. */
  label: string;
  /** 0..100; null = onvoldoende data. */
  score: number | null;
  /** Gewicht 0..1. Som van alle weights = 1.0. */
  weight: number;
  /** Bijdrage aan composite (= score × renormalized-weight). null wanneer score=null. */
  contribution: number | null;
  /** 1-zin uitleg in NL (concrete cijfers waar mogelijk). */
  rationale: string;
  /** Hoe betrouwbaar achten we dit signaal. */
  dataQuality: SignalDataQuality;
  /** Optionele meetwaarde voor de UI ("ROIC 18.4%"). */
  metric?: number | null;
  /** Welke engine de input leverde — audit-trail. */
  source: string;
}

/**
 * Output van de fusion-engine voor één instrument.
 */
export interface InvestmentConfidenceScore {
  ticker: string;
  asOf: ISODateString;
  /** Composite-score 0..100. */
  totalScore: number;
  /** Letter-tier voor at-a-glance reading. */
  tier: ConfidenceTier;
  /** Eén-zin headline ("Sterke quality + redelijke waardering"). */
  headline: string;
  /** Volledige breakdown — exact 10 signals. */
  signals: SignalContribution[];
  /** 0..1 — fractie van weight dat data leverde. */
  effectiveWeight: number;
  /** "high" / "medium" / "low" — afgeleid uit signaal-data-qualities. */
  dataQuality: SignalDataQuality;
  /** Lijst beperkingen (welke signalen geen data hadden). */
  dataLimitations: string[];
  /** Warning-string voor lage data-kwaliteit (UI-toon). null = geen waarschuwing. */
  warning: string | null;
}

/**
 * Default-gewichten per signaal. Som = 1.00.
 *
 * **Buffett-bias**: quality + valuation = 35%.
 * **Dalio-bias**: macro_sensitivity + portfolio_fit = 25%.
 * **Wood-anker**: earnings_revisions + sentiment + insider_analyst hebben
 * elk maar 5% — ze zijn vaak `null` (geen data) en de renormalisatie
 * verdeelt dan over de Buffett/Dalio-anchors.
 *
 * Wijziging vereist een PR met motivatie.
 */
export const DEFAULT_SIGNAL_WEIGHTS: Record<SignalKey, number> = {
  fundamental_quality: 0.20,
  valuation: 0.15,
  momentum: 0.10,
  volatility: 0.10,
  earnings_revisions: 0.05,
  dividend_quality: 0.05,
  macro_sensitivity: 0.10,
  sentiment: 0.05,
  insider_analyst: 0.05,
  portfolio_fit: 0.15,
};

export const SIGNAL_LABELS: Record<SignalKey, string> = {
  fundamental_quality: "Fundamentele kwaliteit",
  valuation: "Waardering",
  momentum: "Momentum",
  volatility: "Volatiliteit",
  earnings_revisions: "Earnings-revisies",
  dividend_quality: "Dividendkwaliteit",
  macro_sensitivity: "Macrogevoeligheid",
  sentiment: "Sentiment",
  insider_analyst: "Insider/analyst",
  portfolio_fit: "Portefeuillefit",
};

/** Volgorde waarin de UI signalen toont (vast — predictable layout). */
export const SIGNAL_ORDER: ReadonlyArray<SignalKey> = [
  "fundamental_quality",
  "valuation",
  "momentum",
  "volatility",
  "dividend_quality",
  "earnings_revisions",
  "sentiment",
  "insider_analyst",
  "macro_sensitivity",
  "portfolio_fit",
];
