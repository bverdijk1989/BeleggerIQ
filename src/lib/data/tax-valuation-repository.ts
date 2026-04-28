import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";

/**
 * Repository voor `TaxValuation` — handmatige Box-3 peildatum-waarden.
 */

export interface TaxValuationRow {
  id: string;
  portfolioId: string;
  peilYear: number;
  asOf: Date;
  totalValue: number;
  baseCurrency: string;
  source: string | null;
  note: string | null;
  createdAt: Date;
}

export interface UpsertInput {
  portfolioId: string;
  peilYear: number;
  asOf: Date;
  totalValue: number;
  baseCurrency: string;
  source?: string | null;
  note?: string | null;
}

export const taxValuationRepository = {
  async list(portfolioId: string): Promise<TaxValuationRow[]> {
    const rows = await prisma.taxValuation.findMany({
      where: { portfolioId },
      orderBy: { peilYear: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      portfolioId: r.portfolioId,
      peilYear: r.peilYear,
      asOf: r.asOf,
      totalValue: Number(r.totalValue),
      baseCurrency: r.baseCurrency,
      source: r.source,
      note: r.note,
      createdAt: r.createdAt,
    }));
  },

  async upsert(input: UpsertInput): Promise<TaxValuationRow> {
    const row = await prisma.taxValuation.upsert({
      where: {
        portfolioId_peilYear: {
          portfolioId: input.portfolioId,
          peilYear: input.peilYear,
        },
      },
      create: {
        portfolioId: input.portfolioId,
        peilYear: input.peilYear,
        asOf: input.asOf,
        totalValue: new Prisma.Decimal(input.totalValue.toString()),
        baseCurrency: input.baseCurrency,
        source: input.source ?? null,
        note: input.note ?? null,
      },
      update: {
        asOf: input.asOf,
        totalValue: new Prisma.Decimal(input.totalValue.toString()),
        baseCurrency: input.baseCurrency,
        source: input.source ?? null,
        note: input.note ?? null,
      },
    });
    return {
      id: row.id,
      portfolioId: row.portfolioId,
      peilYear: row.peilYear,
      asOf: row.asOf,
      totalValue: Number(row.totalValue),
      baseCurrency: row.baseCurrency,
      source: row.source,
      note: row.note,
      createdAt: row.createdAt,
    };
  },

  async delete(portfolioId: string, peilYear: number): Promise<boolean> {
    try {
      await prisma.taxValuation.delete({
        where: { portfolioId_peilYear: { portfolioId, peilYear } },
      });
      return true;
    } catch {
      return false;
    }
  },
};
