/**
 * Provider Health — types (Module 26).
 *
 * **Doel**: bovenop bestaande marktdata-providers een lichte
 * instrumentation-laag die success/failure/latency aggregaten bijhoudt.
 * Admin-UI leest hier uit om "is Yahoo nog gezond?" te beantwoorden.
 *
 * **Privacy/security**: per-call alleen provider-naam + operatie +
 * duration + ok/fail bewaard. Geen tickers, geen request-bodies,
 * geen secrets.
 *
 * **Scope**: in-memory aggregator binnen één Node-process. Zelfde
 * patroon als `cost-meter.ts` — bij multi-instance deploy is dit een
 * proxy van die ene instance. Voor v1 acceptabel.
 */

import type { ISODateString } from "@/types/common";

/** Welke provider-categorie? */
export type ProviderKind = "market-data" | "ai" | "macro" | "fundamentals";

/** Welke operatie? (Voor latency-breakdowns in v2.) */
export type ProviderOperation =
  | "quote"
  | "history"
  | "fx"
  | "fundamentals"
  | "search"
  | "regime"
  | "ai_completion"
  | "other";

/** Eén call-resultaat. */
export interface ProviderCallEvent {
  provider: string;
  kind: ProviderKind;
  operation: ProviderOperation;
  durationMs: number;
  ok: boolean;
  /** Optionele short error name — geen stack, geen secrets. */
  errorName?: string | null;
  /** True wanneer fallback-chain dit niet als "primary" had geprobeerd. */
  fromFallback?: boolean;
}

/** Per-provider geaggregeerde stats. */
export interface ProviderHealthStats {
  provider: string;
  kind: ProviderKind;
  /** Totaal aantal calls binnen window. */
  callCount: number;
  successCount: number;
  failureCount: number;
  /** P50 latency in ms (ms). */
  latencyP50Ms: number | null;
  /** P95 latency in ms. */
  latencyP95Ms: number | null;
  /** Gemiddelde latency in ms — laagst-resolutie maar bekend nuttig. */
  avgLatencyMs: number | null;
  /** Wanneer was de laatste succesvolle call? */
  lastSuccessAt: ISODateString | null;
  /** Wanneer faalde 't het laatst? */
  lastFailureAt: ISODateString | null;
  /** Laatste error-naam (gesnetterd, geen secrets). */
  lastError: string | null;
  /** Heeft fallback-chain hier moeten ingrijpen? */
  fallbackInvocationCount: number;
  /** True wanneer er in laatste 5min een succes was. */
  healthy: boolean;
  /** True wanneer alle data ouder is dan 1 uur (geen recente activity). */
  stale: boolean;
}

/** Full health-snapshot. */
export interface ProviderHealthSnapshot {
  /** Wanneer is dit snapshot gemaakt? */
  generatedAt: ISODateString;
  /** Wanneer startte het meting-window? */
  windowStart: ISODateString;
  byProvider: ReadonlyArray<ProviderHealthStats>;
}

/** Configuratie. */
export interface ProviderHealthConfig {
  /** Max events to retain per provider voor percentile-berekening. */
  maxEventsPerProvider: number;
  /** Healthy-threshold in ms (geen succes binnen → unhealthy). */
  healthyWindowMs: number;
  /** Stale-threshold (geen activity binnen → stale). */
  staleWindowMs: number;
}

export const DEFAULT_PROVIDER_HEALTH_CONFIG: ProviderHealthConfig = {
  maxEventsPerProvider: 500,
  healthyWindowMs: 5 * 60_000, // 5min
  staleWindowMs: 60 * 60_000, // 1u
};
