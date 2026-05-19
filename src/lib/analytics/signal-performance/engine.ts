/**
 * Signal Performance Lab — pure-function engine (Module 27).
 *
 * Neemt `SignalObservation[]` (snapshots + forward-returns) en produceert
 * per-component performance over horizons + regime-breakdown + decay.
 *
 * **Pure**: geen I/O, geen Date.now, geen mutations buiten lokaal scope.
 * **Deterministisch**: zelfde input → zelfde output, tests freeze de
 * exacte cijfers.
 *
 * **Geen overfit-magie**:
 *  - Hit-rate is een binary 50/50-test (score>50 → return≥0)
 *  - IC is Spearman-rank correlatie (rank-based, geen lineaire fit)
 *  - Long-short-spread is een vaste quintile-grens (80/20 — gepubliceerde
 *    quant-conventie), geen ge-tunede waarde
 *  - Bij < 30 obs → warning gerendert; geen claim van significantie
 */

import type { ISODateString } from "@/types/common";

import {
  BOTTOM_QUINTILE_THRESHOLD,
  DECAY_PATTERN_LABELS,
  HIGH_SCORE_THRESHOLD,
  HORIZON_LABELS,
  LOW_SCORE_THRESHOLD,
  MIN_SAMPLE_SIZE,
  REGIME_LABELS,
  SIGNAL_COMPONENT_LABELS,
  SIGNAL_PERFORMANCE_DISCLAIMER,
  TOP_QUINTILE_THRESHOLD,
  type RegimeBucket,
  type RegimePerformanceCell,
  type ReturnHorizon,
  type SignalComponentKey,
  type SignalComponentPerformance,
  type SignalComponentReport,
  type SignalDecayPattern,
  type SignalObservation,
  type SignalPerformanceReport,
  type SignalRegimeBreakdown,
} from "./types";

const COMPONENTS: ReadonlyArray<SignalComponentKey> = [
  "quality",
  "valuation",
  "momentum",
  "volatility",
  "macrofit",
  "portfoliofit",
];

const HORIZONS: ReadonlyArray<ReturnHorizon> = ["1m", "3m", "6m", "12m"];

export interface BuildPerformanceReportInput {
  observations: ReadonlyArray<SignalObservation>;
  generatedAt: ISODateString;
}

/**
 * Hoofd-aggregator.
 */
export function buildSignalPerformanceReport(
  input: BuildPerformanceReportInput,
): SignalPerformanceReport {
  const observations = input.observations;
  const components: SignalComponentReport[] = COMPONENTS.map((c) =>
    buildComponentReport(c, observations),
  );
  const regimeBreakdowns: SignalRegimeBreakdown[] = COMPONENTS.map((c) =>
    buildRegimeBreakdown(c, observations, "12m"),
  );

  const globalWarning =
    observations.length < MIN_SAMPLE_SIZE
      ? `Slechts ${observations.length} observaties — interpreteer cijfers met grote voorzichtigheid (minimum aanbevolen: ${MIN_SAMPLE_SIZE}).`
      : null;

  return {
    generatedAt: input.generatedAt,
    totalObservations: observations.length,
    components,
    regimeBreakdowns,
    globalWarning,
    disclaimer: SIGNAL_PERFORMANCE_DISCLAIMER,
  };
}

// ============================================================
//  Per-component over alle horizons
// ============================================================

function buildComponentReport(
  component: SignalComponentKey,
  observations: ReadonlyArray<SignalObservation>,
): SignalComponentReport {
  const byHorizon = HORIZONS.map((h) =>
    computeComponentPerformance(component, h, observations),
  );
  const decay = classifyDecay(byHorizon);
  const summary = buildComponentSummary(component, byHorizon, decay);
  return { component, byHorizon, decayPattern: decay, summary };
}

export function computeComponentPerformance(
  component: SignalComponentKey,
  horizon: ReturnHorizon,
  observations: ReadonlyArray<SignalObservation>,
): SignalComponentPerformance {
  // Pak alleen observaties met beide score + forward-return voor deze horizon.
  const pairs: Array<{ score: number; ret: number; regime: RegimeBucket }> = [];
  for (const obs of observations) {
    const score = obs.scores[component];
    const ret = obs.forwardReturns[horizon];
    if (typeof score === "number" && Number.isFinite(score) &&
        typeof ret === "number" && Number.isFinite(ret)) {
      pairs.push({ score, ret, regime: obs.regime });
    }
  }
  const sampleSize = pairs.length;

  if (sampleSize === 0) {
    return {
      component,
      horizon,
      sampleSize,
      informationCoefficient: null,
      hitRate: null,
      longShortSpread: null,
      topQuintileReturn: null,
      bottomQuintileReturn: null,
      falsePositiveCount: 0,
      falseNegativeCount: 0,
      warning: "Geen data voor deze horizon.",
    };
  }

  const ic = computeSpearmanRank(
    pairs.map((p) => p.score),
    pairs.map((p) => p.ret),
  );
  const hitRate = computeHitRate(pairs);
  const top = pairs.filter((p) => p.score >= TOP_QUINTILE_THRESHOLD);
  const bot = pairs.filter((p) => p.score < BOTTOM_QUINTILE_THRESHOLD);
  const topMean = mean(top.map((p) => p.ret));
  const botMean = mean(bot.map((p) => p.ret));
  const spread =
    topMean !== null && botMean !== null ? topMean - botMean : null;

  let fp = 0;
  let fn = 0;
  for (const p of pairs) {
    if (p.score >= HIGH_SCORE_THRESHOLD && p.ret < -0.05) fp += 1;
    if (p.score <= LOW_SCORE_THRESHOLD && p.ret > 0.05) fn += 1;
  }

  const warning =
    sampleSize < MIN_SAMPLE_SIZE
      ? `${sampleSize} observaties — onder aanbevolen minimum (${MIN_SAMPLE_SIZE}); cijfer is illustratief.`
      : null;

  return {
    component,
    horizon,
    sampleSize,
    informationCoefficient: ic,
    hitRate,
    longShortSpread: spread,
    topQuintileReturn: topMean,
    bottomQuintileReturn: botMean,
    falsePositiveCount: fp,
    falseNegativeCount: fn,
    warning,
  };
}

// ============================================================
//  Regime breakdown
// ============================================================

function buildRegimeBreakdown(
  component: SignalComponentKey,
  observations: ReadonlyArray<SignalObservation>,
  horizon: ReturnHorizon,
): SignalRegimeBreakdown {
  const buckets: RegimeBucket[] = ["RISK_ON", "NEUTRAL", "DEFENSIVE", "UNKNOWN"];
  const byRegime: RegimePerformanceCell[] = [];

  for (const regime of buckets) {
    const subset = observations.filter((o) => o.regime === regime);
    if (subset.length === 0) {
      byRegime.push({ regime, sampleSize: 0, hitRate: null, meanReturn: null });
      continue;
    }
    const pairs: Array<{ score: number; ret: number }> = [];
    for (const obs of subset) {
      const score = obs.scores[component];
      const ret = obs.forwardReturns[horizon];
      if (typeof score === "number" && typeof ret === "number") {
        pairs.push({ score, ret });
      }
    }
    if (pairs.length === 0) {
      byRegime.push({ regime, sampleSize: 0, hitRate: null, meanReturn: null });
      continue;
    }
    const hr = computeHitRate(pairs.map((p) => ({ ...p, regime })));
    const mr = mean(pairs.map((p) => p.ret));
    byRegime.push({
      regime,
      sampleSize: pairs.length,
      hitRate: hr,
      meanReturn: mr,
    });
  }

  // Best/worst — alleen wanneer ≥ 10 obs per regime; anders te brittle.
  const eligible = byRegime.filter(
    (b) => b.sampleSize >= 10 && b.meanReturn !== null,
  );
  const sorted = [...eligible].sort(
    (a, b) => (b.meanReturn ?? 0) - (a.meanReturn ?? 0),
  );
  const bestRegime = sorted.length > 0 ? sorted[0]!.regime : null;
  const worstRegime =
    sorted.length > 0 ? sorted[sorted.length - 1]!.regime : null;

  const totalEligible = eligible.reduce((s, b) => s + b.sampleSize, 0);
  const warning =
    totalEligible < MIN_SAMPLE_SIZE
      ? `Te weinig observaties per regime (${totalEligible}) voor robuuste regime-attribution.`
      : null;

  return {
    component,
    horizon,
    byRegime,
    bestRegime,
    worstRegime,
    warning,
  };
}

// ============================================================
//  Decay classifier
// ============================================================

export function classifyDecay(
  byHorizon: ReadonlyArray<SignalComponentPerformance>,
): SignalDecayPattern {
  const hrs: number[] = [];
  for (const h of HORIZONS) {
    const cell = byHorizon.find((b) => b.horizon === h);
    if (!cell || cell.hitRate === null) {
      return "insufficient";
    }
    hrs.push(cell.hitRate);
  }
  if (hrs.length < 4) return "insufficient";

  const [a, b, c, d] = hrs as [number, number, number, number];
  const range = Math.max(a, b, c, d) - Math.min(a, b, c, d);

  // Flat: alles binnen 0.05-band.
  if (range < 0.05) return "flat";

  // Monotonic decay: strict daling, alle stappen.
  if (a > b && b > c && c > d) return "monotonic_decay";
  // Monotonic growth: strict stijging.
  if (a < b && b < c && c < d) return "monotonic_growth";
  // Peak mid: piek in b OF c.
  const peakIsMid = Math.max(b, c) > Math.max(a, d);
  if (peakIsMid) return "peak_mid";

  return "flat";
}

function buildComponentSummary(
  component: SignalComponentKey,
  byHorizon: ReadonlyArray<SignalComponentPerformance>,
  decay: SignalDecayPattern,
): string {
  const label = SIGNAL_COMPONENT_LABELS[component];
  const twelveM = byHorizon.find((b) => b.horizon === "12m");
  if (!twelveM || twelveM.sampleSize === 0) {
    return `${label}: geen voldoende historische data voor evaluatie.`;
  }
  const dirText =
    twelveM.hitRate !== null && twelveM.hitRate >= 0.55
      ? `werkt historisch (hit-rate ${pct(twelveM.hitRate)} op 12m)`
      : twelveM.hitRate !== null && twelveM.hitRate <= 0.45
        ? `werkt historisch invers (hit-rate ${pct(twelveM.hitRate)} op 12m)`
        : `is historisch zwak/neutraal op 12m`;
  return `${label} ${dirText}. ${DECAY_PATTERN_LABELS[decay]}.`;
}

// ============================================================
//  Math helpers (pure)
// ============================================================

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

function computeHitRate(
  pairs: ReadonlyArray<{ score: number; ret: number }>,
): number | null {
  if (pairs.length === 0) return null;
  let hits = 0;
  for (const p of pairs) {
    // score > 50 voorspelt positieve return; score < 50 voorspelt negatieve.
    // score === 50 telt niet mee als hit en niet als miss — neutraal.
    if (p.score > 50 && p.ret >= 0) hits += 1;
    else if (p.score < 50 && p.ret < 0) hits += 1;
  }
  return Math.round((hits / pairs.length) * 1000) / 1000;
}

/**
 * Spearman-rank correlatie. Robuust tegen outliers (rangordening i.p.v.
 * absolute waardes); standaard in factor-research.
 *
 * Returnt null bij < 5 paren of bij volledige tie.
 */
export function computeSpearmanRank(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 5) return null;
  const rx = rank(xs);
  const ry = rank(ys);
  return pearson(rx, ry);
}

function rank(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
    const avg = (i + j + 2) / 2; // gemiddelde rank bij ties (1-indexed)
    for (let k = i; k <= j; k++) {
      r[idx[k]![1]] = avg;
    }
    i = j + 1;
  }
  return r;
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0,
    sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i]!;
    sumY += ys[i]!;
    sumXY += xs[i]! * ys[i]!;
    sumX2 += xs[i]! * xs[i]!;
    sumY2 += ys[i]! * ys[i]!;
  }
  const num = n * sumXY - sumX * sumY;
  const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (denom === 0) return null;
  const r = num / denom;
  return Math.round(r * 10000) / 10000;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

// Re-export voor caller convenience.
export { HORIZON_LABELS, REGIME_LABELS };
