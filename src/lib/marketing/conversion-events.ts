/**
 * Conversion Events — privacy-vriendelijke tracking (Module 33).
 *
 * **Filosofie**: geen 3rd-party tracking-pixel, geen Google Analytics,
 * geen cross-site cookies. Conversion-events worden server-side
 * vastgelegd in audit-log (category="system", action="marketing_*")
 * en kunnen door admin worden gequeried.
 *
 * **Privacy-by-default**:
 *  - Geen user-agent / fingerprint
 *  - Optionele session-hash (sha256, 12 chars) i.p.v. raw IP
 *  - Geen URL-params met PII
 *  - Funnel-events anoniem voor uitgelogde users
 */

import crypto from "node:crypto";

/**
 * Stable event-keys — wijzig nooit (analytics-tracking koppelt hieraan).
 */
export type ConversionEvent =
  | "landing_viewed"
  | "landing_cta_hero_clicked"
  | "landing_cta_pricing_clicked"
  | "landing_cta_demo_clicked"
  | "landing_cta_advisor_clicked"
  | "landing_section_scrolled_pricing"
  | "landing_section_scrolled_for_who"
  | "landing_section_scrolled_faq"
  | "signup_started"
  | "signup_completed"
  | "pricing_viewed"
  | "pricing_tier_selected"
  | "upgrade_clicked"
  | "advisor_pilot_inquired";

/** Stabiel event-payload. */
export interface ConversionEventInput {
  event: ConversionEvent;
  /** Optioneel: welke tier-key voor pricing-events. */
  tier?: string;
  /** Optioneel: welke source-block. */
  source?: string;
  /** Optionele session-hash (12 chars sha256) — uit cookie of generated. */
  sessionHash?: string;
}

/** Hash een session-id voor anonieme correlatie. */
export function hashSessionId(raw: string | null | undefined): string | null {
  if (!raw || raw.trim().length === 0) return null;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 12);
}

/**
 * Server-side: schrijf conversion-event naar audit-log.
 * Faal-safe: gooit nooit, log slechts.
 */
export async function recordConversionEvent(
  input: ConversionEventInput,
): Promise<void> {
  try {
    const { audit } = await import("@/lib/audit");
    await audit.record({
      userEmail: null,
      category: "system",
      action: `marketing_${input.event}`,
      resourceType: "Conversion",
      resourceId: input.event,
      summary: `Marketing event: ${input.event}`,
      metadata: {
        event: input.event,
        ...(input.tier ? { tier: input.tier } : {}),
        ...(input.source ? { source: input.source.slice(0, 64) } : {}),
        ...(input.sessionHash ? { sessionHash: input.sessionHash } : {}),
      },
    });
  } catch {
    // Geen impact op user-flow als audit-write faalt.
  }
}
