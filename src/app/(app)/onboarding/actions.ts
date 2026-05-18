"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { resolveUserFromServer } from "@/lib/auth";
import { prisma } from "@/lib/data/prisma";
import {
  validatePreferences,
  type OnboardingPreferences,
} from "@/lib/onboarding/wizard";

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

/**
 * Module 20 — sla 5-stappen-wizard-preferences op + markeer onboarding
 * gestart. Maakt UserProfile aan als 'ie nog niet bestaat.
 */
export async function saveOnboardingPreferences(
  preferences: OnboardingPreferences,
): Promise<ActionResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, message: auth.error };

  const validation = validatePreferences(preferences);
  if (!validation.ok) {
    return {
      ok: false,
      message: `Ongeldige voorkeuren: ${validation.errors.join(", ")}`,
    };
  }

  const user = await prisma.user.findUnique({
    where: { email: auth.user.email },
    select: {
      id: true,
      profile: { select: { id: true } },
    },
  });
  if (!user) return { ok: false, message: "Account niet gevonden." };

  // Map InvestmentStyle → InvestorType (DB-veld).
  const investorType =
    preferences.style === "DIVIDEND"
      ? "DIVIDEND"
      : preferences.style === "STOCKS"
        ? "FACTOR"
        : preferences.style === "ETF" || preferences.style === "MIXED"
          ? "BALANCED"
          : "LONG_TERM";

  if (user.profile) {
    await prisma.userProfile.update({
      where: { id: user.profile.id },
      data: {
        objective: preferences.objective,
        riskTolerance: preferences.riskTolerance,
        uxMode: preferences.uxMode,
        investorType,
        // Preferences-blob bewaart extra wizard-state (style + bootstrap)
        // zonder schema-migratie.
        preferences: {
          onboardingWizard: {
            style: preferences.style,
            portfolioBootstrap: preferences.portfolioBootstrap,
            savedAt: new Date().toISOString(),
          },
        },
      },
    });
  } else {
    await prisma.userProfile.create({
      data: {
        userId: user.id,
        objective: preferences.objective,
        riskTolerance: preferences.riskTolerance,
        uxMode: preferences.uxMode,
        investorType,
        preferences: {
          onboardingWizard: {
            style: preferences.style,
            portfolioBootstrap: preferences.portfolioBootstrap,
            savedAt: new Date().toISOString(),
          },
        },
      },
    });
  }

  await audit.record({
    userEmail: auth.user.email,
    category: "system",
    action: "onboarding_preferences_saved",
    resourceType: "UserProfile",
    summary: "5-stappen-wizard voltooid",
    metadata: {
      objective: preferences.objective,
      uxMode: preferences.uxMode,
      style: preferences.style,
    },
  });

  revalidatePath("/onboarding");
  revalidatePath("/welcome");
  revalidatePath("/dashboard");
  return { ok: true };
}
