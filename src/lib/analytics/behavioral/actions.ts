"use server";

import { revalidatePath } from "next/cache";

import { resolveUserFromServer } from "@/lib/auth";
import { behavioralStateRepository, portfolioRepository } from "@/lib/data";

import type { BehavioralStatus } from "./types";

/**
 * Server actions voor behavioral-warning state.
 *
 * Toegankelijk vanaf client-componenten via `useTransition()`. Elk
 * action verifieert de user, schrijft de state, en revalideert de
 * relevante paden zodat de UI direct refresht.
 */

export interface UpdateBehavioralStateInput {
  signalId: string;
  status: BehavioralStatus;
  /** Voor SNOOZED: datum waarna het signaal weer ACTIVE wordt. */
  snoozedUntil?: string | null;
  reasonNote?: string | null;
}

export interface UpdateBehavioralStateResult {
  ok: boolean;
  error?: string;
}

export async function updateBehavioralWarningStateAction(
  input: UpdateBehavioralStateInput,
): Promise<UpdateBehavioralStateResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, error: "Niet ingelogd" };

  const ctx = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);
  if (!ctx?.userId) return { ok: false, error: "Geen user-context" };

  const trimmedSignalId = input.signalId.trim();
  if (!trimmedSignalId) return { ok: false, error: "Lege signalId" };

  let snoozedUntil: Date | null = null;
  if (input.status === "SNOOZED") {
    if (!input.snoozedUntil) {
      // Default: 7 dagen vooruit als geen datum gegeven is.
      const dt = new Date();
      dt.setUTCDate(dt.getUTCDate() + 7);
      snoozedUntil = dt;
    } else {
      const parsed = new Date(input.snoozedUntil);
      if (Number.isNaN(parsed.getTime())) {
        return { ok: false, error: "Ongeldige snooze-datum" };
      }
      if (parsed.getTime() <= Date.now()) {
        return { ok: false, error: "Snooze-datum moet in de toekomst liggen" };
      }
      snoozedUntil = parsed;
    }
  }

  await behavioralStateRepository.upsertStatus({
    userId: ctx.userId,
    signalId: trimmedSignalId,
    status: input.status,
    snoozedUntil,
    reasonNote: input.reasonNote ?? null,
  });

  // Re-render dashboard + /coach pages.
  revalidatePath("/dashboard");
  revalidatePath("/coach");

  return { ok: true };
}

export async function resetBehavioralWarningAction(input: {
  signalId: string;
}): Promise<UpdateBehavioralStateResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, error: "Niet ingelogd" };

  const ctx = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);
  if (!ctx?.userId) return { ok: false, error: "Geen user-context" };

  await behavioralStateRepository.resetToActive({
    userId: ctx.userId,
    signalId: input.signalId.trim(),
  });

  revalidatePath("/dashboard");
  revalidatePath("/coach");

  return { ok: true };
}
