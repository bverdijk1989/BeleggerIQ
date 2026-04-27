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
 *
 * **Asset-class-filter**: alleen single-name-instrumenten waar "sector"
 * zinvol is (EQUITY, REIT) tellen mee in de sector-aggregatie. ETFs,
 * bonds, crypto, cash en commodities hebben per definitie geen
 * single-sector — ze als "Onbekend" tellen geeft fout-positieve
 * sector-concentratie-flags voor ETF-only portefeuilles.
 *
 * **Sector-data-filter**: EQUITY/REIT zonder sector-data tellen óók
 * niet mee; ze zouden anders een misleidende "Onbekend"-bucket vullen
 * en de UI zou een data-quality-issue als sector-bias presenteren.
 * Data-coverage is een apart signaal — surface'd via
 * `assessHoldingQuality` op de portfolio-pagina, niet hier.
 *
 * Weights blijven genormaliseerd tegen het totale portfolio-volume
 * zodat een 50% ETF + 50% tech-aandelen-portefeuille `topSector =
 * 50%` toont — wat terecht waarschuwbaar is, want de helft hangt
 * direct aan tech-prijzen.
 */

const SECTOR_ELIGIBLE_ASSET_CLASSES = new Set(["EQUITY", "REIT"]);

function hasSectorData(sector: string | null | undefined): sector is string {
  return typeof sector === "string" && sector.trim().length > 0;
}

export function computeSectorAllocation(
  valuations: HoldingValuation[],
  totalValue: number,
): AllocationSlice[] {
  const eligible = valuations.filter(
    (v) =>
      SECTOR_ELIGIBLE_ASSET_CLASSES.has(v.holding.assetClass) &&
      hasSectorData(v.holding.sector),
  );
  return aggregateAllocation(eligible, (v) => v.holding.sector ?? null, totalValue);
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
