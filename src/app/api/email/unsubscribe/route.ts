import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/data/prisma";
import { verifyUnsubscribeToken } from "@/lib/email-review";
import { log } from "@/lib/log";
import { parsePreferences } from "@/lib/notifications/preferences";

export const dynamic = "force-dynamic";

/**
 * GET /api/email/unsubscribe?token=...
 *
 * Token-based unsubscribe (Module 34). Geen auth vereist — de
 * HMAC-token bewijst dat de aanvrager toegang had tot de e-mail.
 *
 * Zet `notifications.monthlyReview = false` op het UserProfile.
 * Idempotent: meerdere keren klikken is veilig.
 *
 * Returnt een simpele HTML-bevestigingspagina (geen redirect — de
 * gebruiker komt rechtstreeks vanuit een e-mailclient).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get("token");
  const verified = verifyUnsubscribeToken(token);

  if (!verified) {
    return htmlResponse(
      "Link ongeldig of verlopen",
      "Deze uitschrijf-link kon niet worden geverifieerd. Pas je voorkeuren aan via Instellingen in de app.",
      400,
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: verified.email },
      select: { id: true },
    });
    if (!user) {
      // Geen account (meer) — toch een vriendelijke bevestiging tonen.
      return htmlResponse(
        "Uitgeschreven",
        "Je ontvangt geen maandelijkse review meer.",
        200,
      );
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: user.id },
      select: { notifications: true },
    });
    const prefs = parsePreferences(profile?.notifications);
    const nextPrefs = { ...prefs, monthlyReview: false };

    await prisma.userProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        notifications: nextPrefs as unknown as Prisma.InputJsonValue,
      },
      update: {
        notifications: nextPrefs as unknown as Prisma.InputJsonValue,
      },
    });

    log.info("email-review", "unsubscribed", {
      // Geen raw e-mail in log — alleen domein-deel + counter.
      emailDomain: verified.email.split("@")[1] ?? "unknown",
    });

    return htmlResponse(
      "Uitgeschreven",
      "Je ontvangt geen maandelijkse review meer per e-mail. Je kunt dit altijd weer aanzetten via Instellingen in de app.",
      200,
    );
  } catch (error) {
    log.error("email-review", "unsubscribe_failed", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return htmlResponse(
      "Er ging iets mis",
      "We konden je uitschrijving niet verwerken. Probeer 't later opnieuw of pas je voorkeuren aan in de app.",
      500,
    );
  }
}

function htmlResponse(
  title: string,
  body: string,
  status: number,
): NextResponse {
  const html = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)} · BeleggerIQ</title>
</head>
<body style="margin:0;background:#eef0f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="max-width:460px;margin:48px auto;padding:24px;background:#fff;border-radius:8px;">
    <p style="margin:0 0 2px 0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#22c55e;font-weight:600;">
      BeleggerIQ
    </p>
    <h1 style="margin:0 0 8px 0;font-size:20px;color:#111827;">${escapeHtml(title)}</h1>
    <p style="margin:0;font-size:14px;line-height:1.5;color:#4b5563;">${escapeHtml(body)}</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
