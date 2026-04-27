/**
 * Tracking-error helpers — pure wiskunde over twee return-reeksen.
 *
 * Conventie:
 *   - `portfolioReturns[i]` en `benchmarkReturns[i]` zijn maandelijkse
 *     returns als fractie (0.012 = +1.2%).
 *   - Annualisatie via √12 voor st-dev (industry standard).
 */

export function excessReturns(
  portfolioReturns: number[],
  benchmarkReturns: number[],
): number[] {
  const n = Math.min(portfolioReturns.length, benchmarkReturns.length);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = portfolioReturns[i];
    const b = benchmarkReturns[i];
    if (typeof p !== "number" || typeof b !== "number") continue;
    if (!Number.isFinite(p) || !Number.isFinite(b)) continue;
    out.push(p - b);
  }
  return out;
}

/**
 * Annualised tracking-error = stdev(excess monthly returns) × √12.
 * Retourneert 0 bij < 2 samples (niet betekenisvol).
 */
export function annualizedTrackingError(
  portfolioReturns: number[],
  benchmarkReturns: number[],
): number {
  const excess = excessReturns(portfolioReturns, benchmarkReturns);
  if (excess.length < 2) return 0;
  const mean = excess.reduce((s, v) => s + v, 0) / excess.length;
  const variance =
    excess.reduce((s, v) => s + (v - mean) ** 2, 0) / (excess.length - 1);
  if (!Number.isFinite(variance) || variance < 0) return 0;
  return Math.sqrt(variance) * Math.sqrt(12);
}

/**
 * Information ratio = annualised excess return / tracking error.
 * Retourneert `null` wanneer tracking-error 0 is (zou delen door 0).
 */
export function informationRatio(
  totalPortfolioReturn: number,
  totalBenchmarkReturn: number,
  monthsObserved: number,
  trackingError: number,
): number | null {
  if (trackingError <= 0 || monthsObserved <= 0) return null;
  const years = monthsObserved / 12;
  if (years <= 0) return null;
  if (1 + totalPortfolioReturn <= 0 || 1 + totalBenchmarkReturn <= 0) {
    return null;
  }
  const annPortfolio = Math.pow(1 + totalPortfolioReturn, 1 / years) - 1;
  const annBench = Math.pow(1 + totalBenchmarkReturn, 1 / years) - 1;
  return (annPortfolio - annBench) / trackingError;
}
