import { isCyclical } from "@/lib/analytics/rebalance-engine";
import type { FundamentalsSnapshot } from "@/types/factor";
import type { Holding } from "@/types/portfolio";

import { scoreCapitalEfficiency } from "./capital-efficiency";
import { scoreEarningsQuality } from "./earnings-quality";
import { scoreMoat } from "./moat";
import {
  BUSINESS_THRESHOLDS,
  BUSINESS_WEIGHTS,
  type BusinessLabel,
  type BusinessQualityResult,
} from "./types";

/**
 * Business Quality engine — orkestrator.
 *
 * Pure functie. Roept de drie deelscores aan, aggregeert tot composite,
 * leidt label + 10y-hold-indicator af, en bouwt confidence + warnings.
 *
 * Reproduceerbaar: identieke (fundamentals, holding) → identiek
 * resultaat. Alle drempels staan in `./types.ts`.
 */

export interface ComputeBusinessQualityInput {
  /** Required: ticker uit holding/factor. */
  ticker: string;
  asOf?: string;
  fundamentals: FundamentalsSnapshot | null;
  /** Holding voor sector-cyclicity-check + asset-class. */
  holding?: Holding | null;
}

export function computeBusinessQuality(
  input: ComputeBusinessQualityInput,
): BusinessQualityResult {
  const asOf = input.asOf ?? input.fundamentals?.asOf ?? new Date().toISOString();

  const moat = scoreMoat(input.fundamentals);
  const earnings = scoreEarningsQuality(input.fundamentals);
  const capital = scoreCapitalEfficiency(input.fundamentals);

  const composite = Math.round(
    moat.score * BUSINESS_WEIGHTS.moat +
      earnings.score * BUSINESS_WEIGHTS.earnings +
      capital.score * BUSINESS_WEIGHTS.capital,
  );

  const sectorIsCyclical = input.holding?.sector
    ? isCyclical(input.holding.sector)
    : false;

  const label = deriveLabel(composite, sectorIsCyclical);
  const confidence = Number(
    ((moat.coverage + earnings.coverage + capital.coverage) / 3).toFixed(2),
  );

  const canHoldLongTerm = decideLongTerm({
    label,
    moat: moat.score,
    earnings: earnings.score,
    capital: capital.score,
    confidence,
  });

  const warnings: string[] = [];
  if (!input.fundamentals) {
    warnings.push("Fundamentals ontbreken volledig — score is neutrale fallback.");
  } else {
    if (moat.coverage < 0.5) warnings.push("Moat-data <50% gedekt.");
    if (earnings.coverage < 0.5) warnings.push("Earnings-quality <50% gedekt.");
    if (capital.coverage < 0.5) warnings.push("Capital-efficiency <50% gedekt.");
  }
  if (
    sectorIsCyclical &&
    composite >= BUSINESS_THRESHOLDS.compounderMin
  ) {
    // Een hoge composite-score in een cyclische sector wijst typisch
    // op piek-margin-moment; label is al gedowngrade naar CYCLICAL,
    // maar we waarschuwen expliciet.
    warnings.push(
      `Sector ${input.holding?.sector ?? ""} is cyclisch — composite ${composite}/100 reflecteert mogelijk piek-marges.`,
    );
  }

  return {
    ticker: input.ticker,
    asOf,
    moatScore: moat.score,
    earningsStability: earnings.score,
    capitalEfficiency: capital.score,
    businessQualityScore: composite,
    label,
    canHoldLongTerm,
    confidence,
    rationale: {
      moat: moat.rationale,
      earnings: earnings.rationale,
      capital: capital.rationale,
    },
    warnings,
  };
}

// ============================================================
//  Label-derivation (pure)
// ============================================================

function deriveLabel(
  composite: number,
  sectorIsCyclical: boolean,
): BusinessLabel {
  if (composite >= BUSINESS_THRESHOLDS.compounderMin && !sectorIsCyclical) {
    return "COMPOUNDER";
  }
  if (composite <= BUSINESS_THRESHOLDS.speculativeMax) {
    return "SPECULATIVE";
  }
  return "CYCLICAL";
}

// ============================================================
//  10-year hold (pure)
// ============================================================

function decideLongTerm(params: {
  label: BusinessLabel;
  moat: number;
  earnings: number;
  capital: number;
  confidence: number;
}): boolean {
  if (params.label !== "COMPOUNDER") return false;
  if (params.confidence < BUSINESS_THRESHOLDS.longTermMinConfidence) return false;
  const min = BUSINESS_THRESHOLDS.longTermPerScore;
  return params.moat >= min && params.earnings >= min && params.capital >= min;
}

// ============================================================
//  Batch helper voor portefeuille-niveau gebruik
// ============================================================

export interface ComputeBusinessQualityBatchEntry {
  ticker: string;
  fundamentals: FundamentalsSnapshot | null;
  holding?: Holding | null;
}

export interface BusinessQualityBatchResult {
  byTicker: Map<string, BusinessQualityResult>;
  /** Aflopend gesorteerd op `businessQualityScore`. */
  ranked: BusinessQualityResult[];
}

export function computeBusinessQualityBatch(
  entries: ComputeBusinessQualityBatchEntry[],
): BusinessQualityBatchResult {
  const results = entries.map((e) =>
    computeBusinessQuality({
      ticker: e.ticker,
      fundamentals: e.fundamentals,
      holding: e.holding,
    }),
  );
  const byTicker = new Map(results.map((r) => [r.ticker, r]));
  const ranked = [...results].sort(
    (a, b) =>
      b.businessQualityScore - a.businessQualityScore ||
      a.ticker.localeCompare(b.ticker),
  );
  return { byTicker, ranked };
}
