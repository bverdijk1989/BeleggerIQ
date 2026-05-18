import { describe, expect, it } from "vitest";

import {
  getActiveRateLimitStore,
  inMemoryStore,
  setRateLimitStore,
  type RateLimitStore,
} from "@/lib/ratelimit";
import { resolvePolicy } from "@/lib/ratelimit/policy";

import { validateEnv } from "./env-validation";

/**
 * Module 19 — Launch Readiness & Trust Hardening spec-conformance.
 *
 * Het Module 19-spec eist 10 controles + diverse bypass-checks.
 * Auth/admin/headers waren al gedekt in Module 16; deze tests
 * bevriezen de Module 19-uitbreidingen:
 *  - Stripe price-IDs env-validatie (zonder secrets te loggen)
 *  - AI provider readiness check
 *  - Rate-limit-store abstractie (Redis drop-in mogelijk)
 *  - Launch checklist als doc-bewijs
 */

describe("Module 19 — Env-validation: Stripe price-IDs zonder secrets te loggen", () => {
  it("STRIPE_SECRET_KEY gezet + price-IDs ontbreken in productie → errors", () => {
    const result = validateEnv({
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://x:y@z/db?sslmode=require",
        BIQ_SESSION_SECRET: "x".repeat(40),
        STRIPE_SECRET_KEY: "sk_live_REDACTED",
        STRIPE_WEBHOOK_SECRET: "whsec_REDACTED",
      },
    });
    const missingMsg = result.errors.find((e) =>
      e.includes("price-IDs missing"),
    );
    expect(missingMsg).toBeDefined();
    // Belangrijk: secret zelf NIET in de error.
    expect(missingMsg).not.toContain("sk_live");
    expect(missingMsg).not.toContain("REDACTED");
  });

  it("STRIPE_SECRET_KEY gezet zonder webhook-secret → error in prod", () => {
    const result = validateEnv({
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://x:y@z/db?sslmode=require",
        BIQ_SESSION_SECRET: "x".repeat(40),
        STRIPE_SECRET_KEY: "sk_live_REDACTED",
        STRIPE_PRICE_PRO_MONTHLY: "price_pro_m",
        STRIPE_PRICE_PRO_YEARLY: "price_pro_y",
        STRIPE_PRICE_ELITE_MONTHLY: "price_elite_m",
        STRIPE_PRICE_ELITE_YEARLY: "price_elite_y",
      },
    });
    expect(
      result.errors.some((e) => e.includes("STRIPE_WEBHOOK_SECRET")),
    ).toBe(true);
  });

  it("Stripe niet geactiveerd → géén errors (Stripe is optioneel in dev)", () => {
    const result = validateEnv({
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://x:y@z/db?sslmode=require",
        BIQ_SESSION_SECRET: "x".repeat(40),
      },
    });
    expect(
      result.errors.some((e) => e.toLowerCase().includes("stripe")),
    ).toBe(false);
  });

  it("Volledige Stripe-config → géén Stripe-errors", () => {
    const result = validateEnv({
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://x:y@z/db?sslmode=require",
        BIQ_SESSION_SECRET: "x".repeat(40),
        STRIPE_SECRET_KEY: "sk_live_REDACTED",
        STRIPE_WEBHOOK_SECRET: "whsec_REDACTED",
        STRIPE_PRICE_PRO_MONTHLY: "price_pro_m",
        STRIPE_PRICE_PRO_YEARLY: "price_pro_y",
        STRIPE_PRICE_ELITE_MONTHLY: "price_elite_m",
        STRIPE_PRICE_ELITE_YEARLY: "price_elite_y",
      },
    });
    expect(
      result.errors.some((e) => e.toLowerCase().includes("stripe")),
    ).toBe(false);
  });
});

describe("Module 19 — AI provider readiness", () => {
  it("AI_PROVIDER=anthropic zonder key in prod → error", () => {
    const result = validateEnv({
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://x:y@z/db?sslmode=require",
        BIQ_SESSION_SECRET: "x".repeat(40),
        AI_PROVIDER: "anthropic",
      },
    });
    expect(
      result.errors.some((e) =>
        e.toLowerCase().includes("anthropic_api_key"),
      ),
    ).toBe(true);
  });

  it("AI_PROVIDER=openai zonder key in prod → error", () => {
    const result = validateEnv({
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://x:y@z/db?sslmode=require",
        BIQ_SESSION_SECRET: "x".repeat(40),
        AI_PROVIDER: "openai",
      },
    });
    expect(
      result.errors.some((e) => e.toLowerCase().includes("openai_api_key")),
    ).toBe(true);
  });

  it("Productie zonder AI_PROVIDER → warning (fallback werkt)", () => {
    const result = validateEnv({
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://x:y@z/db?sslmode=require",
        BIQ_SESSION_SECRET: "x".repeat(40),
      },
    });
    expect(
      result.warnings.some((w) =>
        w.toLowerCase().includes("ai_provider"),
      ),
    ).toBe(true);
    // Géén error: fallback is geldige operatie-modus.
    expect(
      result.errors.some((e) => e.toLowerCase().includes("ai_provider")),
    ).toBe(false);
  });

  it("AI_PROVIDER=anthropic + key gezet → géén errors", () => {
    const result = validateEnv({
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://x:y@z/db?sslmode=require",
        BIQ_SESSION_SECRET: "x".repeat(40),
        AI_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "sk-ant-REDACTED",
      },
    });
    expect(
      result.errors.some((e) => e.toLowerCase().includes("api_key")),
    ).toBe(false);
  });
});

describe("Module 19 — Rate-limit store abstractie", () => {
  it("Default-store is in-memory (`backend === 'memory'`)", () => {
    expect(getActiveRateLimitStore().backend).toBe("memory");
  });

  it("setRateLimitStore zwapt backend zonder call-site-aanpassing", () => {
    const fakeRedis: RateLimitStore = {
      backend: "redis",
      consume: () => ({
        allowed: true,
        remaining: 100,
        retryAfterMs: 0,
        state: { tokens: 100, lastRefillMs: 0 },
      }),
      prune: () => 0,
    };
    setRateLimitStore(fakeRedis);
    try {
      expect(getActiveRateLimitStore().backend).toBe("redis");
    } finally {
      // Reset zodat andere tests niet beïnvloed worden.
      setRateLimitStore(inMemoryStore);
    }
  });

  it("inMemoryStore exports consume + prune", () => {
    expect(typeof inMemoryStore.consume).toBe("function");
    expect(typeof inMemoryStore.prune).toBe("function");
    expect(inMemoryStore.backend).toBe("memory");
  });

  it("STRICT_MARKET policy actief op /api/market/* (Module 16+19)", () => {
    const p = resolvePolicy("/api/market/quote", "GET");
    expect(p?.name).toBe("strict-market");
  });
});

describe("Module 19 — Geen secrets in error-messages (PII-eis)", () => {
  it("Stripe error-messages bevatten alleen env-var-namen, geen waardes", () => {
    const SECRET_VALUE = "sk_live_SUPER_SECRET_12345";
    const result = validateEnv({
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://x:y@z/db?sslmode=require",
        BIQ_SESSION_SECRET: "x".repeat(40),
        STRIPE_SECRET_KEY: SECRET_VALUE,
      },
    });
    for (const msg of [...result.errors, ...result.warnings]) {
      expect(msg).not.toContain(SECRET_VALUE);
      expect(msg).not.toContain("SUPER_SECRET");
    }
  });

  it("AI provider error-messages bevatten alleen env-var-namen, geen waardes", () => {
    const result = validateEnv({
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://x:y@z/db?sslmode=require",
        BIQ_SESSION_SECRET: "x".repeat(40),
        AI_PROVIDER: "anthropic",
        // Key bewust niet gezet — error verwacht
      },
    });
    for (const msg of [...result.errors, ...result.warnings]) {
      expect(msg).not.toContain("sk-ant");
      expect(msg).not.toContain("sk_");
    }
  });
});
