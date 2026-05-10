import { describe, expect, it, vi } from "vitest";

import {
  InMemoryRateLimitStore,
  RedisRateLimitStore,
  createRateLimitStore,
} from "./redis-store";

const CONFIG = { capacity: 5, refillPerSec: 1 };

describe("InMemoryRateLimitStore — interface conformance", () => {
  it("eerste call → allowed met (capacity-1) tokens", async () => {
    const store = new InMemoryRateLimitStore();
    const r = await store.consume("k1", CONFIG, 0);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
  });

  it("burst tot capacity → allowed; daarna denied", async () => {
    const store = new InMemoryRateLimitStore();
    for (let i = 0; i < 5; i++) {
      const r = await store.consume("k1", CONFIG, 0);
      expect(r.allowed).toBe(true);
    }
    const denied = await store.consume("k1", CONFIG, 0);
    expect(denied.allowed).toBe(false);
  });

  it("verschillende keys hebben onafhankelijke buckets", async () => {
    const store = new InMemoryRateLimitStore();
    for (let i = 0; i < 5; i++) await store.consume("a", CONFIG, 0);
    const r = await store.consume("b", CONFIG, 0);
    expect(r.allowed).toBe(true);
  });

  it("prune verwijdert oude buckets na TTL", async () => {
    const store = new InMemoryRateLimitStore(1_000); // 1s TTL
    await store.consume("k1", CONFIG, 0);
    await store.consume("k2", CONFIG, 0);
    const pruned = await store.prune(2_000);
    expect(pruned).toBe(2);
  });
});

describe("RedisRateLimitStore — skeleton-gedrag", () => {
  it("constructor logt warning maar throwt niet", () => {
    expect(() => new RedisRateLimitStore({})).not.toThrow();
  });

  it("consume throws expliciete not-implemented error", async () => {
    const store = new RedisRateLimitStore({});
    await expect(store.consume("k1", CONFIG, 0)).rejects.toThrow(
      /not implemented/i,
    );
  });
});

describe("createRateLimitStore — factory", () => {
  const original = process.env.RATELIMIT_BACKEND;

  it("default → InMemoryRateLimitStore", () => {
    delete process.env.RATELIMIT_BACKEND;
    const store = createRateLimitStore();
    expect(store).toBeInstanceOf(InMemoryRateLimitStore);
    if (original !== undefined) process.env.RATELIMIT_BACKEND = original;
  });

  it("RATELIMIT_BACKEND=redis → fallback op InMemoryRateLimitStore (skeleton-stand)", () => {
    process.env.RATELIMIT_BACKEND = "redis";
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = createRateLimitStore();
    expect(store).toBeInstanceOf(InMemoryRateLimitStore);
    consoleWarn.mockRestore();
    if (original !== undefined) process.env.RATELIMIT_BACKEND = original;
    else delete process.env.RATELIMIT_BACKEND;
  });

  it("onbekende backend → InMemoryRateLimitStore", () => {
    process.env.RATELIMIT_BACKEND = "memcached";
    const store = createRateLimitStore();
    expect(store).toBeInstanceOf(InMemoryRateLimitStore);
    if (original !== undefined) process.env.RATELIMIT_BACKEND = original;
    else delete process.env.RATELIMIT_BACKEND;
  });
});
