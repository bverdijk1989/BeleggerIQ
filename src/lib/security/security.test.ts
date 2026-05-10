import { describe, expect, it } from "vitest";

import { ensureNoPIIInPrompt, ensureNoPIIInMessages, AIPromptPIIError } from "./ai-prompt-guard";
import { validateEnv } from "./env-validation";
import { sanitizeActionError } from "./error-sanitizer";
import { applySecurityHeaders, SECURITY_HEADERS } from "./headers";
import { detectPII, hashIdentifier, redactDeep, redactString } from "./redact";

// ============================================================
//  Redact
// ============================================================

describe("redactString", () => {
  it("scrubt e-mail-adressen", () => {
    expect(redactString("contact: foo@example.com")).toBe(
      "contact: [email-redacted]",
    );
  });

  it("scrubt IPv4 maar bewaart eerste octet", () => {
    const out = redactString("client 83.245.12.4");
    expect(out).toContain("83.x.x.x");
    expect(out).not.toContain("245");
  });

  it("scrubt Bearer-tokens", () => {
    expect(redactString("Authorization: Bearer abcd1234efgh5678ijkl9012")).toBe(
      "Authorization: Bearer [redacted]",
    );
  });

  it("idempotent: dubbel toepassen geeft zelfde output", () => {
    const a = redactString("foo@bar.com 1.2.3.4");
    const b = redactString(a);
    expect(b).toBe(a);
  });

  it("scrubt long-tokens alleen wanneer scrubLongTokens=true", () => {
    const token = "a".repeat(40);
    expect(redactString(`X-Token: ${token}`)).toContain(token);
    expect(redactString(`X-Token: ${token}`, { scrubLongTokens: true })).toContain(
      "[token-redacted]",
    );
  });

  it("fullIpRedact verwijdert ook eerste octet", () => {
    expect(redactString("1.2.3.4", { fullIpRedact: true })).toBe("x.x.x.x");
  });

  it("lege string is no-op", () => {
    expect(redactString("")).toBe("");
  });
});

describe("redactDeep", () => {
  it("scrubt strings binnen geneste objecten", () => {
    const out = redactDeep({
      msg: "user foo@example.com from 1.2.3.4",
      details: [{ note: "ping bar@x.io" }],
    });
    expect(JSON.stringify(out)).not.toContain("foo@example.com");
    expect(JSON.stringify(out)).not.toContain("bar@x.io");
    expect(JSON.stringify(out)).not.toContain("2.3.4");
  });

  it("non-string types blijven intact", () => {
    const out = redactDeep({ count: 42, ratio: 0.5, active: true });
    expect(out).toEqual({ count: 42, ratio: 0.5, active: true });
  });

  it("safety-cap op deeply nested objects", () => {
    let obj: unknown = { leaf: "foo@bar.com" };
    for (let i = 0; i < 10; i++) obj = { nested: obj };
    const out = redactDeep(obj);
    expect(out).toBeTruthy();
  });
});

describe("hashIdentifier", () => {
  it("deterministisch", () => {
    expect(hashIdentifier("user@example.com")).toBe(
      hashIdentifier("user@example.com"),
    );
  });

  it("verschillende inputs → verschillende hashes (best-effort)", () => {
    const a = hashIdentifier("user1@example.com");
    const b = hashIdentifier("user2@example.com");
    expect(a).not.toBe(b);
  });

  it("output is 8-char lowercase hex", () => {
    expect(hashIdentifier("test")).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("detectPII", () => {
  it("vindt emails + ipv4s + bearers", () => {
    const r = detectPII("user@x.com from 1.2.3.4 with Bearer abcd1234efgh5678");
    expect(r.emails).toHaveLength(1);
    expect(r.ipv4s).toHaveLength(1);
    expect(r.bearers).toHaveLength(1);
  });

  it("clean string → 0 findings", () => {
    const r = detectPII("portfolio summary 12.5% YTD");
    expect(r.emails).toHaveLength(0);
    expect(r.ipv4s).toHaveLength(0);
    expect(r.bearers).toHaveLength(0);
  });
});

// ============================================================
//  Env validation
// ============================================================

describe("validateEnv", () => {
  it("ontbrekende DATABASE_URL → error", () => {
    const r = validateEnv({ env: {} });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("DATABASE_URL"))).toBe(true);
  });

  it("dev-mode met korte session-secret → warning, geen error", () => {
    const r = validateEnv({
      env: {
        DATABASE_URL: "postgres://x",
        BIQ_SESSION_SECRET: "short",
        NODE_ENV: "development",
      },
    });
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes("BIQ_SESSION_SECRET"))).toBe(true);
  });

  it("prod-mode met korte session-secret → error", () => {
    const r = validateEnv({
      productionMode: true,
      env: {
        DATABASE_URL: "postgres://x?sslmode=require",
        BIQ_SESSION_SECRET: "short",
      },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("BIQ_SESSION_SECRET"))).toBe(true);
  });

  it("prod-mode + BIQ_ALLOW_DEMO_AUTH=true → error", () => {
    const r = validateEnv({
      productionMode: true,
      env: {
        DATABASE_URL: "postgres://x?sslmode=require",
        BIQ_SESSION_SECRET: "x".repeat(32),
        BIQ_ALLOW_DEMO_AUTH: "true",
      },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("BIQ_ALLOW_DEMO_AUTH"))).toBe(true);
  });

  it("prod zonder sslmode → warning", () => {
    const r = validateEnv({
      productionMode: true,
      env: {
        DATABASE_URL: "postgres://x",
        BIQ_SESSION_SECRET: "x".repeat(32),
      },
    });
    expect(r.warnings.some((w) => w.includes("sslmode"))).toBe(true);
  });

  it("MAIL_TRANSPORT=smtp + ontbrekende SMTP_* → fail", () => {
    const r = validateEnv({
      productionMode: true,
      env: {
        DATABASE_URL: "postgres://x?sslmode=require",
        BIQ_SESSION_SECRET: "x".repeat(32),
        MAIL_TRANSPORT: "smtp",
      },
    });
    expect(r.errors.some((e) => e.includes("SMTP_HOST"))).toBe(true);
  });

  it("compleet OK in productie → ok=true", () => {
    const r = validateEnv({
      productionMode: true,
      env: {
        DATABASE_URL: "postgres://x?sslmode=require",
        BIQ_SESSION_SECRET: "x".repeat(40),
        MAIL_TRANSPORT: "smtp",
        SMTP_HOST: "h",
        SMTP_PORT: "587",
        SMTP_USER: "u",
        SMTP_PASS: "p",
        SMTP_FROM: "n@x.com",
      },
    });
    expect(r.ok).toBe(true);
  });
});

// ============================================================
//  AI prompt-guard
// ============================================================

describe("ensureNoPIIInPrompt", () => {
  it("clean prompt → ongewijzigd", () => {
    const out = ensureNoPIIInPrompt("portfolio rendement 12% YTD", {
      isProduction: true,
    });
    expect(out).toBe("portfolio rendement 12% YTD");
  });

  it("prompt met email + strict (prod) → throw", () => {
    expect(() =>
      ensureNoPIIInPrompt("user foo@example.com vraagt analyse", {
        isProduction: true,
      }),
    ).toThrow(AIPromptPIIError);
  });

  it("prompt met email + non-strict (dev) → redact + onLeak callback", () => {
    let leakSeen = false;
    const out = ensureNoPIIInPrompt("user foo@example.com vraagt analyse", {
      isProduction: false,
      onLeak: () => {
        leakSeen = true;
      },
    });
    expect(out).toContain("[email-redacted]");
    expect(leakSeen).toBe(true);
  });

  it("ensureNoPIIInMessages werkt op message-array", () => {
    const out = ensureNoPIIInMessages(
      [
        { role: "system", content: "je bent een coach" },
        { role: "user", content: "mijn email is x@y.com" },
      ],
      { isProduction: false },
    );
    expect(out[0]?.content).toBe("je bent een coach");
    expect(out[1]?.content).toContain("[email-redacted]");
  });

  it("AIPromptPIIError bevat findings", () => {
    try {
      ensureNoPIIInPrompt("Bearer abcd1234efgh5678ijkl test", {
        isProduction: true,
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AIPromptPIIError);
      const err = e as AIPromptPIIError;
      expect(err.findings.bearers.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================
//  Error sanitizer
// ============================================================

describe("sanitizeActionError", () => {
  it("default: generieke message + INTERNAL_ERROR code", () => {
    const result = sanitizeActionError(new Error("DB connection refused at 1.2.3.4"), {
      scope: "portfolio",
      action: "import",
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INTERNAL_ERROR");
    expect(result.error).not.toContain("DB connection");
    expect(result.error).not.toContain("1.2.3.4");
  });

  it("allowlist: bekende user-friendly message gaat door", () => {
    const result = sanitizeActionError(new Error("Geen rechten"), {
      scope: "portfolio",
      action: "delete",
      allowlist: ["Geen rechten"],
    });
    expect(result.error).toBe("Geen rechten");
  });

  it("custom fallback + code", () => {
    const result = sanitizeActionError(new Error("anything"), {
      scope: "x",
      action: "y",
      fallbackMessage: "Importeren mislukt",
      code: "IMPORT_FAILED",
    });
    expect(result.error).toBe("Importeren mislukt");
    expect(result.code).toBe("IMPORT_FAILED");
  });

  it("non-Error input → string-cast in log, generieke output", () => {
    const result = sanitizeActionError("string-error", {
      scope: "x",
      action: "y",
    });
    expect(result.ok).toBe(false);
  });
});

// ============================================================
//  Security headers
// ============================================================

describe("applySecurityHeaders", () => {
  it("zet alle headers op", () => {
    const h = new Headers();
    applySecurityHeaders(h);
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
    expect(h.get("X-Frame-Options")).toBe("DENY");
    expect(h.get("Strict-Transport-Security")).toContain("max-age");
    expect(h.get("Content-Security-Policy")).toContain("default-src");
    expect(h.get("Permissions-Policy")).toContain("camera=()");
  });

  it("overschrijft bestaande headers NIET", () => {
    const h = new Headers();
    h.set("X-Frame-Options", "SAMEORIGIN");
    applySecurityHeaders(h);
    expect(h.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });

  it("SECURITY_HEADERS-set is non-empty + alle waardes zijn strings", () => {
    expect(Object.keys(SECURITY_HEADERS).length).toBeGreaterThanOrEqual(5);
    for (const v of Object.values(SECURITY_HEADERS)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });
});
