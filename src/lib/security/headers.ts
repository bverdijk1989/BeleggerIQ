/**
 * Security headers — defense-in-depth beyond auth.
 *
 * Toegepast vanuit `proxy.ts` op alle responses. Bewust **niet** te
 * agressief op CSP — we hebben Next.js inline scripts nodig en willen
 * geen breakage; we kunnen 'em later strakker maken met nonces.
 */

export const SECURITY_HEADERS: Record<string, string> = {
  // Voorkom MIME-sniffing (browser respecteert content-type header).
  "X-Content-Type-Options": "nosniff",
  // Voorkom clickjacking via iframes.
  "X-Frame-Options": "DENY",
  // Beperk referer-info naar third parties.
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // HSTS — alleen relevant onder HTTPS; browsers negeren onder HTTP.
  // Subdomeinen + 1 jaar; preload weglaten omdat we niet auto-pre-loaden.
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  // Permissions-policy — alleen wat de app zelf gebruikt; browser blocks rest.
  "Permissions-Policy":
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  // CSP — Next.js heeft inline scripts nodig dus 'unsafe-inline'.
  // Self-only voor de rest. Geen object-src om Flash-achtige dingen te
  // weren. Frame-ancestors = 'none' redundant met X-Frame-Options maar
  // moderne browsers prefereren CSP boven X-Frame-Options.
  "Content-Security-Policy":
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
};

/**
 * Apply security headers naar een Headers-object (mutatief).
 * Reden voor een helper: maakt 'em testbaar en houdt proxy.ts kort.
 */
export function applySecurityHeaders(headers: Headers): void {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
}
