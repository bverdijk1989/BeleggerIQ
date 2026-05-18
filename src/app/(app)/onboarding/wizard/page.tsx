import { redirect } from "next/navigation";

import { resolveUserFromServer } from "@/lib/auth";

import { OnboardingWizardClient } from "./client";

export const metadata = {
  title: "Welkom — Onboarding",
};

export const dynamic = "force-dynamic";

/**
 * /onboarding/wizard — 5-stappen pre-flight wizard (Module 20).
 *
 * Mobile-first; renderbaar zonder portfolio. Eindigt door
 * `saveOnboardingPreferences` aan te roepen en redirect naar /welcome.
 */
export default async function OnboardingWizardPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    redirect("/login");
  }
  return <OnboardingWizardClient />;
}
