import type { Currency, ISODateString } from "./common";

/**
 * Concentration type. Gebruikt om te onderscheiden of een zware positie
 * een gezonde winner is of een fragiele uitschieter.
 */
export type ConcentrationType = "HEALTHY" | "NEUTRAL" | "FRAGILE";

export type CyclicalityLevel = "low" | "medium" | "high";

/**
 * Concrete actie-advies per positie. Bewust smaller dan `AllocationAction`
 * omdat rebalance zich focust op het afbouwen/reviewen van bestaande posities,
 * niet op nieuwe aankopen.
 */
export type RebalanceAction =
  | "NO_ACTION"
  | "TRIM_LIGHT"
  | "TRIM_HEAVY"
  | "RECONSIDER";

export interface ConcentrationAssessment {
  ticker: string;
  positionWeight: number;
  concentrationType: ConcentrationType;
  /** 0..100, hoger = meer fragiele concentratie. */
  fragilityScore: number;
  reasons: string[];
}

/**
 * Snapshot van de input-signalen die de beslissing onderbouwen. Wordt
 * meegestuurd zodat UI en AI-explain laag alles kunnen reconstrueren.
 */
export interface RebalanceFactorSnapshot {
  quality: number | null;
  value: number | null;
  momentum: number | null;
  composite: number | null;
  volatility: number | null;
  sector: string | null;
  sectorCyclicality: CyclicalityLevel;
}

export interface RebalanceRecommendation {
  ticker: string;
  name: string;
  action: RebalanceAction;
  concentrationType: ConcentrationType;
  fragilityScore: number;

  currentWeight: number;
  targetWeight: number;
  /** `targetWeight - currentWeight`. Negatief = afbouwen. */
  deltaWeight: number;
  /** Verandering in base currency (negatief = verkopen). */
  deltaAmount: number;
  /** Indicatief aantal stuks (negatief = verkopen). Undefined als prijs onbekend. */
  deltaShares?: number;

  reasons: string[];
  /** 0..1, confidence op basis van datacoverage + sterkte van signalen. */
  confidence: number;

  factorSnapshot: RebalanceFactorSnapshot;

  /**
   * Concrete afbouw-quantity (stuks + bedrag + NL action label + post-sell
   * gewicht). Gevuld door de rebalance-engine voor TRIM_LIGHT/TRIM_HEAVY/
   * RECONSIDER zodra `currentPrice` beschikbaar is. Bij NO_ACTION is 'ie
   * ook gevuld (sharesToSell=0) zodat UI consistent kan renderen.
   * Undefined wanneer er onvoldoende koersdata is om quantity te bepalen.
   */
  quantityPlan?: RebalanceQuantityPlan;
}

/**
 * NL action labels. Bewust afgeschermd van de enum `RebalanceAction` zodat
 * de UI geen mapping hoeft te maken en analytics engine-taal (upper case
 * enum) los blijft van user-facing taal (NL microcopy).
 */
export type RebalanceActionLabel =
  | "geen actie"
  | "licht afbouwen"
  | "stevig afbouwen"
  | "heroverwegen";

export type RebalanceQuantityConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface RebalanceQuantityPlan {
  /** Zelfde als `RebalanceRecommendation.ticker`, voor standalone gebruik. */
  symbol: string;
  /** Nederlandstalig label; mapped van `RebalanceAction`. */
  actionLabel: RebalanceActionLabel;

  /** Percentage (0..100) voor visuele weergave; conform voorbeeld-output. */
  currentWeight: number;
  targetWeight: number;

  /** Monetaire bedragen in base currency. */
  currentValue: number;
  targetValue: number;
  /** `currentValue - targetValue`. `0` bij NO_ACTION. */
  excessValue: number;

  /** Unit-prijs in base currency. `null` als er geen live/last-known koers is. */
  currentPrice: number | null;

  /** Altijd ≥ 0. Floor tenzij `allowFractionalShares` is true. */
  sharesToSell: number;
  /** `sharesToSell * currentPrice`. 0 bij ontbrekende prijs of NO_ACTION. */
  amountToSell: number;
  /** Geprojecteerd gewicht (0..100%) NA de verkoop. */
  postSellWeight: number;

  /** Eén zin met de reden — toonbaar onder de actie-badge. */
  reason: string;
  /** Confidence in de berekening. Daalt bij ontbrekende prijs of lage classifier-confidence. */
  confidence: RebalanceQuantityConfidence;
  /** Waarschuwingen (bv. "onvoldoende koersdata"). Leeg bij HIGH confidence. */
  warnings: string[];
}

export interface RebalancePlan {
  portfolioId: string;
  asOf: ISODateString;
  baseCurrency: Currency;
  totalValue: number;
  recommendations: RebalanceRecommendation[];
  /** Som van absolute `deltaAmount` — indicatieve turnover. */
  totalTurnover: number;
  /** Tellers per actie-type. Handig voor dashboard-widgets. */
  summary: Record<RebalanceAction, number>;
}
