import { NextResponse, type NextRequest } from "next/server";

import {
  hashSessionId,
  recordConversionEvent,
  type ConversionEvent,
} from "@/lib/marketing/conversion-events";

export const dynamic = "force-dynamic";

/**
 * POST /api/marketing/track
 *
 * Lightweight conversion-tracking endpoint (Module 33).
 *
 * **Privacy**:
 *  - Accepteert alleen vaste ConversionEvent-keys (whitelist)
 *  - Geen user-agent of IP wordt opgeslagen
 *  - Session-id komt uit cookie en wordt direct gehasht
 *  - Geen response-body met PII
 */
const ALLOWED_EVENTS: ReadonlyArray<ConversionEvent> = [
  "landing_viewed",
  "landing_cta_hero_clicked",
  "landing_cta_pricing_clicked",
  "landing_cta_demo_clicked",
  "landing_cta_advisor_clicked",
  "landing_section_scrolled_pricing",
  "landing_section_scrolled_for_who",
  "landing_section_scrolled_faq",
  "signup_started",
  "pricing_viewed",
  "pricing_tier_selected",
  "upgrade_clicked",
  "advisor_pilot_inquired",
];

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      event?: string;
      tier?: string;
      source?: string;
    };
    const event = body.event as ConversionEvent | undefined;
    if (!event || !ALLOWED_EVENTS.includes(event)) {
      return NextResponse.json(
        { ok: false, error: "unknown_event" },
        { status: 400 },
      );
    }

    // Pak sessie-id uit cookie (HMAC-signed biq_session) — gehasht voor anonieme correlatie.
    const cookieHeader = request.headers.get("cookie") ?? "";
    const sessionRaw = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("biq_session="))
      ?.slice("biq_session=".length);
    const sessionHash = hashSessionId(sessionRaw ?? null);

    await recordConversionEvent({
      event,
      tier: typeof body.tier === "string" ? body.tier.slice(0, 16) : undefined,
      source:
        typeof body.source === "string" ? body.source.slice(0, 64) : undefined,
      sessionHash: sessionHash ?? undefined,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
