import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/data";
import type { WatchlistItem } from "@/types/watchlist";

/**
 * Watchlist-write-laag.
 *
 * Voor reads herbergebruiken we [`huntingListRepository.listItemsByEmail`](../data/hunting-list-repository.ts);
 * deze module bevat alleen de mutations (`add`, `remove`, `setAlert`).
 * Houdt het ORM-detail los van de server-actions.
 */

export type AddOutcome =
  | { ok: true; item: WatchlistItem; created: true }
  | { ok: true; item: WatchlistItem; created: false } // duplicate-no-op
  | { ok: false; reason: "user_not_found" };

export interface AddInput {
  email: string;
  ticker: string;
  name?: string | null;
  note?: string | null;
}

export interface SetAlertInput {
  email: string;
  ticker: string;
  /** Lower threshold of de buy-zone (verplicht). */
  targetPrice: number;
  /** Optionele bovengrens voor band-detectie. */
  targetPriceHigh?: number | null;
  /** Default 0.05. */
  buyZoneTolerance?: number | null;
}

function rowToItem(
  row: Awaited<ReturnType<typeof prisma.watchlistItem.findUnique>>,
): WatchlistItem {
  if (!row) throw new Error("rowToItem expects a non-null row");
  return {
    id: row.id,
    userId: row.userId,
    ticker: row.ticker,
    name: row.name,
    note: row.note,
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

async function userIdByEmail(email: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  return user?.id ?? null;
}

export const watchlistRepository = {
  /**
   * Idempotente toevoeging. Bestaande (userId, ticker)-combinatie wordt
   * niet overschreven; we geven 'em terug met `created=false` zodat de
   * UI kan zeggen "stond al in je lijst".
   */
  async add(input: AddInput): Promise<AddOutcome> {
    const userId = await userIdByEmail(input.email);
    if (!userId) return { ok: false, reason: "user_not_found" };

    const existing = await prisma.watchlistItem.findUnique({
      where: {
        userId_ticker: { userId, ticker: input.ticker },
      },
    });
    if (existing) {
      return { ok: true, item: rowToItem(existing), created: false };
    }
    const created = await prisma.watchlistItem.create({
      data: {
        userId,
        ticker: input.ticker,
        name: input.name ?? null,
        note: input.note ?? null,
      },
    });
    return { ok: true, item: rowToItem(created), created: true };
  },

  /**
   * Verwijder een (userId, ticker)-combinatie. Retourneert true wanneer
   * een rij is verwijderd; false bij not-found of cross-user (zie ook
   * `removeById` voor de id-variant).
   */
  async removeByTicker(email: string, ticker: string): Promise<boolean> {
    const userId = await userIdByEmail(email);
    if (!userId) return false;
    const r = await prisma.watchlistItem.deleteMany({
      where: { userId, ticker },
    });
    return r.count > 0;
  },

  /**
   * Verwijder via id. We checken expliciet dat de rij van deze user
   * is — anders sturen we 'em geruisloos terug zonder mutation, zodat
   * een geraden id van een andere user niets doet.
   */
  async removeById(email: string, id: string): Promise<boolean> {
    const userId = await userIdByEmail(email);
    if (!userId) return false;
    const r = await prisma.watchlistItem.deleteMany({
      where: { id, userId },
    });
    return r.count > 0;
  },

  /**
   * Configureer een price-alert (target-zone). De engine in
   * `analytics/hunting-list` leest deze velden op de volgende run en
   * vuurt een `WATCHLIST_PRICE_ALERT` zodra de prijs binnen de zone
   * komt. Module 12 hangt 'r een notification-channel onder.
   */
  async setAlert(input: SetAlertInput): Promise<WatchlistItem | null> {
    const userId = await userIdByEmail(input.email);
    if (!userId) return null;
    const updated = await prisma.watchlistItem.update({
      where: { userId_ticker: { userId, ticker: input.ticker } },
      data: {
        targetPrice: new Prisma.Decimal(input.targetPrice.toString()),
        targetPriceHigh:
          input.targetPriceHigh !== null && input.targetPriceHigh !== undefined
            ? new Prisma.Decimal(input.targetPriceHigh.toString())
            : null,
        buyZoneTolerance: input.buyZoneTolerance ?? null,
      },
    });
    return rowToItem(updated);
  },

  /**
   * Verwijder de alert (zet thresholds op null). De rij blijft in de
   * watchlist staan — alleen de price-trigger gaat uit.
   */
  async clearAlert(email: string, ticker: string): Promise<boolean> {
    const userId = await userIdByEmail(email);
    if (!userId) return false;
    const r = await prisma.watchlistItem.updateMany({
      where: { userId, ticker },
      data: {
        targetPrice: null,
        targetPriceHigh: null,
        buyZoneTolerance: null,
      },
    });
    return r.count > 0;
  },
};
