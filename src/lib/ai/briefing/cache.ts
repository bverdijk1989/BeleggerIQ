/**
 * Daily briefing cache.
 *
 * **Strategie**:
 *  - Per-process `TtlCache` met 12u TTL — 1× per dag is genoeg voor een
 *    "Daily Briefing"; gebruiker kan handmatig refreshen via API.
 *  - Cache-key bevat een `contextDigest` zodat een mutatie van de
 *    onderliggende context (nieuwe transactie, andere regime) automatisch
 *    een nieuwe briefing forceert i.p.v. de stale versie te serveren.
 *
 * Voor multi-instance deployments kunnen we deze achter dezelfde API
 * vervangen door Redis — de service-laag merkt het niet.
 */

import { TtlCache } from "@/lib/data/cache";

import type { BriefingContext, DailyBriefing } from "./types";

const TTL_SECONDS = 12 * 60 * 60;
const CACHE_KEY_NAMESPACE = "ai-briefing";

const globalForCache = globalThis as unknown as {
  __aiBriefingCache?: TtlCache;
};

const briefingCache: TtlCache =
  globalForCache.__aiBriefingCache ??
  (globalForCache.__aiBriefingCache = new TtlCache({
    maxEntries: 500,
    sweepIntervalMs: 60_000,
  }));

export function buildBriefingCacheKey(
  portfolioId: string,
  briefingDate: string,
  contextDigest: string,
): string {
  return `${CACHE_KEY_NAMESPACE}:${portfolioId}:${briefingDate}:${contextDigest}`;
}

export function getCachedBriefing(key: string): DailyBriefing | null {
  return briefingCache.get<DailyBriefing>(key) ?? null;
}

export function setCachedBriefing(key: string, briefing: DailyBriefing): void {
  briefingCache.set(key, briefing, TTL_SECONDS);
}

export function resetBriefingCache(): void {
  briefingCache.clear();
}

/**
 * Compute een korte digest van de briefing-context. We gebruiken een simple
 * non-cryptografische FNV-1a-variant — deterministisch, snel, geen Node
 * crypto vereist (cf. Edge runtime).
 *
 * Doel is alleen "is deze context functioneel anders dan de vorige?";
 * collisions zijn akkoord want de TTL beperkt impact tot 12 uur.
 */
export function computeContextDigest(ctx: BriefingContext): string {
  const serialized = JSON.stringify(ctx, (_, v) => {
    // Round numbers to 4 decimals to absorb minor floating-point drift.
    return typeof v === "number" && Number.isFinite(v)
      ? Math.round(v * 10000) / 10000
      : v;
  });
  return fnv1a(serialized).toString(16);
}

function fnv1a(str: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}
