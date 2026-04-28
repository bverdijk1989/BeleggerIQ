/**
 * Per-positie tax-indicators.
 *
 * Drie flags die elk een non-trivial fiscaal effect hebben:
 *
 *   - **us-dividend**          US-bron → 30% standaard / 15% verdrag.
 *                              Belangrijk om W-8BEN te checken.
 *   - **reit-warning**         REITs distribueren grotendeels als
 *                              "ordinary dividend" zonder QDI-status,
 *                              en sommige verdragen werken anders voor
 *                              REITs (US-REIT: typisch geen verlaagd tarief).
 *   - **accumulating-etf**     Accumulerende ETF's keren géén cash uit;
 *                              er is dus geen echte dividendinhouding,
 *                              maar de bezittingen zijn wél box-3
 *                              relevant. UI moet 'em apart benoemen om
 *                              "ik zie geen dividend" te ontkrachten.
 *
 * Detectie is heuristisch — we hebben geen formele asset-class-feed.
 * Caller mag elk positie-record verrijken met expliciete metadata
 * waar beschikbaar.
 */

import { resolveCountry } from "./country";

export type IndicatorTag =
  | "us-dividend"
  | "reit-warning"
  | "accumulating-etf"
  | "no-direct-cashflow";

export interface PositionLike {
  ticker: string | null;
  isin: string | null;
  name?: string | null;
  assetClass?: string | null;
  /** Indien beschikbaar uit ETF-metadata: ACC / DIST. */
  distributionPolicy?: "ACCUMULATING" | "DISTRIBUTING" | null;
}

export interface IndicatorResult {
  ticker: string | null;
  isin: string | null;
  tags: IndicatorTag[];
  reasons: string[];
}

const REIT_NAME_HINTS = [
  /\breit\b/i,
  /real\s*estate/i,
  /real\s*property/i,
  /\bvastgoed\b/i,
  /\bproperty\s+trust\b/i,
];

const ACC_NAME_HINTS = [
  /\(acc\)/i,
  /accumulating/i,
  /\bacc\b/i,
];

const DIST_NAME_HINTS = [
  /\(dist\)/i,
  /distributing/i,
];

export function deriveIndicators(p: PositionLike): IndicatorResult {
  const tags = new Set<IndicatorTag>();
  const reasons: string[] = [];

  const country = resolveCountry({ isin: p.isin, ticker: p.ticker });
  if (country === "US") {
    tags.add("us-dividend");
    reasons.push(
      "US-bron: standaard 30% Amerikaanse dividendbelasting; verlaag naar 15% via W-8BEN bij je broker.",
    );
  }

  // REIT-detectie: assetClass=REIT óf naam-hint
  const isReitByClass = p.assetClass?.toUpperCase() === "REIT";
  const isReitByName =
    p.name && REIT_NAME_HINTS.some((re) => re.test(p.name as string));
  if (isReitByClass || isReitByName) {
    tags.add("reit-warning");
    reasons.push(
      "REIT: vrijwel volledige uitkering verplicht; veel REIT-dividenden vallen niet onder QDI-treaty-tarieven.",
    );
  }

  // Accumulating ETF
  const isEtf = p.assetClass?.toUpperCase() === "ETF";
  const policyAcc = p.distributionPolicy === "ACCUMULATING";
  const policyDist = p.distributionPolicy === "DISTRIBUTING";
  if (isEtf) {
    if (policyAcc) {
      tags.add("accumulating-etf");
      tags.add("no-direct-cashflow");
      reasons.push(
        "Accumulerende ETF: keert geen cash-dividend uit. Wel box-3 relevant; ingehouden bronbelasting op fund-niveau is meestal niet terugvorderbaar.",
      );
    } else if (!policyDist && p.name) {
      // Heuristiek alleen als beleid niet expliciet bekend
      const accHint = ACC_NAME_HINTS.some((re) => re.test(p.name as string));
      const distHint = DIST_NAME_HINTS.some((re) => re.test(p.name as string));
      if (accHint && !distHint) {
        tags.add("accumulating-etf");
        tags.add("no-direct-cashflow");
        reasons.push(
          "Naam suggereert accumulerend (bv. 'Acc'). Verifieer in fund-factsheet — geen cash-dividenden te verwachten.",
        );
      }
    }
  }

  return {
    ticker: p.ticker,
    isin: p.isin,
    tags: [...tags],
    reasons,
  };
}
