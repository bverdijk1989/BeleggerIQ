"use server";

import { revalidatePath } from "next/cache";

import { resolveUserFromServer } from "@/lib/auth";
import { alertRepository, portfolioRepository } from "@/lib/data";
import { prisma } from "@/lib/data/prisma";
import type { Prisma } from "@prisma/client";

import {
  buildDefaultAlertPreferences,
  mergeAlertPreferences,
  parseAlertPreferences,
  type AlertPreferences,
  type AlertTypePreference,
} from "./preferences";
import type { AlertType } from "./types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function markAlertReadAction(input: {
  alertId: string;
}): Promise<ActionResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, error: "Niet ingelogd" };
  const ctx = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);
  if (!ctx?.userId) return { ok: false, error: "Geen user-context" };

  await alertRepository.markRead(ctx.userId, input.alertId);
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function markAllAlertsReadAction(): Promise<ActionResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, error: "Niet ingelogd" };
  const ctx = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);
  if (!ctx?.userId) return { ok: false, error: "Geen user-context" };

  await alertRepository.markAllRead(ctx.userId);
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function dismissAlertAction(input: {
  alertId: string;
}): Promise<ActionResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, error: "Niet ingelogd" };
  const ctx = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);
  if (!ctx?.userId) return { ok: false, error: "Geen user-context" };

  await alertRepository.dismiss(ctx.userId, input.alertId);
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function undismissAlertAction(input: {
  alertId: string;
}): Promise<ActionResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, error: "Niet ingelogd" };
  const ctx = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);
  if (!ctx?.userId) return { ok: false, error: "Geen user-context" };

  await alertRepository.undismiss(ctx.userId, input.alertId);
  revalidatePath("/alerts");
  return { ok: true };
}

// ============================================================
//  Preferences-update
// ============================================================

export interface UpdateAlertPreferencesInput {
  /** Per-type patch — alleen meegeven wat je wilt wijzigen. */
  patch: Partial<Record<AlertType, AlertTypePreference>>;
}

export async function updateAlertPreferencesAction(
  input: UpdateAlertPreferencesInput,
): Promise<ActionResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, error: "Niet ingelogd" };
  const ctx = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);
  if (!ctx?.userId) return { ok: false, error: "Geen user-context" };

  // Lees huidige prefs (uit Prisma direct want we hebben Json-blob nodig).
  const profile = await prisma.userProfile.findUnique({
    where: { userId: ctx.userId },
    select: { preferences: true },
  });
  const prefsObj =
    profile?.preferences && typeof profile.preferences === "object"
      ? (profile.preferences as Record<string, unknown>)
      : {};
  const currentAlerts = parseAlertPreferences(prefsObj.alerts);
  const next: AlertPreferences = mergeAlertPreferences(
    currentAlerts,
    input.patch,
  );

  const newPrefs: Record<string, unknown> = { ...prefsObj, alerts: next };

  await prisma.userProfile.upsert({
    where: { userId: ctx.userId },
    create: {
      userId: ctx.userId,
      preferences: newPrefs as unknown as Prisma.InputJsonValue,
    },
    update: {
      preferences: newPrefs as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath("/alerts");
  revalidatePath("/profiel");
  return { ok: true };
}

/** Reset naar defaults — handig vanuit de preferences-pagina. */
export async function resetAlertPreferencesAction(): Promise<ActionResult> {
  return updateAlertPreferencesAction({
    patch: buildDefaultAlertPreferences(),
  });
}
