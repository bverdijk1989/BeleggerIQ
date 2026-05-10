"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { resolveUserFromServer } from "@/lib/auth";
import { prisma } from "@/lib/data/prisma";

/**
 * Server actions voor de onboarding-flow.
 *
 * - `markOnboardingComplete` zet `UserProfile.onboardedAt` zodat de
 *   middelware-redirect (proxy.ts in een follow-up) de gebruiker
 *   uit /onboarding houdt.
 *
 * Bewust thin: de echte profile/portfolio/snapshot-acties leven al
 * elders en worden door de onboarding-pagina aangesproken.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export async function markOnboardingComplete(): Promise<ActionResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, message: auth.error };

  const user = await prisma.user.findUnique({
    where: { email: auth.user.email },
    select: { id: true, profile: { select: { id: true, onboardedAt: true } } },
  });
  if (!user) return { ok: false, message: "Account niet gevonden." };
  if (!user.profile) {
    return {
      ok: false,
      message: "Maak eerst je beleggersprofiel aan.",
    };
  }
  if (user.profile.onboardedAt) {
    return { ok: true, message: "Reeds onboarded." };
  }

  await prisma.userProfile.update({
    where: { id: user.profile.id },
    data: { onboardedAt: new Date() },
  });

  await audit.record({
    userEmail: auth.user.email,
    category: "system",
    action: "onboarding_complete",
    resourceType: "UserProfile",
    resourceId: user.profile.id,
    summary: "Onboarding voltooid",
  });

  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
  return { ok: true };
}
