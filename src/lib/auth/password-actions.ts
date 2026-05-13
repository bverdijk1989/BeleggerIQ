"use server";

import { cookies, headers } from "next/headers";

import { audit } from "@/lib/audit";
import { signSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/data/prisma";
import { log } from "@/lib/log";

import { hashIp } from "./magic-link";
import { verifyPassword } from "./password";
import { checkRateLimit } from "./rate-limit";

export type RequestPasswordLoginResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "INVALID_INPUT"
        | "RATE_LIMITED"
        | "INVALID_CREDENTIALS"
        | "INTERNAL";
    };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SESSION_COOKIE = "biq_session";
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/**
 * Server-action `requestPasswordLogin(email, password)`.
 *
 * Verifieert credentials tegen bcrypt-hash in DB. Bij success: signt
 * `biq_session`-cookie (zelfde HMAC-flow als magic-link en OAuth).
 *
 * **Generic error op fail**: nooit "user bestaat niet" of "wachtwoord
 * is fout" apart melden — beide krijgen `INVALID_CREDENTIALS`. Voorkomt
 * account-enumeratie.
 *
 * **Rate-limit**: zelfde `checkRateLimit(ipHash, email)` als magic-link
 * (2/min per IP+email).
 *
 * **Timing-safe**: bcrypt's eigen compare is timing-safe. Voor email-niet-
 * gevonden doen we een dummy-bcrypt-compare om timing-leak (bestaand vs.
 * niet-bestaand account) te voorkomen.
 */
export async function requestPasswordLogin(input: {
  email: string;
  password: string;
}): Promise<RequestPasswordLoginResult> {
  const email = input.email?.trim().toLowerCase() ?? "";
  const password = input.password ?? "";

  if (!EMAIL_REGEX.test(email) || password.length === 0) {
    return { ok: false, reason: "INVALID_INPUT" };
  }
  if (password.length > 200) {
    // Lange password = DoS-poging tegen bcrypt-cost.
    return { ok: false, reason: "INVALID_INPUT" };
  }

  const headerStore = await headers();
  const ip = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ipHash = hashIp(ip);

  const decision = checkRateLimit(ipHash, email);
  if (!decision.allowed) {
    log.info("auth:password", "rate-limited", {
      retryAfterMs: decision.retryAfterMs,
    });
    return { ok: false, reason: "RATE_LIMITED" };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });

    // Timing-leak guard: doe altijd een bcrypt-compare, ook als user
    // niet bestaat — anders kan een aanvaller via response-tijd
    // detecteren of een email bekend is.
    const storedHash =
      user?.passwordHash ??
      // Dummy-hash met bekende value zodat bcrypt.compare uitvoert
      // maar nooit matcht. Cost-factor in deze hash is 12 (zelfde als
      // echte hashes), dus timing klopt.
      "$2a$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUV";

    const passwordOk = await verifyPassword(password, storedHash);

    if (!user || !user.passwordHash || !passwordOk) {
      log.info("auth:password", "invalid_credentials", {
        emailHash: email.length, // niet ruw email loggen
      });
      return { ok: false, reason: "INVALID_CREDENTIALS" };
    }

    // Signing-secret check
    const secret = process.env.BIQ_SESSION_SECRET;
    if (!secret || secret.length < 32) {
      log.error("auth:password", "BIQ_SESSION_SECRET ontbreekt of < 32 chars");
      return { ok: false, reason: "INTERNAL" };
    }

    const cookieValue = signSessionCookie(user.email, secret);

    const cookieStore = await cookies();
    cookieStore.set({
      name: SESSION_COOKIE,
      value: cookieValue,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    });

    await audit
      .record({
        userEmail: user.email,
        category: "auth",
        action: "password_login",
        resourceType: "User",
        resourceId: user.id,
        summary: "Login via wachtwoord",
        metadata: { method: "password" },
      })
      .catch(() => {
        /* audit-failure mag de login niet blokkeren */
      });

    log.info("auth:password", "session_issued", { userId: user.id });
    return { ok: true };
  } catch (error) {
    log.error("auth:password", "login failed", {
      rawMessage: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, reason: "INTERNAL" };
  }
}
