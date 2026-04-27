import type { AssetClass, Holding } from "@/types/portfolio";

/**
 * Regime/sector-classificatie helpers gebruikt door de scenario-shocks.
 *
 * Pure functies, geen data-fetches. Alle tabellen staan als constants
 * zodat de output reproduceerbaar is.
 */

export type SectorBucket =
  | "tech"
  | "growth"
  | "consumer-discretionary"
  | "consumer-staples"
  | "financials"
  | "energy"
  | "materials"
  | "industrials"
  | "healthcare"
  | "real-estate"
  | "utilities"
  | "communication"
  | "unknown";

const SECTOR_KEYWORDS: Array<[RegExp, SectorBucket]> = [
  [/tech/i, "tech"],
  [/software|semic|cloud|internet|artif/i, "tech"],
  [/staple|food|beverage|household|tobacco/i, "consumer-staples"],
  [/discretion|retail|automot|consumer\s+disc/i, "consumer-discretionary"],
  [/financial|bank|insur/i, "financials"],
  [/energy|oil|gas/i, "energy"],
  [/material|metal|mining|chemic/i, "materials"],
  [/industrial|aerospace|defense|machinery/i, "industrials"],
  [/health|pharma|biotech|medical|life\s+scien/i, "healthcare"],
  [/real\s*estate|reit|property/i, "real-estate"],
  [/utilit/i, "utilities"],
  [/communic|telecom|media/i, "communication"],
];

export function classifySector(sector: string | null | undefined): SectorBucket {
  if (!sector) return "unknown";
  for (const [pattern, bucket] of SECTOR_KEYWORDS) {
    if (pattern.test(sector)) return bucket;
  }
  return "unknown";
}

/**
 * Defensieve sectoren — krijgen kleinere shocks bij market-crash en
 * recessie scenario's. Gebruikt in scenarios.ts.
 */
export const DEFENSIVE_SECTORS: SectorBucket[] = [
  "consumer-staples",
  "healthcare",
  "utilities",
];

export function isDefensiveSector(bucket: SectorBucket): boolean {
  return DEFENSIVE_SECTORS.includes(bucket);
}

/**
 * Asset-class shock-multiplier per scenario. Toegevoegd bovenop de
 * sector-shock om bv. ETFs af te zwakken (gediversificeerd) en bonds
 * te accentueren (rate-sensitive).
 */
export function assetClassShockMultiplier(
  assetClass: AssetClass,
): { rates: number; crash: number; recession: number; usd: number } {
  switch (assetClass) {
    case "BOND":
      return { rates: 1.5, crash: 0.4, recession: 0.5, usd: 0.5 };
    case "ETF":
      return { rates: 0.8, crash: 0.7, recession: 0.6, usd: 0.7 };
    case "REIT":
      return { rates: 1.6, crash: 1.1, recession: 1.2, usd: 0.6 };
    case "COMMODITY":
      return { rates: 0.5, crash: 0.8, recession: 0.7, usd: 1.4 };
    case "CRYPTO":
      return { rates: 1.2, crash: 1.8, recession: 1.5, usd: 1.0 };
    case "CASH":
      return { rates: 0, crash: 0, recession: 0, usd: 0 };
    case "EQUITY":
    case "OTHER":
    default:
      return { rates: 1, crash: 1, recession: 1, usd: 1 };
  }
}

/**
 * Bepaalt of een holding "foreign currency" exposure heeft t.o.v. base.
 * Gebruikt in USD_UP_10 scenario.
 */
export function isForeignCurrency(
  holding: Holding,
  baseCurrency: string,
): boolean {
  return holding.currency.toUpperCase() !== baseCurrency.toUpperCase();
}
