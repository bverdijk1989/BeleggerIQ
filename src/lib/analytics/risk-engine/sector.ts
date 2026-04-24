import type { AllocationSlice } from "@/types/allocation";

import { aggregateAllocation } from "../valuation";
import type { HoldingValuation } from "../valuation";

import {
  classify,
  continuousRiskScore,
  type CoreRiskClass,
  type RiskThresholds,
} from "./thresholds";

/**
 * Sector-module. Berekent sector-allocatie, grootste sector en klasse
 * op basis van de `sectorWeight` threshold.
 */

export function computeSectorAllocation(
  valuations: HoldingValuation[],
  totalValue: number,
): AllocationSlice[] {
  return aggregateAllocation(
    valuations,
    (v) => v.holding.sector ?? null,
    totalValue,
  );
}

export function topSector(
  slices: AllocationSlice[],
): { label: string; weight: number } | undefined {
  const top = slices[0];
  if (!top) return undefined;
  return { label: top.label, weight: top.weight };
}

export function classifyTopSectorWeight(
  topSectorWeight: number,
  thresholds: RiskThresholds,
): CoreRiskClass {
  return classify(topSectorWeight, thresholds.sectorWeight);
}

export function sectorRiskScore(
  topSectorWeight: number,
  thresholds: RiskThresholds,
): number {
  return continuousRiskScore(topSectorWeight, thresholds.sectorWeight);
}
