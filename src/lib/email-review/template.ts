/**
 * Monthly Investor Review — e-mail template (Module 34).
 *
 * Pure functies: `MonthlyReviewData` → HTML + plain-text.
 *
 * **E-mail-veilige HTML**: inline styles, tabel-loze simpele layout,
 * geen externe assets. Werkt in Gmail/Outlook/Apple Mail. Alle
 * dynamische strings worden HTML-escaped.
 */

import type { MonthlyReviewData, RenderedReviewEmail } from "./types";

/**
 * Render volledige e-mail (HTML + text + subject).
 */
export function renderReviewEmail(
  data: MonthlyReviewData,
): RenderedReviewEmail {
  return {
    subject: `Je BeleggerIQ-review · ${data.periodLabel}`,
    html: renderHtml(data),
    text: renderText(data),
  };
}

// ============================================================
//  HTML
// ============================================================

function renderHtml(data: MonthlyReviewData): string {
  const sections = data.sections
    .map((s) => {
      const accent = toneColor(s.tone);
      return `
      <div style="margin:0 0 14px 0;padding:12px 14px;border-left:3px solid ${accent};background:#f7f8fa;border-radius:4px;">
        <p style="margin:0 0 4px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">
          ${esc(s.label)}
        </p>
        <p style="margin:0;font-size:14px;line-height:1.5;color:#1f2937;">
          ${esc(s.body)}
        </p>
      </div>`;
    })
    .join("");

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>BeleggerIQ Review</title>
</head>
<body style="margin:0;padding:0;background:#eef0f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#ffffff;border-radius:8px;padding:24px;">
      <p style="margin:0 0 2px 0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#22c55e;font-weight:600;">
        BeleggerIQ
      </p>
      <h1 style="margin:0 0 4px 0;font-size:20px;color:#111827;">
        Maandelijkse review · ${esc(data.periodLabel)}
      </h1>
      <p style="margin:0 0 16px 0;font-size:14px;color:#4b5563;">
        Hallo ${esc(data.greetingName)}, ${esc(data.headline)}
      </p>

      ${sections}

      <div style="margin:18px 0 8px 0;text-align:center;">
        <a href="${esc(data.appUrl)}"
           style="display:inline-block;background:#22c55e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 22px;border-radius:6px;">
          Bekijk je volledige overzicht
        </a>
      </div>

      <p style="margin:14px 0 0 0;font-size:11px;line-height:1.5;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px;">
        ${esc(data.disclaimer)}
      </p>
      <p style="margin:8px 0 0 0;font-size:11px;color:#9ca3af;">
        ${
          data.detailedFigures
            ? "Je hebt gedetailleerde cijfers aangezet in je voorkeuren."
            : "Deze e-mail toont alleen privacy-veilige samenvattingen — geen bedragen."
        }
      </p>
      <p style="margin:8px 0 0 0;font-size:11px;color:#9ca3af;">
        <a href="${esc(data.unsubscribeUrl)}" style="color:#6b7280;">
          Uitschrijven voor de maandelijkse review
        </a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ============================================================
//  Plain-text
// ============================================================

function renderText(data: MonthlyReviewData): string {
  const lines: string[] = [];
  lines.push(`BELEGGERIQ — MAANDELIJKSE REVIEW · ${data.periodLabel}`);
  lines.push("");
  lines.push(`Hallo ${data.greetingName},`);
  lines.push(data.headline);
  lines.push("");

  for (const s of data.sections) {
    lines.push(`## ${s.label}`);
    lines.push(s.body);
    lines.push("");
  }

  lines.push(`Bekijk je volledige overzicht: ${data.appUrl}`);
  lines.push("");
  lines.push("---");
  lines.push(data.disclaimer);
  lines.push("");
  lines.push(
    data.detailedFigures
      ? "Je hebt gedetailleerde cijfers aangezet in je voorkeuren."
      : "Deze e-mail toont alleen privacy-veilige samenvattingen — geen bedragen.",
  );
  lines.push(`Uitschrijven: ${data.unsubscribeUrl}`);
  return lines.join("\n");
}

// ============================================================
//  Helpers
// ============================================================

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toneColor(tone: string): string {
  switch (tone) {
    case "positive":
      return "#22c55e";
    case "warning":
      return "#f59e0b";
    case "info":
      return "#3b82f6";
    default:
      return "#9ca3af";
  }
}
