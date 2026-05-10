/**
 * Portfolio-classifier: map een PortfolioView naar een
 * `Map<AssetClassKey, weight>` zodat de macro-engine een impact-analyse
 * kan doen.
 *
 * **Heuristisch** maar transparant. Voor MVP gebruiken we sector-tags,
 * `holding.assetClass` en factor-scores om equity in groei/value/defensive/
 * cyclical te bucketen. Latere versies kunnen rijkere classificatie inbouwen.
 */

import type { PortfolioView } from "../portfolio-view";
import { classifySector } from "../macro/regime";

import type { AssetClassKey } from "./types";

const CYCLICAL_SECTORS = new Set([
  "consumer-discretionary",
  "industrials",
  "financials",
  "energy",
  "materials",
  "communication",
]);

const DEFENSIVE_SECTORS = new Set([
  "consumer-staples",
  "healthcare",
  "utilities",
]);

/**
 * Map een holding naar één `AssetClassKey`. Volgorde van checks:
 *  1. assetClass = BOND → BOND_CORPORATE / BOND_GOVERNMENT (heuristic op naam)
 *  2. assetClass = COMMODITY → COMMODITIES of GOLD
 *  3. assetClass = CASH → CASH
 *  4. assetClass = REAL_ESTATE → REAL_ESTATE
 *  5. assetClass = ETF/EQUITY → bucket op sector + factor (growth vs value)
 */
export function bucketHoldingToAssetClass(
  holding: PortfolioView["valuations"][number]["holding"],
): AssetClassKey {
  const assetClass = String(holding.assetClass || "").toUpperCase();
  const name = (holding.name || "").toLowerCase();
  const ticker = (holding.ticker || "").toLowerCase();

  if (assetClass === "BOND" || /bond|treasur|gilt|aggregate|tlt|tip|ief/.test(name + ticker)) {
    if (/treasur|govt|gilt|tlt|ief|tip/.test(name + ticker)) return "BOND_GOVERNMENT";
    return "BOND_CORPORATE";
  }
  if (assetClass === "COMMODITY" || /gold|silver|oil|gas|wheat|metals?/.test(name + ticker)) {
    if (/gold|gld|silver/.test(name + ticker)) return "GOLD";
    return "COMMODITIES";
  }
  if (assetClass === "CASH" || /money market|cash/.test(name + ticker)) {
    return "CASH";
  }
  if (assetClass === "REAL_ESTATE" || /reit|real\s*estate|property/.test(name + ticker)) {
    return "REAL_ESTATE";
  }

  // Equity-bucketing
  const sector = classifySector(holding.sector);
  if (DEFENSIVE_SECTORS.has(sector)) return "EQUITY_DEFENSIVE";
  if (CYCLICAL_SECTORS.has(sector)) return "EQUITY_CYCLICAL";

  // Default: gebruik factor-score voor growth-vs-value als beschikbaar.
  const fs = holding.factorScore;
  if (fs?.subScores) {
    const growth = fs.subScores.growth ?? null;
    const value = fs.subScores.value;
    if (typeof growth === "number" && growth >= 65) return "EQUITY_GROWTH";
    if (typeof value === "number" && value >= 65) return "EQUITY_VALUE";
  }
  // Tech sector zonder duidelijk value-signaal → growth.
  if (sector === "tech" || sector === "growth") return "EQUITY_GROWTH";
  return "EQUITY_VALUE";
}

/**
 * Bouw `Map<AssetClassKey, weight>` uit een PortfolioView.
 *
 * Cash-aandeel uit `view.summary.cashBalance` wordt direct als CASH-bucket
 * meegenomen (los van assetClass-classificatie).
 */
export function buildAssetClassWeights(
  view: PortfolioView,
): Map<AssetClassKey, number> {
  const total = view.summary.totalValue;
  const map = new Map<AssetClassKey, number>();
  if (total <= 0) return map;

  const cashWeight = (view.summary.cashBalance ?? 0) / total;
  if (cashWeight > 0) map.set("CASH", cashWeight);

  for (const v of view.valuations) {
    const bucket = bucketHoldingToAssetClass(v.holding);
    const weight = v.marketValueBase / total;
    map.set(bucket, (map.get(bucket) ?? 0) + weight);
  }
  return map;
}
