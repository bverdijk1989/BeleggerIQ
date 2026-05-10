/**
 * Timing-helpers — centrale laag voor `Date.now()`-patronen die nu
 * verspreid in handlers/repositories zitten.
 *
 * **Filosofie**:
 *  - `withTiming` wrapt sync of async functies en logt `durationMs` automatisch
 *  - `withSlowLog` is identiek maar logt ALLEEN wanneer duration een drempel
 *    overschrijdt (slow-query / slow-call detectie zonder log-spam)
 *  - Errors worden NOOIT geslikt; instrumentatie verandert geen control-flow
 *
 * Voor metrics-emit (latency-grafieken in aggregator) zie
 * `src/lib/observability/metrics.ts`. Deze helpers loggen via de bestaande
 * `log`-API — aggregators kunnen filteren op `durationMs` om percentielen
 * te berekenen zonder dat de app een metrics-endpoint nodig heeft.
 */

import { log } from "@/lib/log";

export interface TimingOptions {
  scope: string;
  operation: string;
  /** Extra log-fields. Geen PII. */
  fields?: Record<string, unknown>;
  /** Optioneel correlatie-id voor cross-component tracing. */
  requestId?: string;
}

export interface SlowLogOptions extends TimingOptions {
  /** Drempel in milliseconden. Default 500ms. */
  thresholdMs?: number;
}

/**
 * Wraps een async functie en logt `durationMs` op `info`-niveau bij
 * succes. Bij fout: log op `warn` met dezelfde duration + error-name.
 * Werpt het origineel-error opnieuw — instrumentatie is transparent.
 */
export async function withTiming<T>(
  opts: TimingOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    log.info(opts.scope, `${opts.operation}_done`, {
      ...(opts.fields ?? {}),
      ...(opts.requestId ? { requestId: opts.requestId } : {}),
      durationMs: Date.now() - start,
      success: true,
    });
    return result;
  } catch (error) {
    log.warn(opts.scope, `${opts.operation}_failed`, {
      ...(opts.fields ?? {}),
      ...(opts.requestId ? { requestId: opts.requestId } : {}),
      durationMs: Date.now() - start,
      success: false,
      errorName: error instanceof Error ? error.name : "non-error",
    });
    throw error;
  }
}

/**
 * Variant: log alleen wanneer duration de drempel overschrijdt. Voor
 * "noisy maar meestal-snelle" calls (Prisma queries, market-data fetches)
 * waar je geen log-event-per-call wilt maar wel zicht op uitschieters.
 */
export async function withSlowLog<T>(
  opts: SlowLogOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  const threshold = opts.thresholdMs ?? 500;
  try {
    const result = await fn();
    const duration = Date.now() - start;
    if (duration >= threshold) {
      log.warn(opts.scope, `${opts.operation}_slow`, {
        ...(opts.fields ?? {}),
        ...(opts.requestId ? { requestId: opts.requestId } : {}),
        durationMs: duration,
        thresholdMs: threshold,
        success: true,
      });
    }
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    log.warn(opts.scope, `${opts.operation}_failed`, {
      ...(opts.fields ?? {}),
      ...(opts.requestId ? { requestId: opts.requestId } : {}),
      durationMs: duration,
      thresholdMs: threshold,
      success: false,
      errorName: error instanceof Error ? error.name : "non-error",
    });
    throw error;
  }
}

/**
 * Sync-variant voor situaties waar er geen Promise speelt (heavy compute
 * binnen een single tick). Geen `await` — we meten echte CPU-tijd.
 */
export function timeSync<T>(opts: TimingOptions, fn: () => T): T {
  const start = Date.now();
  try {
    const result = fn();
    log.info(opts.scope, `${opts.operation}_done`, {
      ...(opts.fields ?? {}),
      ...(opts.requestId ? { requestId: opts.requestId } : {}),
      durationMs: Date.now() - start,
      success: true,
    });
    return result;
  } catch (error) {
    log.warn(opts.scope, `${opts.operation}_failed`, {
      ...(opts.fields ?? {}),
      ...(opts.requestId ? { requestId: opts.requestId } : {}),
      durationMs: Date.now() - start,
      success: false,
      errorName: error instanceof Error ? error.name : "non-error",
    });
    throw error;
  }
}
