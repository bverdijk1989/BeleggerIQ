import type { Currency } from "@/types/common";

import type { HoldingValuation } from "./valuation";

/**
 * Scenario-analyse. Pure functies die de portefeuille herwaarderen onder
 * eenvoudige schokken. Bedoeld als illustratief — geen full-blown stress test.
 *
 * Conventies:
 *  - Alle deltas worden genormaliseerd t.o.v. de huidige `totalValue` (incl. cash).
 *  - Cash wordt mee-meegeschaald bij market-shocks niet, maar wél bij FX-shocks
 *    (wanneer `cashCurrency` niet base is). Cash in base currency is neutraal.
 */

export interface ScenarioResult {
  id: string;
  label: string;
  description: string;
  projectedValue: number;
  delta: number;
  deltaPct: number;
}

export interface ScenarioInput {
  valuations: HoldingValuation[];
  totalValue: number;
  baseCurrency: Currency;
  /** Cashbedrag en valuta, voor FX-scenarios. Default: base currency. */
  cashBalance?: number;
  cashCurrency?: Currency;
}

// ============================================================
//  Building blocks
// ============================================================

/**
 * FX-shock: `shiftBase` is de relatieve versterking van de base currency
 * t.o.v. alle vreemde valuta. +0.10 = base 10% sterker; alle niet-base
 * posities gaan naar `marketValueBase / (1 + shiftBase)`.
 */
export function applyFxShock(input: ScenarioInput, shiftBase: number): number {
  if (!Number.isFinite(shiftBase)) return input.totalValue;
  const { valuations, baseCurrency, cashBalance = 0, cashCurrency } = input;
  const divisor = 1 + shiftBase;
  if (divisor <= 0) return 0;

  const domestic = valuations
    .filter((v) => v.holding.currency === baseCurrency)
    .reduce((sum, v) => sum + v.marketValueBase, 0);
  const foreign = valuations
    .filter((v) => v.holding.currency !== baseCurrency)
    .reduce((sum, v) => sum + v.marketValueBase, 0);

  const cashContribution =
    cashCurrency && cashCurrency !== baseCurrency
      ? cashBalance / divisor
      : cashBalance;

  return domestic + foreign / divisor + cashContribution;
}

/**
 * Market-shock: percentage `delta` (bv. -0.2) wordt toegepast op alle posities
 * behalve cash. Cash blijft neutraal.
 */
export function applyMarketShock(
  input: ScenarioInput,
  delta: number,
): number {
  if (!Number.isFinite(delta)) return input.totalValue;
  const { valuations, cashBalance = 0 } = input;
  const shocked = valuations.reduce(
    (sum, v) => sum + v.marketValueBase * (1 + delta),
    0,
  );
  return shocked + cashBalance;
}

/**
 * Sector-shock: alleen posities in `sector` worden met `delta` geraakt.
 * Andere posities en cash blijven flat.
 */
export function applySectorShock(
  input: ScenarioInput,
  sector: string,
  delta: number,
): number {
  if (!Number.isFinite(delta)) return input.totalValue;
  const { valuations, cashBalance = 0 } = input;
  let shocked = 0;
  for (const v of valuations) {
    if (v.holding.sector === sector) {
      shocked += v.marketValueBase * (1 + delta);
    } else {
      shocked += v.marketValueBase;
    }
  }
  return shocked + cashBalance;
}

// ============================================================
//  Default scenario set
// ============================================================

export function runDefaultScenarios(input: ScenarioInput): ScenarioResult[] {
  const { totalValue, baseCurrency, valuations } = input;

  const results: ScenarioResult[] = [];

  results.push(
    buildResult(
      {
        id: "fx.base.strengthens",
        label: `${baseCurrency} +10%`,
        description: `${baseCurrency} versterkt 10% tegenover vreemde valuta.`,
      },
      applyFxShock(input, 0.1),
      totalValue,
    ),
  );

  results.push(
    buildResult(
      {
        id: "fx.base.weakens",
        label: `${baseCurrency} −10%`,
        description: `${baseCurrency} verzwakt 10%, buitenlandse posities worden meer waard.`,
      },
      applyFxShock(input, -0.1),
      totalValue,
    ),
  );

  results.push(
    buildResult(
      {
        id: "market.down.20",
        label: "Markt −20%",
        description: "Brede neergang van 20% op alle posities.",
      },
      applyMarketShock(input, -0.2),
      totalValue,
    ),
  );

  results.push(
    buildResult(
      {
        id: "market.up.15",
        label: "Markt +15%",
        description: "Hersteljaar met 15% upside over de linie.",
      },
      applyMarketShock(input, 0.15),
      totalValue,
    ),
  );

  // Sector-scenario alleen als we een dominante sector kunnen identificeren.
  const topSector = resolveTopSector(valuations);
  if (topSector) {
    results.push(
      buildResult(
        {
          id: "sector.topshock",
          label: `${topSector.label} −30%`,
          description: `Stresstest: sector ${topSector.label} corrigeert 30%, rest blijft flat.`,
        },
        applySectorShock(input, topSector.label, -0.3),
        totalValue,
      ),
    );
  }

  return results;
}

// ============================================================
//  Internals
// ============================================================

function buildResult(
  meta: Pick<ScenarioResult, "id" | "label" | "description">,
  projectedValue: number,
  totalValue: number,
): ScenarioResult {
  const delta = projectedValue - totalValue;
  const deltaPct = totalValue > 0 ? delta / totalValue : 0;
  return { ...meta, projectedValue, delta, deltaPct };
}

function resolveTopSector(
  valuations: HoldingValuation[],
): { label: string; weight: number } | null {
  if (valuations.length === 0) return null;
  const totals = new Map<string, number>();
  let total = 0;
  for (const v of valuations) {
    const sector = v.holding.sector;
    if (!sector) continue;
    totals.set(sector, (totals.get(sector) ?? 0) + v.marketValueBase);
    total += v.marketValueBase;
  }
  if (total === 0) return null;
  let bestLabel: string | null = null;
  let bestValue = 0;
  for (const [label, value] of totals) {
    if (value > bestValue) {
      bestLabel = label;
      bestValue = value;
    }
  }
  if (!bestLabel) return null;
  return { label: bestLabel, weight: bestValue / total };
}
