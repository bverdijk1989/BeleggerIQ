import type { Currency, ISODateString } from "@/types/common";

/**
 * Macro & Scenario Engine — types.
 *
 * Bewust simpel: per scenario passen we **per-positie shock-fracties**
 * toe op marktwaarde. Geen economisch model — heuristisch.
 *
 * Conventies:
 *  - Alle return-velden zijn fracties (-0.18 = -18%).
 *  - `defensiveStrength` is 0..100; hoger = portefeuille beter beschermd
 *    in dat specifieke scenario.
 */

export type MacroScenarioId =
  | "RATES_UP_2"
  | "MARKET_CRASH"
  | "USD_UP_10"
  | "RECESSION"
  | "STAGFLATION"
  | "BLACK_SWAN"
  | "TOP_POSITION_BLOWUP";

export interface PositionImpact {
  ticker: string;
  name: string;
  weight: number;
  shock: number;
  /** Bijdrage = `weight × shock`. */
  contribution: number;
}

export interface MacroScenarioResult {
  scenario: MacroScenarioId;
  label: string;
  description: string;
  /** Totale relatieve P&L over de portefeuille (fractie). */
  portfolioImpact: number;
  /** Indicatief bedrag in base currency (negatief = verlies). */
  portfolioImpactAmount: number;
  /** Top-N posities met de grootste **negatieve** contributie. */
  biggestLosers: PositionImpact[];
  /** Top-N posities die juist defensief zijn (positieve of kleinste shock). */
  biggestWinners: PositionImpact[];
  /** 0..100, hoger = beter beschermd. Berekend uit allocation-tilt. */
  defensiveStrength: number;
  /** NL-zin met de kernconclusie. */
  verdict: string;
  /** Lijst data-quality issues. */
  warnings: string[];
}

export interface MacroScenarioReport {
  generatedAt: ISODateString;
  baseCurrency: Currency;
  totalValue: number;
  scenarios: MacroScenarioResult[];
}
