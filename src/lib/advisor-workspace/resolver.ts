/**
 * Advisor Pilot Workspace — env-resolver + boundary-check (Module 24).
 *
 * **Pure functies** — geen DB, geen IO. Caller geeft env-waarde door
 * zodat tests kunnen overriden.
 *
 * **Filosofie**: zelfde principe als admin-allowlist (Module 15) —
 * deployment = autorisatie-wijziging. Voor een pilot met <5 advisors
 * en <50 cliënten geeft dit een verifieerbare, audit-traceerbare bron
 * zonder Prisma-migratie.
 */

import { WORKSPACE_LINKS_ENV, type WorkspaceLink } from "./types";

/**
 * Parse de raw env-string naar genormaliseerde `WorkspaceLink`-records.
 *
 * Tolerant voor whitespace, lege segmenten, hoofdletters. Duplicates
 * binnen een client-set worden gededupeerd.
 *
 * **Voorbeelden**:
 * ```
 *   "advisor@a.com:c1@b.com,c2@b.com"
 *     → [{ advisor: "advisor@a.com", clients: ["c1@b.com","c2@b.com"] }]
 *   "  ADVISOR@A.com :  C1@b.com  ;  a2@x.com:c3@y.com  "
 *     → twee links, alles lowercase
 *   "advisor@a.com"                  // geen `:` → leeg
 *   "advisor@a.com:"                 // geen cliënten → leeg
 *   ""                               // null
 * ```
 */
export function parseWorkspaceLinks(
  envValue: string | undefined,
): ReadonlyArray<WorkspaceLink> {
  if (!envValue || envValue.trim().length === 0) return [];

  const out: WorkspaceLink[] = [];
  // Group per advisor — overlapping segments worden samengevoegd
  // (`advisor1:c1;advisor1:c2` → één link met [c1, c2]).
  const byAdvisor = new Map<string, Set<string>>();

  for (const segment of envValue.split(";")) {
    const trimmed = segment.trim();
    if (trimmed.length === 0) continue;
    const colon = trimmed.indexOf(":");
    if (colon < 0) continue;
    const advisor = trimmed.slice(0, colon).trim().toLowerCase();
    const clientsRaw = trimmed.slice(colon + 1);
    if (!advisor.includes("@")) continue;

    const clients = clientsRaw
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter((c) => c.length > 0 && c.includes("@"));

    if (clients.length === 0) continue;

    const existing = byAdvisor.get(advisor) ?? new Set<string>();
    for (const c of clients) existing.add(c);
    byAdvisor.set(advisor, existing);
  }

  for (const [advisor, clients] of byAdvisor.entries()) {
    out.push({
      advisorEmail: advisor,
      clientEmails: Array.from(clients).sort(),
    });
  }
  return out;
}

/**
 * Laad de workspace-links voor één advisor. Geen DB-call.
 */
export function getWorkspaceLinksForAdvisor(
  advisorEmail: string | null | undefined,
  envValue: string | undefined = process.env[WORKSPACE_LINKS_ENV],
): WorkspaceLink | null {
  const normalized = (advisorEmail ?? "").trim().toLowerCase();
  if (normalized.length === 0) return null;
  const links = parseWorkspaceLinks(envValue);
  return links.find((l) => l.advisorEmail === normalized) ?? null;
}

/**
 * Boundary-check: mag deze advisor deze cliënt openen?
 *
 * **Strikte semantiek**:
 *   - lege advisor / lege client → DENY
 *   - geen workspace-links → DENY (`no_workspace_links`)
 *   - advisor heeft geen links → DENY (`not_an_advisor`)
 *   - advisor heeft links maar deze client zit er niet in → DENY (`not_linked`)
 *   - match → ALLOW
 *
 * **Pure functie** — geen audit-write hier. Caller logt na boundary-check.
 */
export function checkClientAccess(
  advisorEmail: string | null | undefined,
  clientEmail: string | null | undefined,
  envValue: string | undefined = process.env[WORKSPACE_LINKS_ENV],
): { allowed: boolean; reason: "ok" | "not_an_advisor" | "not_linked" | "no_workspace_links" } {
  const normalizedAdvisor = (advisorEmail ?? "").trim().toLowerCase();
  const normalizedClient = (clientEmail ?? "").trim().toLowerCase();
  if (normalizedAdvisor.length === 0 || normalizedClient.length === 0) {
    return { allowed: false, reason: "not_an_advisor" };
  }

  const links = parseWorkspaceLinks(envValue);
  if (links.length === 0) {
    return { allowed: false, reason: "no_workspace_links" };
  }
  const link = links.find((l) => l.advisorEmail === normalizedAdvisor);
  if (!link) {
    return { allowed: false, reason: "not_an_advisor" };
  }
  if (!link.clientEmails.includes(normalizedClient)) {
    return { allowed: false, reason: "not_linked" };
  }
  return { allowed: true, reason: "ok" };
}

/**
 * Is dit een geldige advisor met workspace-links? Voor entitlement-
 * gating wanneer een advisor de `/advisor/clients`-dashboard opent.
 */
export function isWorkspaceAdvisor(
  advisorEmail: string | null | undefined,
  envValue: string | undefined = process.env[WORKSPACE_LINKS_ENV],
): boolean {
  return getWorkspaceLinksForAdvisor(advisorEmail, envValue) !== null;
}
