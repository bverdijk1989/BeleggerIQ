import type { Currency, ISODateString } from "./common";
import type { FactorScore } from "./factor";
import type { PositionRiskAnalysis } from "./risk";

export type AssetClass =
  | "EQUITY"
  | "ETF"
  | "BOND"
  | "REIT"
  | "COMMODITY"
  | "CRYPTO"
  | "CASH"
  | "OTHER";

/**
 * Enkele positie in een portefeuille. De "harde" velden (ticker, quantity,
 * avgCostPrice, ...) zijn verplicht. Alle andere velden zijn optioneel
 * en dienen als verrijking vanuit scoring-, risk- en allocation-engines.
 *
 * Denormalisatie is bewust: UI-componenten consumeren één Holding en kunnen
 * direct factor/risk/conviction tonen zonder losse joins.
 */
export interface Holding {
  id: string;
  portfolioId: string;
  ticker: string;
  isin?: string | null;
  name: string;
  assetClass: AssetClass;
  currency: Currency;
  quantity: number;
  avgCostPrice: number;
  currentPrice?: number | null;

  sector?: string | null;
  region?: string | null;

  // --- Verrijking (optioneel) ---
  /** Huidige beta t.o.v. portfolio-benchmark. */
  beta?: number;
  /** Geannualiseerde volatility, fractie. */
  volatility?: number;
  /** Moat-achtige score op basis van kwaliteit + stabiliteit, 0..1. */
  moatLikeScore?: number;
  /** Gewenst gewicht volgens policy, 0..1. */
  targetWeight?: number;
  /** Overtuiging van het systeem in deze positie, 0..1. */
  convictionScore?: number;
  /** Cache van de meest recente factor score. */
  factorScore?: FactorScore;
  /** Cache van de meest recente risk analyse. */
  riskAnalysis?: PositionRiskAnalysis;

  metadata?: Record<string, unknown> | null;
}

/**
 * Alias voor semantische leesbaarheid; in UI-taal spreken we vaak over
 * "Positie" terwijl het datamodel "Holding" aanhoudt.
 */
export type Position = Holding;

export interface Portfolio {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  baseCurrency: Currency;
  isPrimary: boolean;
  holdings: Holding[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface PortfolioSnapshot {
  id: string;
  portfolioId: string;
  capturedAt: ISODateString;
  totalValue: number;
  totalCost: number;
  cashBalance: number;
  metrics?: Record<string, number | string | null> | null;
}
