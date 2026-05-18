import type { BucketConfig } from "./token-bucket";

/**
 * Rate-limit-policies per pad-prefix + (optioneel) HTTP-method.
 *
 * Drie regels:
 *   1. Een policy met `name = "default"` wordt gebruikt als geen specifieke
 *      match wordt gevonden. Dat dekt alle `/api/*` calls die niet expliciet
 *      strikter staan ingesteld.
 *   2. Specifieke policies komen vóór de default — eerst-match wint, dus
 *      zet langere prefixes (`/api/snapshots/factors`) hoger in de lijst
 *      dan kortere (`/api/snapshots`).
 *   3. Methode-filtering is optioneel: GET-only `/login` is publieke
 *      pagina, POST `/login` is de magic-link form-submit. Alleen die
 *      laatste rate-limiten we hier.
 *
 * Limieten zijn met opzet conservatief — een normale gebruiker raakt ze
 * nooit. Specifiekere policies bestaan voor:
 *
 *   - `/api/chat`               LLM-streamendpoint, externe quota
 *   - `/api/snapshots/factors`  zware factor-recompute (DB-write)
 *   - POST /login               magic-link request (per-IP guard naast de
 *                               per-(IP+email) rate-limiter in de action)
 *
 * Numbers — 10 req/min default met burst 20 betekent: een gebruiker mag
 * een dashboard-load (8 widgets) zonder problemen doen, maar een script
 * dat 100/s vuurt loopt na 2 seconden vast.
 */

export interface RateLimitPolicy {
  name: string;
  matches: (pathname: string, method: string) => boolean;
  config: BucketConfig;
}

const DEFAULT_API: RateLimitPolicy = {
  name: "default-api",
  matches: (pathname) => pathname.startsWith("/api/"),
  config: { capacity: 20, refillPerSec: 10 / 60 },
};

const STRICT_CHAT: RateLimitPolicy = {
  name: "strict-chat",
  matches: (pathname) => pathname.startsWith("/api/chat"),
  config: { capacity: 5, refillPerSec: 5 / 60 },
};

const STRICT_FACTORS: RateLimitPolicy = {
  name: "strict-factors",
  matches: (pathname) => pathname.startsWith("/api/snapshots/factors"),
  config: { capacity: 5, refillPerSec: 5 / 60 },
};

/**
 * /api/ai/* — LLM-aanroepen zijn duur (provider-quota + latency).
 * Zelfde 5/min-bucket als /api/chat zodat een script niet de quota
 * van een hele dag binnen 1 minuut leeg trekt.
 */
const STRICT_AI: RateLimitPolicy = {
  name: "strict-ai",
  matches: (pathname) => pathname.startsWith("/api/ai/"),
  config: { capacity: 5, refillPerSec: 5 / 60 },
};

/**
 * /api/market/* — Yahoo / Alpha Vantage provider-quota. Module 16 (§4.3):
 * deze endpoints zijn ongeauthenticeerd, dus een tweede defense-laag op
 * IP-niveau voorkomt dat een derde-partij onze upstream-quota leegtrekt.
 * Iets ruimer dan AI (markt-data is goedkoper) maar strikt genoeg om
 * scripted-abuse te dempen.
 */
const STRICT_MARKET: RateLimitPolicy = {
  name: "strict-market",
  matches: (pathname) => pathname.startsWith("/api/market/"),
  config: { capacity: 10, refillPerSec: 10 / 60 },
};

const STRICT_LOGIN: RateLimitPolicy = {
  name: "strict-login",
  matches: (pathname, method) => pathname === "/login" && method === "POST",
  config: { capacity: 3, refillPerSec: 3 / 60 },
};

/**
 * Volgorde matters — eerst-match wint. Strikte policies vóór de
 * default-policy zodat /api/chat niet per ongeluk de losse 20-burst krijgt.
 */
export const POLICIES: readonly RateLimitPolicy[] = [
  STRICT_CHAT,
  STRICT_FACTORS,
  STRICT_AI,
  STRICT_MARKET,
  STRICT_LOGIN,
  DEFAULT_API,
];

export function resolvePolicy(
  pathname: string,
  method: string,
): RateLimitPolicy | null {
  for (const policy of POLICIES) {
    if (policy.matches(pathname, method.toUpperCase())) {
      return policy;
    }
  }
  return null;
}
