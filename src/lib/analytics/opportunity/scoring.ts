import type { OpportunitySignal } from "@/lib/analytics/opportunity-radar";

import {
  CONFIDENCE_TIER_TO_NUMBER,
  type OpportunityRiskLevel,
  type OpportunityType,
} from "./types";

/**
 * Scoring-helpers — pure functies. Bepalen `confidence` (numeric) en
 * `riskLevel` per kandidaat zonder de onderliggende score aan te raken.
 *
 * Afspraken:
 *  - `confidence` is de **maximum** numerieke confidence over de
 *    publieke signalen die op deze kandidaat triggerden — een
 *    optimistische maat (de gebruiker krijgt het sterkste signaal).
 *  - `riskLevel` wordt afgeleid uit het **type** + de confidence:
 *    momentum-reversal is structureel fragiel, dus minimaal MEDIUM
 *    risk ongeacht confidence. Andere types: HIGH conf → LOW risk,
 *    MEDIUM conf → MEDIUM risk, LOW conf → HIGH risk.
 */

/**
 * Derive numerieke confidence (0..1) uit een lijst publieke signalen.
 * Pakt het maximum tier-getal — als ten minste één HIGH-tier signaal
 * triggert, krijgt de kandidaat de hoogste confidence.
 */
export function deriveConfidence(
  publicSignals: OpportunitySignal[],
): number {
  if (publicSignals.length === 0) return 0;
  let max = 0;
  for (const sig of publicSignals) {
    const numeric = CONFIDENCE_TIER_TO_NUMBER[sig.confidence] ?? 0;
    if (numeric > max) max = numeric;
  }
  return Number(max.toFixed(2));
}

/**
 * Bepaal risiconiveau. Pure functie: deterministisch en testbaar.
 *
 * Regel-volgorde (eerste match wint):
 *   1. MOMENTUM_REVERSAL → minimaal MEDIUM, HIGH bij confidence < 0.5.
 *   2. confidence < 0.5 → HIGH risk
 *   3. confidence ≥ 0.8 → LOW risk
 *   4. anders → MEDIUM
 */
export function deriveRiskLevel(
  type: OpportunityType,
  confidence: number,
): OpportunityRiskLevel {
  if (type === "MOMENTUM_REVERSAL") {
    return confidence < 0.5 ? "HIGH" : "MEDIUM";
  }
  if (confidence < 0.5) return "HIGH";
  if (confidence >= 0.8) return "LOW";
  return "MEDIUM";
}

/**
 * Bouw een compacte rationale-zin (NL) uit het primaire signaal.
 * Pakt de eerste rationale-bullet en strip eventuele trailing-period
 * voor consistente concatenatie. Levert "—" wanneer er geen rationale
 * is (defensief — de radar-engine vult deze altijd, maar voor edge-
 * cases handhaven we een fallback).
 */
export function buildRationale(signal: OpportunitySignal): string {
  if (!signal.rationale || signal.rationale.length === 0) return "—";
  const first = signal.rationale[0]!;
  return first.trim();
}
