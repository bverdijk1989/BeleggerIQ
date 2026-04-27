import type { ISODateString } from "@/types/common";
import type { OpportunitySource } from "@/lib/analytics/opportunity-radar";

/**
 * Opportunity Radar — adapter-types.
 *
 * Deze module is een **dunne wrapper** rond `@/lib/analytics/opportunity-radar`.
 * De radar-engine levert al 8 signaaltypes; deze adapter:
 *   - filtert naar de 5 publiek-aangeboden signaaltypes,
 *   - transformeert het object-shape naar `OpportunityResult` zoals
 *     gespecificeerd door deze module's contract,
 *   - normaliseert `OpportunityConfidence` (HIGH/MEDIUM/LOW) naar
 *     een numerieke `confidence ∈ [0, 1]`,
 *   - leidt `riskLevel` en `expectedHorizon` deterministisch af uit
 *     het signaaltype + confidence-tier.
 *
 * Geen AI, geen externe state. Alle businesslogica blijft in de
 * onderliggende `opportunity-radar` engine; wij doen alleen mapping.
 */

export type OpportunityType =
  | "QUALITY_PULLBACK"
  | "VALUE_MISPRICING"
  | "MOMENTUM_REVERSAL"
  | "UNDERWEIGHT_HIGH_CONVICTION"
  | "ETF_REBALANCE_OPPORTUNITY";

export type OpportunityRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface OpportunityResult {
  /** Ticker-symbool (upper-case). */
  symbol: string;
  /** Eén type per resultaat — het sterkste matchende signaaltype. */
  opportunityType: OpportunityType;
  /** 0..100 — composite-score uit de onderliggende radar. */
  score: number;
  /** 0..1 — numerieke confidence (afgeleid uit tier + factor-confidence). */
  confidence: number;
  /** NL-string met verwachte holding-horizon, bv. "6-18 maanden". */
  expectedHorizon: string;
  /** Risiconiveau, afgeleid uit signaaltype + confidence. */
  riskLevel: OpportunityRiskLevel;
  /** Eén compacte zin (NL) — afgeleid uit de eerste rationale-bullet. */
  rationale: string;
  /** Bron van de kandidaat (portfolio / screener / watchlist). */
  source: OpportunitySource;
  /** Originele detectie-timestamp uit de radar. */
  detectedAt: ISODateString;
}

/**
 * Verwachte holding-horizon per signaaltype. Constant — niet gebaseerd
 * op AI of marktdata. Reproduceerbaar.
 *
 *  - QUALITY_PULLBACK: kwaliteitsbedrijven met tijdelijke correctie
 *    herstellen typisch binnen 6–18 maanden.
 *  - VALUE_MISPRICING: mean-reversion van waarderings-multiples is
 *    langzamer (ondergewaardeerde sectoren kunnen jaren onpopulair
 *    blijven).
 *  - MOMENTUM_REVERSAL: trend-keerpunten zijn relatief kortdurig en
 *    fragiel; horizon ≤ 6 maanden.
 *  - UNDERWEIGHT_HIGH_CONVICTION: weeg-aanpassing in de portefeuille
 *    is een DCA-achtige cadence van 12–24 maanden.
 *  - ETF_REBALANCE_OPPORTUNITY: core-ETF onder target → bijkopen op
 *    natuurlijke maandelijkse cadence; horizon 3–12 maanden.
 */
export const OPPORTUNITY_HORIZON: Record<OpportunityType, string> = {
  QUALITY_PULLBACK: "6-18 maanden",
  VALUE_MISPRICING: "12-36 maanden",
  MOMENTUM_REVERSAL: "1-6 maanden",
  UNDERWEIGHT_HIGH_CONVICTION: "12-24 maanden",
  ETF_REBALANCE_OPPORTUNITY: "3-12 maanden",
};

/**
 * Numerieke confidence per tier — gebruikt voor zowel score-aggregatie
 * als als drempel voor `riskLevel`. Consistent met
 * `CONFIDENCE_WEIGHT` in `opportunity-radar/scoring.ts`.
 */
export const CONFIDENCE_TIER_TO_NUMBER: Record<
  "HIGH" | "MEDIUM" | "LOW",
  number
> = {
  HIGH: 0.85,
  MEDIUM: 0.6,
  LOW: 0.35,
};

/**
 * NL-labels per type — UI-tooltip / dashboard.
 */
export const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
  QUALITY_PULLBACK: "Kwaliteits-pullback",
  VALUE_MISPRICING: "Value-mispricing",
  MOMENTUM_REVERSAL: "Momentum-reversal",
  UNDERWEIGHT_HIGH_CONVICTION: "Onderwogen high-conviction",
  ETF_REBALANCE_OPPORTUNITY: "ETF rebalance-kans",
};
