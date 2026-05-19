/**
 * Risk Trend — server-side loader (Module 30).
 *
 * Leest bestaande `PortfolioSnapshot`-rijen via repository en decodet
 * `metrics.riskTrend`. Bij oude snapshots zonder `riskTrend` valt
 * 'em terug op de typed headline-kolommen (healthScore, volatility,
 * drawdown) + null voor wat ontbreekt.
 */

import { portfolioSnapshotRepository } from "@/lib/data";

import { buildRiskTrendReport } from "./engine";
import type {
  RiskTrendPoint,
  RiskTrendReport,
  RiskTrendSnapshot,
} from "./types";

const DEFAULT_LIMIT = 24; // ~2 jaar maandelijkse snapshots

export interface LoadRiskTrendInput {
  portfolioId: string;
  /** Hoeveel snapshots terug? Default 24. */
  limit?: number;
}

export async function loadRiskTrendReport(
  input: LoadRiskTrendInput,
): Promise<RiskTrendReport> {
  const generatedAt = new Date().toISOString();
  try {
    const rows = await portfolioSnapshotRepository.listForPortfolio(
      input.portfolioId,
      input.limit ?? DEFAULT_LIMIT,
    );

    const points: RiskTrendPoint[] = rows.map((row) => {
      const decoded = decodeRiskTrend(row);
      return {
        capturedAt: row.capturedAt,
        date: row.capturedAt.slice(0, 10),
        snapshot: decoded,
      };
    });

    return buildRiskTrendReport({ generatedAt, points });
  } catch {
    return buildRiskTrendReport({ generatedAt, points: [] });
  }
}

/**
 * Decode `metrics.riskTrend` met fallback naar typed headline-kolommen
 * voor oude snapshots die nog geen riskTrend-payload hebben.
 */
function decodeRiskTrend(row: {
  totalValue: number;
  totalCost: number;
  cashBalance: number;
  volatility: number | null;
  drawdown: number | null;
  healthScore: number | null;
  metrics: {
    riskTrend?: RiskTrendSnapshot;
    positionCount?: number;
    top5Weight?: number | null;
    foreignCurrencyExposure?: number | null;
    riskScore?: number | null;
  };
}): RiskTrendSnapshot {
  // Hit-path: nieuwe snapshots hebben riskTrend.
  if (row.metrics.riskTrend) {
    return row.metrics.riskTrend;
  }
  // Fallback voor oude snapshots — vul wat we hebben uit headline-kolommen.
  return {
    schemaVersion: 1,
    healthScore: row.healthScore,
    riskScore: row.metrics.riskScore ?? null,
    concentrationHhi: null,
    largestPositionWeight: null,
    top5Weight: row.metrics.top5Weight ?? null,
    sectorHhi: null,
    volatility: row.volatility,
    maxDrawdown: row.drawdown,
    foreignCurrencyExposure: row.metrics.foreignCurrencyExposure ?? null,
    dataDepthScore: null,
    driftAvg: null,
    positionCount: row.metrics.positionCount ?? 0,
  };
}
