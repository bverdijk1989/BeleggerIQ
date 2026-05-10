import { NextResponse, type NextRequest } from "next/server";

import { log } from "@/lib/log";
import {
  getOrCreateRequestId,
  REQUEST_ID_HEADER_NAME,
} from "@/lib/observability/request-id";
import { checkRateLimit } from "@/lib/ratelimit";

/**
 * Next-middleware: token-bucket rate-limiter.
 *
 * Loopt op iedere request die de `matcher` hieronder matcht. We laten
 * het matcher-systeem het filteren doen in plaats van runtime-checks
 * — dat scheelt overhead voor static assets, _next/data, favicon etc.
 *
 * Beslis-logica zit in `@/lib/ratelimit` (pure module, testbaar zonder
 * Next-runtime). Deze file is alleen de adapter: request → identifier
 * → outcome → response.
 *
 * Headers die we toevoegen:
 *   - `X-RateLimit-Policy`     naam van de toegepaste policy (debug)
 *   - `X-RateLimit-Remaining`  resterende tokens (informatief)
 *   - `Retry-After`            seconden tot retry (alleen bij 429, RFC 7231)
 */

export const config = {
  /**
   * Match alle API-routes en de POST naar /login (magic-link form).
   *
   * Negative-lookaheads houden static assets en Next-internals buiten:
   *   - `_next/static/*`        bundle output
   *   - `_next/image/*`         next/image
   *   - `_next/data/*`          getServerSideProps cache
   *   - `favicon.ico`, public/  static files
   *
   * /login zelf doet GET (form-render) én POST (server-action). De
   * policy in `policy.ts` filtert op method, dus middleware mag voor
   * beide draaien — het rate-limit-resultaat is "skipped" voor GET.
   */
  matcher: [
    "/api/:path*",
    "/login",
    "/auth/callback",
  ],
};

function extractClientIp(request: NextRequest): string {
  // X-Forwarded-For komt van nginx (zie deploy/nginx.conf.example).
  // We pakken de eerste IP — dat is de echte client; daarna staan
  // proxies. Mocht de header ontbreken, val terug op X-Real-IP.
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = request.headers.get("x-real-ip");
  if (xri) return xri.trim();
  // Last-resort: een vaste string. Beter dan undefined — buckets
  // moeten een key hebben. Niet anonimiseert iedereen tot dezelfde
  // bucket maar dat is alleen relevant in dev/test waar nginx ontbreekt.
  return "unknown";
}

export function proxy(request: NextRequest): NextResponse {
  const startMs = Date.now();
  const { pathname } = request.nextUrl;
  const method = request.method;
  const ip = extractClientIp(request);
  const requestId = getOrCreateRequestId(request.headers);

  const outcome = checkRateLimit({ pathname, method, identifier: ip });

  if (outcome.kind === "skipped" || outcome.kind === "allowed") {
    // Propageer request-id naar de downstream handler — zo kan de
    // route-handler `request.headers.get('x-request-id')` lezen en
    // dezelfde ID in z'n eigen logs gebruiken.
    const fwd = new Headers(request.headers);
    fwd.set("x-request-id", requestId);
    const res = NextResponse.next({ request: { headers: fwd } });
    res.headers.set(REQUEST_ID_HEADER_NAME, requestId);
    if (outcome.kind === "allowed") {
      res.headers.set("X-RateLimit-Policy", outcome.policy);
      res.headers.set("X-RateLimit-Remaining", String(outcome.remaining));
    }
    // Request-log: middleware ziet GEEN response-status (dat doet de
    // route-handler). We loggen wat we hier weten + duration tot het
    // moment van doorgeven. Voor end-to-end-timing → response-side
    // logging in de route-handler met dezelfde requestId.
    log.info("http:in", "request_received", {
      requestId,
      method,
      path: pathname,
      ip,
      ratelimit: outcome.kind === "allowed" ? outcome.policy : null,
      durationMs: Date.now() - startMs,
    });
    return res;
  }

  const retryAfterSec = Math.ceil(outcome.retryAfterMs / 1000);
  log.warn("http:in", "rate_limited", {
    requestId,
    method,
    path: pathname,
    ip,
    policy: outcome.policy,
    retryAfterMs: outcome.retryAfterMs,
    status: 429,
    durationMs: Date.now() - startMs,
  });
  return NextResponse.json(
    {
      error:
        "Te veel verzoeken. Probeer het over een paar seconden opnieuw.",
      code: "RATE_LIMITED",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
        "X-RateLimit-Policy": outcome.policy,
        "X-RateLimit-Remaining": "0",
        [REQUEST_ID_HEADER_NAME]: requestId,
      },
    },
  );
}

// Backwards-compat alias zodat bestaande tests + andere imports niet
// in één klap omgewogen hoeven te worden. De Next-runtime gebruikt
// alleen de `proxy`-export.
export { proxy as middleware };
