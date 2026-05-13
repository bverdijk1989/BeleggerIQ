import { NextResponse, type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { signSessionCookie } from "@/lib/auth";
import {
  exchangeCodeForTokens,
  fetchUserInfo,
  getGoogleOAuthConfig,
  OAUTH_STATE_COOKIE,
  verifyStateToken,
  type GoogleUserInfo,
} from "@/lib/auth/google-oauth";
import { prisma } from "@/lib/data/prisma";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "biq_session";
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/**
 * GET /auth/google/callback?code=…&state=…
 *
 * Stap 2 van de OAuth-flow.
 *
 * Volgorde van checks:
 *  1. Geen code/state in querystring → fail
 *  2. State-cookie matcht niet met state-param → CSRF/replay → fail
 *  3. State-token signature is invalid of expired → fail
 *  4. Code-exchange bij Google faalt → fail
 *  5. UserInfo-fetch faalt → fail
 *  6. Email niet geverifieerd door Google → fail (we trust geen onbevestigde emails)
 *  7. Upsert User + UserProfile lokaal (auto-create-flow)
 *  8. Sign biq_session-cookie + redirect /dashboard
 *
 * Audit-trail: elke succesvolle login wordt gelogd als `oauth_login_google`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = getGoogleOAuthConfig();
  if (!config) {
    return redirectError(request, "oauth-not-configured");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    // Google gaf zelf een error terug (bv. user_denied).
    log.warn("auth:google:callback", "google_returned_error", {
      error: oauthError,
    });
    return redirectError(request, "google-denied");
  }
  if (!code || !state) {
    return redirectError(request, "missing-params");
  }

  // ============================================================
  //  State-verificatie (CSRF-guard)
  // ============================================================
  const secret = process.env.BIQ_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    log.error(
      "auth:google:callback",
      "BIQ_SESSION_SECRET ontbreekt of te kort",
    );
    return redirectError(request, "session-config");
  }

  const stateCookie = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const verification = verifyStateToken(state, secret);
  if (!verification.ok) {
    log.warn("auth:google:callback", "state_invalid", {
      reason: verification.reason,
    });
    return redirectError(request, "invalid-state");
  }
  if (!stateCookie || stateCookie !== verification.nonce) {
    log.warn("auth:google:callback", "state_cookie_mismatch");
    return redirectError(request, "state-mismatch");
  }

  // ============================================================
  //  Token-exchange + userinfo
  // ============================================================
  const tokens = await exchangeCodeForTokens({ config, code });
  if (!tokens) {
    log.warn("auth:google:callback", "token_exchange_failed");
    return redirectError(request, "token-exchange");
  }

  const userInfo = await fetchUserInfo({ accessToken: tokens.access_token });
  if (!userInfo) {
    log.warn("auth:google:callback", "userinfo_failed");
    return redirectError(request, "userinfo");
  }
  if (!userInfo.email_verified) {
    log.warn("auth:google:callback", "email_not_verified", {
      sub: userInfo.sub,
    });
    return redirectError(request, "email-not-verified");
  }

  // ============================================================
  //  Upsert User + UserProfile (auto-create flow)
  // ============================================================
  const user = await upsertOAuthUser(userInfo);
  if (!user) {
    log.error("auth:google:callback", "user_upsert_failed", {
      sub: userInfo.sub,
    });
    return redirectError(request, "upsert-failed");
  }

  // ============================================================
  //  Sign session-cookie + clear state-cookie + redirect
  // ============================================================
  let cookieValue: string;
  try {
    cookieValue = signSessionCookie(user.email, secret);
  } catch (error) {
    log.error("auth:google:callback", "signSessionCookie failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return redirectError(request, "session-config");
  }

  await audit
    .record({
      userEmail: user.email,
      category: "auth",
      action: "oauth_login_google",
      resourceType: "User",
      resourceId: user.id,
      summary: `Login via Google OAuth (sub=${userInfo.sub})`,
      metadata: {
        provider: "google",
        newUser: user.isNew,
      },
    })
    .catch(() => {
      /* audit-write mag de hoofd-flow niet blokkeren */
    });

  const dashboardUrl = buildAbsoluteUrl(request, "/dashboard");
  const response = NextResponse.redirect(dashboardUrl, { status: 303 });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: cookieValue,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
  // Wis state-cookie — eenmalig gebruik.
  response.cookies.set({
    name: OAUTH_STATE_COOKIE,
    value: "",
    path: "/auth/google",
    maxAge: 0,
  });
  log.info("auth:google:callback", "session_issued", {
    email: user.email,
    newUser: user.isNew,
  });
  return response;
}

// ============================================================
//  Helpers
// ============================================================

async function upsertOAuthUser(
  info: GoogleUserInfo,
): Promise<{ id: string; email: string; isNew: boolean } | null> {
  const email = info.email.toLowerCase().trim();
  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      // Optioneel: profiel-update wanneer Google ons betere data geeft
      // (name, picture). Niet in v1 — eerst krijgen we de flow rond.
      return { id: existing.id, email, isNew: false };
    }
    // Nieuwe user — auto-create-flow.
    const created = await prisma.user.create({
      data: {
        email,
        name: info.name ?? null,
        image: info.picture ?? null,
        profile: {
          create: {
            // Defaults uit prisma/schema.prisma: BALANCED, 10y horizon, FREE
            // tier. User vult onboarding zelf in vanaf /onboarding.
          },
        },
      },
      select: { id: true },
    });
    return { id: created.id, email, isNew: true };
  } catch (error) {
    log.error("auth:google:callback", "user_upsert_db_error", {
      rawMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function redirectError(request: NextRequest, reason: string): NextResponse {
  const loginUrl = buildAbsoluteUrl(request, "/login");
  loginUrl.searchParams.set("error", reason);
  return NextResponse.redirect(loginUrl, { status: 303 });
}

function buildAbsoluteUrl(request: NextRequest, path: string): URL {
  const forwardedProto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host");
  if (forwardedHost) {
    const proto = forwardedProto ?? "https";
    return new URL(path, `${proto}://${forwardedHost}`);
  }
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    return new URL(path, configured);
  }
  return new URL(path, request.url);
}
