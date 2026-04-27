import type { FactorScore } from "@/types/factor";

import type {
  AttributionBreakdown,
  AttributionBucket,
} from "./types";

/**
 * Performance Attribution-engine.
 *
 * Doel: leg uit *waarom* de portefeuille-alpha is wat 'ie is. We
 * splitsen alpha op in drie buckets:
 *
 *   1. Sector-contributie  — `Σ weight_sector × (return_sector −
 *      benchmarkReturn)`
 *   2. Factor-contributie  — buckets `quality-high/low`,
 *      `value-high/low`, `momentum-high/low` (op basis van factor-
 *      score-tertiles).
 *   3. Single-stock alpha — per individuele positie, top-N getoond.
 *
 * Conventies:
 *  - `weight` is de fractie van portefeuille-waarde aan het **begin**
 *    van de meet-periode. Bij missende start-snapshot vallen we
 *    terug op huidige weight (caller verantwoordelijk).
 *  - `bucketReturn` is de waarde-gewogen rendement van de holdings in
 *    de bucket.
 *  - Stocks zonder return-data worden geskipt; sectors zonder posities
 *    worden niet getoond.
 *
 * Pure functie — geen I/O.
 */

export interface PositionPerformance {
  ticker: string;
  name: string;
  sector: string | null;
  /** Fractie van portefeuille-waarde (0..1) bij start. */
  startWeight: number;
  /** Total return van de positie over de periode (fractie). */
  positionReturn: number;
  factorScore?: FactorScore | null;
}

export interface ComputeAttributionInput {
  positions: PositionPerformance[];
  benchmarkReturn: number;
  /** Hoeveel single-stock alpha-buckets we tonen (default 8). */
  topStocks?: number;
}

const DEFAULT_TOP_STOCKS = 8;
const FACTOR_HIGH_THRESHOLD = 65;
const FACTOR_LOW_THRESHOLD = 35;

export function computeAttribution(
  input: ComputeAttributionInput,
): AttributionBreakdown {
  const { positions, benchmarkReturn } = input;
  const topStocks = input.topStocks ?? DEFAULT_TOP_STOCKS;

  const sectors = bucketBySector(positions, benchmarkReturn);
  const factors = bucketByFactor(positions, benchmarkReturn);
  const stocks = bucketByStock(positions, benchmarkReturn, topStocks);

  const totalSector = sumContributions(sectors);
  const totalFactor = sumContributions(factors);
  const totalStock = sumContributions(stocks);

  // Het residual = alpha − sector. (Sector is meest natuurlijke
  // dekkingsgrond; factor + stock zijn alternatieve lenzen.)
  const portfolioReturn = positions.reduce(
    (acc, p) => acc + p.startWeight * p.positionReturn,
    0,
  );
  const alpha = portfolioReturn - benchmarkReturn;
  const residualAlpha = alpha - totalSector;

  return {
    sectors,
    factors,
    stocks,
    totalSectorContribution: totalSector,
    totalFactorContribution: totalFactor,
    totalStockContribution: totalStock,
    residualAlpha,
  };
}

// ============================================================
//  Sector-bucket
// ============================================================

function bucketBySector(
  positions: PositionPerformance[],
  benchmarkReturn: number,
): AttributionBucket[] {
  const groups = new Map<string, PositionPerformance[]>();
  for (const p of positions) {
    const key = p.sector ?? "Onbekend";
    const existing = groups.get(key);
    if (existing) existing.push(p);
    else groups.set(key, [p]);
  }
  const out: AttributionBucket[] = [];
  for (const [sector, items] of groups) {
    const weight = items.reduce((s, p) => s + p.startWeight, 0);
    if (weight <= 0) continue;
    const bucketReturn =
      items.reduce((s, p) => s + p.startWeight * p.positionReturn, 0) /
      weight;
    out.push({
      key: `sector:${sector}`,
      label: sector,
      weight,
      bucketReturn,
      benchmarkReturn,
      contribution: weight * (bucketReturn - benchmarkReturn),
      positions: items.length,
    });
  }
  out.sort((a, b) => b.contribution - a.contribution);
  return out;
}

// ============================================================
//  Factor-bucket
// ============================================================

function bucketByFactor(
  positions: PositionPerformance[],
  benchmarkReturn: number,
): AttributionBucket[] {
  const dimensions: Array<{
    key: "quality" | "value" | "momentum";
    label: string;
  }> = [
    { key: "quality", label: "Quality" },
    { key: "value", label: "Value" },
    { key: "momentum", label: "Momentum" },
  ];

  const out: AttributionBucket[] = [];
  for (const dim of dimensions) {
    const high: PositionPerformance[] = [];
    const low: PositionPerformance[] = [];
    for (const p of positions) {
      const score = p.factorScore?.subScores?.[dim.key];
      if (typeof score !== "number" || !Number.isFinite(score)) continue;
      if (score >= FACTOR_HIGH_THRESHOLD) high.push(p);
      else if (score <= FACTOR_LOW_THRESHOLD) low.push(p);
    }
    const highBucket = makeFactorBucket(
      high,
      benchmarkReturn,
      `factor:${dim.key}-high`,
      `${dim.label} hoog`,
    );
    const lowBucket = makeFactorBucket(
      low,
      benchmarkReturn,
      `factor:${dim.key}-low`,
      `${dim.label} laag`,
    );
    if (highBucket) out.push(highBucket);
    if (lowBucket) out.push(lowBucket);
  }
  out.sort((a, b) => b.contribution - a.contribution);
  return out;
}

function makeFactorBucket(
  items: PositionPerformance[],
  benchmarkReturn: number,
  key: string,
  label: string,
): AttributionBucket | null {
  if (items.length === 0) return null;
  const weight = items.reduce((s, p) => s + p.startWeight, 0);
  if (weight <= 0) return null;
  const bucketReturn =
    items.reduce((s, p) => s + p.startWeight * p.positionReturn, 0) /
    weight;
  return {
    key,
    label,
    weight,
    bucketReturn,
    benchmarkReturn,
    contribution: weight * (bucketReturn - benchmarkReturn),
    positions: items.length,
  };
}

// ============================================================
//  Stock-bucket (single-stock alpha)
// ============================================================

function bucketByStock(
  positions: PositionPerformance[],
  benchmarkReturn: number,
  topN: number,
): AttributionBucket[] {
  const buckets: AttributionBucket[] = positions.map((p) => ({
    key: `stock:${p.ticker}`,
    label: `${p.name} (${p.ticker})`,
    weight: p.startWeight,
    bucketReturn: p.positionReturn,
    benchmarkReturn,
    contribution: p.startWeight * (p.positionReturn - benchmarkReturn),
    positions: 1,
  }));
  // Sorteer op |contribution| desc — toont zowel grote winnaars als
  // verliezers, niet alleen extremes aan één kant.
  buckets.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return buckets.slice(0, topN);
}

// ============================================================
//  Helpers
// ============================================================

function sumContributions(buckets: AttributionBucket[]): number {
  return buckets.reduce((s, b) => s + b.contribution, 0);
}
