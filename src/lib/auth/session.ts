import { log } from "@/lib/log";

/**
 * Auth-resolver voor BeleggerIQ 2.0.
 *
 * De app heeft nog geen volwaardige login-flow. Deze module fungeert als
 * het eerste contract waar auth wél langs komt, zodat een echte provider
 * (NextAuth, Clerk, custom) later droppable in is zonder de API-routes
 * aan te raken.
 *
 * Resolutie-volgorde:
 * 1. Signed session cookie `biq_session` — HMAC-geverifieerd.
 * 2. Request header `x-beleggeriq-user` — alleen in NON-productie;
 *    handig voor Postman / curl tijdens development.
 * 3. `DEMO_USER_EMAIL` env-fallback — alleen als `BIQ_ALLOW_DEMO_AUTH` op
 *    `"true"` staat. Dit is expliciet opt-in per deployment zodat
 *    productie niet per ongeluk open staat.
 *
 * Cookie-formaat: `base64url(email).base64url(hmac_sha256(email, secret))`
 * met `BIQ_SESSION_SECRET` als sleutel. De cookie bevat alleen een email;
 * alle andere user-state komt uit Prisma.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface AuthenticatedUser {
  email: string;
  /** Hoe de user is gevonden — waardevol voor logs + telemetry. */
  source: "session-cookie" | "dev-header" | "demo-fallback";
}

export type AuthResolution =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Duck-typed request surface zodat zowel `NextRequest` (API routes) als de
 * `cookies()`/`headers()` helpers uit `next/headers` (server components)
 * dezelfde resolver kunnen gebruiken zonder extra adapters.
 */
export interface RequestLike {
  cookies: { get: (name: string) => { value: string } | undefined };
  headers: { get: (name: string) => string | null };
}

const SESSION_COOKIE = "biq_session";
const DEV_HEADER = "x-beleggeriq-user";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function demoAllowed(): boolean {
  // **Productie-guard.** BIQ_ALLOW_DEMO_AUTH=true mag NOOIT in productie
  // zijn — anders zou iedereen met de URL als demo-user inloggen. We
  // weigeren 'em hier expliciet zodat een operator-ongeluk in
  // .env.production niet in stilte tot een security-breach leidt.
  if (process.env.BIQ_ALLOW_DEMO_AUTH !== "true") return false;
  if (isProduction()) {
    // eslint-disable-next-line no-console
    console.warn(
      "[auth] BIQ_ALLOW_DEMO_AUTH=true is geweigerd in productie — demo-fallback uitgeschakeld.",
    );
    return false;
  }
  return true;
}

function getSessionSecret(): string | null {
  const secret = process.env.BIQ_SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

export function resolveUser(request: RequestLike): AuthResolution {
  // 1. Signed cookie.
  const cookieValue = request.cookies.get(SESSION_COOKIE)?.value;
  if (cookieValue) {
    const secret = getSessionSecret();
    if (!secret) {
      log.warn(
        "auth",
        "session cookie aanwezig maar BIQ_SESSION_SECRET ontbreekt of is te kort",
      );
      return {
        ok: false,
        status: 403,
        error: "Session niet te verifiëren.",
      };
    }
    const email = verifySessionCookie(cookieValue, secret);
    if (email) {
      return { ok: true, user: { email, source: "session-cookie" } };
    }
    return {
      ok: false,
      status: 401,
      error: "Ongeldige of verlopen sessie.",
    };
  }

  // 2. Dev header — alleen buiten productie.
  if (!isProduction()) {
    const headerEmail = request.headers.get(DEV_HEADER);
    if (headerEmail && EMAIL_REGEX.test(headerEmail)) {
      return {
        ok: true,
        user: { email: headerEmail.toLowerCase(), source: "dev-header" },
      };
    }
  }

  // 3. Demo fallback — expliciet opt-in per deployment.
  if (demoAllowed()) {
    const email = process.env.DEMO_USER_EMAIL ?? "demo@beleggeriq.nl";
    if (EMAIL_REGEX.test(email)) {
      return {
        ok: true,
        user: { email: email.toLowerCase(), source: "demo-fallback" },
      };
    }
  }

  return {
    ok: false,
    status: 401,
    error: "Authenticatie vereist.",
  };
}

/**
 * Bouw een signed cookie-waarde. Wordt door een (toekomstige) login-flow
 * aangeroepen; vooralsnog hier zodat een integration-test een echte
 * sessie kan simuleren.
 */
export function signSessionCookie(email: string, secret: string): string {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalized)) {
    throw new Error("Email is niet geldig.");
  }
  const payload = base64url(Buffer.from(normalized, "utf8"));
  const mac = hmacSha256(normalized, secret);
  return `${payload}.${base64url(mac)}`;
}

export function verifySessionCookie(
  cookieValue: string,
  secret: string,
): string | null {
  const [payload, signature] = cookieValue.split(".");
  if (!payload || !signature) return null;
  let email: string;
  let providedMac: Buffer;
  try {
    email = Buffer.from(payload, "base64url").toString("utf8");
    providedMac = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (!EMAIL_REGEX.test(email)) return null;
  const expectedMac = hmacSha256(email, secret);
  if (expectedMac.length !== providedMac.length) return null;
  if (!timingSafeEqual(expectedMac, providedMac)) return null;
  return email.toLowerCase();
}

function hmacSha256(value: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(value).digest();
}

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

// ============================================================
//  Authorization helpers
// ============================================================

/**
 * Controleer of de ingelogde user ownership heeft op de meegegeven email
 * (bv. om alleen de eigen portefeuille te mogen snapshotten). Retourneert
 * `true` als ze matchen; `false` als de caller `userEmail` meegeeft maar
 * die niet gelijk is aan de sessie.
 */
export function matchesSessionUser(
  session: AuthenticatedUser,
  requestedEmail?: string,
): boolean {
  if (!requestedEmail) return true;
  return session.email.toLowerCase() === requestedEmail.trim().toLowerCase();
}
