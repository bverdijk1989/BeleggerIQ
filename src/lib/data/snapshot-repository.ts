import type { Prisma } from "@prisma/client";

import type {
  FactorSnapshotData,
  PortfolioSnapshotData,
  PortfolioSnapshotMetrics,
} from "@/lib/analytics/snapshot";

import { prisma } from "./prisma";

/**
 * Repository voor PortfolioSnapshot en FactorSnapshot. Zet platte
 * snapshot-data objecten (`PortfolioSnapshotData` / `FactorSnapshotData`)
 * om naar Prisma writes en leest time-series terug voor de UI.
 *
 * Design:
 *  - Idempotent op (portfolioId, capturedAt) voor portfolio snapshots:
 *    dubbele schrijfacties binnen dezelfde minuut overschrijven elkaar niet.
 *  - FactorSnapshot unique key `(ticker, capturedAt, model)` maakt
 *    herhaalde scoring-runs veilig.
 *  - `listForPortfolio` default-limiet houdt payload klein voor charts.
 */

export interface PortfolioSnapshotRow {
  id: string;
  portfolioId: string;
  capturedAt: string; // ISO
  totalValue: number;
  totalCost: number;
  cashBalance: number;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
  volatility: number | null;
  drawdown: number | null;
  regimeLabel: string | null;
  healthGrade: string | null;
  healthScore: number | null;
  metrics: PortfolioSnapshotMetrics;
}

export interface FactorSnapshotRow {
  id: string;
  ticker: string;
  isin: string | null;
  capturedAt: string;
  model: string;
  composite: number | null;
  valueScore: number | null;
  qualityScore: number | null;
  momentumScore: number | null;
  lowVolScore: number | null;
  percentile: number | null;
  confidence: number | null;
}

export const portfolioSnapshotRepository = {
  async create(data: PortfolioSnapshotData): Promise<PortfolioSnapshotRow> {
    const row = await prisma.portfolioSnapshot.create({
      data: {
        portfolioId: data.portfolioId,
        capturedAt: data.capturedAt,
        totalValue: data.totalValue,
        totalCost: data.totalCost,
        cashBalance: data.cashBalance,
        unrealizedPnl: data.unrealizedPnl ?? undefined,
        unrealizedPnlPct: data.unrealizedPnlPct ?? undefined,
        volatility: data.volatility ?? undefined,
        drawdown: data.drawdown ?? undefined,
        regimeLabel: data.regimeLabel ?? undefined,
        healthGrade: data.healthGrade ?? undefined,
        healthScore: data.healthScore ?? undefined,
        metrics: data.metrics as unknown as Prisma.InputJsonValue,
      },
    });
    return mapPortfolioSnapshot(row);
  },

  async listForPortfolio(
    portfolioId: string,
    limit: number = 120,
  ): Promise<PortfolioSnapshotRow[]> {
    const rows = await prisma.portfolioSnapshot.findMany({
      where: { portfolioId },
      orderBy: { capturedAt: "asc" },
      take: limit,
    });
    return rows.map(mapPortfolioSnapshot);
  },

  async latest(
    portfolioId: string,
  ): Promise<PortfolioSnapshotRow | null> {
    const row = await prisma.portfolioSnapshot.findFirst({
      where: { portfolioId },
      orderBy: { capturedAt: "desc" },
    });
    return row ? mapPortfolioSnapshot(row) : null;
  },
};

export const factorSnapshotRepository = {
  async upsertMany(rows: FactorSnapshotData[]): Promise<number> {
    if (rows.length === 0) return 0;
    await prisma.$transaction(
      rows.map((row) =>
        prisma.factorSnapshot.upsert({
          where: {
            ticker_capturedAt_model: {
              ticker: row.ticker,
              capturedAt: row.capturedAt,
              model: row.model,
            },
          },
          create: {
            ticker: row.ticker,
            isin: row.isin ?? undefined,
            capturedAt: row.capturedAt,
            model: row.model,
            valueScore: row.valueScore ?? undefined,
            qualityScore: row.qualityScore ?? undefined,
            momentumScore: row.momentumScore ?? undefined,
            lowVolScore: row.lowVolScore ?? undefined,
            growthScore: row.growthScore ?? undefined,
            dividendScore: row.dividendScore ?? undefined,
            sizeScore: row.sizeScore ?? undefined,
            composite: row.composite ?? undefined,
            percentile: row.percentile ?? undefined,
            confidence: row.confidence ?? undefined,
            fundamentals: row.fundamentals as unknown as Prisma.InputJsonValue,
            source: row.source ?? undefined,
          },
          update: {
            valueScore: row.valueScore ?? undefined,
            qualityScore: row.qualityScore ?? undefined,
            momentumScore: row.momentumScore ?? undefined,
            lowVolScore: row.lowVolScore ?? undefined,
            growthScore: row.growthScore ?? undefined,
            dividendScore: row.dividendScore ?? undefined,
            sizeScore: row.sizeScore ?? undefined,
            composite: row.composite ?? undefined,
            percentile: row.percentile ?? undefined,
            confidence: row.confidence ?? undefined,
            fundamentals: row.fundamentals as unknown as Prisma.InputJsonValue,
            source: row.source ?? undefined,
          },
        }),
      ),
    );
    return rows.length;
  },

  async listForTicker(
    ticker: string,
    limit: number = 60,
  ): Promise<FactorSnapshotRow[]> {
    const rows = await prisma.factorSnapshot.findMany({
      where: { ticker: ticker.toUpperCase() },
      orderBy: { capturedAt: "asc" },
      take: limit,
    });
    return rows.map(mapFactorSnapshot);
  },
};

// ============================================================
//  Internals
// ============================================================

type PortfolioRow = NonNullable<
  Awaited<ReturnType<typeof prisma.portfolioSnapshot.findFirst>>
>;

function mapPortfolioSnapshot(row: PortfolioRow): PortfolioSnapshotRow {
  return {
    id: row.id,
    portfolioId: row.portfolioId,
    capturedAt: row.capturedAt.toISOString(),
    totalValue: Number(row.totalValue),
    totalCost: Number(row.totalCost),
    cashBalance: Number(row.cashBalance),
    unrealizedPnl:
      row.unrealizedPnl !== null ? Number(row.unrealizedPnl) : null,
    unrealizedPnlPct:
      row.unrealizedPnlPct !== null ? Number(row.unrealizedPnlPct) : null,
    volatility: row.volatility !== null ? Number(row.volatility) : null,
    drawdown: row.drawdown !== null ? Number(row.drawdown) : null,
    regimeLabel: row.regimeLabel,
    healthGrade: row.healthGrade,
    healthScore: row.healthScore !== null ? Number(row.healthScore) : null,
    metrics: (row.metrics ?? {}) as unknown as PortfolioSnapshotMetrics,
  };
}

type FactorRow = NonNullable<
  Awaited<ReturnType<typeof prisma.factorSnapshot.findFirst>>
>;

function mapFactorSnapshot(row: FactorRow): FactorSnapshotRow {
  return {
    id: row.id,
    ticker: row.ticker,
    isin: row.isin,
    capturedAt: row.capturedAt.toISOString(),
    model: row.model,
    composite: row.composite !== null ? Number(row.composite) : null,
    valueScore: row.valueScore !== null ? Number(row.valueScore) : null,
    qualityScore:
      row.qualityScore !== null ? Number(row.qualityScore) : null,
    momentumScore:
      row.momentumScore !== null ? Number(row.momentumScore) : null,
    lowVolScore: row.lowVolScore !== null ? Number(row.lowVolScore) : null,
    percentile: row.percentile !== null ? Number(row.percentile) : null,
    confidence: row.confidence !== null ? Number(row.confidence) : null,
  };
}
