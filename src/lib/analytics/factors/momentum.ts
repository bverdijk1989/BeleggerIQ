import type { HistoricalPoint } from "@/types/market";

import {
  buildSignal,
  formatPct,
  scoreFromSignals,
  type FactorSignal,
  type ScoreFromSignalsResult,
} from "./shared";

/**
 * Momentum-factor: trend over 6 en 12 maanden, 12-1 momentum (klassiek zonder
 * laatste maand) en afstand tot 52-weken hoogtepunt.
 *
 * Werkt op een oplopend gesorteerde prijshistorie (zoals `getHistory` teruggeeft).
 * Wanneer de reeks te kort is voor 6m/12m, vallen die signalen weg; de score
 * baseert zich op wat beschikbaar is.
 */

export interface MomentumMetrics {
  return6m: number | null;
  return12m: number | null;
  return12m1m: number | null;
  distanceFromHigh52w: number | null;
}

export function computeMomentumMetrics(
  history: HistoricalPoint[] | null | undefined,
): MomentumMetrics {
  if (!history || history.length === 0) {
    return {
      return6m: null,
      return12m: null,
      return12m1m: null,
      distanceFromHigh52w: null,
    };
  }

  const first = history[0]!;
  const last = history[history.length - 1]!;
  const sorted =
    first.date <= last.date
      ? history
      : history.slice().sort((a, b) => (a.date < b.date ? -1 : 1));

  const latest = sorted[sorted.length - 1]!;
  const latestDate = new Date(latest.date);
  const latestClose = latest.close;
  if (!Number.isFinite(latestClose) || latestClose <= 0) {
    return {
      return6m: null,
      return12m: null,
      return12m1m: null,
      distanceFromHigh52w: null,
    };
  }

  const return6m = returnBetween(sorted, monthsAgo(latestDate, 6), latestClose);
  const return12m = returnBetween(sorted, monthsAgo(latestDate, 12), latestClose);
  const return1m = returnBetween(sorted, monthsAgo(latestDate, 1), latestClose);
  const return12m1m =
    return12m !== null && return1m !== null
      ? (1 + return12m) / (1 + return1m) - 1
      : null;

  const cutoff52w = monthsAgo(latestDate, 12).getTime();
  let high52w = -Infinity;
  for (const point of sorted) {
    const ts = Date.parse(point.date);
    if (!Number.isFinite(ts) || ts < cutoff52w) continue;
    const candidate = point.high ?? point.close;
    if (Number.isFinite(candidate) && candidate > high52w) high52w = candidate;
  }
  const distanceFromHigh52w =
    Number.isFinite(high52w) && high52w > 0
      ? (high52w - latestClose) / high52w
      : null;

  return { return6m, return12m, return12m1m, distanceFromHigh52w };
}

/**
 * Score op basis van een prijshistorie. Interne shortcut naar `scoreMomentumFromMetrics`.
 */
export function scoreMomentum(
  history: HistoricalPoint[] | null | undefined,
): ScoreFromSignalsResult {
  return scoreMomentumFromMetrics(computeMomentumMetrics(history));
}

/**
 * Score op basis van pre-computed metrics — handig voor callers die
 * momentum al elders hebben berekend (bv. uit snapshots).
 */
export function scoreMomentumFromMetrics(
  metrics: MomentumMetrics,
): ScoreFromSignalsResult {
  const signals: FactorSignal[] = [
    buildSignal({
      key: "return6m",
      label: "6m rendement",
      value: metrics.return6m,
      weight: 0.8,
      kind: "rampUp",
      min: -0.15,
      max: 0.35,
      rationale: (score, value) =>
        score >= 70
          ? `Sterk 6m-rendement (${formatPct(value)}).`
          : score <= 30
            ? `Zwak 6m-rendement (${formatPct(value)}).`
            : `6m-rendement rond gemiddelde (${formatPct(value)}).`,
    }),
    buildSignal({
      key: "return12m",
      label: "12m rendement",
      value: metrics.return12m,
      weight: 1.2,
      kind: "rampUp",
      min: -0.2,
      max: 0.5,
      rationale: (score, value) =>
        score >= 70
          ? `Krachtige 12m-trend (${formatPct(value)}).`
          : score <= 30
            ? `Zwakke 12m-trend (${formatPct(value)}).`
            : `12m-rendement in lijn met markt (${formatPct(value)}).`,
    }),
    buildSignal({
      key: "return12m1m",
      label: "12-1m momentum",
      value: metrics.return12m1m,
      weight: 1.3,
      kind: "rampUp",
      min: -0.2,
      max: 0.5,
      rationale: (score, value) =>
        score >= 70
          ? `Sterk klassiek 12-1 momentum (${formatPct(value)}).`
          : score <= 30
            ? `Zwak 12-1 momentum (${formatPct(value)}).`
            : `12-1 momentum gemiddeld (${formatPct(value)}).`,
    }),
    buildSignal({
      key: "distanceFromHigh52w",
      label: "Afstand tot 52w-high",
      value: metrics.distanceFromHigh52w,
      weight: 0.9,
      kind: "rampDown",
      min: 0,
      max: 0.3,
      rationale: (score, value) =>
        score >= 70
          ? `Handelt dichtbij 52w-high (−${formatPct(value)}).`
          : score <= 30
            ? `Ver onder 52w-high (−${formatPct(value)}).`
            : `Matig onder 52w-high (−${formatPct(value)}).`,
    }),
  ];

  return scoreFromSignals(signals);
}

// ============================================================
//  Interne datum-helpers
// ============================================================

function monthsAgo(anchor: Date, months: number): Date {
  const d = new Date(anchor);
  d.setMonth(d.getMonth() - months);
  return d;
}

/**
 * Vindt de laatst bekende close op of vóór `target` en retourneert het
 * relatieve rendement naar `latestClose`. Geeft null als er geen enkel
 * punt binnen het bereik is.
 */
function returnBetween(
  sorted: HistoricalPoint[],
  target: Date,
  latestClose: number,
): number | null {
  const targetMs = target.getTime();
  let anchor: HistoricalPoint | null = null;
  for (const point of sorted) {
    const ts = Date.parse(point.date);
    if (!Number.isFinite(ts)) continue;
    if (ts <= targetMs) anchor = point;
    else break;
  }
  if (!anchor || !Number.isFinite(anchor.close) || anchor.close <= 0) {
    return null;
  }
  return latestClose / anchor.close - 1;
}
