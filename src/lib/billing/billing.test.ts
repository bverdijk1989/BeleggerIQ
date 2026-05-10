import { describe, expect, it } from "vitest";

import {
  getPriceId,
  getPriceMappingForTier,
  getStripeClient,
  tierFromSubscription,
} from "./stripe";
import { parseBillingState } from "./sync";

describe("Stripe — env-gated", () => {
  it("getStripeClient retourneert null zonder STRIPE_SECRET_KEY", () => {
    const original = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    // Re-require om module-level cache te omzeilen — voor de scope van
    // deze test is null-status genoeg.
    expect(getStripeClient()).toBeNull();
    if (original) process.env.STRIPE_SECRET_KEY = original;
  });

  it("getPriceId leest uit env-vars per tier × interval", () => {
    process.env.STRIPE_PRICE_PRO_MONTHLY = "price_test_pro_monthly";
    expect(getPriceId("PRO", "monthly")).toBe("price_test_pro_monthly");
    expect(getPriceId("ELITE", "monthly")).toBeNull();
    delete process.env.STRIPE_PRICE_PRO_MONTHLY;
  });

  it("getPriceMappingForTier levert {monthly, yearly}", () => {
    process.env.STRIPE_PRICE_PRO_MONTHLY = "p_m";
    process.env.STRIPE_PRICE_PRO_YEARLY = "p_y";
    const mapping = getPriceMappingForTier("PRO");
    expect(mapping.monthly).toBe("p_m");
    expect(mapping.yearly).toBe("p_y");
    delete process.env.STRIPE_PRICE_PRO_MONTHLY;
    delete process.env.STRIPE_PRICE_PRO_YEARLY;
  });
});

describe("tierFromSubscription", () => {
  it("active subscription met tier-metadata → tier + active=true", () => {
    const sub = {
      status: "active",
      metadata: { tier: "PRO" },
    } as never;
    const result = tierFromSubscription(sub);
    expect(result.tier).toBe("PRO");
    expect(result.active).toBe(true);
  });

  it("trialing subscription → active=true", () => {
    const sub = {
      status: "trialing",
      metadata: { tier: "ELITE" },
    } as never;
    expect(tierFromSubscription(sub).active).toBe(true);
  });

  it("canceled subscription → tier=FREE", () => {
    const sub = {
      status: "canceled",
      metadata: { tier: "PRO" },
    } as never;
    expect(tierFromSubscription(sub).tier).toBe("FREE");
  });

  it("invalid tier-metadata → FREE", () => {
    const sub = {
      status: "active",
      metadata: { tier: "ENTERPRISE" }, // niet in onze enum
    } as never;
    expect(tierFromSubscription(sub).tier).toBe("FREE");
  });
});

describe("parseBillingState", () => {
  it("default-state op lege blob", () => {
    const s = parseBillingState(null);
    expect(s.tier).toBe("FREE");
    expect(s.active).toBe(false);
    expect(s.stripeCustomerId).toBeNull();
  });

  it("tolerant voor onbekende tier-strings", () => {
    const s = parseBillingState({ tier: "NONSENSE" });
    expect(s.tier).toBe("FREE");
  });

  it("parseert valid blob", () => {
    const s = parseBillingState({
      tier: "ELITE",
      active: true,
      stripeCustomerId: "cus_x",
      stripeSubscriptionId: "sub_y",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: "2027-01-01T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    expect(s.tier).toBe("ELITE");
    expect(s.active).toBe(true);
    expect(s.stripeCustomerId).toBe("cus_x");
  });
});
