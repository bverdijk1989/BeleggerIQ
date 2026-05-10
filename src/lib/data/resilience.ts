import { log } from "@/lib/log";

/**
 * Resilience-helpers voor externe provider calls.
 *
 * `withTimeout` breekt een belofte af zodra `ms` verstreken zijn en
 * gooit een `TimeoutError` zodat callers `instanceof` checks kunnen doen.
 *
 * `withRetry` draait een factory opnieuw op transient fouten (netwerk,
 * 5xx) met exponential backoff. Niet-transient fouten (400-class,
 * parse errors, domain errors) worden meteen door-gegooid — een
 * verkeerde input fixen we niet door harder te proberen.
 *
 * `fetchWithResilience` bundelt beide: per poging een `AbortController`
 * met timeout, en tot `retries` pogingen met exponential backoff en
 * jitter.
 *
 * Bewust geen externe dependency. Alle defaults zijn getuned voor
 * market-data providers: korte timeout, 2 retries, ±50ms jitter.
 */

export class TimeoutError extends Error {
  constructor(public readonly ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
      promise.then(resolve, reject);
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface RetryOptions {
  /** Hoeveel keer we mogen hertellen. `2` = 1 initial + 2 retries = 3 pogingen. */
  retries: number;
  /** Basis-delay tussen pogingen (in ms). Wordt exponentieel vermenigvuldigd. */
  baseDelayMs: number;
  /** Max delay — voorkomt te lange wachttijden in serverless. */
  maxDelayMs: number;
  /** Scope voor logging. */
  scope: string;
  /** Override: welke errors zijn het retryen waard? Default: alleen transient. */
  isRetryable?: (error: unknown) => boolean;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  retries: 2,
  baseDelayMs: 200,
  maxDelayMs: 1500,
  scope: "retry",
};

/**
 * Standaard-classificatie: timeouts, netwerk-glitches en 5xx responses
 * zijn retryable. 4xx en application errors niet.
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof TimeoutError) return true;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // Node's fetch / undici kan deze errors gooien bij netwerkfouten.
    if (msg.includes("econnreset")) return true;
    if (msg.includes("econnrefused")) return true;
    if (msg.includes("etimedout")) return true;
    if (msg.includes("network")) return true;
    if (msg.includes("fetch failed")) return true;
    // HTTP 5xx: de caller kan die als `Error("HTTP 503")` representeren.
    if (/\b5\d{2}\b/.test(msg)) return true;
  }
  return false;
}

export async function withRetry<T>(
  producer: (attempt: number) => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const isRetryable = opts.isRetryable ?? isTransientError;

  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await producer(attempt);
    } catch (error) {
      lastError = error;
      const canRetry = attempt < opts.retries && isRetryable(error);
      if (!canRetry) break;
      // Exponential backoff met ±50ms jitter om thundering herds te voorkomen.
      const delay = Math.min(
        opts.maxDelayMs,
        opts.baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 100) - 50,
      );
      log.warn(opts.scope, "retryable error, backoff + retry", {
        attempt: attempt + 1,
        nextDelayMs: Math.max(0, delay),
        error,
      });
      if (delay > 0) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ============================================================
//  Circuit breaker
// ============================================================

/**
 * Per-naam circuit-breaker state. Mitigeert het risico dat een flaky
 * provider (bv. `yahoo-finance2` in een outage) de hele app blokkeert
 * door consequent timeouts/errors te genereren — elke call wacht dan
 * `timeoutMs` voordat 'em uiteindelijk faalt, terwijl we al weten
 * dat het mis is.
 *
 * Eenvoudige drie-staat machine:
 *  - **closed**     normale werking
 *  - **open**       trip; calls falen meteen (skip de echte call) tot
 *                   `cooldownMs` voorbij is
 *  - **half_open**  na cooldown laten we ÉÉN probe door — succes →
 *                   closed; fail → opnieuw open met dezelfde cooldown
 *
 * Module-level state — single-instance only. Voor multi-instance
 * gebruik de Redis-store (zie M21 in IMPLEMENTATION_SEQUENCE.md).
 */

interface BreakerState {
  status: "closed" | "open" | "half_open";
  consecutiveFailures: number;
  openedAt: number;
}

export interface CircuitBreakerOptions {
  /** Naam (voor logging + state-isolatie tussen onafhankelijke breakers). */
  name: string;
  /** Aantal opeenvolgende failures voor 'em opent. Default 5. */
  failureThreshold?: number;
  /** Hoe lang circuit open blijft voordat half-open. Default 30s. */
  cooldownMs?: number;
}

const breakers = new Map<string, BreakerState>();

function getBreaker(name: string): BreakerState {
  let b = breakers.get(name);
  if (!b) {
    b = { status: "closed", consecutiveFailures: 0, openedAt: 0 };
    breakers.set(name, b);
  }
  return b;
}

export class CircuitBreakerOpenError extends Error {
  readonly breakerName: string;
  constructor(name: string) {
    super(`Circuit breaker '${name}' is open — fail fast`);
    this.name = "CircuitBreakerOpenError";
    this.breakerName = name;
  }
}

/**
 * Wraps `producer` met een fail-fast circuit-breaker. Eerste aanroep
 * altijd doorgelaten; daarna wordt status bijgehouden per `options.name`.
 *
 * Bij `open`-status gooien we `CircuitBreakerOpenError` zonder de
 * onderliggende producer aan te roepen — de caller kan dan een fallback
 * (cache, secondary provider, neutraal default) activeren.
 */
export async function withCircuitBreaker<T>(
  producer: () => Promise<T>,
  options: CircuitBreakerOptions,
): Promise<T> {
  const { name } = options;
  const failureThreshold = options.failureThreshold ?? 5;
  const cooldownMs = options.cooldownMs ?? 30_000;
  const breaker = getBreaker(name);
  const now = Date.now();

  if (breaker.status === "open") {
    if (now - breaker.openedAt >= cooldownMs) {
      breaker.status = "half_open";
      log.info("circuit", "half_open_probe", { name });
    } else {
      throw new CircuitBreakerOpenError(name);
    }
  }

  try {
    const result = await producer();
    if (breaker.status === "half_open" || breaker.consecutiveFailures > 0) {
      log.info("circuit", "closed_after_recovery", {
        name,
        previousFailures: breaker.consecutiveFailures,
      });
    }
    breaker.status = "closed";
    breaker.consecutiveFailures = 0;
    breaker.openedAt = 0;
    return result;
  } catch (error) {
    breaker.consecutiveFailures += 1;
    if (
      breaker.status === "half_open" ||
      breaker.consecutiveFailures >= failureThreshold
    ) {
      breaker.status = "open";
      breaker.openedAt = now;
      log.warn("circuit", "tripped_open", {
        name,
        consecutiveFailures: breaker.consecutiveFailures,
        cooldownMs,
      });
    }
    throw error;
  }
}

/** Test-only: reset alle breakers (gebruik in `afterEach` zodat tests niet leaken). */
export function resetCircuitBreakersForTest(): void {
  breakers.clear();
}

export interface FetchWithResilienceOptions extends RequestInit {
  /** Per-poging timeout in ms. Default 8s — past binnen serverless budgets. */
  timeoutMs?: number;
  /** Retry-profiel. Default 2 retries (3 pogingen). */
  retry?: Partial<RetryOptions>;
  /** Scope voor logging. */
  scope?: string;
}

/**
 * `fetch` met per-poging AbortController-timeout en retry bij transient
 * fouten. Niet-ok responses (4xx/5xx) worden doorgegeven aan de caller
 * — die beslist zelf of de body nuttig is. Alleen netwerkfouten en
 * timeouts triggeren een retry.
 */
export async function fetchWithResilience(
  url: string,
  options: FetchWithResilienceOptions = {},
): Promise<Response> {
  const { timeoutMs = 8_000, retry, scope = "fetch", ...init } = options;

  return withRetry(
    async () => {
      const controller = new AbortController();
      const caller = init.signal;
      // Chain externally-provided AbortSignals zodat callers nog steeds
      // kunnen cancellen (bv. wanneer de request zelf geannuleerd wordt).
      if (caller) {
        if (caller.aborted) controller.abort(caller.reason);
        else
          caller.addEventListener("abort", () => controller.abort(caller.reason), {
            once: true,
          });
      }
      const timer = setTimeout(
        () => controller.abort(new TimeoutError(timeoutMs)),
        timeoutMs,
      );
      try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        // 5xx expliciet als error zodat het via `isTransientError` retryt.
        if (response.status >= 500) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          // Geupgraded naar TimeoutError wanneer wij de abort triggerden.
          if (controller.signal.reason instanceof TimeoutError) {
            throw controller.signal.reason;
          }
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
    { scope, ...retry },
  );
}
