import type {
  HuntingAlertSeverity,
  HuntingHistoryEntry,
  HuntingTriggerType,
} from "@/lib/analytics/hunting-list";
import type { WatchlistItem } from "@/types/watchlist";

import { prisma } from "./prisma";

/**
 * Repository-laag voor de hunting-list. Isoleert Prisma-ORM-details
 * van de engine, de loader en de UI. Alle writes zijn idempotent
 * door-gedacht: de loader roept `upsertActiveSignal` aan en de
 * repository schrijft alleen een nieuwe log als er nog geen
 * niet-verlopen entry van hetzelfde type is.
 */

export const huntingListRepository = {
  /**
   * Lijst de hunting-list-items van een user (uit `WatchlistItem`) in
   * TS-representatie. Decimal-velden worden coerce'd naar `number`.
   */
  async listItemsByEmail(email: string): Promise<WatchlistItem[]> {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) return [];
    const rows = await prisma.watchlistItem.findMany({
      where: { userId: user.id },
      orderBy: [{ addedAt: "asc" }],
    });
    return rows.map(rowToWatchlistItem);
  },

  async listRecentHistoryForUser(
    userId: string,
    limit: number = 200,
  ): Promise<Map<string, HuntingHistoryEntry[]>> {
    const rows = await prisma.huntingSignalLog.findMany({
      where: { userId },
      orderBy: { firedAt: "desc" },
      take: Math.max(1, Math.min(limit, 500)),
    });
    const byTicker = new Map<string, HuntingHistoryEntry[]>();
    for (const row of rows) {
      const entry: HuntingHistoryEntry = {
        firedAt: row.firedAt.toISOString(),
        triggerType: row.triggerType as HuntingTriggerType,
        severity: row.severity as HuntingAlertSeverity,
        price: row.price !== null ? Number(row.price) : null,
        note: row.note ?? null,
      };
      const existing = byTicker.get(row.ticker);
      if (existing) existing.push(entry);
      else byTicker.set(row.ticker, [entry]);
    }
    return byTicker;
  },

  /**
   * Idempotente fire-log schrijf. We slaan alleen een nieuwe row op
   * wanneer er **geen** niet-verlopen row is van hetzelfde type voor
   * deze ticker. Zo blijft het log een opportunity-history i.p.v. een
   * tick-stream.
   *
   * Geeft true terug wanneer een nieuwe row is geschreven.
   */
  async upsertActiveSignal(input: {
    userId: string;
    watchlistItemId?: string | null;
    ticker: string;
    triggerType: HuntingTriggerType;
    severity: HuntingAlertSeverity;
    price?: number | null;
    currency?: string | null;
    pe?: number | null;
    fcfYield?: number | null;
    rationale: string[];
    note?: string | null;
    firedAt: string;
    expiresAt: string;
  }): Promise<boolean> {
    const existing = await prisma.huntingSignalLog.findFirst({
      where: {
        userId: input.userId,
        ticker: input.ticker,
        triggerType: input.triggerType,
        expiresAt: { gt: new Date(input.firedAt) },
      },
      orderBy: { firedAt: "desc" },
    });
    if (existing) return false;

    await prisma.huntingSignalLog.create({
      data: {
        userId: input.userId,
        watchlistItemId: input.watchlistItemId ?? null,
        ticker: input.ticker,
        triggerType: input.triggerType,
        severity: input.severity,
        price: input.price ?? null,
        currency: input.currency ?? null,
        pe: input.pe ?? null,
        fcfYield: input.fcfYield ?? null,
        rationale: JSON.stringify(input.rationale),
        note: input.note ?? null,
        firedAt: new Date(input.firedAt),
        expiresAt: new Date(input.expiresAt),
      },
    });
    return true;
  },

  async resolveUserIdByEmail(email: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return user?.id ?? null;
  },
};

// ============================================================
//  Mapping helpers
// ============================================================

type WatchlistRow = Awaited<
  ReturnType<typeof prisma.watchlistItem.findMany>
>[number];

function rowToWatchlistItem(row: WatchlistRow): WatchlistItem {
  return {
    id: row.id,
    userId: row.userId,
    ticker: row.ticker,
    name: row.name ?? null,
    note: row.note ?? null,
    targetPrice: row.targetPrice !== null ? Number(row.targetPrice) : null,
    targetPriceHigh:
      row.targetPriceHigh !== null ? Number(row.targetPriceHigh) : null,
    buyZoneTolerance: row.buyZoneTolerance ?? null,
    valuationMaxPE: row.valuationMaxPE ?? null,
    valuationMinFcfYield: row.valuationMinFcfYield ?? null,
    addedAt: row.addedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
