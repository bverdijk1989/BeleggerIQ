import { NextResponse, type NextRequest } from "next/server";

import { resolveUser } from "@/lib/auth";
import { createCheckoutSession, getStripeClient } from "@/lib/billing";
import { getBillingState } from "@/lib/billing";
import { portfolioRepository } from "@/lib/data";
import { jsonError, jsonServerError } from "@/lib/http/errors";
import type { BillingTier } from "@/types/profile";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/checkout
 *
 * Body: `{ tier: "PRO"|"ELITE", interval: "monthly"|"yearly" }`
 *
 * Maakt een Stripe Checkout-sessie + redirect-URL. Als Stripe niet
 * geconfigureerd is (env-vars ontbreken): retourneert 503 — frontend
 * toont dan "Coming soon" inplaats van een dead-link.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = resolveUser(request);
  if (!auth.ok) return jsonError(auth.error, auth.status, "UNAUTHENTICATED");

  if (!getStripeClient()) {
    return jsonError(
      "Stripe is nog niet geconfigureerd in deze omgeving.",
      503,
      "STRIPE_NOT_CONFIGURED",
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const tier = parseTier((body as Record<string, unknown>)?.tier);
  if (!tier) return jsonError("Invalid tier.", 400);
  const interval = parseInterval((body as Record<string, unknown>)?.interval);
  if (!interval) return jsonError("Invalid interval.", 400);

  try {
    const ctx = await portfolioRepository
      .findUserContextByEmail(auth.user.email)
      .catch(() => null);
    if (!ctx?.userId) {
      return jsonError("Geen user-context.", 404, "USER_NOT_FOUND");
    }
    const billing = await getBillingState(ctx.userId);

    const origin = request.nextUrl.origin;
    const result = await createCheckoutSession({
      tier,
      interval,
      userEmail: auth.user.email,
      stripeCustomerId: billing.stripeCustomerId,
      successUrl: `${origin}/pricing?status=success`,
      cancelUrl: `${origin}/pricing?status=cancelled`,
    });

    if (!result.ok || !result.url) {
      return jsonError(result.error ?? "Checkout-fout.", 500);
    }

    return NextResponse.json({ ok: true, url: result.url });
  } catch (error) {
    return jsonServerError("stripe_checkout_failed", error);
  }
}

function parseTier(value: unknown): BillingTier | null {
  if (value === "PRO" || value === "ELITE" || value === "ADVISOR") return value;
  return null;
}

function parseInterval(value: unknown): "monthly" | "yearly" | null {
  if (value === "monthly" || value === "yearly") return value;
  return null;
}
