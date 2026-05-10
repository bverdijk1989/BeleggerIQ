/**
 * Stripe-integratie — env-gated activatie.
 *
 * **Activatie**: alleen wanneer `STRIPE_SECRET_KEY` env-var aanwezig is.
 * Zonder key: alle helpers retourneren `null` en de UI toont een
 * "Coming soon"-fallback. Geen runtime-crashes; geen lege import-cycles.
 *
 * **Architectuur**:
 *  - Mapping `BillingTier → Stripe Price-id` via env-vars
 *    (`STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`, ...)
 *  - Webhook-handler verifieert signature via `STRIPE_WEBHOOK_SECRET`
 *  - Customer-id geserialiseerd in `UserProfile.preferences.billing.stripeCustomerId`
 */

import Stripe from "stripe";

import type { BillingTier } from "@/types/profile";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe | null {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  stripeClient = new Stripe(key, {
    // Geen expliciete `apiVersion` — laat de SDK z'n bundled-version
    // gebruiken (komt overeen met de stripe-package-versie). Pinnen
    // tegen string-literal verschilt per SDK-major en breekt typing.
  });
  return stripeClient;
}

export interface PriceMapping {
  monthly: string | null;
  yearly: string | null;
}

/**
 * Haalt de Stripe-Price-id op voor een tier + interval. Mapping zit in
 * env-vars zodat dezelfde code in staging + prod werkt met andere prices.
 */
export function getPriceId(
  tier: BillingTier,
  interval: "monthly" | "yearly",
): string | null {
  const tierKey = tier.toUpperCase();
  const intervalKey = interval.toUpperCase();
  const envKey = `STRIPE_PRICE_${tierKey}_${intervalKey}`;
  const value = process.env[envKey];
  return value && value.length > 0 ? value : null;
}

export function getPriceMappingForTier(tier: BillingTier): PriceMapping {
  return {
    monthly: getPriceId(tier, "monthly"),
    yearly: getPriceId(tier, "yearly"),
  };
}

/**
 * Bouwt een Stripe Checkout-session voor een tier-upgrade. Returnt
 * de redirect-URL of null wanneer Stripe niet geconfigureerd is.
 */
export interface CreateCheckoutInput {
  tier: BillingTier;
  interval: "monthly" | "yearly";
  userEmail: string;
  /** Bestaand Stripe customer-id, of null voor nieuwe customer. */
  stripeCustomerId: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface CreateCheckoutResult {
  ok: boolean;
  url?: string;
  error?: string;
}

export async function createCheckoutSession(
  input: CreateCheckoutInput,
): Promise<CreateCheckoutResult> {
  const stripe = getStripeClient();
  if (!stripe) {
    return {
      ok: false,
      error: "Stripe niet geconfigureerd (env STRIPE_SECRET_KEY ontbreekt).",
    };
  }
  const priceId = getPriceId(input.tier, input.interval);
  if (!priceId) {
    return {
      ok: false,
      error: `Geen Price-id voor ${input.tier} ${input.interval} (env STRIPE_PRICE_${input.tier.toUpperCase()}_${input.interval.toUpperCase()} ontbreekt).`,
    };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card", "ideal"],
      line_items: [{ price: priceId, quantity: 1 }],
      // Customer-koppeling: bij nieuwe user maak Stripe 'em aan op basis
      // van email; bij bestaande customer hergebruiken.
      ...(input.stripeCustomerId
        ? { customer: input.stripeCustomerId }
        : { customer_email: input.userEmail }),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      // Metadata voor webhook-side reconciliation.
      metadata: {
        tier: input.tier,
        interval: input.interval,
      },
      subscription_data: {
        metadata: {
          tier: input.tier,
          interval: input.interval,
        },
      },
      // EU-BTW: laat Stripe de customer's locatie vragen + BTW automatisch toepassen.
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      allow_promotion_codes: true,
    });

    return {
      ok: true,
      url: session.url ?? undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Stripe-fout: ${error.message}`
          : "Onbekende Stripe-fout.",
    };
  }
}

/**
 * Bouwt een customer-portal-session voor het beheren van een actief
 * abonnement (cancel / payment-method update / invoice-history).
 */
export async function createCustomerPortalSession(input: {
  stripeCustomerId: string;
  returnUrl: string;
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  const stripe = getStripeClient();
  if (!stripe) {
    return { ok: false, error: "Stripe niet geconfigureerd." };
  }
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: input.stripeCustomerId,
      return_url: input.returnUrl,
    });
    return { ok: true, url: session.url };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Onbekende fout.",
    };
  }
}

/**
 * Verifieer een Stripe webhook-payload + signature. Returnt het event
 * of null bij invalid-signature.
 */
export function verifyWebhookSignature(input: {
  payload: string | Buffer;
  signature: string;
}): Stripe.Event | null {
  const stripe = getStripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return null;
  try {
    return stripe.webhooks.constructEvent(
      input.payload,
      input.signature,
      secret,
    );
  } catch {
    return null;
  }
}

/**
 * Map een Stripe subscription-status naar onze interne BillingTier.
 * Niet-betaalde of gecancelde subscriptions vallen terug op FREE.
 */
export function tierFromSubscription(
  subscription: Stripe.Subscription,
): { tier: BillingTier; active: boolean } {
  const tierMeta = subscription.metadata?.tier;
  const tier: BillingTier =
    tierMeta === "PRO" || tierMeta === "ELITE" || tierMeta === "ADVISOR"
      ? tierMeta
      : "FREE";
  const active =
    subscription.status === "active" ||
    subscription.status === "trialing";
  return { tier: active ? tier : "FREE", active };
}
