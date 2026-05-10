/**
 * Stripe → UserProfile sync.
 *
 * Schrijft de actuele tier vanuit een Stripe-event terug naar
 * `UserProfile.preferences.billing` zodat `resolveCurrentTier()` het
 * direct ziet zonder Stripe-API-call op elke request.
 *
 * **Idempotent**: meerdere keren callen met hetzelfde event levert
 * dezelfde state.
 */

import type Stripe from "stripe";

import { audit } from "@/lib/audit";
import { prisma } from "@/lib/data/prisma";
import { log } from "@/lib/log";
import type { BillingTier } from "@/types/profile";

import { tierFromSubscription } from "./stripe";

export interface BillingState {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  tier: BillingTier;
  active: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  updatedAt: string;
}

const DEFAULT_STATE: BillingState = {
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  tier: "FREE",
  active: false,
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
  updatedAt: new Date(0).toISOString(),
};

export function parseBillingState(raw: unknown): BillingState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_STATE };
  }
  const obj = raw as Record<string, unknown>;
  const tier =
    obj.tier === "PRO" ||
    obj.tier === "ELITE" ||
    obj.tier === "ADVISOR" ||
    obj.tier === "FREE"
      ? (obj.tier as BillingTier)
      : "FREE";
  return {
    stripeCustomerId:
      typeof obj.stripeCustomerId === "string" ? obj.stripeCustomerId : null,
    stripeSubscriptionId:
      typeof obj.stripeSubscriptionId === "string"
        ? obj.stripeSubscriptionId
        : null,
    tier,
    active: typeof obj.active === "boolean" ? obj.active : false,
    cancelAtPeriodEnd:
      typeof obj.cancelAtPeriodEnd === "boolean"
        ? obj.cancelAtPeriodEnd
        : false,
    currentPeriodEnd:
      typeof obj.currentPeriodEnd === "string"
        ? obj.currentPeriodEnd
        : null,
    updatedAt:
      typeof obj.updatedAt === "string"
        ? obj.updatedAt
        : new Date(0).toISOString(),
  };
}

/**
 * Lees billing-state voor een user (uit `UserProfile.preferences.billing`).
 */
export async function getBillingState(
  userId: string,
): Promise<BillingState> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { preferences: true },
  });
  const prefsObj =
    profile?.preferences && typeof profile.preferences === "object"
      ? (profile.preferences as Record<string, unknown>)
      : {};
  return parseBillingState(prefsObj.billing);
}

/**
 * Schrijf nieuwe billing-state naar `UserProfile.preferences.billing`.
 * Merge — andere preferences-keys (alerts, community, ...) blijven intact.
 */
export async function writeBillingState(
  userId: string,
  state: BillingState,
): Promise<void> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { preferences: true },
  });
  const prefsObj =
    profile?.preferences && typeof profile.preferences === "object"
      ? (profile.preferences as Record<string, unknown>)
      : {};
  const newPrefs = {
    ...prefsObj,
    billing: { ...state, updatedAt: new Date().toISOString() },
  };
  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, preferences: newPrefs as never },
    update: { preferences: newPrefs as never },
  });
}

/**
 * Sync vanuit een Stripe Subscription-object (uit `subscription.created`,
 * `subscription.updated`, `subscription.deleted` events).
 *
 * Vindt de user via `customer.email` (Stripe mailt het email-veld op de
 * customer) of via `metadata.userId` (als we 'em bij checkout meegeven).
 */
export async function syncFromSubscription(input: {
  subscription: Stripe.Subscription;
  customerEmail: string | null;
}): Promise<{ ok: boolean; userId?: string; error?: string }> {
  const email = input.customerEmail;
  if (!email) {
    return { ok: false, error: "No customer email on subscription event." };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user) {
    log.warn("billing", "subscription_for_unknown_user", {
      subscriptionId: input.subscription.id,
    });
    return { ok: false, error: "Unknown user." };
  }

  const { tier, active } = tierFromSubscription(input.subscription);
  const periodEnd =
    typeof (input.subscription as unknown as { current_period_end?: number })
      .current_period_end === "number"
      ? new Date(
          (input.subscription as unknown as { current_period_end: number })
            .current_period_end * 1000,
        ).toISOString()
      : null;

  const state: BillingState = {
    stripeCustomerId:
      typeof input.subscription.customer === "string"
        ? input.subscription.customer
        : input.subscription.customer.id,
    stripeSubscriptionId: input.subscription.id,
    tier,
    active,
    cancelAtPeriodEnd: input.subscription.cancel_at_period_end,
    currentPeriodEnd: periodEnd,
    updatedAt: new Date().toISOString(),
  };

  await writeBillingState(user.id, state);

  // Mirror naar gedenormaliseerde UserProfile.billingTier zodat
  // resolveCurrentTier() het direct ziet zonder preferences-parse.
  await prisma.userProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, billingTier: state.tier },
    update: { billingTier: state.tier },
  });

  await audit.record({
    userEmail: user.email,
    category: "system",
    action: "billing_sync",
    resourceType: "Subscription",
    resourceId: input.subscription.id,
    summary: `Subscription → tier=${tier}, active=${active}, status=${input.subscription.status}`,
    metadata: {
      subscriptionStatus: input.subscription.status,
      cancelAtPeriodEnd: input.subscription.cancel_at_period_end,
    },
  });

  return { ok: true, userId: user.id };
}
