import type { Currency, ISODateString } from "@/types/common";

/**
 * Opportunity Radar types.
 *
 * De radar scant **systematisch** op situaties waar prijs, kwaliteit,
 * momentum, risico en waardering **niet logisch in balans** lijken.
 * Belangrijke regel: dit zijn *signalen*, geen adviezen. De UI moet
 * altijd tonen waarom een kandidaat oplicht, met de bijbehorende
 * risico-nota, zodat de gebruiker zelf de beslissing neemt.
 *
 * Design-principes:
 *  - Reproduceerbaar: elk signaal is een pure functie van holding-data +
 *    factor-scores. Geen willekeur, geen AI, geen verzonnen cijfers.
 *  - Explainable: elk signaal levert eigen `rationale` + `riskNote`.
 *  - Composable: één kandidaat kan meerdere signalen tegelijk triggeren.
 *    De composite-score erkent dat een stapeling sterker is dan losse hits.
 *  - Defensief bij missende data: een signaal retourneert `null` als de
 *    benodigde input ontbreekt. Geen gokken.
 */

export const OPPORTUNITY_SIGNAL_TYPES = [
  "quality-pullback",
  "value-dislocation",
  "momentum-reversal",
  "watchlist-target",
  "underweight-high-conviction",
  "etf-core-rebalance",
  "defensive-bargain",
  "earnings-sentiment-placeholder",
] as const;

export type OpportunitySignalType = (typeof OPPORTUNITY_SIGNAL_TYPES)[number];

export type OpportunityConfidence = "HIGH" | "MEDIUM" | "LOW";

export type OpportunitySource = "portfolio" | "screener" | "watchlist";

export interface OpportunitySignal {
  type: OpportunitySignalType;
  /** 0..100 — sterkte van dit ene signaal. Hoger = sterker trigger. */
  strength: number;
  confidence: OpportunityConfidence;
  /** NL-bullets die uitleggen waarom dit signaal triggert. */
  rationale: string[];
  /**
   * Expliciete risico-nota: "wat kan hier mis gaan" (value trap,
   * momentum fade, earnings surprise, etc.). **Verplicht** om gebruikers
   * te laten zien dat elk signaal een keerzijde heeft.
   */
  riskNote: string;
  detectedAt: ISODateString;
}

export interface OpportunityCandidate {
  ticker: string;
  name: string;
  isin: string | null;
  /** 0..100 — composite opportunity-score over alle gematchte signalen. */
  score: number;
  confidence: OpportunityConfidence;
  signals: OpportunitySignal[];
  source: OpportunitySource;
  /** Laatst bekende koers (voor UI-regel "trigger onder €X"). */
  currentPrice: number | null;
  /** Valuta van de koers; UI gebruikt dit voor formatCurrency. */
  currency: Currency | null;
  /** Samenvattende één-zin-regel voor lijstweergave. */
  summary: string;
  /** Waarschuwingen over data-kwaliteit (missende prijs, dunne history, ...). */
  warnings: string[];
}

export interface OpportunityReport {
  scannedAt: ISODateString;
  candidateCount: number;
  candidates: OpportunityCandidate[];
  /** Tellers per signaal-type: handig voor dashboard-widgets. */
  signalDistribution: Record<OpportunitySignalType, number>;
  /** Bronnen die de scan heeft geraadpleegd. UI toont dit als audit-trail. */
  sourcesScanned: {
    portfolioHoldings: number;
    screenerCandidates: number;
    watchlistItems: number;
  };
}

/** Label-mapping voor UI. Geëxporteerd zodat dashboard-widget en page
 *  dezelfde strings gebruiken. */
export const SIGNAL_LABELS: Record<OpportunitySignalType, string> = {
  "quality-pullback": "Kwaliteit met pullback",
  "value-dislocation": "Value-dislocatie",
  "momentum-reversal": "Momentum-keerpunt",
  "watchlist-target": "Watchlist-target geraakt",
  "underweight-high-conviction": "Onderwogen conviction",
  "etf-core-rebalance": "Core-ETF rebalance",
  "defensive-bargain": "Defensieve koopje",
  "earnings-sentiment-placeholder": "Earnings / sentiment (placeholder)",
};

/** Kleurklassen per type — UI-consistentie. */
export const SIGNAL_TONE: Record<OpportunitySignalType, "positive" | "neutral" | "warning"> = {
  "quality-pullback": "positive",
  "value-dislocation": "positive",
  "momentum-reversal": "neutral",
  "watchlist-target": "positive",
  "underweight-high-conviction": "positive",
  "etf-core-rebalance": "neutral",
  "defensive-bargain": "positive",
  "earnings-sentiment-placeholder": "neutral",
};
