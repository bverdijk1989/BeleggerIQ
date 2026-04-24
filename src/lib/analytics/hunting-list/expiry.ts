import type { HuntingTrigger } from "./types";

/**
 * Pure expiry-helpers. Losgetrokken zodat UI-componenten ook zonder
 * de detectoren aan te roepen kunnen filteren op "verlopen" (bv. voor
 * opportunity-history-rendering).
 */

export function isTriggerExpired(
  trigger: Pick<HuntingTrigger, "expiresAt">,
  now: string = new Date().toISOString(),
): boolean {
  const expiresMs = Date.parse(trigger.expiresAt);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(expiresMs) || !Number.isFinite(nowMs)) return false;
  return expiresMs <= nowMs;
}

/**
 * Splits een triggerset in `active` en `expired`. Behoudt input-volgorde
 * binnen elk subset.
 */
export function partitionTriggers(
  triggers: HuntingTrigger[],
  now: string = new Date().toISOString(),
): { active: HuntingTrigger[]; expired: HuntingTrigger[] } {
  const active: HuntingTrigger[] = [];
  const expired: HuntingTrigger[] = [];
  for (const t of triggers) {
    if (isTriggerExpired(t, now)) expired.push(t);
    else active.push(t);
  }
  return { active, expired };
}

/**
 * Bereken `expiresAt` = `firedAt + ttlDays × 24u`. Pure functie zodat
 * deze uit tests aanroepbaar is met een vaste `firedAt`.
 */
export function computeExpiresAt(firedAt: string, ttlDays: number): string {
  const base = new Date(firedAt);
  if (Number.isNaN(base.getTime())) return firedAt;
  const ttlMs = Math.max(1, Math.floor(ttlDays)) * 24 * 60 * 60 * 1000;
  return new Date(base.getTime() + ttlMs).toISOString();
}
