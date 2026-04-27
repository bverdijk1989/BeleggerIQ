import type { Prisma } from "@prisma/client";

import type {
  DecisionRecord,
  DecisionSnapshotInput,
  DecisionStatus,
} from "@/lib/analytics/decision-history";

import { prisma } from "./prisma";

/**
 * Repository voor `DecisionSnapshot`. Server-only.
 *
 * Design:
 *  - **Idempotente upsert** op `(userId, suggestedBucket, decisionKey)`:
 *    repeated dashboard-loads in hetzelfde uur produceren geen
 *    duplicaten. We werken alleen `expiresAt` bij — de rest blijft
 *    onaangeroerd zodat audit-trail consistent is.
 *  - **`updateStatus`** muteert alleen `status`, `statusUpdatedAt` en
 *    `statusNote`. Andere velden zijn append-only.
 *  - **`reapExpired`** zet records met `status = SUGGESTED` en
 *    `expiresAt < now` om naar `EXPIRED`.
 *  - **Decimal → number** conversie gebeurt in deze laag zodat callers
 *    plain JS-getallen krijgen.
 */

const DEFAULT_LIMIT = 25;

export const decisionHistoryRepository = {
  async upsertMany(
    userId: string,
    portfolioId: string | null,
    snapshots: DecisionSnapshotInput[],
  ): Promise<number> {
    if (snapshots.length === 0) return 0;
    let written = 0;
    // Sequentieel — elke upsert schrijft één rij; we hebben geen
    // bulk-upsert in Prisma. Deze sets zijn klein (≤ 3) per dashboard-load.
    for (const s of snapshots) {
      await prisma.decisionSnapshot.upsert({
        where: {
          userId_suggestedBucket_decisionKey: {
            userId,
            suggestedBucket: s.suggestedBucket,
            decisionKey: s.decisionKey,
          },
        },
        update: {
          // Update alleen `expiresAt`: gebruiker mag een advies dat
          // binnen hetzelfde uur verschijnt verlengen, maar de
          // oorspronkelijke status/title/etc. blijven gezet.
          expiresAt: s.expiresAt,
        },
        create: {
          userId,
          portfolioId,
          decisionKey: s.decisionKey,
          actionType: s.actionType,
          symbol: s.symbol,
          shares: s.shares,
          amount: s.amount,
          baseCurrency: s.baseCurrency,
          title: s.title,
          rationale: s.rationale,
          confidence: s.confidence,
          sourceEngine: s.sourceEngine,
          suggestedAt: s.suggestedAt,
          suggestedBucket: s.suggestedBucket,
          expiresAt: s.expiresAt,
        },
      });
      written += 1;
    }
    return written;
  },

  async listForUser(
    userId: string,
    options: { limit?: number; statuses?: DecisionStatus[] } = {},
  ): Promise<DecisionRecord[]> {
    const where: Prisma.DecisionSnapshotWhereInput = { userId };
    if (options.statuses && options.statuses.length > 0) {
      where.status = { in: options.statuses };
    }
    const rows = await prisma.decisionSnapshot.findMany({
      where,
      orderBy: { suggestedAt: "desc" },
      take: options.limit ?? DEFAULT_LIMIT,
    });
    return rows.map(rowToRecord);
  },

  async findById(id: string): Promise<DecisionRecord | null> {
    const row = await prisma.decisionSnapshot.findUnique({ where: { id } });
    return row ? rowToRecord(row) : null;
  },

  async resolveOwner(id: string): Promise<{ userId: string } | null> {
    const row = await prisma.decisionSnapshot.findUnique({
      where: { id },
      select: { userId: true },
    });
    return row ?? null;
  },

  /**
   * User-getriggerde status-update. Returnt `null` wanneer het record
   * niet bestaat of aan een andere user toebehoort. Geen state machine
   * hier — caller (API-route) checkt `isValidStatusTransition`.
   */
  async updateStatus(args: {
    id: string;
    userId: string;
    status: DecisionStatus;
    note?: string | null;
  }): Promise<DecisionRecord | null> {
    const existing = await prisma.decisionSnapshot.findUnique({
      where: { id: args.id },
    });
    if (!existing || existing.userId !== args.userId) return null;
    const updated = await prisma.decisionSnapshot.update({
      where: { id: args.id },
      data: {
        status: args.status,
        statusUpdatedAt: new Date(),
        statusNote: args.note ?? null,
      },
    });
    return rowToRecord(updated);
  },

  /**
   * Markeer alle SUGGESTED records waarvan `expiresAt < now` als
   * EXPIRED. Idempotent. Bedoeld voor cron / on-load housekeeping.
   */
  async reapExpired(now: Date = new Date()): Promise<number> {
    const result = await prisma.decisionSnapshot.updateMany({
      where: {
        status: "SUGGESTED",
        expiresAt: { lt: now },
      },
      data: { status: "EXPIRED", statusUpdatedAt: now },
    });
    return result.count;
  },
};

// ============================================================
//  Mapping (Prisma row → DecisionRecord)
// ============================================================

type Row = Awaited<
  ReturnType<typeof prisma.decisionSnapshot.findUnique>
>;

function rowToRecord(row: NonNullable<Row>): DecisionRecord {
  return {
    id: row.id,
    decisionKey: row.decisionKey,
    suggestedAt: row.suggestedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    actionType: row.actionType,
    symbol: row.symbol,
    shares: row.shares,
    amount: row.amount === null ? null : Number(row.amount),
    baseCurrency: row.baseCurrency as DecisionRecord["baseCurrency"],
    title: row.title,
    rationale: row.rationale,
    confidence: Number(row.confidence),
    sourceEngine: row.sourceEngine,
    status: row.status,
    statusUpdatedAt: row.statusUpdatedAt.toISOString(),
    statusNote: row.statusNote,
  };
}
