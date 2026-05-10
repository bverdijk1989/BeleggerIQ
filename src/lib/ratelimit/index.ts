import { resolvePolicy, type RateLimitPolicy } from "./policy";
import { consume, maybePrune } from "./store";
import type { ConsumeResult } from "./token-bucket";

/**
 * High-level entry-point voor de rate-limiter.
 *
 * Gebruikt door `src/proxy.ts` (Next 16 proxy-laag) en door eventuele
 * unit-tests. Geen Next-imports — deze module blijft framework-vrij
 * zodat 'em ook in een Server Action of API-route kan worden hergebruikt
 * zonder fragiele edge-runtime gymnastiek.
 */

export type RateLimitOutcome =
  | {
      kind: "skipped";
      /** Pad/method match'te geen policy → niet rate-limiten. */
      reason: "no-policy";
    }
  | {
      kind: "allowed";
      policy: string;
      remaining: number;
    }
  | {
      kind: "denied";
      policy: string;
      retryAfterMs: number;
    };

export interface CheckRateLimitInput {
  pathname: string;
  method: string;
  /** Stable identifier — meestal client-IP. */
  identifier: string;
  /** Override `Date.now()` voor deterministische tests. */
  nowMs?: number;
}

/**
 * Beslist of een request mag passeren onder de actieve policy. Pure
 * function aan de buitenkant — interne side-effect is het schrijven naar
 * de in-memory store.
 */
export function checkRateLimit(
  input: CheckRateLimitInput,
): RateLimitOutcome {
  const policy: RateLimitPolicy | null = resolvePolicy(
    input.pathname,
    input.method,
  );
  if (!policy) {
    return { kind: "skipped", reason: "no-policy" };
  }

  const nowMs = input.nowMs ?? Date.now();
  maybePrune(nowMs);

  const key = `${policy.name}|${input.identifier}`;
  const result: ConsumeResult = consume(key, policy.config, nowMs);

  if (result.allowed) {
    return { kind: "allowed", policy: policy.name, remaining: result.remaining };
  }

  return {
    kind: "denied",
    policy: policy.name,
    retryAfterMs: result.retryAfterMs,
  };
}

export { resolvePolicy } from "./policy";
export { resetRateLimitStoreForTest } from "./store";
