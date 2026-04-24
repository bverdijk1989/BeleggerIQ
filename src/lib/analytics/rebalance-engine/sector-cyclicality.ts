import type { CyclicalityLevel } from "@/types/rebalance";

/**
 * Sector → cyclicality mapping. Gebruikt voor het beoordelen of een zware
 * positie extra kwetsbaar is in een downturn. Vervang later door een
 * dynamische bron (bv. per-sector beta of GICS mapping) zodra beschikbaar.
 */

const CYCLICALITY_MAP: Record<string, CyclicalityLevel> = {
  Energy: "high",
  Materials: "high",
  "Consumer Discretionary": "high",
  Industrials: "high",

  Financials: "medium",
  "Real Estate": "medium",
  "Communication Services": "medium",
  Technology: "medium",

  Healthcare: "low",
  "Consumer Staples": "low",
  Utilities: "low",
  Diversified: "low",
};

export function sectorCyclicality(
  sector: string | null | undefined,
): CyclicalityLevel {
  if (!sector) return "medium";
  return CYCLICALITY_MAP[sector] ?? "medium";
}

export function isCyclical(
  sector: string | null | undefined,
): boolean {
  return sectorCyclicality(sector) === "high";
}
