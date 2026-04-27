import {
  scanOpportunities,
  type OpportunityCandidate,
  type OpportunityReport,
  type ScanOpportunitiesInput,
} from "@/lib/analytics/opportunity-radar";

import { filterPublicSignals, mapSignalType, pickPrimarySignal } from "./signals";
import {
  buildRationale,
  deriveConfidence,
  deriveRiskLevel,
} from "./scoring";
import {
  OPPORTUNITY_HORIZON,
  type OpportunityResult,
  type OpportunityType,
} from "./types";

/**
 * Adapter rondom `scanOpportunities` (opportunity-radar).
 *
 * Pipeline:
 *   1. Roep de bestaande radar aan met de meegegeven input.
 *   2. Filter kandidaten zodat ze ten minste één publiek signaal
 *      hebben (van de 5 ondersteunde types).
 *   3. Kies het sterkste publieke signaal als primaire `opportunityType`.
 *   4. Map naar `OpportunityResult`-shape met `expectedHorizon`,
 *      `riskLevel` en `confidence` als number.
 *   5. Sorteer aflopend op score (default voor de UI).
 *
 * Pure functie boven op een pure engine — geen I/O. Reproduceerbaar
 * met `config.now` override.
 */

export interface ScanOpportunityRadarInput extends ScanOpportunitiesInput {
  /** Filter de output op specifieke `OpportunityType`-waarden. */
  includeTypes?: OpportunityType[];
  /** Maximaal aantal resultaten — default 20. */
  limit?: number;
}

export interface OpportunityRadarReport {
  generatedAt: string;
  results: OpportunityResult[];
  /** Tellers per type over de output. */
  countByType: Record<OpportunityType, number>;
  /** Originele radar-rapport (voor wie de volledige 8-signaal output wil). */
  underlying: OpportunityReport;
}

export function scanOpportunityRadar(
  input: ScanOpportunityRadarInput,
): OpportunityRadarReport {
  const underlying = scanOpportunities(input);

  const limit = input.limit ?? 20;
  const includeFilter =
    input.includeTypes && input.includeTypes.length > 0
      ? new Set(input.includeTypes)
      : null;

  const results: OpportunityResult[] = [];
  for (const candidate of underlying.candidates) {
    const result = mapCandidate(candidate);
    if (!result) continue;
    if (includeFilter && !includeFilter.has(result.opportunityType)) continue;
    results.push(result);
  }

  // Sorteer aflopend op score; tie-break op confidence desc, dan symbol.
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.symbol.localeCompare(b.symbol);
  });
  const top = results.slice(0, limit);

  return {
    generatedAt: underlying.scannedAt,
    results: top,
    countByType: countByType(top),
    underlying,
  };
}

// ============================================================
//  Candidate → Result mapping (pure)
// ============================================================

function mapCandidate(
  candidate: OpportunityCandidate,
): OpportunityResult | null {
  const publicSignals = filterPublicSignals(candidate.signals);
  if (publicSignals.length === 0) return null;

  const primary = pickPrimarySignal(publicSignals);
  if (!primary) return null;

  const opportunityType = mapSignalType(primary.type);
  if (!opportunityType) return null;

  const confidence = deriveConfidence(publicSignals);
  const riskLevel = deriveRiskLevel(opportunityType, confidence);

  return {
    symbol: candidate.ticker,
    opportunityType,
    score: candidate.score,
    confidence,
    expectedHorizon: OPPORTUNITY_HORIZON[opportunityType],
    riskLevel,
    rationale: buildRationale(primary),
    source: candidate.source,
    detectedAt: primary.detectedAt,
  };
}

function countByType(
  results: OpportunityResult[],
): Record<OpportunityType, number> {
  const out: Record<OpportunityType, number> = {
    QUALITY_PULLBACK: 0,
    VALUE_MISPRICING: 0,
    MOMENTUM_REVERSAL: 0,
    UNDERWEIGHT_HIGH_CONVICTION: 0,
    ETF_REBALANCE_OPPORTUNITY: 0,
  };
  for (const r of results) out[r.opportunityType] += 1;
  return out;
}
