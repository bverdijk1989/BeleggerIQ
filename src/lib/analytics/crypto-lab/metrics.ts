/**
 * Pure metric-helpers voor crypto-lab.
 *
 * Werkt op een chronologisch oplopende reeks closes (oudste eerst).
 * Geen Date.now, geen randomness — Simons-laag: deterministisch.
 */

import type {
  CryptoAssetKey,
  CryptoAssetMetrics,
  CryptoDataQuality,
  CryptoTrendDirection,
} from "./types";

// ============================================================
//  Drempels (constants)
// ============================================================

const MIN_SAMPLE_FULL = 200; // ~1 jaar dagelijks
const MIN_SAMPLE_PARTIAL = 60; // ~3 maanden — wel berekenen, lagere quality
const ANNUALIZATION_FACTOR = Math.sqrt(252);

// ============================================================
//  Public API
// ============================================================

export interface ComputeCryptoMetricsInput {
  asset: CryptoAssetKey;
  /** Closes oudste→nieuwste. Lege array → unknown metrics. */
  closes: ReadonlyArray<number>;
}

export function computeCryptoMetrics(
  input: ComputeCryptoMetricsInput,
): CryptoAssetMetrics {
  const closes = input.closes.filter((c) => Number.isFinite(c) && c > 0);
  const sampleSize = closes.length;
  const dataQuality = deriveDataQuality(sampleSize);

  if (sampleSize < 2) {
    return emptyMetrics(input.asset, sampleSize);
  }

  const last = closes[closes.length - 1]!;
  const returns = computeDailyReturns(closes);
  const annualizedVolatility = computeAnnualizedVol(returns);
  const maxDrawdown = computeMaxDrawdown(closes);

  // 12m-return: oudste close in window vs laatste; vereist ~252 dagen.
  const return12m =
    sampleSize >= 200
      ? safeReturn(closes[Math.max(0, sampleSize - 252)]!, last)
      : null;

  // 30d-return: 30 dagen geleden vs laatste.
  const return30d =
    sampleSize >= 31
      ? safeReturn(closes[sampleSize - 31]!, last)
      : null;

  // Momentum-score: combineer 12m en 30d returns, geclamped naar 0..100.
  const momentumScore = computeMomentumScore(return12m, return30d);

  // Trend-strength: percentage van afgelopen min(60, sampleSize) dagen
  // waarin close boven 200d MA staat.
  const trendStrength = computeTrendStrength(closes);
  const trendDirection = deriveTrendDirection(return30d, momentumScore);

  return {
    asset: input.asset,
    return12m,
    return30d,
    annualizedVolatility,
    maxDrawdown,
    momentumScore,
    trendStrength,
    trendDirection,
    sampleSize,
    dataQuality,
  };
}

// ============================================================
//  Helpers
// ============================================================

function emptyMetrics(
  asset: CryptoAssetKey,
  sampleSize: number,
): CryptoAssetMetrics {
  return {
    asset,
    return12m: null,
    return30d: null,
    annualizedVolatility: null,
    maxDrawdown: null,
    momentumScore: 50,
    trendStrength: 0,
    trendDirection: "unknown",
    sampleSize,
    dataQuality: sampleSize === 0 ? "missing" : "low",
  };
}

function deriveDataQuality(sampleSize: number): CryptoDataQuality {
  if (sampleSize === 0) return "missing";
  if (sampleSize >= MIN_SAMPLE_FULL) return "high";
  if (sampleSize >= MIN_SAMPLE_PARTIAL) return "medium";
  return "low";
}

function safeReturn(start: number, end: number): number | null {
  if (!Number.isFinite(start) || start <= 0) return null;
  return end / start - 1;
}

function computeDailyReturns(closes: ReadonlyArray<number>): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]!;
    const cur = closes[i]!;
    if (prev > 0) out.push(cur / prev - 1);
  }
  return out;
}

function computeAnnualizedVol(returns: ReadonlyArray<number>): number | null {
  if (returns.length < 10) return null;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance =
    returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const sd = Math.sqrt(variance);
  return sd * ANNUALIZATION_FACTOR;
}

function computeMaxDrawdown(closes: ReadonlyArray<number>): number | null {
  if (closes.length < 2) return null;
  let peak = closes[0]!;
  let maxDD = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    const dd = c / peak - 1;
    if (dd < maxDD) maxDD = dd;
  }
  return maxDD;
}

function computeMomentumScore(
  return12m: number | null,
  return30d: number | null,
): number {
  // Map: -50% → 10, 0% → 50, +50% → 80, +100%+ → 95.
  // Combineert 12m (70% weight) en 30d (30% weight).
  const score12 = scoreReturn(return12m);
  const score30 = scoreReturn(return30d);
  if (score12 === null && score30 === null) return 50;
  if (score12 === null) return clamp(score30!);
  if (score30 === null) return clamp(score12);
  return clamp(0.7 * score12 + 0.3 * score30);
}

function scoreReturn(ret: number | null): number | null {
  if (ret === null) return null;
  // Asymmetrisch: hoge winst → max ~95, hoge daling → min ~10.
  if (ret >= 1.0) return 95;
  if (ret >= 0.5) return 80 + 15 * ((ret - 0.5) / 0.5);
  if (ret >= 0) return 50 + 30 * (ret / 0.5);
  if (ret >= -0.5) return 20 + 30 * ((ret + 0.5) / 0.5);
  return 10;
}

function computeTrendStrength(closes: ReadonlyArray<number>): number {
  const window = Math.min(60, closes.length);
  if (window < 30) return 0;

  // 200d MA — als we minder dan 200 hebben, gebruik de helft (rolling).
  const maWindow = Math.min(200, Math.max(50, Math.floor(closes.length * 0.5)));
  let aboveCount = 0;
  for (let i = closes.length - window; i < closes.length; i++) {
    const from = Math.max(0, i - maWindow + 1);
    const slice = closes.slice(from, i + 1);
    const ma = slice.reduce((s, c) => s + c, 0) / slice.length;
    if (closes[i]! > ma) aboveCount += 1;
  }
  return clamp((aboveCount / window) * 100);
}

function deriveTrendDirection(
  return30d: number | null,
  momentumScore: number,
): CryptoTrendDirection {
  if (return30d === null) {
    if (momentumScore >= 65) return "up";
    if (momentumScore <= 35) return "down";
    return "unknown";
  }
  if (return30d >= 0.08) return "up";
  if (return30d <= -0.08) return "down";
  return "sideways";
}

function clamp(v: number, min = 0, max = 100): number {
  if (!Number.isFinite(v)) return 50;
  if (v < min) return min;
  if (v > max) return max;
  return Math.round(v);
}
