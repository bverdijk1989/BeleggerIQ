import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { resetRateLimitStoreForTest } from "@/lib/ratelimit";

import { middleware } from "./middleware";

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  resetRateLimitStoreForTest();
  vi.restoreAllMocks();
});

function makeRequest(
  url: string,
  init: { method?: string; headers?: Record<string, string> } = {},
): NextRequest {
  return new NextRequest(new URL(url), {
    method: init.method ?? "GET",
    headers: init.headers ?? { "x-forwarded-for": "10.0.0.1" },
  });
}

describe("middleware — rate-limit gedrag", () => {
  it("static page (/dashboard) → 200/next, geen rate-limit-headers", () => {
    const res = middleware(
      makeRequest("http://localhost:3000/dashboard", {
        headers: { "x-forwarded-for": "10.0.0.1" },
      }),
    );
    // NextResponse.next() heeft status 200 en geen Retry-After.
    expect(res.status).toBe(200);
    expect(res.headers.get("retry-after")).toBeNull();
    expect(res.headers.get("x-ratelimit-policy")).toBeNull();
  });

  it("API route binnen budget → 200 + remaining-header", () => {
    const res = middleware(
      makeRequest("http://localhost:3000/api/market/quote"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-ratelimit-policy")).toBe("default-api");
    expect(res.headers.get("x-ratelimit-remaining")).toBe("19");
  });

  it("API route over limiet → 429 met body { error, code:'RATE_LIMITED' }", async () => {
    const ip = "10.0.0.99";
    for (let i = 0; i < 20; i++) {
      middleware(
        makeRequest("http://localhost:3000/api/market/quote", {
          headers: { "x-forwarded-for": ip },
        }),
      );
    }
    const res = middleware(
      makeRequest("http://localhost:3000/api/market/quote", {
        headers: { "x-forwarded-for": ip },
      }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(res.headers.get("x-ratelimit-remaining")).toBe("0");
    const body = await res.json();
    expect(body).toMatchObject({ code: "RATE_LIMITED" });
    expect(typeof body.error).toBe("string");
  });

  it("verschillende IPs delen geen bucket", () => {
    for (let i = 0; i < 20; i++) {
      middleware(
        makeRequest("http://localhost:3000/api/market/quote", {
          headers: { "x-forwarded-for": "10.0.0.1" },
        }),
      );
    }
    const res = middleware(
      makeRequest("http://localhost:3000/api/market/quote", {
        headers: { "x-forwarded-for": "10.0.0.2" },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("/api/chat onder strict-chat policy: 6e call → 429", () => {
    const ip = "10.0.0.5";
    for (let i = 0; i < 5; i++) {
      const res = middleware(
        makeRequest("http://localhost:3000/api/chat", {
          method: "POST",
          headers: { "x-forwarded-for": ip },
        }),
      );
      expect(res.status).toBe(200);
    }
    const denied = middleware(
      makeRequest("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "x-forwarded-for": ip },
      }),
    );
    expect(denied.status).toBe(429);
    expect(denied.headers.get("x-ratelimit-policy")).toBe("strict-chat");
  });

  it("POST /login na 4 calls → 429; GET /login passeert altijd", () => {
    const ip = "10.0.0.6";
    for (let i = 0; i < 3; i++) {
      const res = middleware(
        makeRequest("http://localhost:3000/login", {
          method: "POST",
          headers: { "x-forwarded-for": ip },
        }),
      );
      expect(res.status).toBe(200);
    }
    const denied = middleware(
      makeRequest("http://localhost:3000/login", {
        method: "POST",
        headers: { "x-forwarded-for": ip },
      }),
    );
    expect(denied.status).toBe(429);

    // GET met dezelfde IP wordt niet rate-limited (= page-render).
    const getRes = middleware(
      makeRequest("http://localhost:3000/login", {
        method: "GET",
        headers: { "x-forwarded-for": ip },
      }),
    );
    expect(getRes.status).toBe(200);
  });

  it("genereert X-Request-ID en propageert 'em naar de response", () => {
    const res = middleware(
      makeRequest("http://localhost:3000/api/market/quote"),
    );
    const requestId = res.headers.get("x-request-id");
    expect(requestId).toMatch(/^req_[0-9a-f]{32}$/);
  });

  it("respecteert binnenkomende X-Request-ID (mits veilig formaat)", () => {
    const res = middleware(
      makeRequest("http://localhost:3000/api/market/quote", {
        headers: {
          "x-forwarded-for": "10.0.0.1",
          "x-request-id": "trace-abc-123",
        },
      }),
    );
    expect(res.headers.get("x-request-id")).toBe("trace-abc-123");
  });

  it("verwerpt onveilig formaat X-Request-ID (spaces/quotes) en genereert nieuwe", () => {
    const res = middleware(
      makeRequest("http://localhost:3000/api/market/quote", {
        headers: {
          "x-forwarded-for": "10.0.0.1",
          "x-request-id": "abc def \"quoted\"",
        },
      }),
    );
    expect(res.headers.get("x-request-id")).toMatch(/^req_[0-9a-f]{32}$/);
  });

  it("429-response bevat X-Request-ID", () => {
    const ip = "10.0.0.42";
    for (let i = 0; i < 20; i++) {
      middleware(
        makeRequest("http://localhost:3000/api/market/quote", {
          headers: { "x-forwarded-for": ip },
        }),
      );
    }
    const res = middleware(
      makeRequest("http://localhost:3000/api/market/quote", {
        headers: { "x-forwarded-for": ip },
      }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("x-request-id")).toMatch(/^req_/);
  });

  it("X-Real-IP wordt gebruikt als X-Forwarded-For ontbreekt", () => {
    for (let i = 0; i < 20; i++) {
      middleware(
        makeRequest("http://localhost:3000/api/market/quote", {
          headers: { "x-real-ip": "10.0.0.7" },
        }),
      );
    }
    const denied = middleware(
      makeRequest("http://localhost:3000/api/market/quote", {
        headers: { "x-real-ip": "10.0.0.7" },
      }),
    );
    expect(denied.status).toBe(429);
  });
});
