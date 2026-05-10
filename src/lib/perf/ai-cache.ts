/**
 * Generieke AI-response-cache — content-addressable.
 *
 * **Aanvulling op bestaande caches**:
 *  - `src/lib/ai/briefing/cache.ts` — per-user briefing, 12u TTL
 *  - `src/lib/ai/explainability/service.ts` — per-domain explanation, 12u TTL
 *
 * Beide gebruiken een eigen ad-hoc TtlCache met digest-key. Deze module
 * biedt een **gedeelde** primitive voor toekomstige LLM-aanroepen die
 * dezelfde patroon nodig hebben (research-dossier, chat-met-cache, etc.).
 *
 * **Bewuste keuze**: in-process. Voor multi-instance deploys → Redis-
 * upgrade (zelfde route als rate-limit redis-store). Documenteer in
 * caller welk gedrag oké is bij replica-divergence.
 */

import { recordCacheEvent } from "@/lib/observability/metrics";

import { recordAICost } from "./cost-meter";

export interface AICacheEntry<T> {
  value: T;
  /** ms-timestamp wanneer entry geldig is tot. */
  expiresAt: number;
  /** Wanneer geplaatst — voor `ageSeconds`-debug. */
  insertedAt: number;
  /** Optionele provider-info zodat cache-hit cost-meter kan invullen. */
  provider?: string;
  model?: string;
  scope?: string;
}

export interface AICacheOptions {
  /** Default TTL in seconden. Default 12u (43200s). */
  defaultTtlSec?: number;
  /** Maximum entries voor LRU-trim. Default 500. */
  maxEntries?: number;
}

/**
 * Generieke key-value cache met TTL en LRU-trim. Per-instantie zodat
 * verschillende AI-domeinen hun eigen namespace hebben (geen
 * key-collisions tussen briefing en explanation).
 */
export class AIResponseCache<T> {
  private store = new Map<string, AICacheEntry<T>>();
  private hits = 0;
  private misses = 0;

  constructor(
    private readonly namespace: string,
    private readonly opts: AICacheOptions = {},
  ) {}

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses += 1;
      recordCacheEvent({ namespace: this.namespace, hit: false });
      return null;
    }
    const now = Date.now();
    if (entry.expiresAt <= now) {
      this.store.delete(key);
      this.misses += 1;
      recordCacheEvent({ namespace: this.namespace, hit: false });
      return null;
    }
    // LRU touch: re-insert om aan einde-rangschikking te komen.
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits += 1;
    recordCacheEvent({
      namespace: this.namespace,
      hit: true,
      ageSeconds: Math.floor((now - entry.insertedAt) / 1000),
    });
    return entry.value;
  }

  set(
    key: string,
    value: T,
    extras: {
      ttlSec?: number;
      provider?: string;
      model?: string;
      scope?: string;
    } = {},
  ): void {
    const ttl = extras.ttlSec ?? this.opts.defaultTtlSec ?? 12 * 60 * 60;
    const now = Date.now();
    const entry: AICacheEntry<T> = {
      value,
      expiresAt: now + ttl * 1000,
      insertedAt: now,
      provider: extras.provider,
      model: extras.model,
      scope: extras.scope,
    };
    this.store.set(key, entry);

    // LRU trim
    const max = this.opts.maxEntries ?? 500;
    while (this.store.size > max) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) break;
      this.store.delete(oldestKey);
    }
  }

  /**
   * Wrapper-pattern: geef een producer-fn mee; bij miss roepen we 'em
   * aan en cachen het resultaat. Bij hit doen we GEEN producer-call.
   *
   * **Cost-meter**: bij hit emitten we `recordAICost(...{cacheHit:true})`
   * met 0 tokens — voor savings-zicht.
   */
  async getOrSet(
    key: string,
    producer: () => Promise<{
      value: T;
      provider: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
    }>,
    extras: { scope: string; ttlSec?: number; userHash?: string | null } = {
      scope: this.namespace,
    },
  ): Promise<T> {
    const cached = this.get(key);
    if (cached !== null) {
      // Emit 0-cost cache-hit zodat savings-zicht klopt.
      const entry = this.store.get(key);
      if (entry) {
        recordAICost({
          provider: (entry.provider ?? "unknown") as Parameters<
            typeof recordAICost
          >[0]["provider"],
          model: entry.model ?? "unknown",
          scope: extras.scope,
          inputTokens: 0,
          outputTokens: 0,
          cacheHit: true,
          userHash: extras.userHash ?? null,
        });
      }
      return cached;
    }

    const produced = await producer();
    this.set(key, produced.value, {
      ttlSec: extras.ttlSec,
      provider: produced.provider,
      model: produced.model,
      scope: extras.scope,
    });
    recordAICost({
      provider: produced.provider as Parameters<
        typeof recordAICost
      >[0]["provider"],
      model: produced.model,
      scope: extras.scope,
      inputTokens: produced.inputTokens,
      outputTokens: produced.outputTokens,
      cacheHit: false,
      userHash: extras.userHash ?? null,
    });
    return produced.value;
  }

  invalidate(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats(): { size: number; hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : this.hits / total,
    };
  }
}

/**
 * Helper: deterministische hash voor cache-key. djb2-variant — zelfde
 * implementatie als `src/lib/security/redact.ts` zodat tests cross-
 * compatibel blijven.
 */
export function hashCacheKey(parts: ReadonlyArray<string>): string {
  const input = parts.join("|");
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return ("00000000" + ((h >>> 0).toString(16))).slice(-8);
}
