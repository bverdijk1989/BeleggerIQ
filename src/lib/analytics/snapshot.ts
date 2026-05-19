import type { AllocationPlan } from "@/types/allocation";
import type { FundamentalsSnapshot } from "@/types/factor";
import type {
  MarketRegimeScore,
  MarketRegimeState,
} from "@/types/regime";

import type { PortfolioView } from "./portfolio-view";
import { buildRiskTrendSnapshot } from "./risk-trend/snapshot-builder";

/**
 * Snapshot-data builders. Pure functies die engine-outputs omzetten naar
 * platte rijen die Prisma kan opslaan. Geen I/O — dat is de verantwoordelijkheid
 * van de snapshot-repository.
 *
 * Design:
 *  - Typed headline-kolommen (totalValue, drawdown, enz.) blijven
 *    eenvoudig queryable; flexibele signalen gaan in `metrics` Json.
 *  - `MarketRegimeStance` wordt gemapt naar de Prisma `RegimeLabel` enum
 *    zodat time-series-views hem direct kunnen gebruiken.
 */

export type PrismaRegimeLabel =
  | "EXPANSION"
  | "SLOWDOWN"
  | "RECESSION"
  | "RECOVERY"
  | "UNKNOWN";

export type PrismaHealthGrade = "A" | "B" | "C" | "D" | "F";

export interface PortfolioSnapshotData {
  portfolioId: string;
  capturedAt: Date;
  totalValue: number;
  totalCost: number;
  cashBalance: number;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
  volatility: number | null;
  drawdown: number | null;
  regimeLabel: PrismaRegimeLabel | null;
  healthGrade: PrismaHealthGrade | null;
  healthScore: number | null;
  metrics: PortfolioSnapshotMetrics;
}

export interface PortfolioSnapshotMetrics {
  positionCount: number;
  largestPosition?: { ticker: string; name: string; weight: number };
  avgFactorComposite: number | null;
  averageFactorCoverage: number;
  foreignCurrencyExposure: number | null;
  top5Weight: number | null;
  allocationByCurrency: Array<{
    label: string;
    value: number;
    weight: number;
  }>;
  riskScore: number | null;
  regimeScore: number | null;
  planDeployed: number | null;
  planRecommendations: number | null;
  /**
   * Module 30 — Risk Trend & Snapshot History.
   * Compact, geaggregeerd: alleen scores 0..100 en fracties, geen
   * ruwe holdings/PII. Optioneel: niet aanwezig in oude snapshots.
   */
  riskTrend?: RiskTrendSnapshot;
}

/**
 * Module 30 — gestandaardiseerde compact-snapshot voor trend-tracking.
 * Alle velden 0..100 of fractie; geen tickers, geen bedragen.
 */
export interface RiskTrendSnapshot {
  /** Schema-version — bump bij breaking change. */
  schemaVersion: 1;
  /** Health-score 0..100 (uit view.health). */
  healthScore: number | null;
  /** Risk-score 0..100 (uit view.risk.riskScore — hoger = meer risico). */
  riskScore: number | null;
  /** Concentratie HHI 0..1. */
  concentrationHhi: number | null;
  /** Grootste positie-gewicht 0..1. */
  largestPositionWeight: number | null;
  /** Top-5 weight 0..1. */
  top5Weight: number | null;
  /** Sector HHI 0..1. */
  sectorHhi: number | null;
  /** Geannualizeerde vola fractie. */
  volatility: number | null;
  /** Max drawdown (negatief fractie). */
  maxDrawdown: number | null;
  /** Vreemde-valuta-exposure 0..1. */
  foreignCurrencyExposure: number | null;
  /** Data-depth 0..100 (M26). */
  dataDepthScore: number | null;
  /** Drift: gemiddelde |currentWeight - targetWeight| over rebalance-recommendations. */
  driftAvg: number | null;
  /** Aantal posities. */
  positionCount: number;
}

export interface BuildPortfolioSnapshotInput {
  view: PortfolioView;
  regime?: MarketRegimeScore | null;
  plan?: AllocationPlan | null;
  capturedAt?: Date;
}

export function buildPortfolioSnapshotData(
  input: BuildPortfolioSnapshotInput,
): PortfolioSnapshotData {
  const { view, regime, plan, capturedAt } = input;
  const summary = view.summary;
  const risk = view.risk;
  const health = view.health;

  const composites = view.valuations
    .map((v) => v.holding.factorScore?.composite)
    .filter((c): c is number => typeof c === "number" && Number.isFinite(c));
  const avgComposite =
    composites.length > 0
      ? composites.reduce((sum, c) => sum + c, 0) / composites.length
      : null;

  const coverages = view.valuations
    .map((v) => v.holding.factorScore?.confidence)
    .filter((c): c is number => typeof c === "number" && Number.isFinite(c));
  const avgCoverage =
    coverages.length > 0
      ? coverages.reduce((sum, c) => sum + c, 0) / coverages.length
      : 0;

  const metrics: PortfolioSnapshotMetrics = {
    positionCount: summary.positionCount,
    largestPosition: summary.largestPosition
      ? {
          ticker: summary.largestPosition.ticker,
          name: summary.largestPosition.name,
          weight: summary.largestPosition.weight,
        }
      : undefined,
    avgFactorComposite: avgComposite,
    averageFactorCoverage: avgCoverage,
    foreignCurrencyExposure: risk.foreignCurrencyExposure ?? null,
    top5Weight: risk.top5Weight ?? null,
    allocationByCurrency: summary.allocationByCurrency.map((slice) => ({
      label: slice.label,
      value: slice.value,
      weight: slice.weight,
    })),
    riskScore: risk.riskScore ?? null,
    regimeScore: regime?.score ?? null,
    planDeployed: plan?.deployedAmount ?? null,
    planRecommendations: plan?.recommendations.length ?? null,
    // Module 30 — compact trend-snapshot (≤200 bytes JSON).
    riskTrend: buildRiskTrendSnapshot({ view }),
  };

  return {
    portfolioId: summary.portfolioId,
    capturedAt: capturedAt ?? new Date(),
    totalValue: round2(summary.totalValue),
    totalCost: round2(summary.totalCost),
    cashBalance: round2(summary.cashBalance),
    unrealizedPnl: round2(summary.unrealizedPnl),
    unrealizedPnlPct: round4(summary.unrealizedPnlPct),
    volatility: risk.portfolioVolatility ?? null,
    drawdown: risk.maxDrawdown ?? null,
    regimeLabel: mapRegimeToLabel(regime),
    healthGrade: health.grade,
    healthScore: round2(health.score),
    metrics,
  };
}

// ============================================================
//  Factor snapshot data
// ============================================================

export interface FactorSnapshotData {
  ticker: string;
  isin: string | null;
  capturedAt: Date;
  model: string;
  valueScore: number | null;
  qualityScore: number | null;
  momentumScore: number | null;
  lowVolScore: number | null;
  growthScore: number | null;
  dividendScore: number | null;
  sizeScore: number | null;
  composite: number | null;
  percentile: number | null;
  confidence: number | null;
  fundamentals: Record<string, unknown> | null;
  source: string;
}

export interface BuildFactorSnapshotInput {
  ticker: string;
  isin?: string | null;
  factorScore: {
    subScores: {
      value: number;
      quality: number;
      momentum: number;
      lowVol: number;
      growth?: number;
      dividend?: number;
      size?: number;
    };
    composite: number;
    percentile?: number;
    confidence?: number;
    model?: string;
  };
  fundamentals?: FundamentalsSnapshot | null;
  source?: string;
  capturedAt?: Date;
}

export function buildFactorSnapshotData(
  input: BuildFactorSnapshotInput,
): FactorSnapshotData {
  return {
    ticker: input.ticker.toUpperCase(),
    isin: input.isin ?? null,
    capturedAt: input.capturedAt ?? new Date(),
    model: input.factorScore.model ?? "beleggeriq.v1",
    valueScore: input.factorScore.subScores.value,
    qualityScore: input.factorScore.subScores.quality,
    momentumScore: input.factorScore.subScores.momentum,
    lowVolScore: input.factorScore.subScores.lowVol,
    growthScore: input.factorScore.subScores.growth ?? null,
    dividendScore: input.factorScore.subScores.dividend ?? null,
    sizeScore: input.factorScore.subScores.size ?? null,
    composite: input.factorScore.composite,
    percentile: input.factorScore.percentile ?? null,
    confidence: input.factorScore.confidence ?? null,
    fundamentals: input.fundamentals
      ? (input.fundamentals as unknown as Record<string, unknown>)
      : null,
    source: input.source ?? "beleggeriq",
  };
}

// ============================================================
//  Regime mapping
// ============================================================

export function mapRegimeToLabel(
  regime: MarketRegimeScore | null | undefined,
): PrismaRegimeLabel | null {
  if (!regime) return null;
  switch (regime.stance) {
    case "RISK_ON":
      return "EXPANSION";
    case "DEFENSIVE":
      return "RECESSION";
    case "NEUTRAL":
    default:
      return "SLOWDOWN";
  }
}

export function mapRegimeStateToLabel(
  state: MarketRegimeState | null | undefined,
): PrismaRegimeLabel | null {
  if (!state) return null;
  switch (state) {
    case "expansion":
      return "EXPANSION";
    case "slowdown":
      return "SLOWDOWN";
    case "recession":
      return "RECESSION";
    case "recovery":
      return "RECOVERY";
    case "unknown":
    default:
      return "UNKNOWN";
  }
}

// ============================================================
//  Internals
// ============================================================

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10_000) / 10_000;
}
