/**
 * Simpele in-memory TTL-cache voor marketdata.
 *
 * Scope: één Node-process. In serverless omgevingen krijgt elke
 * instance z'n eigen cache — dat is acceptabel voor quotes/fx met
 * korte TTL. Voor gedeelde cache (Redis/KV) vervang de implementatie
 * achter dezelfde publieke API.
 *
 * Belangrijk:
 *  - `getOrSet` is race-safe binnen één process door inflight-promises
 *    te de-dupliceren.
 *  - Expired entries worden lazy opgeruimd bij read; een periodieke sweep
 *    voorkomt onbegrensde groei bij veel unieke keys.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  inflight: number;
}

export class TtlCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly maxEntries: number;
  private hits = 0;
  private misses = 0;
  private lastSweep = 0;
  private readonly sweepIntervalMs: number;

  constructor(options: { maxEntries?: number; sweepIntervalMs?: number } = {}) {
    this.maxEntries = options.maxEntries ?? 2000;
    this.sweepIntervalMs = options.sweepIntervalMs ?? 60_000;
  }

  get<T>(key: string, now: number = Date.now()): T | undefined {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (entry.expiresAt <= now) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    return entry.value;
  }

  set<T>(key: string, value: T, ttlSeconds: number, now: number = Date.now()): void {
    const expiresAt = now + Math.max(0, ttlSeconds) * 1000;
    this.store.set(key, { value, expiresAt });
    this.maybeSweep(now);
    if (this.store.size > this.maxEntries) {
      this.evictOldest();
    }
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
    this.inflight.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats(): CacheStats {
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      inflight: this.inflight.size,
    };
  }

  /**
   * Retourneer een cached waarde of produceer er één. Tijdens de productie
   * wordt de promise gedupliceerd; concurrent callers wachten dezelfde
   * producer-run af i.p.v. meerdere provider-calls af te vuren.
   *
   * Als `producer` `null` of `undefined` retourneert, wordt die waarde
   * teruggegeven maar NIET gecached (zodat een "data unavailable" niet
   * een hele TTL blijft hangen).
   */
  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    producer: () => Promise<T>,
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const run = (async () => {
      try {
        const value = await producer();
        if (value !== null && value !== undefined) {
          this.set(key, value, ttlSeconds);
        }
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, run);
    return run;
  }

  private maybeSweep(now: number): void {
    if (now - this.lastSweep < this.sweepIntervalMs) return;
    this.lastSweep = now;
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) this.store.delete(key);
    }
  }

  private evictOldest(): void {
    // Map preserveert insertion order; de oudste key is de eerste.
    const oldest = this.store.keys().next().value;
    if (oldest !== undefined) this.store.delete(oldest);
  }
}

/**
 * Gedeelde cache voor alle market-data services. Eén globale instance zodat
 * hot-reload in dev niet per module een nieuwe cache aanmaakt.
 */
const globalForCache = globalThis as unknown as { __marketCache?: TtlCache };

export const marketDataCache: TtlCache =
  globalForCache.__marketCache ??
  (globalForCache.__marketCache = new TtlCache());

export function buildCacheKey(namespace: string, ...parts: string[]): string {
  return `${namespace}:${parts.map((p) => p.trim().toUpperCase()).join(":")}`;
}
