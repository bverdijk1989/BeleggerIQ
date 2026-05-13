import { NextResponse, type NextRequest } from "next/server";

import {
  buildAuthorizeUrl,
  buildStateToken,
  getGoogleOAuthConfig,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_COOKIE_MAX_AGE,
} from "@/lib/auth/google-oauth";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /auth/google/start
 *
 * Stap 1 van de OAuth-flow. Genereert een signed state-token, plaatst
 * 'em in een korte-TTL cookie, en redirect de gebruiker naar Google's
 * consent-screen.
 *
 * Bij ontbrekende Google-OAuth-config (env-vars niet gezet):
 * redirect naar /login met `error=oauth-not-configured` zodat de UI
 * een nette melding kan tonen.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = getGoogleOAuthConfig();
  if (!config) {
    log.warn("auth:google:start", "google_oauth_not_configured");
    return redirectError(request, "oauth-not-configured");
  }

  const secret = process.env.BIQ_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    log.error(
      "auth:google:start",
      "BIQ_SESSION_SECRET ontbreekt of < 32 chars",
    );
    return redirectError(request, "session-config");
  }

  const { state, nonce } = buildStateToken(secret);
  const authorizeUrl = buildAuthorizeUrl({ config, state });

  const response = NextResponse.redirect(authorizeUrl, { status: 303 });
  // State-cookie zodat we op de callback kunnen verifiëren dat de state
  // die Google terugstuurt EXACT dezelfde is als degene die WIJ uitgaven.
  // HttpOnly + secure + sameSite=Lax (geen `none`, anders zou Google ze
  // kunnen opvragen via fetch met credentials).
  response.cookies.set({
    name: OAUTH_STATE_COOKIE,
    value: nonce,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/auth/google",
    maxAge: OAUTH_STATE_COOKIE_MAX_AGE,
  });
  log.info("auth:google:start", "redirect_to_google", { nonce });
  return response;
}

function redirectError(request: NextRequest, reason: string): NextResponse {
  const forwardedProto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "https";
  const forwardedHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host") ??
    new URL(request.url).host;
  const loginUrl = new URL(
    `/login?error=${encodeURIComponent(reason)}`,
    `${forwardedProto}://${forwardedHost}`,
  );
  return NextResponse.redirect(loginUrl, { status: 303 });
}
