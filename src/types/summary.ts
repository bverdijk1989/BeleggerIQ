import type { Currency, ISODateString } from "./common";
import type { AllocationSlice } from "./allocation";

export interface PositionBreakdown {
  ticker: string;
  name: string;
  marketValue: number;
  /** Aandeel binnen portefeuille, 0..1. */
  weight: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
}

/**
 * Samenvatting op portefeuilleniveau. De enige canonieke bron voor dashboard-
 * kaarten, allocation-charts en toppositie-tabellen.
 */
export interface PortfolioSummary {
  portfolioId: string;
  baseCurrency: Currency;
  totalValue: number;
  totalCost: number;
  cashBalance: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  positionCount: number;
  /** Grootste positie, `null` bij een lege portefeuille. */
  largestPosition: PositionBreakdown | null;
  topPositions: PositionBreakdown[];
  allocationByAssetClass: AllocationSlice[];
  allocationBySector: AllocationSlice[];
  allocationByRegion: AllocationSlice[];
  /** Allocatie per valuta, inclusief cash. */
  allocationByCurrency: AllocationSlice[];
}

export type HealthGrade = "A" | "B" | "C" | "D" | "F";

export type HealthSignalSeverity =
  | "positive"
  | "info"
  | "warning"
  | "critical";

/**
 * Enkel signaal dat bijdraagt aan de overall health-grade. Gebruik `code`
 * als stabiele identifier voor UI-routing en i18n-keys.
 */
export interface PortfolioHealthSignal {
  code: string;
  label: string;
  severity: HealthSignalSeverity;
  message: string;
  /** Numerieke meetwaarde achter het signaal, indien relevant. */
  metric?: number;
}

/**
 * Overall "gezondheidsrapport" van een portefeuille. Combineert
 * diversificatie, kwaliteit, risk alignment, factor alignment en
 * (optioneel) regime alignment tot één grade met toelichting.
 */
export interface PortfolioHealthSummary {
  portfolioId: string;
  asOf: ISODateString;
  grade: HealthGrade;
  /** Composite score, 0..100. */
  score: number;

  diversificationScore: number;
  qualityScore: number;
  riskAlignmentScore: number;
  factorAlignmentScore: number;
  regimeAlignmentScore?: number;

  signals: PortfolioHealthSignal[];
}
