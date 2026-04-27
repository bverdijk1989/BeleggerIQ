"use server";

import { headers } from "next/headers";

import { log } from "@/lib/log";
import { sendMail } from "@/lib/mail/provider";

import { hashIp, issueMagicLink } from "./magic-link";
import { checkRateLimit } from "./rate-limit";

/**
 * Server action `requestMagicLink(email)`.
 *
 * Doel: vraag een magic-link aan voor `email` en e-mail het token.
 *
 * **Privacy-by-design**: response onthult NOOIT of de email bestaat
 * in onze DB. We retourneren altijd dezelfde "OK"-staat ongeacht
 * email-bestand-status, zodat een aanvaller geen account-enumeratie
 * via deze endpoint kan doen. (Een geldig User-record is *niet*
 * vereist om een token aan te maken; de auth-resolver checkt
 * `prisma.user.findUnique` pas op de exchange-stap, en geeft daar
 * 401 zodra er geen User is.)
 *
 * **Rate limit**: 2 per minuut per `(ipHash, email)`.
 *
 * Retourneert een opaque `RequestMagicLinkResult` zodat de UI
 * generieke success-copy kan tonen, met `rateLimited` als enige
 * disclosable failure-state.
 */

export type RequestMagicLinkResult =
  | { ok: true }
  | { ok: false; reason: "INVALID_EMAIL" | "RATE_LIMITED" | "INTERNAL" };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestMagicLink(
  email: string,
): Promise<RequestMagicLinkResult> {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalized)) {
    return { ok: false, reason: "INVALID_EMAIL" };
  }

  const headerStore = await headers();
  const ip = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ipHash = hashIp(ip);

  const decision = checkRateLimit(ipHash, normalized);
  if (!decision.allowed) {
    log.info("auth:magic-link", "rate-limited", {
      retryAfterMs: decision.retryAfterMs,
    });
    return { ok: false, reason: "RATE_LIMITED" };
  }

  try {
    const issued = await issueMagicLink({ email: normalized, ip });
    const callbackUrl = buildCallbackUrl(issued.rawToken);
    const subject = "Inloglink voor BeleggerIQ";
    const text = [
      "Klik op onderstaande link om in te loggen op BeleggerIQ.",
      "Deze link is 15 minuten geldig en werkt slechts één keer.",
      "",
      callbackUrl,
      "",
      "Heb je deze e-mail niet aangevraagd? Negeer 'm — er is verder geen actie nodig.",
    ].join("\n");
    const html = [
      `<p>Klik op de knop om in te loggen op BeleggerIQ.</p>`,
      `<p><a href="${escapeHtml(callbackUrl)}" style="display:inline-block;padding:10px 18px;background:#1f6feb;color:#fff;border-radius:6px;text-decoration:none">Inloggen</a></p>`,
      `<p style="font-size:12px;color:#888">Deze link is 15 minuten geldig en werkt slechts één keer. Heb je deze e-mail niet aangevraagd? Negeer 'm — er is verder geen actie nodig.</p>`,
    ].join("");
    await sendMail({ to: normalized, subject, text, html });
    return { ok: true };
  } catch (error) {
    log.error("auth:magic-link", "issue/send failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, reason: "INTERNAL" };
  }
}

function buildCallbackUrl(rawToken: string): string {
  const base =
    process.env.BIQ_PUBLIC_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";
  const params = new URLSearchParams({ token: rawToken });
  return `${base}/auth/callback?${params.toString()}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
