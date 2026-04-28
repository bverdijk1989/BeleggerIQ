/**
 * Email-templates voor notifications.
 *
 * **Plain-text first.** Een betrouwbare text-version is verplicht — die
 * werkt in elk mailclient, ook als CSS faalt of een gebruiker preview-
 * mode draait. HTML is optioneel en best-effort.
 *
 * Geen externe templating-engine. String concat met escape voor HTML.
 * Reden: minder bytes in de bundle, geen XSS-risico, en de output is
 * makkelijk te diffen in testen.
 */

import type { NotificationEvent } from "./events";

const APP_NAME = "BeleggerIQ";

export interface RenderedEmail {
  subject: string;
  text: string;
  html?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Eén-event-renderer (instant alert). HTML versie is een minimal
 * card-shape — werkt overal zonder CSS-dependencies.
 */
export function renderEventEmail(
  event: NotificationEvent,
  options?: { appUrl?: string },
): RenderedEmail {
  const appUrl = options?.appUrl ?? "";

  const subjectPrefix =
    event.severity === "critical" ? "[Actie] " : "[Update] ";
  const subject = `${subjectPrefix}${event.title}`;

  const textLines: string[] = [
    event.title,
    "".padEnd(event.title.length, "="),
    "",
    event.body,
    "",
  ];
  if (appUrl) {
    textLines.push(`Open je dashboard: ${appUrl}/dashboard`);
    textLines.push("");
  }
  textLines.push(
    "Voorkeuren beheren of uitschrijven: voorkeuren in /profiel.",
  );
  textLines.push(`— ${APP_NAME}`);
  const text = textLines.join("\n");

  const html = [
    "<!doctype html><html><body style=\"font-family:system-ui,sans-serif;color:#111;\">",
    `<h1 style="margin:0 0 12px;font-size:18px;">${escapeHtml(event.title)}</h1>`,
    `<p style="margin:0 0 12px;line-height:1.5;">${escapeHtml(event.body)}</p>`,
    appUrl
      ? `<p style="margin:16px 0;"><a href="${escapeHtml(appUrl)}/dashboard" style="color:#1d4ed8;">Open je dashboard →</a></p>`
      : "",
    `<hr style="border:none;border-top:1px solid #ddd;margin:24px 0;">`,
    `<p style="font-size:12px;color:#666;">Voorkeuren beheren in /profiel. — ${APP_NAME}</p>`,
    "</body></html>",
  ].join("\n");

  return { subject, text, html };
}

// ============================================================
//  Digest renderer
// ============================================================

export interface DigestBullet {
  label: string;
  detail: string;
}

export interface DigestRenderInput {
  weekLabel: string;
  bullets: DigestBullet[];
  /** Korte CTA aan het einde — wat raden we de gebruiker concreet aan? */
  nextAction: string;
  appUrl?: string;
}

export function renderDigestEmail(input: DigestRenderInput): RenderedEmail {
  const subject = `${APP_NAME} weekupdate — ${input.weekLabel}`;

  const textLines: string[] = [
    `${APP_NAME} weekoverzicht — ${input.weekLabel}`,
    "".padEnd(48, "="),
    "",
  ];
  for (const b of input.bullets) {
    textLines.push(`• ${b.label}: ${b.detail}`);
  }
  textLines.push("");
  textLines.push(`Volgende actie: ${input.nextAction}`);
  if (input.appUrl) {
    textLines.push("");
    textLines.push(`Open je dashboard: ${input.appUrl}/dashboard`);
  }
  textLines.push("");
  textLines.push(
    "Voorkeuren beheren: zet de wekelijkse digest uit via /profiel.",
  );
  textLines.push(`— ${APP_NAME}`);
  const text = textLines.join("\n");

  const html = [
    "<!doctype html><html><body style=\"font-family:system-ui,sans-serif;color:#111;\">",
    `<h1 style="margin:0 0 12px;font-size:18px;">${APP_NAME} weekoverzicht</h1>`,
    `<p style="margin:0 0 12px;color:#666;">${escapeHtml(input.weekLabel)}</p>`,
    "<ul style=\"padding-left:20px;line-height:1.6;\">",
    ...input.bullets.map(
      (b) =>
        `<li><strong>${escapeHtml(b.label)}:</strong> ${escapeHtml(b.detail)}</li>`,
    ),
    "</ul>",
    `<p style="margin:16px 0;"><strong>Volgende actie:</strong> ${escapeHtml(input.nextAction)}</p>`,
    input.appUrl
      ? `<p style="margin:16px 0;"><a href="${escapeHtml(input.appUrl)}/dashboard" style="color:#1d4ed8;">Open je dashboard →</a></p>`
      : "",
    `<hr style="border:none;border-top:1px solid #ddd;margin:24px 0;">`,
    `<p style="font-size:12px;color:#666;">Voorkeuren beheren in /profiel. — ${APP_NAME}</p>`,
    "</body></html>",
  ].join("\n");

  return { subject, text, html };
}
