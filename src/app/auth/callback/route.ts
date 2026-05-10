import { NextResponse, type NextRequest } from "next/server";

import { consumeMagicLink } from "@/lib/auth/magic-link";
import { signSessionCookie } from "@/lib/auth";
import { log } from "@/lib/log";

/**
 * GET /auth/callback?token=…
 *
 * Validatie-flow:
 *  1. Lees `token` uit query.
 *  2. `consumeMagicLink()` markeert single-use, checkt expiry, retourneert email.
 *  3. Sign een nieuwe `biq_session`-cookie via `signSessionCookie()`.
 *  4. Redirect naar `/dashboard`.
 *
 * Foutpaden redirecten naar `/login?error=…` zodat de gebruiker
 * een actionable boodschap krijgt zonder dat we 4xx HTML showen.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "biq_session";
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 dagen

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const rawToken = url.searchParams.get("token");
  if (!rawToken || rawToken.length < 16) {
    return redirectToLogin(request, "missing-token");
  }

  const result = await consumeMagicLink({ rawToken });
  if (!result.ok) {
    return redirectToLogin(request, result.reason.toLowerCase());
  }

  const secret = process.env.BIQ_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    log.error(
      "auth:callback",
      "BIQ_SESSION_SECRET ontbreekt of < 32 chars — kan geen sessie tekenen",
    );
    return redirectToLogin(request, "session-config");
  }

  let cookieValue: string;
  try {
    cookieValue = signSessionCookie(result.email, secret);
  } catch (error) {
    log.error("auth:callback", "signSessionCookie failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return redirectToLogin(request, "session-config");
  }

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
  log.info("auth:callback", "session issued", {
    email: result.email,
    tokenId: result.id,
  });
  return response;
}

function redirectToLogin(
  request: NextRequest,
  reason: string,
): NextResponse {
  const loginUrl = buildAbsoluteUrl(request, "/login");
  loginUrl.searchParams.set("error", reason);
  return NextResponse.redirect(loginUrl, { status: 303 });
}

/**
 * Proxy-aware absolute-URL bouwer. Achter nginx (of een vergelijkbare
 * reverse-proxy) is `request.url` de interne `http://localhost:3003/...`-
 * URL — niet bruikbaar voor een 303 Location-header die de browser moet
 * volgen. We construeren de juiste origin uit:
 *
 *   1. `X-Forwarded-Proto` + `X-Forwarded-Host` (door nginx gezet)
 *   2. of `Host`-header + protocol uit `X-Forwarded-Proto`
 *   3. fallback op `NEXT_PUBLIC_APP_URL`
 *   4. laatste redmiddel: `request.url` (bv. lokale dev zonder proxy)
 */
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
