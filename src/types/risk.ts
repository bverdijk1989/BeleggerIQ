import type { ISODateString } from "./common";
import type { AllocationSlice } from "./allocation";

export type RiskSeverity =
  | "low"
  | "moderate"
  | "elevated"
  | "high"
  | "critical";

/**
 * Gestandaardiseerde risicosignal. `code` is een stabiele identifier
 * (bv. "concentration.position") zodat UI en i18n erop kunnen mappen.
 */
export interface RiskFlag {
  code: string;
  label: string;
  severity: RiskSeverity;
  message?: string;
  /** Optionele numerieke meetwaarde die de flag triggerde. */
  metric?: number;
  /** Drempel waarboven de flag afgaat. */
  threshold?: number;
}

/**
 * Risico op positieniveau. Alle velden zijn optioneel op `concentrationWeight`,
 * `ticker` en `flags` na — de rest vult zich zodra data beschikbaar is.
 */
export interface PositionRiskAnalysis {
  ticker: string;
  asOf?: ISODateString;

  /** Huidig gewicht in de portefeuille, 0..1. */
  concentrationWeight: number;

  beta?: number;
  /** Geannualiseerde volatility, fractie (0.18 = 18%). */
  volatility?: number;
  downsideDeviation?: number;
  /** Grootste historische drawdown, fractie (negatief getal). */
  maxDrawdown?: number;
  /** Historische VaR (95%) als fractie van positiewaarde. */
  var95?: number;
  /** 0..1, hoger = liquider. */
  liquidityScore?: number;

  correlationToPortfolio?: number;
  contributionToRisk?: number;

  // --- Klassificaties (Risk engine output) ---
  /** Klasse op basis van positie-gewicht t.o.v. thresholds. */
  concentrationClass?: RiskSeverity;
  /** Klasse op basis van volatiliteit. */
  volatilityClass?: RiskSeverity;
  /** Bijdrage aan valuta-risico (0..1, weight in niet-base currency). */
  currencyRiskContribution?: number;
  /** Gewogen positierisico score 0..100 (lager = veiliger). */
  riskScore?: number;
  /** Overall risicoklasse afgeleid uit `riskScore`. */
  riskClass?: RiskSeverity;

  flags: RiskFlag[];
}

/**
 * Risico op portefeuilleniveau. Bevat zowel de eenvoudige concentratiemetrics
 * als de rijkere risk-decompositie zodra die beschikbaar is.
 */
export interface PortfolioRiskSummary {
  portfolioId: string;
  asOf: ISODateString;
  overallSeverity: RiskSeverity;

  // Concentratie (altijd beschikbaar zodra er posities zijn)
  concentrationHhi: number;
  largestPositionWeight: number;
  /** Som van de top-5 posities. */
  top5Weight?: number;
  sectorConcentrationHhi: number;
  regionConcentrationHhi: number;

  // Rijkere metrics (afhankelijk van price history)
  portfolioBeta?: number;
  portfolioVolatility?: number;
  maxDrawdown?: number;
  valueAtRisk95?: number;
  trackingError?: number;

  // Top-exposures — snelle weergave voor dashboard-widgets
  /** Grootste sector-bucket (label + gewicht). */
  topSector?: { label: string; weight: number };
  /** Aandeel in niet-base currency. */
  foreignCurrencyExposure?: number;

  exposures: {
    byAssetClass: AllocationSlice[];
    bySector: AllocationSlice[];
    byRegion: AllocationSlice[];
    byCurrency?: AllocationSlice[];
  };

  /** Gewogen portfolio risk score 0..100 (lager = veiliger). */
  riskScore?: number;

  positions: PositionRiskAnalysis[];
  flags: RiskFlag[];
}
