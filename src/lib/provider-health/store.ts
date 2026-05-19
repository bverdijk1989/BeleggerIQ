/**
 * Provider Health — in-memory store (Module 26).
 *
 * Zelfde patroon als `cost-meter.ts`: globaal Node-process aggregator.
 * In serverless krijgt elke instance z'n eigen store; voor v1 acceptabel.
 *
 * **Hoe te gebruiken**:
 * ```ts
 * import { withProviderHealth } from "@/lib/provider-health";
 * const quote = await withProviderHealth(
 *   { provider: "yahoo", kind: "market-data", operation: "quote" },
 *   () => yahoo.getQuote("MSFT"),
 * );
 * ```
 *
 * Wrapper meet de duration, logt success/failure, en gooit het origineel-
 * error opnieuw (instrumentatie is transparant).
 */

import { log } from "@/lib/log";

import {
  DEFAULT_PROVIDER_HEALTH_CONFIG,
  type ProviderCallEvent,
  type ProviderHealthSnapshot,
  type ProviderHealthStats,
  type ProviderHealthConfig,
  type ProviderKind,
  type ProviderOperation,
} from "./types";

interface ProviderState {
  kind: ProviderKind;
  events: ProviderCallEvent[];
  /** Cumulatieve tellers — overleven event-rotation. */
  cum: {
    callCount: number;
    successCount: number;
    failureCount: number;
    fallbackInvocationCount: number;
    latencySumMs: number;
    lastSuccessAt: number | null;
    lastFailureAt: number | null;
    lastError: string | null;
  };
}

const globalForHealth = globalThis as unknown as {
  __providerHealth?: {
    config: ProviderHealthConfig;
    windowStart: number;
    byProvider: Map<string, ProviderState>;
  };
};

function ensureStore() {
  if (!globalForHealth.__providerHealth) {
    globalForHealth.__providerHealth = {
      config: DEFAULT_PROVIDER_HEALTH_CONFIG,
      windowStart: Date.now(),
      byProvider: new Map(),
    };
  }
  return globalForHealth.__providerHealth;
}

function getOrInitProvider(
  provider: string,
  kind: ProviderKind,
): ProviderState {
  const store = ensureStore();
  let state = store.byProvider.get(provider);
  if (!state) {
    state = {
      kind,
      events: [],
      cum: {
        callCount: 0,
        successCount: 0,
        failureCount: 0,
        fallbackInvocationCount: 0,
        latencySumMs: 0,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastError: null,
      },
    };
    store.byProvider.set(provider, state);
  }
  return state;
}

/**
 * Schrijf één event. Pure side-effect; gooit nooit.
 */
export function recordProviderCall(event: ProviderCallEvent): void {
  try {
    const store = ensureStore();
    const state = getOrInitProvider(event.provider, event.kind);
    state.events.push(event);
    state.cum.callCount += 1;
    state.cum.latencySumMs += Math.max(0, event.durationMs);
    if (event.ok) {
      state.cum.successCount += 1;
      state.cum.lastSuccessAt = Date.now();
    } else {
      state.cum.failureCount += 1;
      state.cum.lastFailureAt = Date.now();
      if (event.errorName) {
        state.cum.lastError = event.errorName.slice(0, 80);
      }
    }
    if (event.fromFallback) {
      state.cum.fallbackInvocationCount += 1;
    }
    // Trim om unbounded growth te voorkomen.
    if (state.events.length > store.config.maxEventsPerProvider) {
      state.events.splice(0, state.events.length - store.config.maxEventsPerProvider);
    }
    // Structured log voor downstream-aggregators (optioneel).
    log.info("metric:provider_health", "provider_call", {
      metric: "provider_call",
      provider: event.provider,
      kind: event.kind,
      operation: event.operation,
      durationMs: event.durationMs,
      ok: event.ok,
      fromFallback: event.fromFallback === true,
      ...(event.errorName ? { errorName: event.errorName } : {}),
    });
  } catch {
    // Instrumentation mag de hoofdactie nooit breken.
  }
}

/**
 * Wrap een async functie en log success/failure + duration.
 *
 * Gebruik:
 * ```ts
 * const quote = await withProviderHealth(
 *   { provider: "yahoo", kind: "market-data", operation: "quote" },
 *   () => yahoo.getQuote("MSFT"),
 * );
 * ```
 *
 * Bij failure: log + re-throw — control-flow blijft identiek.
 */
export async function withProviderHealth<T>(
  meta: {
    provider: string;
    kind: ProviderKind;
    operation: ProviderOperation;
    fromFallback?: boolean;
  },
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    recordProviderCall({
      provider: meta.provider,
      kind: meta.kind,
      operation: meta.operation,
      durationMs: Date.now() - start,
      ok: true,
      fromFallback: meta.fromFallback,
    });
    return result;
  } catch (error) {
    recordProviderCall({
      provider: meta.provider,
      kind: meta.kind,
      operation: meta.operation,
      durationMs: Date.now() - start,
      ok: false,
      errorName: error instanceof Error ? error.name : "non-error",
      fromFallback: meta.fromFallback,
    });
    throw error;
  }
}

/** Geheel resetten — alleen voor tests. */
export function resetProviderHealth(): void {
  if (globalForHealth.__providerHealth) {
    globalForHealth.__providerHealth.windowStart = Date.now();
    globalForHealth.__providerHealth.byProvider.clear();
  }
}

/**
 * Snapshot voor admin-UI. Pure read, geen mutations.
 */
export function snapshotProviderHealth(
  now: number = Date.now(),
): ProviderHealthSnapshot {
  const store = ensureStore();
  const byProvider: ProviderHealthStats[] = [];

  for (const [provider, state] of store.byProvider.entries()) {
    byProvider.push(computeStats(provider, state, now, store.config));
  }

  byProvider.sort((a, b) => a.provider.localeCompare(b.provider));

  return {
    generatedAt: new Date(now).toISOString(),
    windowStart: new Date(store.windowStart).toISOString(),
    byProvider,
  };
}

function computeStats(
  provider: string,
  state: ProviderState,
  now: number,
  config: ProviderHealthConfig,
): ProviderHealthStats {
  const c = state.cum;
  const latencies = state.events.map((e) => e.durationMs).sort((a, b) => a - b);
  const p50 = percentile(latencies, 0.5);
  const p95 = percentile(latencies, 0.95);
  const avg =
    c.callCount > 0 ? Math.round(c.latencySumMs / c.callCount) : null;

  const healthy =
    c.lastSuccessAt !== null && now - c.lastSuccessAt <= config.healthyWindowMs;
  const stale =
    (c.lastSuccessAt === null || now - c.lastSuccessAt > config.staleWindowMs) &&
    (c.lastFailureAt === null || now - c.lastFailureAt > config.staleWindowMs);

  return {
    provider,
    kind: state.kind,
    callCount: c.callCount,
    successCount: c.successCount,
    failureCount: c.failureCount,
    latencyP50Ms: p50,
    latencyP95Ms: p95,
    avgLatencyMs: avg,
    lastSuccessAt:
      c.lastSuccessAt !== null ? new Date(c.lastSuccessAt).toISOString() : null,
    lastFailureAt:
      c.lastFailureAt !== null ? new Date(c.lastFailureAt).toISOString() : null,
    lastError: c.lastError,
    fallbackInvocationCount: c.fallbackInvocationCount,
    healthy,
    stale,
  };
}

function percentile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return Math.round(sorted[0]!);
  // Nearest-rank methode: ceil(q × N) - 1 → integer index in [0, N-1].
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(q * sorted.length) - 1),
  );
  return Math.round(sorted[idx]!);
}
