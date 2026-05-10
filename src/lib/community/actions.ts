"use server";

import { revalidatePath } from "next/cache";

import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
import { prisma } from "@/lib/data/prisma";
import type { Prisma } from "@prisma/client";

import { buildConsent } from "./consent";
import type { ConsentScope } from "./types";

export interface UpdateCommunityConsentInput {
  scopes: ReadonlyArray<ConsentScope>;
}

export interface UpdateCommunityConsentResult {
  ok: boolean;
  error?: string;
}

/**
 * Server action: zet/update de community-consent voor de ingelogde user.
 *
 * **Privacy-laag**: dit is de ENIGE plek waar `community` in
 * `UserProfile.preferences` mag worden geupdate. Geen impliciete
 * activeringen vanuit andere flows; geen "we hebben het voor je
 * aangezet"-magic.
 */
export async function updateCommunityConsentAction(
  input: UpdateCommunityConsentInput,
): Promise<UpdateCommunityConsentResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, error: "Niet ingelogd" };
  const ctx = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);
  if (!ctx?.userId) return { ok: false, error: "Geen user-context" };

  const consent = buildConsent(input.scopes);

  // Lees huidige preferences-blob — we mergen onze 'community'-key zonder
  // andere keys te wissen.
  const profile = await prisma.userProfile.findUnique({
    where: { userId: ctx.userId },
    select: { preferences: true },
  });
  const prefsObj =
    profile?.preferences && typeof profile.preferences === "object"
      ? (profile.preferences as Record<string, unknown>)
      : {};

  const newPrefs: Record<string, unknown> = {
    ...prefsObj,
    community: consent,
  };

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

  revalidatePath("/community");
  revalidatePath("/profiel");
  return { ok: true };
}

/**
 * Trekt alle consent in. Reset volledig — gebruiker is geen contributor
 * meer en ziet alleen de synthetic-baseline. Aparte action zodat het
 * UI-pad expliciet en auditbaar is.
 */
export async function revokeCommunityConsentAction(): Promise<UpdateCommunityConsentResult> {
  return updateCommunityConsentAction({ scopes: [] });
}
