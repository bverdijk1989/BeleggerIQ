"use server";

import { revalidatePath } from "next/cache";

import { resolveUserFromServer } from "@/lib/auth";
import { normalizeAndValidateTicker } from "@/lib/watchlist/ticker";
import { watchlistRepository } from "@/lib/watchlist/repository";

export interface AddInput {
  ticker: string;
  name?: string;
  note?: string;
}

export interface AddResult {
  ok: boolean;
  message?: string;
  /** True als de rij nieuw is aangemaakt; false bij duplicaat. */
  created?: boolean;
}

export async function addToWatchlist(input: AddInput): Promise<AddResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, message: auth.error };

  const validation = normalizeAndValidateTicker(input.ticker);
  if (!validation.ok) {
    return { ok: false, message: validation.reason };
  }

  const result = await watchlistRepository.add({
    email: auth.user.email,
    ticker: validation.ticker,
    name: input.name?.trim() || null,
    note: input.note?.trim() || null,
  });

  if (!result.ok) {
    return { ok: false, message: "Account niet gevonden." };
  }

  revalidatePath("/watchlist");
  revalidatePath("/kansen");
  return {
    ok: true,
    created: result.created,
    message: result.created
      ? `${validation.ticker} toegevoegd aan watchlist.`
      : `${validation.ticker} stond al in je watchlist.`,
  };
}

export interface RemoveInput {
  /** id heeft voorkeur boven ticker — voorkomt race-conditions wanneer een ticker
   *  net wordt vervangen door een nieuwe entry. */
  id?: string;
  ticker?: string;
}

export interface RemoveResult {
  ok: boolean;
  message?: string;
}

export async function removeFromWatchlist(
  input: RemoveInput,
): Promise<RemoveResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, message: auth.error };

  let removed = false;
  if (input.id) {
    removed = await watchlistRepository.removeById(auth.user.email, input.id);
  } else if (input.ticker) {
    const v = normalizeAndValidateTicker(input.ticker);
    if (!v.ok) return { ok: false, message: v.reason };
    removed = await watchlistRepository.removeByTicker(
      auth.user.email,
      v.ticker,
    );
  } else {
    return { ok: false, message: "Geef id of ticker mee." };
  }

  if (!removed) {
    return { ok: false, message: "Niet gevonden." };
  }

  revalidatePath("/watchlist");
  revalidatePath("/kansen");
  return { ok: true };
}

export interface SetAlertInput {
  ticker: string;
  /** Onderdrempel — bij prijs ≤ targetPrice → alert. */
  targetPrice: number;
  targetPriceHigh?: number | null;
  buyZoneTolerance?: number | null;
}

export interface SetAlertResult {
  ok: boolean;
  message?: string;
}

export async function setPriceAlert(
  input: SetAlertInput,
): Promise<SetAlertResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, message: auth.error };

  const v = normalizeAndValidateTicker(input.ticker);
  if (!v.ok) return { ok: false, message: v.reason };

  if (!Number.isFinite(input.targetPrice) || input.targetPrice <= 0) {
    return { ok: false, message: "Voer een geldige prijs > 0 in." };
  }
  if (
    input.targetPriceHigh !== null &&
    input.targetPriceHigh !== undefined &&
    input.targetPriceHigh <= input.targetPrice
  ) {
    return {
      ok: false,
      message: "De bovengrens moet groter zijn dan de ondergrens.",
    };
  }
  if (
    input.buyZoneTolerance !== null &&
    input.buyZoneTolerance !== undefined &&
    (input.buyZoneTolerance < 0 || input.buyZoneTolerance > 0.5)
  ) {
    return {
      ok: false,
      message: "Tolerance moet tussen 0 en 0.5 (50%) liggen.",
    };
  }

  const updated = await watchlistRepository.setAlert({
    email: auth.user.email,
    ticker: v.ticker,
    targetPrice: input.targetPrice,
    targetPriceHigh: input.targetPriceHigh ?? null,
    buyZoneTolerance: input.buyZoneTolerance ?? null,
  });

  if (!updated) {
    return { ok: false, message: "Watchlist-item niet gevonden." };
  }

  revalidatePath("/watchlist");
  return { ok: true };
}

export async function clearPriceAlert(
  input: { ticker: string },
): Promise<SetAlertResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, message: auth.error };

  const v = normalizeAndValidateTicker(input.ticker);
  if (!v.ok) return { ok: false, message: v.reason };

  const ok = await watchlistRepository.clearAlert(auth.user.email, v.ticker);
  if (!ok) return { ok: false, message: "Niet gevonden." };

  revalidatePath("/watchlist");
  return { ok: true };
}
