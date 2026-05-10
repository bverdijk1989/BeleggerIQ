/**
 * Watchlist Intelligence — types.
 *
 * Voor elke watchlist-ticker leveren we een **rijk** signaal-pakket:
 *  - 7 signaal-typen (waardering, momentum, earnings, dividend, macro,
 *    sentiment, alternatieven)
 *  - één 1-zin AI-style verklaring per item (Lynch-laag)
 *  - per signaal een `direction` (positief / negatief / neutraal) + 1-zin
 *    rationale (Simons-laag — meetbaar)
 *
 * Topbelegger-laag:
 *  - Buffett: een ticker is interessant wanneer kwaliteit hoog is én
 *    waardering verbetert.
 *  - Dalio: macro-fit met huidig regime weegt mee.
 *  - Lynch: rationale in spreektaal NL.
 *  - Simons: drempels zijn `const`; pure-functie generators; tests.
 *  - Wood: "alternatives" finder helpt innovatieve kansen ontdekken.
 */

import type { ISODateString } from "@/types/common";

export type WatchlistSignalKey =
  | "VALUATION_IMPROVED"
  | "MOMENTUM_CHANGED"
  | "EARNINGS_SOON"
  | "DIVIDEND_CHANGED"
  | "MACRO_FIT"
  | "SENTIMENT_SHIFT"
  | "SIMILAR_ALTERNATIVE";

export type SignalDirection = "positive" | "negative" | "neutral";

/**
 * Eén signaal-bijdrage. `available=false` betekent dat de signaal-bron
 * geen data leverde — UI toont 'em dan als "geen data" pill, niet
 * weglaten (transparantie-laag).
 */
export interface WatchlistSignal {
  key: WatchlistSignalKey;
  /** UI-label NL. */
  label: string;
  /** Of de bron data leverde voor dit signaal. */
  available: boolean;
  /** Richting voor UI-tone (groen/rood/neutraal). */
  direction: SignalDirection;
  /** 1-zin uitleg in NL met concrete cijfers waar beschikbaar. */
  rationale: string;
  /** Optionele numerieke meetwaarde (bv. value-score, dividendyield). */
  metric?: number | null;
  /** 0..100 sterkte van het signaal — voor sortering / aandacht-rangorde. */
  strength: number;
}

/**
 * Eén alternatief — ander ticker dat lijkt op deze maar (vermoedelijk)
 * beter scoort. Bewust beperkt tot tickers in user-universe + watchlist.
 */
export interface WatchlistAlternative {
  ticker: string;
  name: string;
  /** Hoe vergelijkbaar (0..1). Hoger = sterker match. */
  similarity: number;
  /** Composite-score van het alternatief, 0..100. */
  compositeScore: number;
  /** Eén-zin reden waarom het alternatief interessant is. */
  rationale: string;
  /** Bron: "portfolio" (al in bezit) of "watchlist" (ander watchlist-item). */
  source: "portfolio" | "watchlist";
}

/**
 * Volledig intelligentie-rapport voor één watchlist-ticker.
 */
export interface WatchlistIntelligenceReport {
  ticker: string;
  asOf: ISODateString;
  /** 1-zin samenvatting (Lynch-laag — spreektaal). */
  headline: string;
  /** Algemene tier afgeleid uit signal-strengths. */
  tier: "STRONG_OPPORTUNITY" | "POSITIVE" | "NEUTRAL" | "WAIT";
  /** Alle 7 signalen, in canonical UI-volgorde. */
  signals: WatchlistSignal[];
  /** 0..3 alternatieven die mogelijk interessanter zijn. */
  alternatives: WatchlistAlternative[];
  /**
   * Conclusie-zin in spreektaal — combineert sterkste positieve en
   * zwakste negatieve signaal. Voor in een paneel/uitleg-blok.
   */
  whyInteresting: string;
  /** Welke databronnen de engine kon lezen — voor traceability/audit. */
  sources: string[];
}

export const WATCHLIST_SIGNAL_LABELS: Record<WatchlistSignalKey, string> = {
  VALUATION_IMPROVED: "Waardering",
  MOMENTUM_CHANGED: "Momentum",
  EARNINGS_SOON: "Earnings",
  DIVIDEND_CHANGED: "Dividend",
  MACRO_FIT: "Macro-fit",
  SENTIMENT_SHIFT: "Sentiment",
  SIMILAR_ALTERNATIVE: "Alternatieven",
};

export const WATCHLIST_SIGNAL_ORDER: ReadonlyArray<WatchlistSignalKey> = [
  "VALUATION_IMPROVED",
  "MOMENTUM_CHANGED",
  "DIVIDEND_CHANGED",
  "EARNINGS_SOON",
  "MACRO_FIT",
  "SENTIMENT_SHIFT",
  "SIMILAR_ALTERNATIVE",
];
