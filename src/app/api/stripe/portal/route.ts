import { NextResponse, type NextRequest } from "next/server";

import { resolveUser } from "@/lib/auth";
import {
  createCustomerPortalSession,
  getBillingState,
  getStripeClient,
} from "@/lib/billing";
import { portfolioRepository } from "@/lib/data";
import { jsonError, jsonServerError } from "@/lib/http/errors";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/portal
 *
 * Genereert een Stripe Customer Portal-URL voor het beheren van
 * abonnement, payment-method, invoices.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = resolveUser(request);
  if (!auth.ok) return jsonError(auth.error, auth.status, "UNAUTHENTICATED");

  if (!getStripeClient()) {
    return jsonError(
      "Stripe niet geconfigureerd.",
      503,
      "STRIPE_NOT_CONFIGURED",
    );
  }

  try {
    const ctx = await portfolioRepository
      .findUserContextByEmail(auth.user.email)
      .catch(() => null);
    if (!ctx?.userId) {
      return jsonError("Geen user-context.", 404, "USER_NOT_FOUND");
    }

    const billing = await getBillingState(ctx.userId);
    if (!billing.stripeCustomerId) {
      return jsonError(
        "Geen Stripe customer-id gevonden — eerst checkout afronden.",
        400,
        "NO_STRIPE_CUSTOMER",
      );
    }

    const result = await createCustomerPortalSession({
      stripeCustomerId: billing.stripeCustomerId,
      returnUrl: `${request.nextUrl.origin}/pricing`,
    });

    if (!result.ok || !result.url) {
      return jsonError(result.error ?? "Portal-fout.", 500);
    }

    return NextResponse.json({ ok: true, url: result.url });
  } catch (error) {
    return jsonServerError("stripe_portal_failed", error);
  }
}
