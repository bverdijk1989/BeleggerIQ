import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordMock } = vi.hoisted(() => ({
  recordMock: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  audit: { record: recordMock },
}));

import {
  hashSessionId,
  recordConversionEvent,
} from "./conversion-events";

/**
 * Module 33 — Conversion-events tests.
 *
 * Privacy + correctness focus:
 *  - hashSessionId deterministisch + niet-omkeerbaar
 *  - recordConversionEvent gebruikt audit met juiste category/action
 *  - Geen raw IP / user-agent in payload
 *  - Audit-write-fail breekt user-flow niet
 */

beforeEach(() => {
  recordMock.mockClear();
  recordMock.mockResolvedValue(undefined);
});

describe("hashSessionId", () => {
  it("null/empty → null", () => {
    expect(hashSessionId(null)).toBeNull();
    expect(hashSessionId(undefined)).toBeNull();
    expect(hashSessionId("")).toBeNull();
    expect(hashSessionId("   ")).toBeNull();
  });

  it("deterministisch — zelfde input → zelfde hash", () => {
    const a = hashSessionId("session-cookie-value-xyz");
    const b = hashSessionId("session-cookie-value-xyz");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
  });

  it("verschillende inputs → verschillende hashes", () => {
    const a = hashSessionId("sess-1");
    const b = hashSessionId("sess-2");
    expect(a).not.toBe(b);
  });

  it("hash bevat geen oorspronkelijke session-string", () => {
    const raw = "very-secret-session-12345";
    const h = hashSessionId(raw);
    expect(h).not.toContain("secret");
    expect(h).not.toContain("session");
    expect(h).not.toContain("12345");
  });
});

describe("recordConversionEvent", () => {
  it("event landing_viewed → category=system, action=marketing_*", async () => {
    await recordConversionEvent({ event: "landing_viewed" });
    expect(recordMock).toHaveBeenCalledTimes(1);
    const call = recordMock.mock.calls[0]![0];
    expect(call.category).toBe("system");
    expect(call.action).toBe("marketing_landing_viewed");
    expect(call.resourceType).toBe("Conversion");
  });

  it("metadata bevat alleen event + tier + source + sessionHash", async () => {
    await recordConversionEvent({
      event: "pricing_tier_selected",
      tier: "ELITE",
      source: "pricing-card",
      sessionHash: "abc123def456",
    });
    const call = recordMock.mock.calls[0]![0];
    const meta = call.metadata as Record<string, unknown>;
    expect(meta.event).toBe("pricing_tier_selected");
    expect(meta.tier).toBe("ELITE");
    expect(meta.source).toBe("pricing-card");
    expect(meta.sessionHash).toBe("abc123def456");
    // Geen user-agent of IP
    expect(meta.userAgent).toBeUndefined();
    expect(meta.ip).toBeUndefined();
  });

  it("source-string wordt cap'd op 64 chars", async () => {
    const longSource = "x".repeat(200);
    await recordConversionEvent({
      event: "landing_viewed",
      source: longSource,
    });
    const call = recordMock.mock.calls[0]![0];
    const meta = call.metadata as Record<string, unknown>;
    expect((meta.source as string).length).toBeLessThanOrEqual(64);
  });

  it("userEmail = null — anonymous-by-default", async () => {
    await recordConversionEvent({ event: "landing_viewed" });
    const call = recordMock.mock.calls[0]![0];
    expect(call.userEmail).toBeNull();
  });

  it("audit-write-fail gooit niet (faal-safe)", async () => {
    recordMock.mockRejectedValueOnce(new Error("DB down"));
    await expect(
      recordConversionEvent({ event: "landing_viewed" }),
    ).resolves.toBeUndefined();
  });
});

describe("Module 33 — privacy + spec-conformance", () => {
  it("geen raw e-mail / IP / user-agent in serialized payload", async () => {
    await recordConversionEvent({
      event: "signup_started",
      tier: "PRO",
      source: "hero-cta",
      sessionHash: "h4sh1ng",
    });
    const call = recordMock.mock.calls[0]![0];
    const serialized = JSON.stringify(call);
    // Geen e-mail-pattern
    expect(serialized).not.toMatch(/[\w.-]+@[\w.-]+\.[a-z]{2,}/i);
    // Geen IPv4-pattern
    expect(serialized).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    // Geen common user-agent fragments
    expect(serialized.toLowerCase()).not.toContain("mozilla");
    expect(serialized.toLowerCase()).not.toContain("webkit");
  });

  it("Audit-category is altijd 'system' — geen 'auth' confusion", async () => {
    const events = [
      "landing_viewed",
      "landing_cta_hero_clicked",
      "pricing_tier_selected",
      "advisor_pilot_inquired",
    ] as const;
    for (const e of events) {
      recordMock.mockClear();
      await recordConversionEvent({ event: e });
      expect(recordMock.mock.calls[0]![0].category).toBe("system");
    }
  });
});
