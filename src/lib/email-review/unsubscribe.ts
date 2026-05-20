/**
 * Monthly Review — HMAC-signed unsubscribe-token (Module 34).
 *
 * **Doel**: een gebruiker kan zich uitschrijven via een link in de e-mail
 * zonder in te loggen. Token = base64url(payload) + "." + HMAC-sig.
 *
 * **Security**:
 *  - HMAC-SHA256 met server-secret (`AUTH_SECRET` of fallback)
 *  - Payload bevat alleen e-mail + scope — geen wachtwoord, geen sessie
 *  - Constant-time vergelijking tegen timing-attacks
 *  - Token is niet tijd-gebonden (unsubscribe-links verlopen niet —
 *    een verlopen unsubscribe-link die niet werkt is slechte UX)
 */

import crypto from "node:crypto";

interface UnsubscribePayload {
  email: string;
  scope: "monthly_review";
}

function getSecret(): string {
  return (
    process.env.AUTH_SECRET ??
    process.env.SESSION_SECRET ??
    "beleggeriq-dev-unsubscribe-secret"
  );
}

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(
    s.replace(/-/g, "+").replace(/_/g, "/") + pad,
    "base64",
  );
}

/**
 * Genereer een unsubscribe-token voor één e-mailadres.
 */
export function createUnsubscribeToken(email: string): string {
  const payload: UnsubscribePayload = {
    email: email.trim().toLowerCase(),
    scope: "monthly_review",
  };
  const body = base64url(Buffer.from(JSON.stringify(payload), "utf-8"));
  const sig = base64url(
    crypto.createHmac("sha256", getSecret()).update(body).digest(),
  );
  return `${body}.${sig}`;
}

/**
 * Verifieer een unsubscribe-token. Returnt het e-mailadres bij geldig
 * token, anders `null`.
 */
export function verifyUnsubscribeToken(
  token: string | null | undefined,
): { email: string } | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expectedSig = base64url(
    crypto.createHmac("sha256", getSecret()).update(body).digest(),
  );
  // Constant-time vergelijking.
  if (
    sig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      base64urlDecode(body).toString("utf-8"),
    ) as UnsubscribePayload;
    if (
      !parsed ||
      typeof parsed.email !== "string" ||
      parsed.scope !== "monthly_review" ||
      !parsed.email.includes("@")
    ) {
      return null;
    }
    return { email: parsed.email };
  } catch {
    return null;
  }
}

/**
 * Bouw de absolute unsubscribe-URL.
 */
export function buildUnsubscribeUrl(email: string, baseUrl: string): string {
  const token = createUnsubscribeToken(email);
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  return `${normalizedBase}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}
