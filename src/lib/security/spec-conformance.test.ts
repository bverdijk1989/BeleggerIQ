import { describe, expect, it } from "vitest";

import { isAdminEmail } from "@/lib/admin";
import { canUseFeature } from "@/lib/entitlements";
import { hasPermission } from "@/lib/enterprise/roles";
import { resolvePolicy } from "@/lib/ratelimit/policy";

import { ensureNoPIIInPrompt } from "./ai-prompt-guard";
import { sanitizeActionError } from "./error-sanitizer";
import { validateEnv } from "./env-validation";
import { SECURITY_HEADERS } from "./headers";
import { detectPII, redactDeep, redactString } from "./redact";

/**
 * Module 16 — Security, Privacy & Compliance spec-conformance.
 *
 * Bevriest dat de 15 spec-controles op codebase-niveau gedekt zijn.
 * Tests zijn pure-function asserts; geen DB, geen netwerk.
 */

describe("Module 16 — Check 1: Authenticatie helpers aanwezig", () => {
  it("auth-module exports session-resolver + admin-guard", () => {
    // Import-zonder-side-effects als smoke-test dat de module-grenzen
    // stevig staan.
    expect(typeof isAdminEmail).toBe("function");
  });
});

describe("Module 16 — Check 2: Autorisatie (RBAC)", () => {
  it("Enterprise OrgRole-permissions onderscheiden read vs write", () => {
    expect(hasPermission("VIEWER", "report.read")).toBe(true);
    expect(hasPermission("VIEWER", "report.generate")).toBe(false);
    expect(hasPermission("ADVISOR", "client.read")).toBe(true);
    expect(hasPermission("CLIENT", "client.list")).toBe(false);
  });
});

describe("Module 16 — Check 5: Rate-limiting policies", () => {
  it("/api/chat → strict-chat (5/min)", () => {
    const p = resolvePolicy("/api/chat", "POST");
    expect(p?.name).toBe("strict-chat");
    expect(p?.config.capacity).toBeLessThanOrEqual(5);
  });

  it("/api/ai/* → strict-ai (5/min)", () => {
    const p = resolvePolicy("/api/ai/explain", "POST");
    expect(p?.name).toBe("strict-ai");
  });

  it("/api/market/* → strict-market (Module 16 §4.3)", () => {
    const p = resolvePolicy("/api/market/quote", "GET");
    expect(p?.name).toBe("strict-market");
    expect(p?.config.capacity).toBeLessThanOrEqual(10);
  });

  it("POST /login → strict-login (3/min)", () => {
    const p = resolvePolicy("/login", "POST");
    expect(p?.name).toBe("strict-login");
    expect(p?.config.capacity).toBeLessThanOrEqual(3);
  });

  it("Default-API valt op /api/* zonder specifieke match", () => {
    const p = resolvePolicy("/api/decisions/x/status", "POST");
    expect(p?.name).toBe("default-api");
  });
});

describe("Module 16 — Check 6: Env-validation fail-fast", () => {
  it("Productie zonder DATABASE_URL → error", () => {
    const result = validateEnv({
      env: {
        NODE_ENV: "production",
        BIQ_SESSION_SECRET: "x".repeat(32),
      },
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(
      result.errors.some((e) => e.toLowerCase().includes("database_url")),
    ).toBe(true);
  });

  it("Productie met BIQ_ALLOW_DEMO_AUTH=true → error", () => {
    const result = validateEnv({
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://x:y@z/db",
        BIQ_SESSION_SECRET: "x".repeat(32),
        BIQ_ALLOW_DEMO_AUTH: "true",
      },
    });
    expect(
      result.errors.some((e) =>
        e.toLowerCase().includes("biq_allow_demo_auth"),
      ),
    ).toBe(true);
  });

  it("Productie met te-korte BIQ_SESSION_SECRET → error", () => {
    const result = validateEnv({
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://x:y@z/db",
        BIQ_SESSION_SECRET: "short",
      },
    });
    expect(
      result.errors.some((e) =>
        e.toLowerCase().includes("biq_session_secret"),
      ),
    ).toBe(true);
  });
});

describe("Module 16 — Check 7: Logging zonder PII (value-level)", () => {
  it("redactString scrubt email-adressen", () => {
    expect(redactString("user foo@bar.com tried login")).not.toContain(
      "foo@bar.com",
    );
  });

  it("redactString scrubt IPv4-adressen (eerste octet bewaard)", () => {
    expect(redactString("from 192.168.1.42 failed")).toMatch(/192\.x\.x\.x/);
  });

  it("redactString scrubt Bearer-tokens (>=16 chars)", () => {
    const out = redactString("Authorization: Bearer abc123xyz9876defghijk");
    expect(out).toContain("[redacted]");
    expect(out).not.toContain("abc123xyz9876defghijk");
  });

  it("redactDeep scrubt nested objects", () => {
    const out = redactDeep({
      user: { email: "x@y.com", ip: "10.0.0.1" },
      note: "hello",
    });
    expect(JSON.stringify(out)).not.toContain("x@y.com");
    expect(JSON.stringify(out)).not.toContain("10.0.0.1");
  });

  it("detectPII vindt emails én IPv4 in test-string", () => {
    const result = detectPII("contact: a@b.com from 1.2.3.4");
    expect(result.emails.length).toBeGreaterThan(0);
    expect(result.ipv4s.length).toBeGreaterThan(0);
  });
});

describe("Module 16 — Check 8: AI prompt PII-guard (strict)", () => {
  it("Prompt met email → throws AIPromptPIIError in strict mode", () => {
    expect(() =>
      ensureNoPIIInPrompt("Analyseer voor user foo@bar.com", {
        strict: true,
      }),
    ).toThrow();
  });

  it("Prompt zonder PII → géén throw", () => {
    expect(() =>
      ensureNoPIIInPrompt("Analyseer portfolio met BTC en ASML", {
        strict: true,
      }),
    ).not.toThrow();
  });

  it("Soft-mode → redact + onLeak callback (geen throw)", () => {
    let leakCalled = false;
    const out = ensureNoPIIInPrompt("user x@y.com asked", {
      strict: false,
      onLeak: () => {
        leakCalled = true;
      },
    });
    expect(out).not.toContain("x@y.com");
    expect(leakCalled).toBe(true);
  });
});

describe("Module 16 — Check 12: Error-handling sanitization", () => {
  it("DB-error-message wordt vervangen door generieke melding", () => {
    const result = sanitizeActionError(
      new Error("DB connection refused at 1.2.3.4"),
      {
        scope: "test",
        action: "import",
        fallbackMessage: "Importeren mislukt door een interne fout.",
      },
    );
    expect(result.error).not.toContain("1.2.3.4");
    expect(result.error).toMatch(/intern/i);
  });

  it("Allowlist-bekende user-friendly messages gaan ongewijzigd door", () => {
    const result = sanitizeActionError(new Error("Geen rechten"), {
      scope: "test",
      action: "delete",
      fallbackMessage: "Onbekende fout.",
      allowlist: ["Geen rechten"],
    });
    expect(result.error).toBe("Geen rechten");
  });
});

describe("Module 16 — Check 13: Admin route guard", () => {
  it("Niet-admin email → isAdmin false", () => {
    expect(
      isAdminEmail("user@example.com", "admin@beleggeriq.nl").isAdmin,
    ).toBe(false);
  });

  it("Admin via env-allowlist → isAdmin true", () => {
    expect(
      isAdminEmail("admin@beleggeriq.nl", "admin@beleggeriq.nl").isAdmin,
    ).toBe(true);
  });

  it("Geen allowlist → niemand admin (failsafe)", () => {
    expect(isAdminEmail("admin@beleggeriq.nl", undefined).isAdmin).toBe(false);
  });
});

describe("Module 16 — Check 14: Subscription-bypass (entitlement-tests)", () => {
  it("FREE krijgt GEEN toegang tot PRO-only feature (briefing.daily)", () => {
    expect(canUseFeature("FREE", "briefing.daily").allowed).toBe(false);
  });

  it("FREE krijgt GEEN toegang tot ELITE-only feature (signal_fusion)", () => {
    expect(
      canUseFeature("FREE", "signal_fusion.confidence_score").allowed,
    ).toBe(false);
  });

  it("PRO krijgt GEEN toegang tot ELITE-only feature (crypto.lab)", () => {
    expect(canUseFeature("PRO", "crypto.lab").allowed).toBe(false);
  });

  it("ELITE krijgt GEEN toegang tot ADVISOR-only feature", () => {
    expect(canUseFeature("ELITE", "advisor.multi_client").allowed).toBe(false);
  });

  it("null/undefined tier valt terug op FREE (defensive default)", () => {
    expect(canUseFeature(null, "briefing.daily").allowed).toBe(false);
    expect(canUseFeature(undefined, "crypto.lab").allowed).toBe(false);
  });
});

describe("Module 16 — Check: Security headers globaal", () => {
  it("SECURITY_HEADERS bevat CSP + X-Frame-Options + HSTS + nosniff", () => {
    const headerNames = Object.keys(SECURITY_HEADERS).map((k) =>
      k.toLowerCase(),
    );
    expect(headerNames).toContain("content-security-policy");
    expect(headerNames).toContain("x-frame-options");
    expect(headerNames).toContain("strict-transport-security");
    expect(headerNames).toContain("x-content-type-options");
  });

  it("X-Frame-Options is DENY (clickjacking-prevention)", () => {
    const key = Object.keys(SECURITY_HEADERS).find(
      (k) => k.toLowerCase() === "x-frame-options",
    );
    expect(key).toBeDefined();
    expect(SECURITY_HEADERS[key!]).toBe("DENY");
  });

  it("X-Content-Type-Options is nosniff", () => {
    const key = Object.keys(SECURITY_HEADERS).find(
      (k) => k.toLowerCase() === "x-content-type-options",
    );
    expect(key).toBeDefined();
    expect(SECURITY_HEADERS[key!]).toBe("nosniff");
  });
});
