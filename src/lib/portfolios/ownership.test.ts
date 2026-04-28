import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assertPortfolioOwnership } from "./ownership";

const findOwnerEmailById = vi.hoisted(() => vi.fn());

vi.mock("@/lib/data", () => ({
  portfolioRepository: {
    findOwnerEmailById: (...args: unknown[]) => findOwnerEmailById(...args),
  },
}));

beforeEach(() => {
  findOwnerEmailById.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const sessionUser = {
  email: "alice@example.com",
  source: "session-cookie" as const,
};

describe("assertPortfolioOwnership", () => {
  it("eigenaar = sessie-user → ok", async () => {
    findOwnerEmailById.mockResolvedValue("alice@example.com");
    const r = await assertPortfolioOwnership(sessionUser, "p1");
    expect(r.ok).toBe(true);
  });

  it("portefeuille van andere user → 403 (geen rechten)", async () => {
    findOwnerEmailById.mockResolvedValue("bob@example.com");
    const r = await assertPortfolioOwnership(sessionUser, "p1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.reason).toMatch(/rechten/i);
    }
  });

  it("onbekende portefeuille (verwijderd / nooit bestaan) → 404", async () => {
    findOwnerEmailById.mockResolvedValue(null);
    const r = await assertPortfolioOwnership(sessionUser, "ghost-id");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(404);
    }
  });

  it("case-sensitivity: alice@example.com ≠ ALICE@EXAMPLE.COM (matchesSessionUser regelt case)", async () => {
    // matchesSessionUser zou case-insensitive matchen (algemeen pattern voor email).
    // Deze test documenteert het verwacht-gedrag — als matcher case-insensitive
    // is, blijft 'em ok.
    findOwnerEmailById.mockResolvedValue("ALICE@example.com");
    const r = await assertPortfolioOwnership(sessionUser, "p1");
    expect(r.ok).toBe(true);
  });
});
