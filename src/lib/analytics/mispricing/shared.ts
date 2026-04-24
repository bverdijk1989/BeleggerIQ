import type { HistoricalPoint } from "@/types/market";

/**
 * Shared pure helpers voor de mispricing-detectoren. Alles numeriek,
 * deterministisch, zonder I/O. Getest via de detector-tests.
 */

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Schaal een waarde naar 0..100 tussen `min` en `max`. Buiten de
 * grenzen klemt de schaal naar 0 of 100. Gebruikt voor strength-
 * conversies zodat elke detector dezelfde formule volgt.
 */
export function scaleStrength(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  if (max === min) return value >= max ? 100 : 0;
  const pct = ((value - min) / (max - min)) * 100;
  return clamp(Math.round(pct), 0, 100);
}

export function pctChange(latest: number, baseline: number): number {
  if (!Number.isFinite(latest) || !Number.isFinite(baseline) || baseline <= 0) {
    return 0;
  }
  return (latest - baseline) / baseline;
}

export function latestClose(history: HistoricalPoint[]): number | null {
  const last = history.length > 0 ? history[history.length - 1] : null;
  return last && Number.isFinite(last.close) ? last.close : null;
}

export function closeNDaysAgo(
  history: HistoricalPoint[],
  days: number,
): number | null {
  if (history.length === 0) return null;
  const idx = Math.max(0, history.length - 1 - days);
  const point = history[idx];
  return point && Number.isFinite(point.close) ? point.close : null;
}

/**
 * Log-return reeks uit een oplopende history (N-1 returns bij N punten).
 * Filtert niet-finite samples.
 */
export function logReturns(history: HistoricalPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1]?.close;
    const curr = history[i]?.close;
    if (
      prev &&
      curr &&
      Number.isFinite(prev) &&
      Number.isFinite(curr) &&
      prev > 0 &&
      curr > 0
    ) {
      out.push(Math.log(curr / prev));
    }
  }
  return out;
}

/**
 * Standaarddeviatie met (n-1)-correctie. Gebruikt voor realized
 * volatility. Retourneert 0 bij < 2 samples.
 */
export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Annualized realized volatility van log-returns (252 trading days). */
export function annualizedVol(returns: number[]): number {
  if (returns.length < 2) return 0;
  return stdev(returns) * Math.sqrt(252);
}

/**
 * Realized vol over laatste `window` dagen van een history. Retourneert
 * `null` bij onvoldoende data — caller triggered dan geen signaal.
 */
export function realizedVolOverWindow(
  history: HistoricalPoint[],
  window: number,
): number | null {
  if (history.length < window + 1) return null;
  const slice = history.slice(-1 * (window + 1));
  const returns = logReturns(slice);
  if (returns.length < 2) return null;
  return annualizedVol(returns);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

/**
 * Bereken cumulatieve return over een trailing window uit history.
 * Null bij onvoldoende data.
 */
export function trailingReturn(
  history: HistoricalPoint[],
  days: number,
): number | null {
  const latest = latestClose(history);
  const baseline = closeNDaysAgo(history, days);
  if (latest === null || baseline === null || baseline <= 0) return null;
  return pctChange(latest, baseline);
}

/**
 * Construeer een ISO timestamp voor expiresAt op basis van detectedAt
 * + TTL-dagen. Pure functie (geen `new Date()` side-effect tenzij
 * detectedAt expliciet is meegegeven).
 */
export function computeExpiresAt(
  detectedAt: string,
  ttlDays: number,
): string {
  const base = new Date(detectedAt);
  if (Number.isNaN(base.getTime())) {
    // Fallback — voorkom dat een ongeldige detectedAt doorpropageert.
    return detectedAt;
  }
  const ttlMs = Math.max(1, Math.floor(ttlDays)) * 24 * 60 * 60 * 1000;
  return new Date(base.getTime() + ttlMs).toISOString();
}
