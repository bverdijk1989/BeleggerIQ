/**
 * Google OAuth 2.0 — server-side handlers.
 *
 * **Hand-rolled, geen Auth.js**: past schoon naast de bestaande
 * magic-link + HMAC-cookie-architectuur (Module 15). Auth.js zou een
 * heel parallel cookie-systeem introduceren wat we niet willen.
 *
 * Flow:
 *  1. `/auth/google/start` → genereer state-nonce + redirect-URL
 *     naar Google's OAuth-consent screen
 *  2. Google redirect terug naar `/auth/google/callback?code=...&state=...`
 *  3. Server verifieert state-nonce → exchange code voor tokens
 *  4. Fetch userinfo (email + name + sub) bij Google
 *  5. Upsert User + UserProfile lokaal
 *  6. Sign onze eigen `biq_session`-cookie (zelfde helper als magic-link)
 *
 * **Env-vars**:
 *  - `GOOGLE_CLIENT_ID` — OAuth client-id van Google Cloud Console
 *  - `GOOGLE_CLIENT_SECRET` — bijbehorend secret
 *  - `NEXT_PUBLIC_APP_URL` — voor redirect-URI constructie
 *
 * Zonder env-vars: alle calls retourneren `null` of geven gracefully een
 * fallback error. Geen runtime-crash.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

const STATE_TTL_SECONDS = 10 * 60; // 10 min — gebruiker moet redelijk-snel klikken

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Resolve config uit env. Returnt null als één van de keys ontbreekt.
 */
export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId || !clientSecret) return null;
  const base = appUrl ?? "http://localhost:3000";
  return {
    clientId,
    clientSecret,
    redirectUri: `${base.replace(/\/$/, "")}/auth/google/callback`,
  };
}

// ============================================================
//  State-token: signed nonce om CSRF te voorkomen
// ============================================================

/**
 * Bouw state-token: `nonce.timestamp.hmac`. Wordt in cookie geplaatst
 * + meegestuurd in de redirect-URL. Google stuurt het terug; wij
 * verifiëren dat ze matchen + niet expired zijn.
 */
export function buildStateToken(secret: string): {
  state: string;
  nonce: string;
} {
  const nonce = randomBytes(16).toString("base64url");
  const ts = Math.floor(Date.now() / 1000).toString();
  const payload = `${nonce}.${ts}`;
  const sig = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return { state: `${payload}.${sig}`, nonce };
}

export type StateVerification =
  | { ok: true; nonce: string; issuedAt: number }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyStateToken(
  state: string,
  secret: string,
): StateVerification {
  const parts = state.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [nonce, tsStr, sig] = parts as [string, string, string];
  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return { ok: false, reason: "malformed" };
  const expected = createHmac("sha256", secret)
    .update(`${nonce}.${tsStr}`)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (now - ts > STATE_TTL_SECONDS) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, nonce, issuedAt: ts };
}

// ============================================================
//  OAuth-flow helpers
// ============================================================

/**
 * Bouw de Google authorize-URL waar we de gebruiker heen sturen.
 */
export function buildAuthorizeUrl(input: {
  config: GoogleOAuthConfig;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.config.clientId,
    redirect_uri: input.config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: input.state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  id_token?: string;
  token_type: "Bearer";
  scope: string;
}

/**
 * Exchange authorization-code voor access_token.
 */
export async function exchangeCodeForTokens(input: {
  config: GoogleOAuthConfig;
  code: string;
  fetchImpl?: typeof fetch;
}): Promise<GoogleTokenResponse | null> {
  const fetcher = input.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.config.clientId,
    client_secret: input.config.clientSecret,
    redirect_uri: input.config.redirectUri,
    grant_type: "authorization_code",
  });
  try {
    const response = await fetcher(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as GoogleTokenResponse;
    if (!json.access_token) return null;
    return json;
  } catch {
    return null;
  }
}

export interface GoogleUserInfo {
  /** Google's stable user-id (subject claim). */
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}

/**
 * Fetch user-info met de access_token.
 */
export async function fetchUserInfo(input: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<GoogleUserInfo | null> {
  const fetcher = input.fetchImpl ?? fetch;
  try {
    const response = await fetcher(GOOGLE_USERINFO_ENDPOINT, {
      headers: { authorization: `Bearer ${input.accessToken}` },
    });
    if (!response.ok) return null;
    const json = (await response.json()) as GoogleUserInfo;
    if (!json.email || !json.sub) return null;
    return json;
  } catch {
    return null;
  }
}

// ============================================================
//  State-cookie helpers
// ============================================================

export const OAUTH_STATE_COOKIE = "biq_oauth_state";
export const OAUTH_STATE_COOKIE_MAX_AGE = STATE_TTL_SECONDS;
