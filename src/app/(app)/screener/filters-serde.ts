import type { FactorSubScores } from "@/types/factor";
import type { ScreenerFilters } from "@/types/screener";

/**
 * URL-serializatie van `ScreenerFilters`. Zo blijven filter-selecties
 * shareable via URL en werkt de server-side run deterministisch.
 *
 * Conventies:
 *  - Arrays (regions, sectors) → comma-separated strings.
 *  - Numerieke filters → pas opnemen als ze een echte drempel zetten.
 *  - Keys worden snake-case in URLs gehouden voor leesbaarheid.
 */

type SearchParamsLike =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function readString(
  params: SearchParamsLike,
  key: string,
): string | undefined {
  if (params instanceof URLSearchParams) {
    return params.get(key) ?? undefined;
  }
  const v = params[key];
  if (Array.isArray(v)) return v[0];
  return v;
}

function readList(params: SearchParamsLike, key: string): string[] {
  const raw = readString(params, key);
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function readNumber(
  params: SearchParamsLike,
  key: string,
): number | undefined {
  const raw = readString(params, key);
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function parseFiltersFromSearchParams(
  params: SearchParamsLike,
): ScreenerFilters {
  const filters: ScreenerFilters = {};

  const regions = readList(params, "region");
  if (regions.length > 0) filters.regions = regions;

  const sectors = readList(params, "sector");
  if (sectors.length > 0) filters.sectors = sectors;

  const minQuality = readNumber(params, "minQuality");
  const minValue = readNumber(params, "minValue");
  const minMomentum = readNumber(params, "minMomentum");
  const minLowVol = readNumber(params, "minRisk");
  const factorMin: Partial<FactorSubScores> = {};
  if (minQuality !== undefined && minQuality > 0) factorMin.quality = minQuality;
  if (minValue !== undefined && minValue > 0) factorMin.value = minValue;
  if (minMomentum !== undefined && minMomentum > 0)
    factorMin.momentum = minMomentum;
  if (minLowVol !== undefined && minLowVol > 0) factorMin.lowVol = minLowVol;
  if (Object.keys(factorMin).length > 0) filters.factorMin = factorMin;

  const minComposite = readNumber(params, "minComposite");
  if (minComposite !== undefined && minComposite > 0) {
    filters.minFactorComposite = minComposite;
  }

  const minDividend = readNumber(params, "minDividend");
  if (minDividend !== undefined && minDividend > 0) {
    filters.minDividendYield = minDividend;
  }

  const maxDe = readNumber(params, "maxDebt");
  if (maxDe !== undefined) filters.maxDebtToEquity = maxDe;

  const maxPe = readNumber(params, "maxPe");
  if (maxPe !== undefined) filters.maxPe = maxPe;

  const minMcap = readNumber(params, "minMcap");
  if (minMcap !== undefined && minMcap > 0) filters.minMarketCap = minMcap;

  const maxMcap = readNumber(params, "maxMcap");
  if (maxMcap !== undefined && maxMcap > 0) filters.maxMarketCap = maxMcap;

  const dividendOnly = readString(params, "divOnly");
  if (dividendOnly === "1") filters.dividendOnly = true;

  return filters;
}

export function filtersToSearchParams(
  filters: ScreenerFilters,
): URLSearchParams {
  const sp = new URLSearchParams();

  if (filters.regions?.length) sp.set("region", filters.regions.join(","));
  if (filters.sectors?.length) sp.set("sector", filters.sectors.join(","));

  if (filters.factorMin?.quality)
    sp.set("minQuality", String(filters.factorMin.quality));
  if (filters.factorMin?.value)
    sp.set("minValue", String(filters.factorMin.value));
  if (filters.factorMin?.momentum)
    sp.set("minMomentum", String(filters.factorMin.momentum));
  if (filters.factorMin?.lowVol)
    sp.set("minRisk", String(filters.factorMin.lowVol));

  if (filters.minFactorComposite)
    sp.set("minComposite", String(filters.minFactorComposite));
  if (filters.minDividendYield)
    sp.set("minDividend", String(filters.minDividendYield));
  if (filters.maxDebtToEquity !== undefined)
    sp.set("maxDebt", String(filters.maxDebtToEquity));
  if (filters.maxPe !== undefined) sp.set("maxPe", String(filters.maxPe));
  if (filters.minMarketCap) sp.set("minMcap", String(filters.minMarketCap));
  if (filters.maxMarketCap) sp.set("maxMcap", String(filters.maxMarketCap));
  if (filters.dividendOnly) sp.set("divOnly", "1");

  return sp;
}
