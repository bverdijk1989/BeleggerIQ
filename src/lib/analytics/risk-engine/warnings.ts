import type { Currency } from "@/types/common";
import type { RiskFlag } from "@/types/risk";

import type { RiskThresholds } from "./thresholds";

/**
 * Warning builder. Vergelijkt metrics tegen thresholds en produceert
 * `RiskFlag`-objecten met stabiele `code`, severity en menselijke tekst.
 * Severity is bewust beperkt tot "moderate"/"high" zodat UI consistent kleurt.
 */

export interface PortfolioWarningInput {
  positionCount: number;
  largestPosition: { ticker: string; name: string; weight: number } | null;
  top5Weight: number;
  concentrationHhi: number;
  topSector?: { label: string; weight: number };
  foreignCurrencyExposure: number;
  baseCurrency: Currency;
  thresholds: RiskThresholds;
}

export function buildPortfolioWarnings(
  input: PortfolioWarningInput,
): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const t = input.thresholds;

  if (
    input.largestPosition &&
    input.largestPosition.weight >= t.positionWeight.high
  ) {
    flags.push({
      code: "concentration.position",
      label: "Grote positie-concentratie",
      severity:
        input.largestPosition.weight >= t.positionWeight.high * 1.5
          ? "high"
          : "moderate",
      message: `${input.largestPosition.name} is ${pct(input.largestPosition.weight)} van de portefeuille — boven ${pct(t.positionWeight.high)}.`,
      metric: input.largestPosition.weight,
      threshold: t.positionWeight.high,
    });
  }

  if (input.top5Weight >= t.top5Weight.high) {
    flags.push({
      code: "concentration.top5",
      label: "Top 5 weegt zwaar",
      severity: "high",
      message: `Top 5 posities vormen ${pct(input.top5Weight)} van de portefeuille.`,
      metric: input.top5Weight,
      threshold: t.top5Weight.high,
    });
  } else if (input.top5Weight >= t.top5Weight.low) {
    flags.push({
      code: "concentration.top5",
      label: "Top 5 redelijk geconcentreerd",
      severity: "moderate",
      message: `Top 5 posities vormen ${pct(input.top5Weight)} van de portefeuille.`,
      metric: input.top5Weight,
      threshold: t.top5Weight.high,
    });
  }

  if (input.concentrationHhi >= t.concentrationHhi.high) {
    flags.push({
      code: "concentration.hhi",
      label: "HHI overschrijdt drempel",
      severity: "high",
      message: `Herfindahl-index ${input.concentrationHhi.toFixed(2)} duidt op sterke concentratie.`,
      metric: input.concentrationHhi,
      threshold: t.concentrationHhi.high,
    });
  }

  if (
    input.topSector &&
    input.topSector.weight >= t.sectorWeight.high
  ) {
    flags.push({
      code: "concentration.sector",
      label: "Sector-bias",
      severity: "high",
      message: `Sector ${input.topSector.label} is ${pct(input.topSector.weight)} van de portefeuille.`,
      metric: input.topSector.weight,
      threshold: t.sectorWeight.high,
    });
  }

  if (input.foreignCurrencyExposure >= t.foreignCurrencyExposure.high) {
    flags.push({
      code: "exposure.currency",
      label: "Hoge valuta-exposure",
      severity: "high",
      message: `${pct(input.foreignCurrencyExposure)} van de portefeuille staat in niet-${input.baseCurrency} valuta.`,
      metric: input.foreignCurrencyExposure,
      threshold: t.foreignCurrencyExposure.high,
    });
  } else if (
    input.foreignCurrencyExposure >= t.foreignCurrencyExposure.low
  ) {
    flags.push({
      code: "exposure.currency",
      label: "Valuta-exposure om in de gaten te houden",
      severity: "moderate",
      message: `${pct(input.foreignCurrencyExposure)} staat in niet-${input.baseCurrency} valuta.`,
      metric: input.foreignCurrencyExposure,
      threshold: t.foreignCurrencyExposure.high,
    });
  }

  if (input.positionCount > 0 && input.positionCount < t.minPositions) {
    flags.push({
      code: "diversification.positions",
      label: "Beperkte spreiding",
      severity: "moderate",
      message: `${input.positionCount} posities — streef naar minimaal ${t.minPositions}.`,
      metric: input.positionCount,
      threshold: t.minPositions,
    });
  }

  return flags;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
