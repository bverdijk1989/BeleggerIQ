import { afterEach, describe, expect, it } from "vitest";

import { checkRateLimit, resetRateLimitStoreForTest } from "./index";

afterEach(() => {
  resetRateLimitStoreForTest();
});

describe("checkRateLimit — integratie via store + policy", () => {
  it("static page (/dashboard) → skipped", () => {
    const r = checkRateLimit({
      pathname: "/dashboard",
      method: "GET",
      identifier: "1.2.3.4",
    });
    expect(r.kind).toBe("skipped");
  });

  it("default-api: 20 requests passeren, 21e wordt 429", () => {
    const ip = "1.2.3.4";
    for (let i = 0; i < 20; i++) {
      const r = checkRateLimit({
        pathname: "/api/market/quote",
        method: "GET",
        identifier: ip,
        nowMs: 0,
      });
      expect(r.kind).toBe("allowed");
    }
    const denied = checkRateLimit({
      pathname: "/api/market/quote",
      method: "GET",
      identifier: ip,
      nowMs: 0,
    });
    expect(denied.kind).toBe("denied");
    if (denied.kind === "denied") {
      expect(denied.policy).toBe("default-api");
      expect(denied.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it("twee verschillende IPs delen geen bucket", () => {
    for (let i = 0; i < 20; i++) {
      checkRateLimit({
        pathname: "/api/market/quote",
        method: "GET",
        identifier: "1.1.1.1",
        nowMs: 0,
      });
    }
    // 1.1.1.1 zit nu droog, maar 2.2.2.2 begint vers.
    const r = checkRateLimit({
      pathname: "/api/market/quote",
      method: "GET",
      identifier: "2.2.2.2",
      nowMs: 0,
    });
    expect(r.kind).toBe("allowed");
  });

  it("strict-chat: 5 requests passeren, 6e wordt 429", () => {
    const ip = "1.2.3.4";
    for (let i = 0; i < 5; i++) {
      const r = checkRateLimit({
        pathname: "/api/chat",
        method: "POST",
        identifier: ip,
        nowMs: 0,
      });
      expect(r.kind).toBe("allowed");
    }
    const denied = checkRateLimit({
      pathname: "/api/chat",
      method: "POST",
      identifier: ip,
      nowMs: 0,
    });
    expect(denied.kind).toBe("denied");
    if (denied.kind === "denied") expect(denied.policy).toBe("strict-chat");
  });

  it("strict-chat en default-api gebruiken aparte buckets", () => {
    const ip = "1.2.3.4";
    // Drain default-api
    for (let i = 0; i < 20; i++) {
      checkRateLimit({
        pathname: "/api/market/quote",
        method: "GET",
        identifier: ip,
        nowMs: 0,
      });
    }
    // /api/chat moet nog vol zitten — andere policy-naam = andere bucket.
    const r = checkRateLimit({
      pathname: "/api/chat",
      method: "POST",
      identifier: ip,
      nowMs: 0,
    });
    expect(r.kind).toBe("allowed");
  });

  it("POST /login: 3 requests passeren, 4e wordt 429", () => {
    const ip = "1.2.3.4";
    for (let i = 0; i < 3; i++) {
      const r = checkRateLimit({
        pathname: "/login",
        method: "POST",
        identifier: ip,
        nowMs: 0,
      });
      expect(r.kind).toBe("allowed");
    }
    const denied = checkRateLimit({
      pathname: "/login",
      method: "POST",
      identifier: ip,
      nowMs: 0,
    });
    expect(denied.kind).toBe("denied");
  });

  it("GET /login → skipped (alleen POST wordt gerate-limit)", () => {
    const r = checkRateLimit({
      pathname: "/login",
      method: "GET",
      identifier: "1.2.3.4",
    });
    expect(r.kind).toBe("skipped");
  });

  it("na 60s zijn er weer tokens (default 10/min)", () => {
    const ip = "1.2.3.4";
    for (let i = 0; i < 20; i++) {
      checkRateLimit({
        pathname: "/api/market/quote",
        method: "GET",
        identifier: ip,
        nowMs: 0,
      });
    }
    // 60s later — 10 nieuwe tokens beschikbaar.
    const r = checkRateLimit({
      pathname: "/api/market/quote",
      method: "GET",
      identifier: ip,
      nowMs: 60_000,
    });
    expect(r.kind).toBe("allowed");
  });
});
