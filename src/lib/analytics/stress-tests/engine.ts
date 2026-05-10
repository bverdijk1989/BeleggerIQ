/**
 * Stress-test engine — pure functie van portefeuille + scenario naar
 * indicatieve impact-cijfers.
 *
 * **Aannames** (Simons-laag): per-positie shock = sector-shock × bèta-
 * proxy + currency-shock voor niet-base-currency posities. Geen
 * propagatie tussen positions, geen sequence-of-returns. Het is een
 * lineaire scenario-mapping, niet een echte simulatie.
 */

import type { ISODateString } from "@/types/common";

import { classifySector, type SectorBucket } from "../macro/regime";
import type {
  StressPositionImpact,
  StressScenarioDefinition,
  StressTestResult,
} from "./types";

// ============================================================
//  Position-input shape
// ============================================================

export interface StressPositionInput {
  ticker: string;
  name: string;
  sector: string | null;
  /** Marktwaarde in base currency. */
  marketValueBase: number;
  /** Asset-class: "EQUITY" | "BOND" | "CASH" | etc. */
  assetClass: string;
  /** Currency van het instrument. */
  currency: string;
  /** Bèta — default 1.0 wanneer onbekend. */
  beta?: number | null;
}

export interface RunStressTestInput {
  scenario: StressScenarioDefinition;
  /** Posities (incl. cash) van de portefeuille. */
  positions: StressPositionInput[];
  /** Cash-balans in base currency — wordt apart gemodelleerd. */
  cashBalance: number;
  baseCurrency: string;
  /** Totale portfolio-waarde — voor weight-berekening. */
  totalValue: number;
  /** Optionele asOf voor reproduceerbare tests. */
  asOf?: ISODateString;
}

const TOP_N = 3;
const NEUTRAL_BETA = 1.0;

// ============================================================
//  Hoofd-engine
// ============================================================

export function runStressTest(input: RunStressTestInput): StressTestResult {
  const { scenario, positions, cashBalance, totalValue } = input;
  const impacts: StressPositionImpact[] = [];
  const warnings: string[] = [];

  if (totalValue <= 0) {
    warnings.push("Totale portefeuille-waarde is 0 — impact niet berekend.");
  }

  // 1. Cash-impact
  if (cashBalance > 0 && totalValue > 0) {
    const cashWeight = cashBalance / totalValue;
    impacts.push({
      ticker: "CASH",
      name: "Cash",
      sector: null,
      weight: cashWeight,
      shock: scenario.cashShock,
      contribution: cashWeight * scenario.cashShock,
      marketValueBase: cashBalance,
    });
  }

  // 2. Per-positie shock-mapping
  for (const pos of positions) {
    if (totalValue <= 0) continue;
    const weight = pos.marketValueBase / totalValue;

    // Asset-class-specifieke shock
    let shock: number;
    if (pos.assetClass === "BOND") {
      shock = scenario.bondShock;
    } else if (pos.assetClass === "CASH") {
      shock = scenario.cashShock;
    } else {
      // Equity / ETF / commodity — sector-shock × beta-proxy.
      const bucket = classifySector(pos.sector);
      const sectorShock = lookupSectorShock(scenario, bucket);
      const beta = typeof pos.beta === "number" ? pos.beta : NEUTRAL_BETA;
      shock = sectorShock * beta;
    }

    // Currency-shock voor niet-base-currency posities.
    if (
      pos.currency &&
      pos.currency !== input.baseCurrency &&
      scenario.currencyShock !== 0
    ) {
      // Currency-shock is additief op de equity-shock.
      shock += scenario.currencyShock;
    }

    impacts.push({
      ticker: pos.ticker,
      name: pos.name,
      sector: pos.sector,
      weight,
      shock,
      contribution: weight * shock,
      marketValueBase: pos.marketValueBase,
    });
  }

  // 3. Aggregeer
  const portfolioImpactPct = impacts.reduce((s, i) => s + i.contribution, 0);
  const portfolioImpactAmount = portfolioImpactPct * totalValue;

  // 4. Top-N losers / winners (op contribution)
  const sortedByContribution = [...impacts].sort(
    (a, b) => a.contribution - b.contribution,
  );
  const biggestLosers = sortedByContribution.slice(0, TOP_N);
  const biggestWinners = sortedByContribution.slice(-TOP_N).reverse();

  // 5. Defensive strength (0..100)
  const defensiveStrength = clamp(
    100 + portfolioImpactPct * 200, // -25% impact → 50; -50% → 0; 0% → 100
    0,
    100,
  );

  // 6. Verdict-zin (Lynch-laag)
  const verdict = buildVerdict(scenario, portfolioImpactPct);

  // 7. Data-quality warnings
  const noBetaCount = positions.filter(
    (p) => typeof p.beta !== "number",
  ).length;
  if (noBetaCount > positions.length * 0.5 && positions.length > 0) {
    warnings.push(
      `${noBetaCount} van ${positions.length} posities zonder bèta — gebruikt 1.0 als proxy.`,
    );
  }
  const unknownSectorCount = positions.filter(
    (p) => !p.sector || classifySector(p.sector) === "unknown",
  ).length;
  if (unknownSectorCount > 0) {
    warnings.push(
      `${unknownSectorCount} positie(s) zonder sector-classificatie — gebruikt default-shock.`,
    );
  }

  return {
    scenario: scenario.id,
    label: scenario.label,
    description: scenario.description,
    severity: scenario.severity,
    portfolioImpactPct,
    portfolioImpactAmount,
    biggestLosers,
    biggestWinners,
    defensiveStrength: Math.round(defensiveStrength),
    verdict,
    warnings,
    assumptions: scenario.assumptions,
  };
}

// ============================================================
//  Helpers
// ============================================================

function lookupSectorShock(
  scenario: StressScenarioDefinition,
  bucket: SectorBucket,
): number {
  return scenario.sectorShocks[bucket] ?? scenario.sectorShocks.unknown ?? 0;
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function buildVerdict(
  scenario: StressScenarioDefinition,
  impactPct: number,
): string {
  const pctStr = `${(impactPct * 100).toFixed(1)}%`;
  if (impactPct > 0) {
    return `In ${scenario.label.toLowerCase()} zou je portefeuille ongeveer ${pctStr} in waarde stijgen — gunstige tilt voor dit scenario.`;
  }
  if (impactPct >= -0.05) {
    return `${scenario.label} zou je portefeuille slechts ${pctStr} raken — defensieve mix houdt stand.`;
  }
  if (impactPct >= -0.15) {
    return `${scenario.label} zou je portefeuille rond ${pctStr} terugbrengen — overweeg of dit binnen je tolerantie valt.`;
  }
  return `${scenario.label} zou je portefeuille fors raken (${pctStr}). Overweeg defensieve hedge of cash-buffer.`;
}
