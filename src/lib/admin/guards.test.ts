import { describe, expect, it } from "vitest";

import { isAdminEmail, maskEmail } from "./guards";

/**
 * Module 15 — admin-guard + PII-masker tests.
 */

describe("isAdminEmail — env-allowlist", () => {
  it("email in allowlist → isAdmin true + source env_allowlist", () => {
    const ctx = isAdminEmail(
      "admin@beleggeriq.nl",
      "admin@beleggeriq.nl,other@example.com",
    );
    expect(ctx.isAdmin).toBe(true);
    expect(ctx.source).toBe("env_allowlist");
  });

  it("case-insensitive vergelijking", () => {
    const ctx = isAdminEmail(
      "  Admin@Beleggeriq.nl  ",
      "admin@beleggeriq.nl",
    );
    expect(ctx.isAdmin).toBe(true);
  });

  it("email NIET in allowlist → isAdmin false", () => {
    const ctx = isAdminEmail("user@example.com", "admin@beleggeriq.nl");
    expect(ctx.isAdmin).toBe(false);
    expect(ctx.source).toBe("none");
  });

  it("lege allowlist → niemand is admin", () => {
    const ctx = isAdminEmail("admin@beleggeriq.nl", "");
    expect(ctx.isAdmin).toBe(false);
  });

  it("undefined allowlist → niemand is admin", () => {
    const ctx = isAdminEmail("admin@beleggeriq.nl", undefined);
    expect(ctx.isAdmin).toBe(false);
  });

  it("lege email → niemand is admin (defensive)", () => {
    const ctx = isAdminEmail("", "admin@beleggeriq.nl");
    expect(ctx.isAdmin).toBe(false);
  });

  it("null email → niemand is admin (defensive)", () => {
    const ctx = isAdminEmail(null, "admin@beleggeriq.nl");
    expect(ctx.isAdmin).toBe(false);
  });

  it("meerdere emails met whitespace + lege entries → genormaliseerd", () => {
    const ctx = isAdminEmail(
      "two@example.com",
      "one@example.com,  two@example.com  ,,three@example.com",
    );
    expect(ctx.isAdmin).toBe(true);
  });
});

describe("maskEmail — PII-laag", () => {
  it("normale email → eerste letter + sterren + domein", () => {
    expect(maskEmail("bart@example.com")).toMatch(/^b\*+@example\.com$/);
  });

  it("één-letter local → enkel ster", () => {
    expect(maskEmail("a@example.com")).toBe("*@example.com");
  });

  it("null/undefined → '(onbekend)'", () => {
    expect(maskEmail(null)).toBe("(onbekend)");
    expect(maskEmail(undefined)).toBe("(onbekend)");
  });

  it("lege string → '(onbekend)'", () => {
    expect(maskEmail("")).toBe("(onbekend)");
  });

  it("kromme input zonder @ → '(onbekend)'", () => {
    expect(maskEmail("notanemail")).toBe("(onbekend)");
  });

  it("maximaal 3 sterren in local-part (anti-length-leak)", () => {
    const long = maskEmail("aaaaaaaaa@example.com");
    // 1 letter + sterren + @domain
    const stars = (long.match(/\*/g) ?? []).length;
    expect(stars).toBeLessThanOrEqual(3);
  });
});
