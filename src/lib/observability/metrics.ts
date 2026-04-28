import { log } from "@/lib/log";

/**
 * Lichtgewicht metrics-emitter — schrijft structured events naar de
 * logger zodat Loki / Datadog / Sentry-alerts ze kunnen aggregeren.
 *
 * Geen prom-client, geen statsd-socket. Patroon "logs als metrics":
 * elke call is één LogEvent met `metric: <naam>` en numerieke fields.
 * Aggregator-side filteren op `metric=provider_call` en `groupBy(provider)`
 * geeft je een latency-grafiek zonder dat de app een metrics-endpoint hoeft
 * te exposen.
 *
 * Twee primaire metrics:
 *
 *   metric=provider_call
 *     provider, operation, latencyMs, success, fallbackUsed, error?
 *
 *   metric=cache_event
 *     namespace, hit (true/false), ageSeconds?
 *
 * Toevoegen van een nieuwe metric? Houd 'em platte structuur — geen
 * nested objects in de hot path; aggregators houden niet van diepe paths.
 */

// ============================================================
//  Provider metrics
// ============================================================

export interface ProviderCallEvent {
  provider: string;
  operation: string;
  latencyMs: number;
  success: boolean;
  fallbackUsed: boolean;
  error?: string;
  /** Pass-through naar logger zodat downstream-correlatie werkt. */
  requestId?: string;
}

export function recordProviderCall(event: ProviderCallEvent): void {
  const fields: Record<string, unknown> = {
    metric: "provider_call",
    provider: event.provider,
    operation: event.operation,
    latencyMs: event.latencyMs,
    success: event.success,
    fallbackUsed: event.fallbackUsed,
  };
  if (event.error) fields.error = event.error;
  if (event.requestId) fields.requestId = event.requestId;
  if (event.success) {
    log.info("metric:provider", "provider_call", fields);
  } else {
    log.warn("metric:provider", "provider_call", fields);
  }
}

export interface InstrumentProviderInput<T> {
  provider: string;
  operation: string;
  fn: () => Promise<T>;
  /** Set true vanuit caller wanneer dit een fallback-pad is (na primary failure). */
  fallbackUsed?: boolean;
  requestId?: string;
}

/**
 * Wraps een provider-call met tijdmeting + auto-emit. Gebruik:
 *
 * ```ts
 * const quote = await instrumentProvider({
 *   provider: "yahoo", operation: "quote", fn: () => yahoo.quote("AAPL"),
 * });
 * ```
 *
 * Errors worden opnieuw gegooid — instrumentatie verandert nooit
 * control-flow.
 */
export async function instrumentProvider<T>(
  input: InstrumentProviderInput<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await input.fn();
    recordProviderCall({
      provider: input.provider,
      operation: input.operation,
      latencyMs: Date.now() - start,
      success: true,
      fallbackUsed: input.fallbackUsed ?? false,
      requestId: input.requestId,
    });
    return result;
  } catch (error) {
    recordProviderCall({
      provider: input.provider,
      operation: input.operation,
      latencyMs: Date.now() - start,
      success: false,
      fallbackUsed: input.fallbackUsed ?? false,
      error: error instanceof Error ? error.message : String(error),
      requestId: input.requestId,
    });
    throw error;
  }
}

// ============================================================
//  Cache metrics
// ============================================================

export interface CacheEvent {
  namespace: string;
  hit: boolean;
  /** Leeftijd van de cache-entry in seconden bij hit (optioneel). */
  ageSeconds?: number;
  requestId?: string;
}

export function recordCacheEvent(event: CacheEvent): void {
  const fields: Record<string, unknown> = {
    metric: "cache_event",
    namespace: event.namespace,
    hit: event.hit,
  };
  if (typeof event.ageSeconds === "number") {
    fields.ageSeconds = event.ageSeconds;
  }
  if (event.requestId) fields.requestId = event.requestId;
  log.info("metric:cache", "cache_event", fields);
}
