import { NextResponse, type NextRequest } from "next/server";

import {
  getStripeClient,
  syncFromSubscription,
  verifyWebhookSignature,
} from "@/lib/billing";
import { jsonError } from "@/lib/http/errors";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";
// Stripe webhooks komen met raw body — Next 16 Edge zou body al
// kunnen parsen; we forceren Node-runtime + raw read.
export const runtime = "nodejs";

/**
 * POST /api/stripe/webhook
 *
 * Stripe-webhook handler. Verifieert signature, dispatcht events naar
 * billing-sync. Idempotent — Stripe stuurt soms dubbele events.
 *
 * Geconfigureerd in Stripe-dashboard met endpoint:
 *   `https://<host>/api/stripe/webhook`
 *   en signing-secret in env `STRIPE_WEBHOOK_SECRET`
 *
 * Subscribe op events:
 *   - `customer.subscription.created`
 *   - `customer.subscription.updated`
 *   - `customer.subscription.deleted`
 *   - `checkout.session.completed`
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const stripe = getStripeClient();
  if (!stripe) {
    // Stripe niet geconfigureerd — webhooks zouden niet geconfigureerd moeten zijn.
    return jsonError("Stripe niet geconfigureerd.", 503, "STRIPE_NOT_CONFIGURED");
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return jsonError("Missing stripe-signature header.", 400);
  }

  const rawBody = await request.text();
  const event = verifyWebhookSignature({
    payload: rawBody,
    signature,
  });
  if (!event) {
    log.warn("billing:webhook", "invalid_signature", {
      // Geen body loggen — kan PII bevatten.
    });
    return jsonError("Invalid signature.", 401);
  }

  log.info("billing:webhook", "event_received", {
    type: event.type,
    eventId: event.id,
  });

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        // Customer kan id-string zijn óf een uitgebreid object.
        let customerEmail: string | null = null;
        if (typeof subscription.customer === "string") {
          const customer = await stripe.customers.retrieve(subscription.customer);
          if (!customer.deleted) {
            customerEmail = customer.email ?? null;
          }
        } else if (!subscription.customer.deleted) {
          customerEmail = subscription.customer.email ?? null;
        }
        await syncFromSubscription({ subscription, customerEmail });
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object;
        if (
          session.mode === "subscription" &&
          typeof session.subscription === "string"
        ) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription,
          );
          const customerEmail = session.customer_email ?? null;
          await syncFromSubscription({ subscription, customerEmail });
        }
        break;
      }
      default:
        log.info("billing:webhook", "unhandled_event", { type: event.type });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    log.error("billing:webhook", "event_handler_failed", {
      type: event.type,
      eventId: event.id,
      rawMessage: error instanceof Error ? error.message : String(error),
    });
    // Return 500 zodat Stripe het event opnieuw probeert.
    return jsonError("Webhook-handler error.", 500);
  }
}
