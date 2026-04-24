import { getFundamentals } from "@/lib/data/fundamentals";
import { getHistory } from "@/lib/data/history";
import {
  DEFAULT_SCREENER_UNIVERSE,
  type UniverseEntry,
} from "@/lib/data/screener-universe";
import type { Currency, ISODateString } from "@/types/common";
import type {
  FactorRationales,
  FactorScore,
  FactorSubScores,
  FactorWeights,
  FundamentalsSnapshot,
} from "@/types/factor";
import type { AssetClass } from "@/types/portfolio";
import type { ScreenerFilters } from "@/types/screener";

import { DEFAULT_FACTOR_WEIGHTS, scoreFactors } from "./factors/composite";

/**
 * Factor-first screener. Ranking is puur op `FactorScore.composite`;
 * geen AI en geen heuristische re-rank. Filters en rank-data komen
 * uit dezelfde fundamentals/history bronnen als de portfolio enrichment.
 *
 * Pipeline:
 *  1. Pre-filter universe op region/sector/assetClass (cheap, metadata-only).
 *  2. Fetch fundamentals + price history parallel.
 *  3. Score via `scoreFactors`.
 *  4. Post-filter op per-factor drempels, composite drempel,
 *     dividend yield, debt/equity, market cap en exclusie-lijst.
 *  5. Sort desc op composite, trunc tot limit.
 */

export interface ScreenerCandidate {
  ticker: string;
  name: string;
  sector: string;
  region: string;
  currency: Currency;
  assetClass: AssetClass;
  fundamentals: FundamentalsSnapshot | null;
  factorScore: FactorScore;
  strengths: string[];
  weaknesses: string[];
}

export interface RunScreenOptions {
  filters: ScreenerFilters;
  weights?: FactorWeights;
  limit?: number;
  universe?: readonly UniverseEntry[];
}

export interface RunScreenResult {
  candidates: ScreenerCandidate[];
  /** Aantal entries in het universe vóór enige filter. */
  universeSize: number;
  /** Na pre-filter op metadata (region/sector/asset class/exclusie). */
  preFiltered: number;
  /** Na alle post-score filters. */
  totalAfterFilter: number;
  asOf: ISODateString;
}

const DEFAULT_LIMIT = 30;

export async function runScreen(
  options: RunScreenOptions,
): Promise<RunScreenResult> {
  const universe = options.universe ?? DEFAULT_SCREENER_UNIVERSE;
  const weights = options.weights ?? DEFAULT_FACTOR_WEIGHTS;
  const filters = options.filters;
  const asOf = new Date().toISOString();

  const pre = preFilter(universe, filters);

  if (pre.length === 0) {
    return {
      candidates: [],
      universeSize: universe.length,
      preFiltered: 0,
      totalAfterFilter: 0,
      asOf,
    };
  }

  // Parallel fetch per ticker. Elk gebruikt de market-data cache dus
  // herhaalde runs met dezelfde filters zijn zowat gratis.
  const enriched = await Promise.all(
    pre.map(async (entry) => {
      const [fundamentals, priceHistory] = await Promise.all([
        safeFundamentals(entry.ticker),
        safeHistoryWindow(entry.ticker),
      ]);
      const factorScore = scoreFactors(
        {
          ticker: entry.ticker,
          asOf,
          fundamentals,
          priceHistory,
        },
        weights,
      );
      const { strengths, weaknesses } = deriveStrengthsWeaknesses(factorScore);
      const candidate: ScreenerCandidate = {
        ticker: entry.ticker,
        name: entry.name,
        sector: entry.sector,
        region: entry.region,
        currency: entry.currency,
        assetClass: entry.assetClass,
        fundamentals,
        factorScore,
        strengths,
        weaknesses,
      };
      return candidate;
    }),
  );

  const filtered = enriched.filter((c) => passesPostScoreFilters(c, filters));
  filtered.sort((a, b) => b.factorScore.composite - a.factorScore.composite);
  const limited = filtered.slice(0, options.limit ?? DEFAULT_LIMIT);

  return {
    candidates: limited,
    universeSize: universe.length,
    preFiltered: pre.length,
    totalAfterFilter: filtered.length,
    asOf,
  };
}

// ============================================================
//  Filtering
// ============================================================

export function preFilter(
  universe: readonly UniverseEntry[],
  filters: ScreenerFilters,
): UniverseEntry[] {
  return universe.filter((entry) => {
    if (filters.regions && filters.regions.length > 0) {
      if (!filters.regions.includes(entry.region)) return false;
    }
    if (filters.sectors && filters.sectors.length > 0) {
      if (!filters.sectors.includes(entry.sector)) return false;
    }
    if (filters.assetClasses && filters.assetClasses.length > 0) {
      if (!filters.assetClasses.includes(entry.assetClass)) return false;
    }
    if (
      filters.excludedTickers &&
      filters.excludedTickers.includes(entry.ticker)
    ) {
      return false;
    }
    return true;
  });
}

export function passesPostScoreFilters(
  candidate: ScreenerCandidate,
  filters: ScreenerFilters,
): boolean {
  // Factor drempels
  if (filters.factorMin) {
    const keys: Array<keyof FactorSubScores> = [
      "quality",
      "value",
      "momentum",
      "lowVol",
    ];
    for (const key of keys) {
      const threshold = filters.factorMin[key];
      if (threshold === undefined) continue;
      const value = candidate.factorScore.subScores[key];
      if (value === undefined || value < threshold) return false;
    }
  }
  if (
    filters.minFactorComposite !== undefined &&
    candidate.factorScore.composite < filters.minFactorComposite
  ) {
    return false;
  }

  const f = candidate.fundamentals;
  if (filters.minMarketCap !== undefined) {
    if (!f?.marketCap || f.marketCap < filters.minMarketCap) return false;
  }
  if (filters.maxMarketCap !== undefined) {
    if (!f?.marketCap || f.marketCap > filters.maxMarketCap) return false;
  }
  if (filters.maxPe !== undefined) {
    if (f?.pe === undefined || f.pe > filters.maxPe) return false;
  }
  if (filters.minDividendYield !== undefined) {
    if (
      f?.dividendYield === undefined ||
      f.dividendYield < filters.minDividendYield
    ) {
      return false;
    }
  }
  if (filters.maxDebtToEquity !== undefined) {
    if (
      f?.debtToEquity === undefined ||
      f.debtToEquity > filters.maxDebtToEquity
    ) {
      return false;
    }
  }
  if (filters.dividendOnly && !(f?.dividendYield && f.dividendYield > 0)) {
    return false;
  }
  return true;
}

// ============================================================
//  Strengths / weaknesses extraction
// ============================================================

/**
 * Leidt de 2–3 meest uitgesproken sterke en zwakke punten af uit de
 * factor rationales. Pure, deterministisch.
 *
 * Sterke punten: sub-scores ≥ 65, sorted op afstand tot 50.
 * Zwakke punten: sub-scores ≤ 35, sorted op afstand tot 50.
 */
export function deriveStrengthsWeaknesses(score: FactorScore): {
  strengths: string[];
  weaknesses: string[];
} {
  const keys: Array<{
    key: keyof FactorSubScores;
    label: string;
  }> = [
    { key: "quality", label: "Quality" },
    { key: "value", label: "Value" },
    { key: "momentum", label: "Momentum" },
    { key: "lowVol", label: "Risk" },
  ];

  const ranked = keys
    .map(({ key, label }) => ({
      key,
      label,
      score: score.subScores[key] ?? 50,
      rationale: firstRationale(score.rationales, key),
    }))
    .sort(
      (a, b) =>
        Math.abs(b.score - 50) - Math.abs(a.score - 50),
    );

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  for (const entry of ranked) {
    if (entry.score >= 65 && strengths.length < 3 && entry.rationale) {
      strengths.push(`${entry.label}: ${entry.rationale}`);
    } else if (entry.score <= 35 && weaknesses.length < 3 && entry.rationale) {
      weaknesses.push(`${entry.label}: ${entry.rationale}`);
    }
  }

  return { strengths, weaknesses };
}

function firstRationale(
  rationales: FactorRationales | undefined,
  key: keyof FactorSubScores,
): string | undefined {
  if (!rationales) return undefined;
  switch (key) {
    case "quality":
      return rationales.quality[0];
    case "value":
      return rationales.value[0];
    case "momentum":
      return rationales.momentum[0];
    case "lowVol":
      return rationales.lowVol[0];
    default:
      return undefined;
  }
}

// ============================================================
//  Fetch helpers (defensive)
// ============================================================

async function safeFundamentals(
  ticker: string,
): Promise<FundamentalsSnapshot | null> {
  try {
    return await getFundamentals(ticker);
  } catch (error) {
    console.warn(`[screener] fundamentals ${ticker} failed`, error);
    return null;
  }
}

async function safeHistoryWindow(ticker: string) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 400);
  try {
    return await getHistory({
      ticker,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      interval: "1d",
    });
  } catch (error) {
    console.warn(`[screener] history ${ticker} failed`, error);
    return [];
  }
}
