"use server";

import { revalidatePath } from "next/cache";

import { resolveUserFromServer } from "@/lib/auth";
import { prisma } from "@/lib/data/prisma";
import { log } from "@/lib/log";

/**
 * Server actions voor de screener-pagina. De ingelogde user (via
 * `resolveUserFromServer`) is altijd de watchlist-owner — cross-user
 * writes zijn niet mogelijk.
 */

export interface AddToWatchlistInput {
  ticker: string;
  name?: string;
  note?: string;
}

export interface AddToWatchlistResult {
  ok: boolean;
  message: string;
  duplicated?: boolean;
}

export async function addToWatchlist(
  input: AddToWatchlistInput,
): Promise<AddToWatchlistResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, message: auth.error };

  const ticker = input.ticker.trim().toUpperCase();
  if (!ticker) {
    return { ok: false, message: "Ticker ontbreekt." };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: auth.user.email },
      select: { id: true },
    });
    if (!user) {
      return {
        ok: false,
        message:
          "Geen user-record gevonden — draai eerst `npm run prisma:seed` of rond de login af.",
      };
    }

    const existing = await prisma.watchlistItem.findUnique({
      where: { userId_ticker: { userId: user.id, ticker } },
      select: { id: true },
    });

    await prisma.watchlistItem.upsert({
      where: { userId_ticker: { userId: user.id, ticker } },
      create: {
        userId: user.id,
        ticker,
        name: input.name ?? null,
        note: input.note ?? null,
      },
      update: {
        name: input.name ?? undefined,
        note: input.note ?? undefined,
      },
    });

    revalidatePath("/portfolio");

    return {
      ok: true,
      duplicated: Boolean(existing),
      message: existing
        ? `${ticker} stond al op je watchlist — bijgewerkt.`
        : `${ticker} toegevoegd aan je watchlist.`,
    };
  } catch (error) {
    log.error("screener:addToWatchlist", "prisma upsert failed", { error });
    const message =
      error instanceof Error ? error.message : "Onbekende fout.";
    return { ok: false, message };
  }
}
