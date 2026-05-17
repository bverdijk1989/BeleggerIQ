/**
 * Detector-input shape — alles wat de 8 detectoren nodig hebben.
 *
 * **Pure data**: geen Prisma, geen netwerk. De `loader.ts` hydrateert
 * deze shape uit de DB; de detectoren zijn synchrone, deterministische
 * functies. Dat is de Simons-laag: testbaar, reproduceerbaar.
 */

import type { ISODateString } from "@/types/common";
import type { InvestmentObjective, RiskTolerance } from "@/types/profile";

export interface BehavioralPosition {
  ticker: string;
  name: string;
  /** Sector — kan null zijn bij ontbrekende classificatie. */
  sector: string | null;
  /** Marktwaarde in base-currency. */
  marketValueBase: number;
  /** Gewicht 0..1. */
  weight: number;
  /** P&L sinds aankoop, fractie. */
  pnlPct: number;
  /**
   * Asset-class label uit Prisma — bv. EQUITY / ETF / BOND / REIT /
   * COMMODITY / CRYPTO / CASH. Optioneel zodat fixtures backward-compatible
   * blijven. Gebruikt door SPECULATIVE_OVERALLOCATION-detector.
   */
  assetClass?: string | null;
}

export interface BehavioralSectorExposure {
  label: string;
  weight: number;
}

export interface BehavioralTransaction {
  /** Stabiele identifier voor signal-IDs. */
  id: string;
  type: "BUY" | "SELL";
  ticker: string;
  /** Genormaliseerde executiedatum. */
  executedAt: Date;
  quantity: number | null;
  price: number | null;
  /**
   * Prijs van de ticker N dagen vóór executie (typisch 7d voor SELL,
   * 30d voor BUY). Null wanneer geen historie beschikbaar is —
   * detectoren zien dat als "kan niet beoordelen".
   */
  priceBefore: number | null;
  /**
   * Aantal handelsdagen tussen executie en `priceBefore`-meting.
   * Voor logging/debug; detectoren gebruiken het zelden.
   */
  priceBeforeDays: number;
  /**
   * Prijs N dagen vóór executie voor de FOMO-window (default 30d).
   * Apart veld want sell- en buy-windows verschillen.
   */
  priceBefore30d: number | null;
}

export interface BehavioralProfile {
  objective: InvestmentObjective;
  riskTolerance: RiskTolerance;
  investmentHorizonYrs: number;
  /** Door user gewenst minimum cash-aandeel 0..1. */
  cashBufferPct: number | null;
  /** User-policy max-cash-share — boven deze drempel = drag-flag. */
  maxCashShare: number | null;
  /** User-policy max single position weight, fractie. */
  maxPositionWeight: number | null;
}

export interface BehavioralDetectorInput {
  portfolioId: string;
  /** ISO-date wanneer de detectie plaatsvindt — referentie voor recency-windows. */
  asOf: ISODateString;
  baseCurrency: string;

  totalValue: number;
  cashBalance: number;
  positionCount: number;
  positions: BehavioralPosition[];
  /** Sector-exposure (gewicht 0..1 per label). */
  sectorExposure: BehavioralSectorExposure[];

  /** Recente transacties (laatste 90 dagen typisch — loader bepaalt window). */
  recentTransactions: BehavioralTransaction[];

  /** Profile + policy. Mag null zijn — detectoren gebruiken defaults. */
  profile: BehavioralProfile | null;

  /** Originele streefweegingen uit allocation-plan (voor strategy-drift). */
  targetWeightsByTicker?: Map<string, number>;

  /**
   * Geannualiseerde portfolio-volatility uit risk-engine (fractie, bv. 0.18).
   * Optioneel: null wanneer geen historie beschikbaar. Gebruikt door
   * VOLATILITY_MISMATCH-detector om portfolio-vol te vergelijken met
   * profile.riskTolerance.
   */
  portfolioVolatility?: number | null;
}
