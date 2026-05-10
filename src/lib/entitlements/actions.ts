"use server";

import { revalidatePath } from "next/cache";

import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
import { prisma } from "@/lib/data/prisma";
import type { BillingTier } from "@/types/profile";

const VALID_TIERS: ReadonlyArray<BillingTier> = ["FREE", "PRO", "ELITE", "ADVISOR"];

export interface SetBillingTierResult {
  ok: boolean;
  error?: string;
}

/**
 * **Dev-only** server-action om de eigen billing-tier te switchen.
 * In productie wordt dit gestuurd door Stripe/Mollie webhooks; deze
 * action is bedoeld voor:
 *  - lokale ontwikkeling
 *  - QA-omgevingen waar geen echte payment-flow bestaat
 *  - admin-overrides (voorlopig: zelf-bedienend per user)
 *
 * Wanneer een echte billing-provider gekoppeld is, kan deze action
 * vervangen worden door `requireWebhookOnly` om misbruik te voorkomen.
 */
export async function setBillingTierAction(input: {
  tier: BillingTier;
}): Promise<SetBillingTierResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, error: "Niet ingelogd" };
  if (!VALID_TIERS.includes(input.tier)) {
    return { ok: false, error: "Ongeldige tier" };
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
      billingTier: input.tier,
    },
    update: {
      billingTier: input.tier,
    },
  });

  // Revalideer alle paden waar entitlements impact hebben.
  revalidatePath("/dashboard");
  revalidatePath("/profiel");
  revalidatePath("/pricing");
  revalidatePath("/score");
  revalidatePath("/macro");
  revalidatePath("/portfolio-health");
  return { ok: true };
}
