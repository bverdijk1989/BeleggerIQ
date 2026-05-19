/**
 * Risk Trend — snapshot-builder (Module 30).
 *
 * Pure functie: portfolio-view + optionele data-depth → compact
 * `RiskTrendSnapshot`. Geen I/O.
 *
 * **Privacy/data-minimalisatie**:
 *  - Alleen geaggregeerde scores en fracties
 *  - Geen ticker-namen, geen bedragen
 *  - ≤ 200 bytes JSON-payload
 */

import type { PortfolioView } from "@/lib/analytics/portfolio-view";

import type { RiskTrendSnapshot } from "./types";

export interface BuildRiskTrendSnapshotInput {
  view: PortfolioView;
  /** Data-depth score uit M26, 0..100. Optioneel. */
  dataDepthScore?: number | null;
}

export function buildRiskTrendSnapshot(
  input: BuildRiskTrendSnapshotInput,
): RiskTrendSnapshot {
  const view = input.view;
  const risk = view.risk;

  // Drift: gemiddelde |currentWeight - targetWeight| over rebalance-rows
  // waar target > 0. Alleen meten als ≥ 1 row. Defensief voor stub-views
  // zonder rebalance-plan.
  let driftAvg: number | null = null;
  const allRecs = view.rebalance?.recommendations ?? [];
  const recs = allRecs.filter(
    (r) =>
      typeof r.targetWeight === "number" &&
      r.targetWeight > 0 &&
      typeof r.currentWeight === "number",
  );
  if (recs.length > 0) {
    const totalAbs = recs.reduce(
      (sum, r) => sum + Math.abs(r.currentWeight - r.targetWeight),
      0,
    );
    driftAvg = totalAbs / recs.length;
  }

  return {
    schemaVersion: 1,
    healthScore: round1(view.health.score),
    riskScore: round1(risk.riskScore ?? null),
    concentrationHhi: round4(risk.concentrationHhi),
    largestPositionWeight: round4(risk.largestPositionWeight),
    top5Weight: round4(risk.top5Weight ?? null),
    sectorHhi: round4(risk.sectorConcentrationHhi),
    volatility: round4(risk.portfolioVolatility ?? null),
    maxDrawdown: round4(risk.maxDrawdown ?? null),
    foreignCurrencyExposure: round4(risk.foreignCurrencyExposure ?? null),
    dataDepthScore: round1(input.dataDepthScore ?? null),
    driftAvg: round4(driftAvg),
    positionCount: view.summary.positionCount,
  };
}

function round1(v: number | null): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  return Math.round(v * 10) / 10;
}

function round4(v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return Math.round(v * 10000) / 10000;
}
