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
