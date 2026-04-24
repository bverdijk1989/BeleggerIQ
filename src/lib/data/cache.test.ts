import { beforeEach, describe, expect, it, vi } from "vitest";

import { TtlCache, buildCacheKey } from "./cache";

describe("TtlCache", () => {
  let cache: TtlCache;

  beforeEach(() => {
    cache = new TtlCache({ maxEntries: 5 });
  });

  it("bewaart en leest waarden binnen de TTL", () => {
    cache.set("a", 42, 60);
    expect(cache.get<number>("a")).toBe(42);
  });

  it("geeft undefined na TTL-verloop", () => {
    const now = 1_000_000;
    cache.set("a", "v", 10, now);
    expect(cache.get<string>("a", now + 5_000)).toBe("v");
    expect(cache.get<string>("a", now + 11_000)).toBeUndefined();
  });

  it("getOrSet dedupliceert concurrent calls", async () => {
    const producer = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return "expensive";
    });

    const [a, b] = await Promise.all([
      cache.getOrSet("k", 60, producer),
      cache.getOrSet("k", 60, producer),
    ]);
    expect(a).toBe("expensive");
    expect(b).toBe("expensive");
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it("cached geen null-waarden (retry blijft mogelijk)", async () => {
    const producer = vi.fn(async () => null);
    await cache.getOrSet("missing", 60, producer);
    await cache.getOrSet("missing", 60, producer);
    expect(producer).toHaveBeenCalledTimes(2);
  });

  it("evicteert de oudste entry bij overschrijden van maxEntries", () => {
    for (let i = 0; i < 6; i++) cache.set(`k${i}`, i, 60);
    expect(cache.get("k0")).toBeUndefined();
    expect(cache.get("k5")).toBe(5);
  });

  it("ruimt inflight-entry op na een throw, zodat retry meteen opnieuw draait", async () => {
    let attempt = 0;
    const producer = vi.fn(async () => {
      attempt++;
      if (attempt === 1) {
        throw new Error("provider down");
      }
      return "ok";
    });

    await expect(cache.getOrSet("k", 60, producer)).rejects.toThrow(
      "provider down",
    );
    // Na de throw moet inflight leeg zijn; de tweede call mag de producer
    // opnieuw aanroepen.
    expect(cache.stats().inflight).toBe(0);
    const second = await cache.getOrSet("k", 60, producer);
    expect(second).toBe("ok");
    expect(producer).toHaveBeenCalledTimes(2);
  });

  it("concurrent callers delen exact één rejected promise bij een throw", async () => {
    const producer = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      throw new Error("boom");
    });
    const results = await Promise.allSettled([
      cache.getOrSet("k", 60, producer),
      cache.getOrSet("k", 60, producer),
      cache.getOrSet("k", 60, producer),
    ]);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(producer).toHaveBeenCalledTimes(1);
    expect(cache.stats().inflight).toBe(0);
  });

  it("clear() reset zowel store, inflight als metrics", () => {
    cache.set("a", 1, 60);
    cache.get("a");
    cache.get("missing");
    expect(cache.stats().hits).toBeGreaterThan(0);
    cache.clear();
    const stats = cache.stats();
    expect(stats.size).toBe(0);
    expect(stats.inflight).toBe(0);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });
});

describe("buildCacheKey", () => {
  it("upcased alle parts en prefixt de namespace", () => {
    expect(buildCacheKey("quote", "asml.as")).toBe("quote:ASML.AS");
    expect(buildCacheKey("fx", "eur", "usd")).toBe("fx:EUR:USD");
  });
});
