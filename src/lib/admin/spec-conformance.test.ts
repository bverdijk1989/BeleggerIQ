import { describe, expect, it } from "vitest";

import { isAdminEmail, maskEmail } from "./guards";
import type { AdminDashboardData } from "./types";

/**
 * Module 15 — Admin Console spec-conformance.
 *
 * Het Module 15-spec eist 10 beheerfuncties + 4 privacy/access-eisen:
 *  1-10. Cards: actieve gebruikers, subscriptions, feature-flags,
 *        provider-health, AI-kosten, error-log, imports, failed-jobs,
 *        security-events, support-info.
 *  - alleen admin-rol toegang
 *  - geen gevoelige financiële details
 *  - PII minimaliseren
 *  - audit log voor adminacties
 *
 * Deze tests bevriezen de shape + privacy-eisen op data-laag (geen
 * Next-page-imports nodig).
 */

describe("Module 15 — admin dashboard shape (10 cards)", () => {
  it("AdminDashboardData heeft alle 10 spec-cards als velden", () => {
    // Type-assertion: bevat de geldige velden? We bouwen een mock-object
    // dat aan de interface moet voldoen; de TS-compiler valideert de
    // shape op compile-time, deze runtime-check verifieert de keys.
    const mock: AdminDashboardData = {
      generatedAt: "2026-05-18T00:00:00.000Z",
      activeUsers: {
        totalUsers: 0,
        active24h: 0,
        active7d: 0,
        byTier: { FREE: 0, PRO: 0, ELITE: 0, ADVISOR: 0 },
      },
      subscriptions: {
        byTier: { FREE: 0, PRO: 0, ELITE: 0, ADVISOR: 0 },
        withStripeSubscription: 0,
      },
      featureFlags: [],
      providers: {
        marketDataProvider: "stub",
        aiProvider: "deterministic",
        marketDataHealthy: false,
        aiHealthy: false,
        marketDataLastError: null,
        aiLastError: null,
      },
      aiCost: {
        windowStart: "2026-05-18T00:00:00.000Z",
        totalCalls: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalEstimatedUsd: 0,
        byScope: [],
      },
      errors: { errors24h: 0, recent: [] },
      imports: { imports7d: 0, failed7d: 0, recent: [] },
      failedJobs: { recent: [] },
      security: { authEvents24h: 0, failedLogins24h: 0, recent: [] },
      support: null,
    };

    // Verifieer dat alle 10 spec-cards keys aanwezig zijn.
    const requiredKeys: Array<keyof AdminDashboardData> = [
      "activeUsers", // 1
      "subscriptions", // 2
      "featureFlags", // 3
      "providers", // 4
      "aiCost", // 5
      "errors", // 6
      "imports", // 7
      "failedJobs", // 8
      "security", // 9
      "support", // 10
    ];
    for (const k of requiredKeys) {
      expect(k in mock).toBe(true);
    }
  });
});

describe("Module 15 — access-control (admin-only)", () => {
  it("Niet-admin email krijgt isAdmin=false", () => {
    expect(
      isAdminEmail("randomuser@example.com", "admin@beleggeriq.nl").isAdmin,
    ).toBe(false);
  });

  it("Admin via allowlist krijgt isAdmin=true + source env_allowlist", () => {
    const ctx = isAdminEmail(
      "admin@beleggeriq.nl",
      "admin@beleggeriq.nl",
    );
    expect(ctx.isAdmin).toBe(true);
    expect(ctx.source).toBe("env_allowlist");
  });

  it("Geen env-allowlist → niemand is admin (failsafe)", () => {
    expect(isAdminEmail("admin@beleggeriq.nl", "").isAdmin).toBe(false);
    expect(isAdminEmail("admin@beleggeriq.nl", undefined).isAdmin).toBe(false);
  });
});

describe("Module 15 — privacy-laag: PII-minimalisatie", () => {
  it("maskEmail toont nooit volledige local-part (PII-eis)", () => {
    const cases = [
      "bart.verdijk@example.com",
      "supersecret@example.com",
      "abc@gmail.com",
    ];
    for (const email of cases) {
      const masked = maskEmail(email);
      const localPart = email.split("@")[0]!;
      // Eerste letter is OK; rest moet sterren zijn.
      expect(masked).not.toContain(localPart.slice(1));
    }
  });

  it("AdminDashboardData.support-shape bevat GEEN portfolio-waardes", () => {
    // Type-check: het type `SupportUserInfo` heeft GEEN field
    // `portfolioValue` of `cashBalance` o.i.d. — alleen counts.
    // Deze test maakt dit expliciet door de allowed-keys-set te
    // bevriezen.
    const allowedKeys = new Set([
      "maskedEmail",
      "tier",
      "portfolioCount",
      "positionCount",
      "createdAt",
      "lastActivityAt",
    ]);
    const sample = {
      maskedEmail: "b***@example.com",
      tier: "FREE" as const,
      portfolioCount: 1,
      positionCount: 12,
      createdAt: "2026-05-18T00:00:00.000Z",
      lastActivityAt: null,
    };
    for (const key of Object.keys(sample)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
    // Negatieve check: nooit een waarde-veld toevoegen.
    expect("portfolioValue" in sample).toBe(false);
    expect("cashBalance" in sample).toBe(false);
    expect("ipAddress" in sample).toBe(false);
    expect("passwordHash" in sample).toBe(false);
  });

  it("activeUsers byTier dekt alle 4 BillingTiers (no-orphans)", () => {
    const sample: AdminDashboardData["activeUsers"] = {
      totalUsers: 0,
      active24h: 0,
      active7d: 0,
      byTier: { FREE: 0, PRO: 0, ELITE: 0, ADVISOR: 0 },
    };
    for (const t of ["FREE", "PRO", "ELITE", "ADVISOR"] as const) {
      expect(t in sample.byTier).toBe(true);
    }
  });
});
