/**
 * Advisor Pilot Workspace — audit-helpers (Module 24).
 *
 * Dunne wrappers rond `audit.record` voor twee discrete events:
 *   - `advisor_client_opened` — advisor opent een cliënt-detail-page
 *   - `advisor_client_report_exported` — advisor genereert een rapport
 *
 * **Privacy-regel**: NOOIT raw e-mail in audit-metadata. We schrijven
 * `clientEmailHash` (sha256) zodat compliance kan reconstrueren wie
 * is geopend zonder dat een DB-lek e-mails blootlegt.
 */

import { audit } from "@/lib/audit";

import { clientEmailHash } from "./service";

export interface AdvisorAuditEventInput {
  advisorEmail: string;
  clientEmail: string;
  /** Optionele extra metadata — wordt schoongespoeld op PII. */
  metadata?: Record<string, unknown>;
  /** Hash van het IP-adres (al door middleware berekend). */
  ipHash?: string | null;
}

/**
 * Log dat een advisor een cliënt-detail-page heeft geopend.
 */
export async function recordAdvisorClientOpened(
  input: AdvisorAuditEventInput,
): Promise<void> {
  await audit.record({
    userEmail: input.advisorEmail,
    category: "system",
    action: "advisor_client_opened",
    resourceType: "AdvisorClient",
    resourceId: clientEmailHash(input.clientEmail),
    summary: "Advisor opende cliëntdossier.",
    metadata: scrub({
      ...input.metadata,
      clientEmailHash: clientEmailHash(input.clientEmail),
      workspaceVersion: "pilot/env",
    }),
    ipHash: input.ipHash ?? null,
  });
}

/**
 * Log dat een advisor een rapport heeft geëxporteerd voor een cliënt.
 */
export async function recordAdvisorClientReportExported(
  input: AdvisorAuditEventInput & {
    format: "html" | "pdf";
    schemaVersion: number;
  },
): Promise<void> {
  await audit.record({
    userEmail: input.advisorEmail,
    category: "system",
    action: "advisor_client_report_exported",
    resourceType: "AdvisorReport",
    resourceId: clientEmailHash(input.clientEmail),
    summary: `Advisor exporteerde ${input.format.toUpperCase()}-rapport voor cliënt.`,
    metadata: scrub({
      ...input.metadata,
      clientEmailHash: clientEmailHash(input.clientEmail),
      format: input.format,
      schemaVersion: input.schemaVersion,
      workspaceVersion: "pilot/env",
    }),
    ipHash: input.ipHash ?? null,
  });
}

/**
 * Log een poging om een niet-gekoppelde cliënt te openen — KRITIEK
 * voor security-monitoring. Vangt zowel typo's als actieve probes.
 */
export async function recordAdvisorAccessDenied(input: {
  advisorEmail: string;
  attemptedClientId: string;
  reason: string;
  ipHash?: string | null;
}): Promise<void> {
  await audit.record({
    userEmail: input.advisorEmail,
    category: "auth",
    action: "advisor_access_denied",
    resourceType: "AdvisorClient",
    resourceId: input.attemptedClientId.slice(0, 32),
    summary: `Advisor-toegang geweigerd: ${input.reason}`,
    metadata: {
      reason: input.reason,
      attemptedClientId: input.attemptedClientId.slice(0, 32),
    },
    ipHash: input.ipHash ?? null,
  });
}

/**
 * Strip PII-velden uit metadata (defensief tegen callers die per
 * ongeluk een raw email of bedrag meegeven). Conservatief: alleen
 * primitive types (string/number/boolean), nooit raw mail-patroon.
 */
function scrub(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === "string") {
      // Eenvoudige e-mail-detectie — als de waarde een @ bevat en
      // langer is dan 5 chars, beschouw als mogelijke e-mail en
      // mask 'em.
      if (v.includes("@") && v.length > 5) {
        out[k] = "[redacted-email]";
      } else {
        out[k] = v.slice(0, 200);
      }
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else if (v === null) {
      out[k] = null;
    } else {
      // Objects/arrays niet — voorkomt accidentele blob-dump
      out[k] = "[dropped]";
    }
  }
  return out;
}
