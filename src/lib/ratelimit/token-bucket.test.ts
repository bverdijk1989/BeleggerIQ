import { describe, expect, it } from "vitest";

import {
  createBucket,
  tryConsume,
  type BucketConfig,
} from "./token-bucket";

const DEFAULT: BucketConfig = { capacity: 20, refillPerSec: 10 / 60 };

describe("token-bucket", () => {
  it("nieuwe bucket → vol op capacity", () => {
    const s = createBucket(DEFAULT, 0);
    expect(s.tokens).toBe(20);
  });

  it("eerste consume → allowed + 19 remaining", () => {
    const s = createBucket(DEFAULT, 0);
    const r = tryConsume(s, DEFAULT, 0);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(19);
  });

  it("burst van 20 lukt; 21e wordt geweigerd", () => {
    let s = createBucket(DEFAULT, 0);
    for (let i = 0; i < 20; i++) {
      const r = tryConsume(s, DEFAULT, 0);
      expect(r.allowed).toBe(true);
      s = r.state;
    }
    const denied = tryConsume(s, DEFAULT, 0);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });

  it("refill na 6s → 1 extra token (10/min = 0.167/s × 6s = 1)", () => {
    let s = createBucket(DEFAULT, 0);
    // Drain naar 0
    for (let i = 0; i < 20; i++) s = tryConsume(s, DEFAULT, 0).state;
    // 6 seconden later
    const r = tryConsume(s, DEFAULT, 6_000);
    expect(r.allowed).toBe(true);
  });

  it("refill cap't bij capacity (geen drift omhoog)", () => {
    let s = createBucket(DEFAULT, 0);
    // Drain helemaal
    for (let i = 0; i < 20; i++) s = tryConsume(s, DEFAULT, 0).state;
    // Lange tijd niets doen
    const r = tryConsume(s, DEFAULT, 60 * 60_000);
    expect(r.allowed).toBe(true);
    // Na 1 consume zit je 19 hoog, niet meer.
    expect(r.remaining).toBe(19);
  });

  it("clock-skew (now < last) wordt geclamped → geen extra-tokens-aftrekken", () => {
    const s: ReturnType<typeof createBucket> = {
      tokens: 5,
      lastRefillMs: 1000,
    };
    const r = tryConsume(s, DEFAULT, 500);
    // Negatieve elapsed wordt 0 → tokens blijft 5, één wordt geconsumeerd.
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
  });

  it("denied retryAfterMs is correct (1 token / refillPerSec)", () => {
    let s = createBucket(DEFAULT, 0);
    for (let i = 0; i < 20; i++) s = tryConsume(s, DEFAULT, 0).state;
    const denied = tryConsume(s, DEFAULT, 0);
    // refillPerSec = 0.1667 → 1 token = 6000ms (afronding boven)
    expect(denied.retryAfterMs).toBeGreaterThanOrEqual(5990);
    expect(denied.retryAfterMs).toBeLessThanOrEqual(6010);
  });

  it("strikte policy (5/min, burst 5) blokkeert na 5 calls", () => {
    const config: BucketConfig = { capacity: 5, refillPerSec: 5 / 60 };
    let s = createBucket(config, 0);
    for (let i = 0; i < 5; i++) {
      const r = tryConsume(s, config, 0);
      expect(r.allowed).toBe(true);
      s = r.state;
    }
    const denied = tryConsume(s, config, 0);
    expect(denied.allowed).toBe(false);
  });
});
