import {
  createBucket,
  tryConsume,
  type BucketConfig,
  type BucketState,
  type ConsumeResult,
} from "./token-bucket";

/**
 * In-memory token-bucket store.
 *
 * Bewust géén externe dependency. Voor één Node-instance (huidige
 * Hetzner-deploy) heeft één Map voldoende capaciteit; bij scale-out
 * naar meerdere replicas migreren we naar Redis (zie TODO onderin).
 *
 * Geheugengebruik: ~100 bytes per actieve bucket. 10k unieke IPs = ~1MB
 * — verwaarloosbaar. De `prune` haak houdt 'em opgeruimd zodat een
 * lange-running proces niet langzaam balloont.
 *
 * ⚠ Multi-instance migratie (TODO):
 *   - Vervang `Map` door een Redis-client (bv. `ioredis`).
 *   - Bewaar `BucketState` als Redis-hash met `HSET <key> tokens ts`.
 *   - Gebruik Lua-script voor atomic refill+consume zodat 2 replicas
 *     niet beide "allowed" teruggeven binnen dezelfde tick.
 *   - Pas `RATELIMIT_BACKEND=redis` env-flag toe voor staged rollout.
 *   - Rate-limit-keys hoeven niet sticky te zijn naar 1 replica — de
 *     pure functions in `token-bucket.ts` zijn al backend-agnostisch.
 */

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
}

/** Test-only inspect — gebruik niet in productie-code. */
export function _peekStoreSize(): number {
  return buckets.size;
}
