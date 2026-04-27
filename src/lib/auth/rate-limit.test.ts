import { beforeEach, describe, expect, it } from "vitest";

import {
  checkRateLimit,
  resetRateLimitForTest,
} from "./rate-limit";

beforeEach(() => {
  resetRateLimitForTest();
});

describe("checkRateLimit", () => {
  it("eerste 2 calls binnen window zijn allowed (default max=2)", () => {
    const t0 = 1_000_000;
    const a = checkRateLimit("ip-1", "u@e.nl", { now: t0 });
    const b = checkRateLimit("ip-1", "u@e.nl", { now: t0 + 1_000 });
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });

  it("3e call binnen window is geblokkeerd + retryAfterMs > 0", () => {
    const t0 = 1_000_000;
    checkRateLimit("ip-1", "u@e.nl", { now: t0 });
    checkRateLimit("ip-1", "u@e.nl", { now: t0 + 1_000 });
    const c = checkRateLimit("ip-1", "u@e.nl", { now: t0 + 2_000 });
    expect(c.allowed).toBe(false);
    expect(c.retryAfterMs).toBeGreaterThan(0);
  });

  it("verschillende email/ip-combinatie heeft eigen window", () => {
    const t0 = 1_000_000;
    checkRateLimit("ip-1", "u@e.nl", { now: t0 });
    checkRateLimit("ip-1", "u@e.nl", { now: t0 + 1_000 });
    const other = checkRateLimit("ip-1", "v@e.nl", { now: t0 + 2_000 });
    expect(other.allowed).toBe(true);
  });

  it("buiten window opnieuw allowed", () => {
    const t0 = 1_000_000;
    checkRateLimit("ip-1", "u@e.nl", { now: t0 });
    checkRateLimit("ip-1", "u@e.nl", { now: t0 + 1_000 });
    const later = checkRateLimit("ip-1", "u@e.nl", { now: t0 + 70_000 });
    expect(later.allowed).toBe(true);
  });

  it("custom max-respect (max=1 → 2e call blokkeert)", () => {
    const t0 = 1_000_000;
    expect(checkRateLimit("ip-1", "u@e.nl", { now: t0, max: 1 }).allowed).toBe(
      true,
    );
    expect(
      checkRateLimit("ip-1", "u@e.nl", { now: t0 + 100, max: 1 }).allowed,
    ).toBe(false);
  });
});
