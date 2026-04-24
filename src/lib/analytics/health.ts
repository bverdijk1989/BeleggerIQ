import type { ISODateString } from "@/types/common";
import type {
  HealthGrade,
  PortfolioHealthSignal,
  PortfolioHealthSummary,
  PortfolioSummary,
} from "@/types/summary";

import type { HoldingValuation } from "./valuation";

/**
 * Basic health-scoring.
 *
 * Scope: werkt puur op samengestelde metrics (`PortfolioSummary`) plus
 * optionele valuations voor moat- en factor-signalen. Wordt bewust simpel
 * gehouden — echte regime-alignment en factor-alignment vullen we in
 * zodra die engines live data leveren. Deze score biedt alvast een bruikbaar
 * dashboard-cijfer zonder prijshistorie nodig te hebben.
 */

export interface BasicHealthInput {
  summary: PortfolioSummary;
  /** Optioneel: valuations met factorScore/moatLikeScore voor rijkere score. */
  valuations?: HoldingValuation[];
  asOf?: ISODateString;
}

const WEIGHTS = {
  diversification: 0.3,
  risk: 0.3,
  quality: 0.2,
  factor: 0.2,
} as const;

// Drempels in fractie-termen (0..1)
const MAX_POSITION_OK = 0.1;
const MAX_POSITION_WARN = 0.15;
const MAX_POSITION_CRITICAL = 0.25;
const MIN_POSITIONS_OK = 8;
const FOREIGN_EXPOSURE_WARN = 0.7;

export function computeBasicHealthSummary({
  summary,
  valuations,
  asOf,
}: BasicHealthInput): PortfolioHealthSummary {
  const positionWeights = summary.topPositions.map((p) => p.weight);
  const hhi = positionWeights.reduce((s, w) => s + w * w, 0);
  const diversificationScore = clamp01(1 - hhi);

  const largest = summary.largestPosition?.weight ?? 0;
  const riskAlignmentScore = computeRiskAlignmentScore(largest);

  const { qualityScore, factorAlignmentScore } = computeHoldingScores(valuations);

  const rawScore =
    diversificationScore * WEIGHTS.diversification +
    riskAlignmentScore * WEIGHTS.risk +
    qualityScore * WEIGHTS.quality +
    factorAlignmentScore * WEIGHTS.factor;
  const score = Math.round(rawScore * 100);

  const signals = buildSignals({ summary, largest });

  return {
    portfolioId: summary.portfolioId,
    asOf: asOf ?? new Date().toISOString(),
    grade: gradeFromScore(score),
    score,
    diversificationScore,
    qualityScore,
    riskAlignmentScore,
    factorAlignmentScore,
    signals,
  };
}

// ============================================================
//  Internals
// ============================================================

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function gradeFromScore(score: number): HealthGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

/**
 * Risk alignment is 1 bij concentraties onder MAX_POSITION_OK en daalt
 * lineair naar 0 rond 30% in één positie. Boven MAX_POSITION_CRITICAL
 * geeft de functie 0 zodat het eindcijfer zichtbaar zakt.
 */
function computeRiskAlignmentScore(largestWeight: number): number {
  if (largestWeight <= MAX_POSITION_OK) return 1;
  if (largestWeight >= 0.3) return 0;
  return clamp01(1 - (largestWeight - MAX_POSITION_OK) / (0.3 - MAX_POSITION_OK));
}

function computeHoldingScores(valuations?: HoldingValuation[]): {
  qualityScore: number;
  factorAlignmentScore: number;
} {
  if (!valuations || valuations.length === 0) {
    return { qualityScore: 0.5, factorAlignmentScore: 0.5 };
  }

  const moats = valuations
    .map((v) => v.holding.moatLikeScore)
    .filter((m): m is number => typeof m === "number" && Number.isFinite(m));
  const qualityScore =
    moats.length === 0
      ? 0.5
      : clamp01(moats.reduce((s, m) => s + m, 0) / moats.length);

  const composites = valuations
    .map((v) => v.holding.factorScore?.composite)
    .filter((c): c is number => typeof c === "number" && Number.isFinite(c));
  const factorAlignmentScore =
    composites.length === 0
      ? 0.5
      : clamp01(
          (composites.reduce((s, c) => s + c, 0) / composites.length + 1) / 2,
        );

  return { qualityScore, factorAlignmentScore };
}

function buildSignals({
  summary,
  largest,
}: {
  summary: PortfolioSummary;
  largest: number;
}): PortfolioHealthSignal[] {
  const signals: PortfolioHealthSignal[] = [];

  if (largest >= MAX_POSITION_WARN) {
    const pos = summary.largestPosition;
    signals.push({
      code: "concentration.position",
      label: "Hoge positie-concentratie",
      severity: largest >= MAX_POSITION_CRITICAL ? "critical" : "warning",
      message: `${pos?.name ?? pos?.ticker ?? "Grootste positie"} is ${Math.round(largest * 100)}% van de portefeuille.`,
      metric: largest,
    });
  }

  if (summary.positionCount > 0 && summary.positionCount < MIN_POSITIONS_OK) {
    signals.push({
      code: "diversification.low",
      label: "Beperkte spreiding",
      severity: "warning",
      message: `Portefeuille heeft ${summary.positionCount} posities — overweeg spreiding naar minimaal ${MIN_POSITIONS_OK}.`,
      metric: summary.positionCount,
    });
  }

  const foreignExposure = summary.allocationByCurrency
    .filter((slice) => slice.label !== summary.baseCurrency)
    .reduce((sum, slice) => sum + slice.weight, 0);
  if (foreignExposure >= FOREIGN_EXPOSURE_WARN) {
    signals.push({
      code: "currency.foreign",
      label: "Veel valuta-exposure",
      severity: "info",
      message: `${Math.round(foreignExposure * 100)}% staat in niet-${summary.baseCurrency} valuta.`,
      metric: foreignExposure,
    });
  }

  if (summary.unrealizedPnlPct >= 0.2) {
    signals.push({
      code: "performance.positive",
      label: "Sterk positief rendement",
      severity: "positive",
      message: `Portefeuille staat ${Math.round(summary.unrealizedPnlPct * 100)}% in de plus t.o.v. kostprijs.`,
      metric: summary.unrealizedPnlPct,
    });
  } else if (summary.unrealizedPnlPct <= -0.15) {
    signals.push({
      code: "performance.drawdown",
      label: "Portefeuille onder water",
      severity: "warning",
      message: `Portefeuille staat ${Math.round(summary.unrealizedPnlPct * 100)}% onder kostprijs.`,
      metric: summary.unrealizedPnlPct,
    });
  }

  return signals;
}
