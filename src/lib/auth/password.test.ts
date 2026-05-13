import { describe, expect, it } from "vitest";

import {
  hashPassword,
  PASSWORD_POLICY,
  validatePasswordPolicy,
  verifyPassword,
} from "./password";

describe("validatePasswordPolicy", () => {
  it("accepteert password van minimum-lengte", () => {
    expect(
      validatePasswordPolicy("a".repeat(PASSWORD_POLICY.MIN_LENGTH)).ok,
    ).toBe(true);
  });

  it("weigert password korter dan minimum", () => {
    const r = validatePasswordPolicy("a".repeat(PASSWORD_POLICY.MIN_LENGTH - 1));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/minimaal/);
  });

  it("weigert leeg password", () => {
    expect(validatePasswordPolicy("").ok).toBe(false);
  });

  it("weigert password langer dan maximum", () => {
    const r = validatePasswordPolicy("a".repeat(PASSWORD_POLICY.MAX_LENGTH + 1));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/maximaal/);
  });

  it("accepteert password met spaties en symbolen", () => {
    expect(validatePasswordPolicy("Te S T  @#$%^&*").ok).toBe(true);
  });

  it("PASSWORD_POLICY constants zijn redelijk", () => {
    expect(PASSWORD_POLICY.MIN_LENGTH).toBeGreaterThanOrEqual(8);
    expect(PASSWORD_POLICY.MAX_LENGTH).toBeGreaterThan(
      PASSWORD_POLICY.MIN_LENGTH,
    );
    expect(PASSWORD_POLICY.BCRYPT_COST).toBeGreaterThanOrEqual(10);
  });
});

describe("hashPassword + verifyPassword", () => {
  it("round-trip: hash → verify slaagt met juiste password", async () => {
    const password = "MijnSterkeWachtwoord123";
    const hashed = await hashPassword(password);
    expect(hashed.ok).toBe(true);
    if (!hashed.ok) return;
    expect(hashed.hash).toMatch(/^\$2[ab]\$/); // bcrypt-format
    expect(await verifyPassword(password, hashed.hash)).toBe(true);
  });

  it("verkeerd password → verify faalt", async () => {
    const hashed = await hashPassword("MijnSterkeWachtwoord123");
    if (!hashed.ok) throw new Error("setup failed");
    expect(await verifyPassword("VerkeerdWachtwoord456", hashed.hash)).toBe(
      false,
    );
  });

  it("hashPassword weigert te kort password", async () => {
    const hashed = await hashPassword("kort");
    expect(hashed.ok).toBe(false);
  });

  it("verifyPassword met malformed hash → false (geen crash)", async () => {
    expect(await verifyPassword("password", "not-a-valid-hash")).toBe(false);
    expect(await verifyPassword("password", "")).toBe(false);
  });

  it("verifyPassword met lege raw password → false", async () => {
    const hashed = await hashPassword("MijnSterkeWachtwoord123");
    if (!hashed.ok) throw new Error("setup failed");
    expect(await verifyPassword("", hashed.hash)).toBe(false);
  });

  it("twee hashes van zelfde password zijn verschillend (salt-randomness)", async () => {
    const a = await hashPassword("MijnSterkeWachtwoord123");
    const b = await hashPassword("MijnSterkeWachtwoord123");
    if (!a.ok || !b.ok) throw new Error("setup failed");
    expect(a.hash).not.toBe(b.hash);
    // Maar beide moeten valid zijn voor het origineel
    expect(await verifyPassword("MijnSterkeWachtwoord123", a.hash)).toBe(true);
    expect(await verifyPassword("MijnSterkeWachtwoord123", b.hash)).toBe(true);
  });
});
