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
 * Redis-backed implementatie via Upstash REST API.
 *
 * **Activatie**: zet `REDIS_URL` (rest-URL van Upstash) + `REDIS_TOKEN`
 * env-vars. Code valt automatisch terug op in-memory zonder die.
 *
 * Implementeert atomic refill+consume via Upstash `eval`-RPC met de
 * Lua-script hierboven. Idle-bucket-TTL is 10 minuten zodat onbenutte
 * IPs vanzelf opruimen.
 */

const LUA_CONSUME = `
local state = redis.call('HMGET', KEYS[1], 'tokens', 'lastRefillMs')
local capacity = tonumber(ARGV[1])
local refillPerSec = tonumber(ARGV[2])
local nowMs = tonumber(ARGV[3])
local tokens = tonumber(state[1])
if tokens == nil then tokens = capacity end
local last = tonumber(state[2])
if last == nil then last = nowMs end
local elapsed = (nowMs - last) / 1000.0
if elapsed < 0 then elapsed = 0 end
tokens = math.min(capacity, tokens + elapsed * refillPerSec)
local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end
redis.call('HMSET', KEYS[1], 'tokens', tostring(tokens), 'lastRefillMs', tostring(nowMs))
redis.call('EXPIRE', KEYS[1], 600)
return {allowed, tostring(tokens)}
`;

interface UpstashLikeClient {
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly client: UpstashLikeClient) {}

  async consume(
    key: string,
    config: BucketConfig,
    nowMs: number,
  ): Promise<ConsumeResult> {
    try {
      const result = (await this.client.eval(
        LUA_CONSUME,
        [`rl:${key}`],
        [
          String(config.capacity),
          String(config.refillPerSec),
          String(nowMs),
        ],
      )) as [number, string];
      const allowed = result[0] === 1;
      const remaining = Number(result[1]);
      const state: BucketState = {
        tokens: remaining,
        lastRefillMs: nowMs,
      };
      if (allowed) {
        return {
          allowed: true,
          remaining,
          retryAfterMs: 0,
          state,
        };
      }
      const tokensNeeded = 1 - remaining;
      const retryAfterMs = Math.ceil(
        (tokensNeeded / config.refillPerSec) * 1000,
      );
      return { allowed: false, remaining, retryAfterMs, state };
    } catch (error) {
      log.error("ratelimit:redis", "redis_consume_failed", {
        rawMessage: error instanceof Error ? error.message : String(error),
      });
      // Fail-open bij Redis-fout: niet de hele app blokkeren als Redis
      // tijdelijk onbereikbaar is. Operator monitort errors via logs.
      return {
        allowed: true,
        remaining: config.capacity,
        retryAfterMs: 0,
        state: createBucket(config, nowMs),
      };
    }
  }

  async prune(_nowMs: number): Promise<number> {
    // Upstash kent zelf TTL via EXPIRE in de Lua-script — server-side
    // pruning niet nodig.
    return 0;
  }
}

/**
 * Factory — kiest backend o.b.v. env. Volgorde:
 *  1. `REDIS_URL` + `REDIS_TOKEN` aanwezig + `RATELIMIT_BACKEND=redis` → Upstash
 *  2. Anders → in-memory (default)
 */
export function createRateLimitStore(): RateLimitStore {
  const backend = (process.env.RATELIMIT_BACKEND ?? "memory").toLowerCase();
  const url = process.env.REDIS_URL;
  const token = process.env.REDIS_TOKEN;
  if (backend === "redis" && url && token) {
    try {
      // Lazy-import zodat de bundle niet altijd Upstash trekt.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Redis } = require("@upstash/redis") as typeof import("@upstash/redis");
      const client = new Redis({ url, token });
      log.info("ratelimit:store", "redis_backend_active");
      return new RedisRateLimitStore(client as UpstashLikeClient);
    } catch (error) {
      log.warn("ratelimit:store", "redis_init_failed_fallback_to_memory", {
        rawMessage: error instanceof Error ? error.message : String(error),
      });
      return new InMemoryRateLimitStore();
    }
  }
  return new InMemoryRateLimitStore();
}
