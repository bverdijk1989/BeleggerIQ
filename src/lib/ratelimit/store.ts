import {
  createBucket,
  tryConsume,
  type BucketConfig,
  type BucketState,
  type ConsumeResult,
} from "./token-bucket";

/**
 * Token-bucket store-abstractie (Module 19).
 *
 * **Interface**: `RateLimitStore` definieert wat een rate-limit-backend
 * moet kunnen. De in-memory implementatie is de default; een toekomstige
 * Redis-store implementeert dezelfde interface en kan via
 * `setRateLimitStore(store)` worden aangesloten.
 *
 * **Pure functions** (`createBucket`, `tryConsume`) zijn backend-agnostisch
 * — een Redis-store wraps ze met Lua-script of WATCH/MULTI voor
 * atomicity tussen replicas.
 *
 * **Migratie-pad naar multi-instance**:
 *   - Implementeer `RateLimitStore` met `ioredis`-client
 *   - Bewaar `BucketState` als Redis-hash: `HSET <key> tokens ts`
 *   - Gebruik Lua-script voor atomic refill+consume
 *   - Activeer via `RATELIMIT_BACKEND=redis` env-flag in een staged rollout
 */

/** Pluggable store-interface — Redis kan dezelfde shape implementeren. */
export interface RateLimitStore {
  /** Backend-naam voor logs/debug (`memory` / `redis` / ...). */
  readonly backend: string;
  /** Probeer 1 token te consumeren voor de gegeven key. */
  consume(key: string, config: BucketConfig, nowMs: number): ConsumeResult;
  /** Cleanup van oude buckets (opportunistic, in-memory only). */
  prune(nowMs: number): number;
}

// ============================================================
//  In-memory implementation — default backend
// ============================================================

const buckets = new Map<string, BucketState>();
const lastSeen = new Map<string, number>();

/** Buckets die langer dan dit niet zijn aangeraakt worden gepruned. */
const TTL_MS = 5 * 60_000; // 5 min

/**
 * Probeer 1 token te consumeren voor de gegeven (policy, ip)-combinatie.
 * Schrijft de nieuwe bucket-state direct terug naar de in-memory store.
 */
export function consume(
  key: string,
  config: BucketConfig,
  nowMs: number,
): ConsumeResult {
  const existing = buckets.get(key) ?? createBucket(config, nowMs);
  const result = tryConsume(existing, config, nowMs);
  buckets.set(key, result.state);
  lastSeen.set(key, nowMs);
  return result;
}

/**
 * Verwijder buckets die langer dan TTL_MS niet meer aangeraakt zijn.
 * Veilig om vaak te draaien — O(N) maar N is klein (zie geheugen-
 * berekening boven). Wordt opportunistisch aangeroepen vanuit `consume`
 * via `maybePrune`, niet via setInterval (Edge-runtime mag geen timers
 * starten).
 */
export function prune(nowMs: number): number {
  let deleted = 0;
  for (const [key, ts] of lastSeen) {
    if (nowMs - ts > TTL_MS) {
      buckets.delete(key);
      lastSeen.delete(key);
      deleted++;
    }
  }
  return deleted;
}

let lastPruneMs = 0;
const PRUNE_INTERVAL_MS = 60_000;

/**
 * Roept `prune` aan zodra er ≥ 1 minuut sinds vorige prune is verstreken.
 * Doel: amortiseer cleanup zonder per-request overhead te introduceren.
 */
export function maybePrune(nowMs: number): void {
  if (nowMs - lastPruneMs >= PRUNE_INTERVAL_MS) {
    lastPruneMs = nowMs;
    prune(nowMs);
  }
}

/** Test-only: leegt de in-memory store. */
export function resetRateLimitStoreForTest(): void {
  buckets.clear();
  lastSeen.clear();
  lastPruneMs = 0;
  activeStore = inMemoryStore;
}

/** Test-only inspect — gebruik niet in productie-code. */
export function _peekStoreSize(): number {
  return buckets.size;
}

// ============================================================
//  Store-registry — backend zwap zonder call-site-aanpassing
// ============================================================

/**
 * In-memory implementatie van `RateLimitStore`. Default-backend in
 * Module 19. Bij multi-instance scaling: implementeer `RateLimitStore`
 * met Redis-client en gebruik `setRateLimitStore(redisStore)` op startup.
 */
export const inMemoryStore: RateLimitStore = {
  backend: "memory",
  consume,
  prune,
};

let activeStore: RateLimitStore = inMemoryStore;

/** Backend-zwap — bv. `setRateLimitStore(redisStore)` op startup. */
export function setRateLimitStore(store: RateLimitStore): void {
  activeStore = store;
}

/** Lees-only view van de actieve store. */
export function getActiveRateLimitStore(): RateLimitStore {
  return activeStore;
}
