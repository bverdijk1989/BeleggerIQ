import type { EquityPoint } from "@/types/backtest";

/**
 * Gedeelde helpers voor de evidence-analytics. Alles puur en
 * deterministisch.
 */

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Bereken een totaalrendement uit een waardenreeks (fractie). */
export function totalReturnOverValues(values: number[]): number {
  if (values.length < 2) return 0;
  const first = values[0]!;
  const last = values[values.length - 1]!;
  if (first <= 0 || !Number.isFinite(first) || !Number.isFinite(last)) return 0;
  return last / first - 1;
}

/** Annualiseer een total return over een aantal maanden. */
export function annualiseReturn(
  totalReturn: number,
  months: number,
): number {
  if (!Number.isFinite(totalReturn) || months <= 0) return 0;
  const years = months / 12;
  if (years <= 0) return 0;
  // (1 + r)^(1/years) - 1 — log-safe: als 1+r ≤ 0 → -1 (wipeout).
  if (1 + totalReturn <= 0) return -1;
  return Math.pow(1 + totalReturn, 1 / years) - 1;
}

/**
 * Detecteert of de equity-curve een benchmark heeft op álle punten.
 * Gebruikt om no-op-paden te detecteren (regret en rolling hebben de
 * benchmark nodig om excess-returns te berekenen).
 */
export function hasCompleteBenchmark(points: EquityPoint[]): boolean {
  if (points.length === 0) return false;
  return points.every(
    (p) => typeof p.benchmark === "number" && Number.isFinite(p.benchmark),
  );
}

export function extractBenchmarkValues(points: EquityPoint[]): number[] {
  const out: number[] = [];
  for (const p of points) {
    if (typeof p.benchmark === "number" && Number.isFinite(p.benchmark)) {
      out.push(p.benchmark);
    }
  }
  return out;
}

export function extractStrategyValues(points: EquityPoint[]): number[] {
  return points.map((p) => p.value);
}

/**
 * Bereken maandelijkse returns t.o.v. de vorige maand. Bij de eerste
 * maand wordt geen return opgeslagen.
 */
export function monthlyReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]!;
    const curr = values[i]!;
    if (prev > 0) out.push(curr / prev - 1);
    else out.push(0);
  }
  return out;
}

/**
 * ISO-date-only → "YYYY-MM-DD". Veilig voor vergelijkingen.
 */
export function toIsoDateOnly(input: string): string {
  // Accept al "YYYY-MM-DD" en "YYYY-MM-DDT...Z".
  const match = input.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? input;
}

export function sum(values: number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return sum(values) / values.length;
}

export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10000) / 10000;
}
