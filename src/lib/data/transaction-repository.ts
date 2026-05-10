import { Prisma, type Transaction as PrismaTx, type TransactionType as PrismaTxType } from "@prisma/client";

import { prisma } from "./prisma";
import type { ParsedTransaction, TxType } from "@/lib/transactions/types";

/**
 * Repository voor `Transaction`-rijen.
 *
 * Belangrijke design-keuze: **upserts via `(portfolioId, externalId)` —
 * het unique-paar in het schema**. De parser produceert deterministische
 * `externalId`s, dus tweemaal dezelfde CSV importeren is een no-op.
 *
 * `bulkImport` retourneert per-rij `inserted | skipped_duplicate | error`
 * zodat de UI exacte feedback aan de gebruiker kan geven.
 */

export type DomainTxType = TxType;

export interface TransactionRow {
  id: string;
  portfolioId: string;
  ticker: string | null;
  isin: string | null;
  name: string | null;
  type: DomainTxType;
  quantity: number | null;
  price: number | null;
  fee: number | null;
  signedAmount: number | null;
  currency: string;
  executedAt: Date;
  externalId: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface BulkImportInput {
  portfolioId: string;
  parsed: ParsedTransaction[];
}

export interface BulkImportOutcome {
  inserted: number;
  skipped: number;
  errors: number;
  results: Array<{
    externalId: string;
    status: "inserted" | "skipped" | "error";
    reason?: string;
  }>;
}

export interface ListFilter {
  portfolioId: string;
  year?: number;
  type?: DomainTxType;
  ticker?: string;
  /** Pagineer-grens. Default 1000 — ruim voor de gemiddelde retail-belegger
   *  maar voorkomt unbounded scans bij 20k+ transacties in één jaar. */
  take?: number;
}

const TRANSACTION_LIST_DEFAULT_TAKE = 1000;
const TRANSACTION_LIST_MAX_TAKE = 5000;

function rowToDomain(row: PrismaTx): TransactionRow {
  return {
    id: row.id,
    portfolioId: row.portfolioId,
    ticker: row.ticker,
    isin: row.isin,
    name: row.name,
    type: row.type as DomainTxType,
    quantity: row.quantity ? Number(row.quantity) : null,
    price: row.price ? Number(row.price) : null,
    fee: row.fee ? Number(row.fee) : null,
    signedAmount: row.signedAmount ? Number(row.signedAmount) : null,
    currency: row.currency,
    executedAt: row.executedAt,
    externalId: row.externalId,
    source: row.source,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null,
    createdAt: row.createdAt,
  };
}

function toPrismaCreate(
  portfolioId: string,
  tx: ParsedTransaction,
): Prisma.TransactionCreateInput {
  return {
    portfolio: { connect: { id: portfolioId } },
    ticker: tx.ticker,
    isin: tx.isin,
    name: tx.name,
    type: tx.type as PrismaTxType,
    quantity:
      tx.quantity !== null
        ? new Prisma.Decimal(tx.quantity.toString())
        : null,
    price:
      tx.price !== null ? new Prisma.Decimal(tx.price.toString()) : null,
    fee: tx.fee !== null ? new Prisma.Decimal(tx.fee.toString()) : null,
    signedAmount:
      tx.signedAmount !== null
        ? new Prisma.Decimal(tx.signedAmount.toString())
        : null,
    currency: tx.currency,
    executedAt: tx.executedAt,
    externalId: tx.externalId,
    source: tx.source,
    metadata: (tx.metadata ?? null) as Prisma.InputJsonValue,
  };
}

export const transactionRepository = {
  async list(filter: ListFilter): Promise<TransactionRow[]> {
    const where: Prisma.TransactionWhereInput = {
      portfolioId: filter.portfolioId,
    };
    if (filter.type) where.type = filter.type as PrismaTxType;
    if (filter.ticker) where.ticker = filter.ticker;
    if (filter.year) {
      const start = new Date(Date.UTC(filter.year, 0, 1));
      const end = new Date(Date.UTC(filter.year + 1, 0, 1));
      where.executedAt = { gte: start, lt: end };
    }
    const take = Math.min(
      Math.max(1, filter.take ?? TRANSACTION_LIST_DEFAULT_TAKE),
      TRANSACTION_LIST_MAX_TAKE,
    );
    const rows = await prisma.transaction.findMany({
      where,
      orderBy: [{ executedAt: "desc" }, { createdAt: "desc" }],
      take,
    });
    return rows.map(rowToDomain);
  },

  /**
   * Idempotente bulk-insert. Per-rij outcome zodat de UI kan tonen
   * "X nieuwe, Y duplicaten, Z fouten".
   *
   * We doen één-rij-per-call createOrIgnore-stijl: bij een
   * unique-violation (`P2002` op `(portfolioId, externalId)`) markeren
   * we 'em als `skipped`. Voor 50-200 CSV-rijen is dit acceptabel; bij
   * een 10k-rij broker-export migreren we naar `createMany({ skipDuplicates: true })`.
   */
  async bulkImport(input: BulkImportInput): Promise<BulkImportOutcome> {
    const out: BulkImportOutcome = {
      inserted: 0,
      skipped: 0,
      errors: 0,
      results: [],
    };

    for (const tx of input.parsed) {
      try {
        await prisma.transaction.create({
          data: toPrismaCreate(input.portfolioId, tx),
        });
        out.inserted += 1;
        out.results.push({ externalId: tx.externalId, status: "inserted" });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          out.skipped += 1;
          out.results.push({ externalId: tx.externalId, status: "skipped" });
          continue;
        }
        out.errors += 1;
        out.results.push({
          externalId: tx.externalId,
          status: "error",
          reason: err instanceof Error ? err.message : "unknown",
        });
      }
    }
    return out;
  },

  /** Verwijder ALLE transacties van een portfolio. Test-only / debug. */
  async deleteAllForPortfolio(portfolioId: string): Promise<number> {
    const r = await prisma.transaction.deleteMany({ where: { portfolioId } });
    return r.count;
  },
};
