/**
 * Dividend Calendar & DRIP Simulator — types (Module 22).
 *
 * Twee samenhangende modellen:
 *  1. **Dividend-calendar**: per holding een verwacht-bedrag-per-maand
 *     met expliciete data-kwaliteit ("estimated" vs "actual feed").
 *  2. **DRIP-simulator**: 5/10/20-jaars projectie van portfolio-value
 *     met vs zonder herbeleggen × 3 rendementsscenarios.
 *
 * **Geen verzonnen bedragen zonder data** — als de data-feed geen
 * actuele ex-dividend-datum of dividend-amount levert, valt de
 * calendar terug op een **heuristische schatting** met expliciete
 * `estimated`-flag en lagere dataQuality-tier.
 */

import type { ISODateString } from "@/types/common";

// ============================================================
//  Distribution-frequency heuristiek
// ============================================================

/**
 * Hoe vaak per jaar betaalt deze positie? Hardcoded heuristieken
 * vanuit publieke conventies:
 *  - US-aandelen + ETFs → meestal QUARTERLY (Mar/Jun/Sep/Dec)
 *  - EU-aandelen (NL/FR/DE) → meestal SEMIANNUAL of ANNUAL
 *  - REITs → MONTHLY of QUARTERLY
 *  - Geen dividend bekend → ZERO
 */
export type DistributionFrequency =
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMIANNUAL"
  | "ANNUAL"
  | "ZERO";

export const FREQUENCY_LABELS: Record<DistributionFrequency, string> = {
  MONTHLY: "Maandelijks (12×/jr)",
  QUARTERLY: "Kwartaal (4×/jr)",
  SEMIANNUAL: "Halfjaarlijks (2×/jr)",
  ANNUAL: "Jaarlijks (1×/jr)",
  ZERO: "Geen dividend",
};

// ============================================================
//  Per-positie row in de calendar
// ============================================================

/** Data-kwaliteit voor één calendar-row. */
export type DividendDataQuality =
  | "actual" // ex-dividend-datum + amount uit feed
  | "estimated" // bedrag berekend uit yield × marktwaarde, distributie uit heuristiek
  | "low" // partial data — wel yield, geen distributie-pattern
  | "missing"; // niets bekend

export interface DividendCalendarRow {
  ticker: string;
  name: string;
  /** Marktwaarde van de positie in base-currency. */
  marketValue: number;
  /** Yield als fractie (0.025 = 2.5%). */
  dividendYield: number | null;
  /** Verwacht jaarlijks dividend (= marketValue × yield). */
  expectedAnnualGross: number;
  /** Distributie-frequentie. */
  frequency: DistributionFrequency;
  /** Per-maand bedragen (1..12 of leeg). */
  monthlyEstimates: ReadonlyArray<{ month: number; amount: number }>;
  /** Optionele ex-dividend datum (actueel uit feed). */
  nextExDividendDate?: ISODateString | null;
  /** Optionele pay-date. */
  nextPayDate?: ISODateString | null;
  dataQuality: DividendDataQuality;
}

// ============================================================
//  Jaarlijkse projectie + groei
// ============================================================

export interface AnnualDividendProjection {
  /** Totale jaarlijkse uitkering in base-currency. */
  annualGross: number;
  /** Gewogen yield. */
  weightedYield: number;
  /** Aantal posities met dividend (coverage-transparantie). */
  coveredPositions: number;
  /** Aantal posities zonder dividend. */
  zeroPositions: number;
  /** Aantal posities met dataQuality `actual`. */
  actualCount: number;
  /** Aantal met dataQuality `estimated`. */
  estimatedCount: number;
}

export interface DividendGrowthAnalysis {
  /** Gewogen 5-jaar dividend-groei (CAGR) — null bij onvoldoende data. */
  weighted5yGrowth: number | null;
  /** Aantal posities met groei-data. */
  coveredPositions: number;
  /** 1-zin samenvatting voor UI. */
  summary: string;
}

// ============================================================
//  DRIP-simulator
// ============================================================

export type DripHorizonYears = 5 | 10 | 20;

export type DripScenario = "conservative" | "neutral" | "optimistic";

export interface DripScenarioResult {
  /** Annual return-aanname voor scenario. */
  annualReturn: number;
  /** Eindwaarde portfolio. */
  finalValue: number;
  /** Totaal herbelegd dividend over de horizon (alleen bij DRIP-aan). */
  reinvestedDividend: number;
}

export interface DripSimulation {
  horizonYears: DripHorizonYears;
  /** Met DRIP — per scenario. */
  withDrip: Record<DripScenario, DripScenarioResult>;
  /** Zonder DRIP (dividend valt buiten compound) — per scenario. */
  withoutDrip: Record<DripScenario, DripScenarioResult>;
  /** Aannames voor disclosure. */
  assumptions: string[];
}

// ============================================================
//  Hoofd-output
// ============================================================

export interface DividendReport {
  generatedAt: ISODateString;
  baseCurrency: string;
  totalPortfolioValue: number;
  /** Per-positie rij. */
  rows: DividendCalendarRow[];
  /** Per-maand totaal (1..12). */
  monthlyTotals: ReadonlyArray<{ month: number; amount: number }>;
  projection: AnnualDividendProjection;
  growth: DividendGrowthAnalysis;
  /** Simulaties voor 5/10/20 jaar. */
  simulations: ReadonlyArray<DripSimulation>;
  /** Universele disclaimer. */
  disclaimer: string;
  /** Waarschuwingen — lage data-kwaliteit, etc. */
  warnings: string[];
}

export const DIVIDEND_DISCLAIMER =
  "Dividenden zijn niet gegarandeerd. Bedragen worden geschat op basis van huidige yield × marktwaarde — echte uitkeringen kunnen wijzigen door beleidsbeslissingen, payout-ratio's of bedrijfsresultaten. Geen koop/verkoop-advies; geen yield-chasing-aanmoediging.";

export const MONTH_LABELS_NL: ReadonlyArray<string> = [
  "Jan",
  "Feb",
  "Mrt",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dec",
];
