import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AIResponseCache, hashCacheKey } from "./ai-cache";
import {
  estimateCost,
  recordAICost,
  resetCostMeter,
  snapshotCostMeter,
} from "./cost-meter";
import { timeSync, withSlowLog, withTiming } from "./timing";

// ============================================================
//  Timing
// ============================================================

describe("withTiming", () => {
  it("returnt resultaat van fn", async () => {
    const out = await withTiming(
      { scope: "test", operation: "noop" },
      async () => 42,
    );
    expect(out).toBe(42);
  });

  it("propageert errors", async () => {
    await expect(
      withTiming({ scope: "test", operation: "fail" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});

describe("withSlowLog", () => {
  it("returnt resultaat zonder log onder threshold", async () => {
    const out = await withSlowLog(
      { scope: "test", operation: "fast", thresholdMs: 1000 },
      async () => "ok",
    );
    expect(out).toBe("ok");
  });

  it("logt warning boven threshold", async () => {
    const out = await withSlowLog(
      { scope: "test", operation: "slow", thresholdMs: 0 },
      async () => "ok",
    );
    expect(out).toBe("ok");
  });

  it("propageert errors", async () => {
    await expect(
      withSlowLog(
        { scope: "test", operation: "fail" },
        async () => {
          throw new Error("boom");
        },
      ),
    ).rejects.toThrow("boom");
  });
});

describe("timeSync", () => {
  it("werkt voor sync-functies", () => {
    const out = timeSync({ scope: "test", operation: "compute" }, () => 7);
    expect(out).toBe(7);
  });

  it("propageert sync errors", () => {
    expect(() =>
      timeSync({ scope: "test", operation: "fail" }, () => {
        throw new Error("sync-boom");
      }),
    ).toThrow("sync-boom");
  });
});

// ============================================================
//  Cost meter
// ============================================================

describe("estimateCost", () => {
  it("Anthropic: input + output rates", () => {
    const r = estimateCost("anthropic", 1_000_000, 0);
    expect(r.usd).toBeCloseTo(3.0, 2);
  });

  it("nul tokens → nul cost", () => {
    const r = estimateCost("anthropic", 0, 0);
    expect(r.usd).toBe(0);
    expect(r.eur).toBe(0);
  });

  it("EUR is USD × wisselkoers", () => {
    const r = estimateCost("anthropic", 1_000_000, 1_000_000);
    expect(r.eur).toBeLessThan(r.usd); // USD>EUR fixed-rate
  });

  it("noop = gratis", () => {
    const r = estimateCost("noop", 1_000_000, 1_000_000);
    expect(r.usd).toBe(0);
  });
});

describe("recordAICost + snapshotCostMeter", () => {
  beforeEach(() => resetCostMeter());

  it("aggregateert over scopes en providers", () => {
    recordAICost({
      provider: "anthropic",
      model: "claude-sonnet",
      scope: "briefing",
      inputTokens: 1000,
      outputTokens: 500,
    });
    recordAICost({
      provider: "anthropic",
      model: "claude-sonnet",
      scope: "explainability",
      inputTokens: 2000,
      outputTokens: 800,
    });
    const snap = snapshotCostMeter();
    expect(snap.total.callCount).toBe(2);
    expect(snap.total.inputTokens).toBe(3000);
    expect(snap.total.outputTokens).toBe(1300);
    expect(snap.byScope.briefing?.callCount).toBe(1);
    expect(snap.byScope.explainability?.callCount).toBe(1);
    expect(snap.byProvider.anthropic?.callCount).toBe(2);
  });

  it("cache-hit: 0 cost maar wel callCount + cacheHitCount", () => {
    recordAICost({
      provider: "anthropic",
      model: "x",
      scope: "briefing",
      inputTokens: 1000,
      outputTokens: 500,
      cacheHit: true,
    });
    const snap = snapshotCostMeter();
    expect(snap.total.callCount).toBe(1);
    expect(snap.total.cacheHitCount).toBe(1);
    expect(snap.total.cacheMissCount).toBe(0);
    expect(snap.total.costEur).toBe(0);
    expect(snap.total.inputTokens).toBe(0); // tokens niet meegeteld bij hit
  });

  it("resetCostMeter wist alle counters", () => {
    recordAICost({
      provider: "openai",
      model: "x",
      scope: "chat",
      inputTokens: 100,
      outputTokens: 50,
    });
    resetCostMeter();
    const snap = snapshotCostMeter();
    expect(snap.total.callCount).toBe(0);
    expect(snap.byScope).toEqual({});
  });
});

// ============================================================
//  AI response cache
// ============================================================

describe("AIResponseCache", () => {
  let cache: AIResponseCache<string>;

  beforeEach(() => {
    cache = new AIResponseCache<string>("test-ns", { defaultTtlSec: 60, maxEntries: 3 });
    resetCostMeter();
  });
  afterEach(() => cache.clear());

  it("miss → set → hit", () => {
    expect(cache.get("k1")).toBeNull();
    cache.set("k1", "v1");
    expect(cache.get("k1")).toBe("v1");
  });

  it("LRU-trim bij maxEntries overschrijding", () => {
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");
    cache.set("d", "4"); // should evict 'a'
    expect(cache.get("a")).toBeNull();
    expect(cache.get("d")).toBe("4");
  });

  it("invalidate verwijdert key", () => {
    cache.set("k", "v");
    cache.invalidate("k");
    expect(cache.get("k")).toBeNull();
  });

  it("stats: hits/misses/hitRate", () => {
    cache.set("k", "v");
    cache.get("k"); // hit
    cache.get("k2"); // miss
    const s = cache.stats();
    expect(s.hits).toBe(1);
    expect(s.misses).toBe(1);
    expect(s.hitRate).toBeCloseTo(0.5, 2);
  });

  it("getOrSet: producer wordt gecalled bij miss", async () => {
    let producerCalls = 0;
    const out = await cache.getOrSet(
      "kx",
      async () => {
        producerCalls += 1;
        return {
          value: "produced",
          provider: "anthropic",
          model: "claude-sonnet",
          inputTokens: 100,
          outputTokens: 50,
        };
      },
      { scope: "test" },
    );
    expect(out).toBe("produced");
    expect(producerCalls).toBe(1);
    // 2e call = hit, geen producer
    const out2 = await cache.getOrSet(
      "kx",
      async () => {
        producerCalls += 1;
        return {
          value: "should-not-replace",
          provider: "anthropic",
          model: "claude-sonnet",
          inputTokens: 0,
          outputTokens: 0,
        };
      },
      { scope: "test" },
    );
    expect(out2).toBe("produced"); // van cache
    expect(producerCalls).toBe(1);
  });

  it("getOrSet: cost-meter ziet miss + hit", async () => {
    await cache.getOrSet(
      "ky",
      async () => ({
        value: "v",
        provider: "anthropic",
        model: "claude-sonnet",
        inputTokens: 1000,
        outputTokens: 500,
      }),
      { scope: "test-scope" },
    );
    await cache.getOrSet(
      "ky",
      async () => ({
        value: "should-not-replace",
        provider: "anthropic",
        model: "claude-sonnet",
        inputTokens: 0,
        outputTokens: 0,
      }),
      { scope: "test-scope" },
    );
    const snap = snapshotCostMeter();
    expect(snap.total.callCount).toBe(2);
    expect(snap.total.cacheMissCount).toBe(1);
    expect(snap.total.cacheHitCount).toBe(1);
  });

  it("TTL-expiry: na verstrijken → miss", async () => {
    const tiny = new AIResponseCache<string>("tiny", { defaultTtlSec: 0.01 });
    tiny.set("k", "v");
    expect(tiny.get("k")).toBe("v");
    await new Promise((r) => setTimeout(r, 25));
    expect(tiny.get("k")).toBeNull();
  });
});

describe("hashCacheKey", () => {
  it("deterministisch", () => {
    expect(hashCacheKey(["a", "b", "c"])).toBe(hashCacheKey(["a", "b", "c"]));
  });

  it("verschillende parts → verschillende hash", () => {
    expect(hashCacheKey(["a", "b"])).not.toBe(hashCacheKey(["a", "c"]));
  });

  it("output is 8-char hex", () => {
    expect(hashCacheKey(["x"])).toMatch(/^[0-9a-f]{8}$/);
  });
});
