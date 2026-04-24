import type { ISODateString } from "./common";

/**
 * Macro-economische regime-fase. Gebruikt door allocation en
 * strategy lab om signalen te wegen.
 */
export type MarketRegimeState =
  | "expansion"
  | "slowdown"
  | "recession"
  | "recovery"
  | "unknown";

export type MarketTrend = "bullish" | "neutral" | "bearish";

export type VolatilityRegime = "low" | "normal" | "elevated" | "high";

/**
 * Enkele indicator die bijdraagt aan de regime-classificatie
 * (bv. yield curve, PMI, breadth, credit spreads).
 */
export interface MarketRegimeIndicator {
  key: string;
  label: string;
  value: number;
  trend?: MarketTrend;
  /** Bijdrage aan de uiteindelijke classificatie (0..1). */
  weight?: number;
  asOf?: ISODateString;
  source?: string;
}

/**
 * Huidige marktregime-inschatting. Bewust compact gehouden zodat de
 * UI er direct op kan renderen en de allocation engine er op kan filteren.
 */
export interface MarketRegime {
  asOf: ISODateString;
  state: MarketRegimeState;
  trend: MarketTrend;
  /** Zelfvertrouwen van de classificatie, 0..1. */
  confidence: number;
  volatilityRegime?: VolatilityRegime;
  interestRateTrend?: MarketTrend;
  inflationTrend?: MarketTrend;
  growthTrend?: MarketTrend;
  indicators: MarketRegimeIndicator[];
  /** Korte human-readable duiding voor in de UI. */
  narrative?: string;
}

// ============================================================
//  Market Regime Score (aggressiviteit / risk appetite)
// ============================================================

/**
 * Risk-appetite stance van de markt. Los van `MarketRegimeState`
 * (cyclische fase) — dit cijfer vertelt of de allocator meer/minder
 * risicobudget mag inzetten.
 */
export type MarketRegimeStance = "RISK_ON" | "NEUTRAL" | "DEFENSIVE";

/**
 * Eén driver die bijdraagt aan de composite regime-score.
 * `score` is 0..100 (hoger = meer risk-on), of `null` als de driver
 * geen data kon produceren.
 */
export interface RegimeSubScore {
  key: string;
  label: string;
  score: number | null;
  weight: number;
  rationale?: string;
  /** Ruwe input-waarde (P/E, VIX, 10y yield, …). */
  value?: number;
}

/**
 * Eindresultaat van de regime-scoring. `score` en `stance` worden door
 * de allocation engine en het dashboard geconsumeerd; `narrative` en
 * `subDrivers` maken de beslissing uitlegbaar.
 */
export interface MarketRegimeScore {
  asOf: ISODateString;
  score: number;
  stance: MarketRegimeStance;
  /** 0..1 — fractie van gewicht dat uit daadwerkelijke data kwam. */
  confidence: number;
  narrative: string;
  subDrivers: RegimeSubScore[];
  source?: string;
}
