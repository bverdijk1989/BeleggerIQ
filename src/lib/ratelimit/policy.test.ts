import { describe, expect, it } from "vitest";

import { resolvePolicy } from "./policy";

describe("resolvePolicy", () => {
  it("/api/chat → strict-chat, niet default-api", () => {
    const p = resolvePolicy("/api/chat", "POST");
    expect(p?.name).toBe("strict-chat");
  });

  it("/api/snapshots/factors → strict-factors", () => {
    const p = resolvePolicy("/api/snapshots/factors", "POST");
    expect(p?.name).toBe("strict-factors");
  });

  it("/api/snapshots/portfolio → default-api (niet de strict-factors)", () => {
    const p = resolvePolicy("/api/snapshots/portfolio", "POST");
    expect(p?.name).toBe("default-api");
  });

  it("POST /login → strict-login", () => {
    const p = resolvePolicy("/login", "POST");
    expect(p?.name).toBe("strict-login");
  });

  it("GET /login → geen rate-limit (alleen POST)", () => {
    const p = resolvePolicy("/login", "GET");
    expect(p).toBeNull();
  });

  it("/dashboard → geen policy (page route)", () => {
    const p = resolvePolicy("/dashboard", "GET");
    expect(p).toBeNull();
  });

  it("/api/health → default-api (geen vrijstelling)", () => {
    // Bewuste keuze: zelfs health-checks kennen een burst van 20.
    // Operators die meer willen hangen 'em achter een dedicated probe-IP.
    const p = resolvePolicy("/api/health", "GET");
    expect(p?.name).toBe("default-api");
  });

  it("default-api capacity = 20, refill = 10/min", () => {
    // Module 16: /api/market/* heeft een strikt-market-policy gekregen
    // (capacity 10) — gebruik een andere /api/-pad voor de default-check.
    const p = resolvePolicy("/api/health", "GET");
    expect(p?.config.capacity).toBe(20);
    expect(p?.config.refillPerSec).toBeCloseTo(10 / 60, 5);
  });

  it("strict policies hebben lagere capaciteit (5/min, burst 5)", () => {
    expect(resolvePolicy("/api/chat", "POST")?.config.capacity).toBe(5);
    expect(
      resolvePolicy("/api/snapshots/factors", "POST")?.config.capacity,
    ).toBe(5);
  });
});
