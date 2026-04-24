/**
 * Backtest-metrics. Pure wiskunde over een reeks portefeuillewaarden of
 * maandelijkse returns. Geen I/O, geen state.
 *
 * Aannames:
 *  - Inputreeks is maandelijks (één waarde per maand). Vandaar factor 12
 *    voor annualisering.
 *  - Monthly returns worden berekend als V_t / V_{t-1} - 1. Contributions
 *    moeten door de caller uit de waarden gefilterd zijn (de engine levert
 *    een `returns` array die contribution-vrij is).
 *  - "Sharpe-like" ratio gebruikt een vaste risk-free rente van 2% p.a.
 *    tenzij anders meegegeven. Simpel en genoeg voor strategie-vergelijking.
 */

export interface BacktestMetrics {
  totalReturn: number;
  cagr: number;
  volatility: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  calmar: number;
  winRate: number;
}

export const MONTHS_PER_YEAR = 12;
export const DEFAULT_RISK_FREE_ANNUAL = 0.02;

export function monthlyReturnsFromValues(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]!;
    const curr = values[i]!;
    if (prev > 0) out.push(curr / prev - 1);
  }
  return out;
}

/** Simpele total-return op basis van eerste en laatste waarde. */
export function computeTotalReturn(values: number[]): number {
  if (values.length < 2) return 0;
  const first = values[0]!;
  const last = values[values.length - 1]!;
  if (first <= 0 || !Number.isFinite(first) || !Number.isFinite(last)) return 0;
  return last / first - 1;
}

/** CAGR op basis van geometrische product van monthly returns. */
export function computeCagrFromReturns(returns: number[]): number {
  if (returns.length === 0) return 0;
  const compound = returns.reduce((acc, r) => acc * (1 + r), 1);
  if (compound <= 0) return -1;
  const years = returns.length / MONTHS_PER_YEAR;
  if (years <= 0) return 0;
  return Math.pow(compound, 1 / years) - 1;
}

/**
 * CAGR vanuit een waardenreeks (start vs eind). Gemakkelijk voor bench- en
 * equity-curves waar we geen aparte returns-array hebben.
 */
export function computeCagrFromValues(values: number[]): number {
  if (values.length < 2) return 0;
  const first = values[0]!;
  const last = values[values.length - 1]!;
  if (first <= 0 || last <= 0) return 0;
  const months = values.length - 1;
  const years = months / MONTHS_PER_YEAR;
  if (years <= 0) return 0;
  return Math.pow(last / first, 1 / years) - 1;
}

export function computeAnnualizedVolatility(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean =
    returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) /
    (returns.length - 1);
  if (!Number.isFinite(variance) || variance < 0) return 0;
  return Math.sqrt(variance) * Math.sqrt(MONTHS_PER_YEAR);
}

export function computeMaxDrawdown(values: number[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = v / peak - 1;
      if (dd < maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

export function computeSharpeRatio(
  returns: number[],
  riskFreeAnnual: number = DEFAULT_RISK_FREE_ANNUAL,
): number {
  if (returns.length < 2) return 0;
  const rfMonthly = riskFreeAnnual / MONTHS_PER_YEAR;
  const excess = returns.map((r) => r - rfMonthly);
  const mean = excess.reduce((sum, r) => sum + r, 0) / excess.length;
  const variance =
    excess.reduce((sum, r) => sum + (r - mean) ** 2, 0) /
    (excess.length - 1);
  const std = Math.sqrt(Math.max(0, variance));
  if (std === 0 || !Number.isFinite(std)) return 0;
  return (mean / std) * Math.sqrt(MONTHS_PER_YEAR);
}

export function computeSortinoRatio(
  returns: number[],
  riskFreeAnnual: number = DEFAULT_RISK_FREE_ANNUAL,
): number {
  if (returns.length < 2) return 0;
  const rfMonthly = riskFreeAnnual / MONTHS_PER_YEAR;
  const excess = returns.map((r) => r - rfMonthly);
  const mean = excess.reduce((sum, r) => sum + r, 0) / excess.length;
  const downside = excess.filter((r) => r < 0);
  if (downside.length === 0) return 0;
  const downsideVar =
    downside.reduce((sum, r) => sum + r * r, 0) / downside.length;
  const downsideStd = Math.sqrt(Math.max(0, downsideVar));
  if (downsideStd === 0 || !Number.isFinite(downsideStd)) return 0;
  return (mean / downsideStd) * Math.sqrt(MONTHS_PER_YEAR);
}

export function computeCalmarRatio(
  cagr: number,
  maxDrawdown: number,
): number {
  if (maxDrawdown === 0 || !Number.isFinite(maxDrawdown)) return 0;
  return cagr / Math.abs(maxDrawdown);
}

export function computeWinRate(returns: number[]): number {
  if (returns.length === 0) return 0;
  const wins = returns.filter((r) => r > 0).length;
  return wins / returns.length;
}

/**
 * Combineer alle metrics uit een waardenreeks en de bijbehorende
 * monthly returns (contribution-vrij; door de engine geleverd).
 */
export function computeBacktestMetrics({
  values,
  returns,
  riskFreeAnnual = DEFAULT_RISK_FREE_ANNUAL,
}: {
  values: number[];
  returns: number[];
  riskFreeAnnual?: number;
}): BacktestMetrics {
  const cagr = computeCagrFromReturns(returns);
  const maxDd = computeMaxDrawdown(values);
  return {
    totalReturn: computeTotalReturn(values),
    cagr,
    volatility: computeAnnualizedVolatility(returns),
    sharpe: computeSharpeRatio(returns, riskFreeAnnual),
    sortino: computeSortinoRatio(returns, riskFreeAnnual),
    maxDrawdown: maxDd,
    calmar: computeCalmarRatio(cagr, maxDd),
    winRate: computeWinRate(returns),
  };
}
