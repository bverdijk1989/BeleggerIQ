"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/data/prisma";
import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
import type { UxMode } from "@/types/profile";

const VALID_MODES: ReadonlyArray<UxMode> = ["BEGINNER", "FOCUS", "EXPERT"];

export interface SetUxModeResult {
  ok: boolean;
  error?: string;
}

/**
 * Server action — werk de UX-mode bij in `UserProfile`. Maakt een
 * leeg profiel aan wanneer er nog geen is (zodat onboarding-state
 * niet kapot gaat).
 *
 * Revalidert dashboard + profiel zodat de UI direct refresht.
 */
export async function setUxModeAction(input: {
  mode: UxMode;
}): Promise<SetUxModeResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, error: "Niet ingelogd" };
  if (!VALID_MODES.includes(input.mode)) {
    return { ok: false, error: "Ongeldige modus" };
  }

  const ctx = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);
  if (!ctx?.userId) {
    return { ok: false, error: "Geen user-context" };
  }

  await prisma.userProfile.upsert({
    where: { userId: ctx.userId },
    create: {
      userId: ctx.userId,
      uxMode: input.mode,
    },
    update: {
      uxMode: input.mode,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/profiel");
  return { ok: true };
}
