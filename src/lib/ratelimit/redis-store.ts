import { log } from "@/lib/log";

import {
  createBucket,
  tryConsume,
  type BucketConfig,
  type BucketState,
  type ConsumeResult,
} from "./token-bucket";

/**
 * Redis-backed rate-limit store — skeleton (M21).
 *
 * **Status**: skeleton, niet wired in productie. Activeren via:
 *   1. Set `RATELIMIT_BACKEND=redis`
 *   2. Set `REDIS_URL=redis://host:port`
 *   3. Install `ioredis` (`npm i ioredis`)
 *   4. Verwijder de `_TODO_redis_client` placeholder hieronder
 *
 * **Waarom skeleton + niet meteen wiring?**
 * - Redis-infra is een operator-keuze (managed Redis Cloud / Upstash /
 *   self-hosted). Pas activeren als horizontale scaling concreet is.
 * - De Lua-script-aanpak (atomic refill+consume) vereist test tegen
 *   een echte Redis. Mock'en met fake-redis is onbetrouwbaar voor
 *   atomic-semantics.
 *
 * **Wat dit bestand wel levert**:
 * - De `RateLimitStore`-interface die zowel in-memory als Redis volgen.
 * - Een dummy `RedisRateLimitStore` die expliciet faalt met een
 *   informatieve error totdat de operator 'em activeert.
 * - Tests die bewijzen dat de interface compatible is met de in-memory
 *   variant — zodat een latere swap geen behaviour-verandering oplevert.
 *
 * **Lua-script ontwerp** (commentaar voor implementatie-volger):
 * ```lua
 * -- KEYS[1] = bucket key, ARGV[1] = capacity, ARGV[2] = refillPerSec, ARGV[3] = nowMs
 * local state = redis.call('HMGET', KEYS[1], 'tokens', 'lastRefillMs')
 * local tokens = tonumber(state[1]) or tonumber(ARGV[1])
 * local last = tonumber(state[2]) or tonumber(ARGV[3])
 * local elapsed = math.max(0, (tonumber(ARGV[3]) - last) / 1000)
 * tokens = math.min(tonumber(ARGV[1]), tokens + elapsed * tonumber(ARGV[2]))
 * if tokens >= 1 then
 *   tokens = tokens - 1
 *   redis.call('HMSET', KEYS[1], 'tokens', tokens, 'lastRefillMs', ARGV[3])
 *   redis.call('EXPIRE', KEYS[1], 600)  -- 10 min idle TTL
 *   return {1, tokens}  -- allowed=true, remaining
 * else
 *   redis.call('HMSET', KEYS[1], 'tokens', tokens, 'lastRefillMs', ARGV[3])
 *   redis.call('EXPIRE', KEYS[1], 600)
 *   return {0, tokens}  -- allowed=false
 * end
 * ```
 */

export interface RateLimitStore {
  consume(key: string, config: BucketConfig, nowMs: number): Promise<ConsumeResult>;
  prune(nowMs: number): Promise<number>;
}

/**
 * In-memory implementatie achter de gemeenschappelijke interface.
 * Wraps de bestaande pure-functies uit `store.ts` zodat caller-code
 * via dezelfde Promise-interface werkt als de Redis-variant.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, BucketState>();
  private readonly lastSeen = new Map<string, number>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = 5 * 60_000) {
    this.ttlMs = ttlMs;
  }

  async consume(
    key: string,
    config: BucketConfig,
    nowMs: number,
  ): Promise<ConsumeResult> {
    const existing = this.buckets.get(key) ?? createBucket(config, nowMs);
    const result = tryConsume(existing, config, nowMs);
    this.buckets.set(key, result.state);
    this.lastSeen.set(key, nowMs);
    return result;
  }

  async prune(nowMs: number): Promise<number> {
    let deleted = 0;
    for (const [key, ts] of this.lastSeen) {
      if (nowMs - ts > this.ttlMs) {
        this.buckets.delete(key);
        this.lastSeen.delete(key);
        deleted++;
      }
    }
    return deleted;
  }
}

/**
 * Redis-backed implementatie — skeleton. Faalt expliciet zolang er
 * geen redis-client is. De Lua-script + ioredis wiring komt in M21
 * follow-up wanneer Redis-infra is gekozen.
 */
export class RedisRateLimitStore implements RateLimitStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _TODO_redis_client: unknown;

  constructor(redisClient: unknown) {
    this._TODO_redis_client = redisClient;
    log.warn(
      "ratelimit:redis",
      "RedisRateLimitStore is een skeleton — niet voor productie tot Lua-script + ioredis wiring landt",
    );
  }

  async consume(
    _key: string,
    _config: BucketConfig,
    _nowMs: number,
  ): Promise<ConsumeResult> {
    void this._TODO_redis_client;
    throw new Error(
      "RedisRateLimitStore.consume not implemented — install ioredis + wire Lua script per docs in redis-store.ts",
    );
  }

  async prune(_nowMs: number): Promise<number> {
    return 0;
  }
}

/**
 * Factory — kiest backend o.b.v. `RATELIMIT_BACKEND` env-var.
 * Default: in-memory (zodat huidige deploys ongewijzigd blijven).
 */
export function createRateLimitStore(): RateLimitStore {
  const backend = (process.env.RATELIMIT_BACKEND ?? "memory").toLowerCase();
  if (backend === "redis") {
    log.warn(
      "ratelimit:store",
      "RATELIMIT_BACKEND=redis maar Redis-skeleton is nog niet geïmplementeerd — fallback op in-memory",
    );
    // TODO(M21): import("ioredis") + new Redis(REDIS_URL) + return RedisRateLimitStore.
    return new InMemoryRateLimitStore();
  }
  return new InMemoryRateLimitStore();
}
