/**
 * Advisor Pilot Workspace — types (Module 24).
 *
 * **Status v1**: pilot-laag bovenop bestaande User/Portfolio-modellen.
 * Workspace-links worden geparsed uit een env-var (`ADVISOR_WORKSPACE_LINKS`),
 * net als de admin-allowlist (Module 15). Geen Prisma-migratie.
 *
 * **Migratie-pad** (v2 — wanneer pilot bevestigd is): vervang
 * `resolveLinksFromEnv` door een DB-resolver die `OrgMembership` + een
 * `WorkspaceClientLink`-tabel leest. De rest van de codebase (boundary
 * check, audit-wrapper, UI-componenten) consumeert hetzelfde
 * `WorkspaceLink`-type → migratie wordt één file, geen rewrite.
 *
 * **Privacy-by-default**: een advisor ziet ALLEEN cliënten waarvan
 * de e-mail expliciet in zijn link-set staat. Niet-gelinkte cliënten
 * zijn onvindbaar via deze laag.
 */

import type { ISODateString } from "@/types/common";
import type { BillingTier } from "@/types/profile";

/**
 * Eén workspace-link tussen één advisor en zijn cliënten.
 * `clientEmails` is een set — dedup gebeurt in de resolver.
 */
export interface WorkspaceLink {
  /** E-mail van de advisor (genormaliseerd, lowercase). */
  advisorEmail: string;
  /** Genormaliseerde cliënt-e-mails (lowercase). */
  clientEmails: ReadonlyArray<string>;
}

/**
 * Geresolveerd workspace-record voor één advisor — wat hij ziet
 * wanneer hij `/advisor/clients` opent.
 */
export interface AdvisorWorkspace {
  advisorEmail: string;
  /** Cliënten met hun publieke samenvatting. */
  clients: ReadonlyArray<AdvisorClientSummary>;
  /** Bron van de link-data — voor support. */
  source: "env_allowlist" | "db" | "none";
  /** Aantal niet-gevonden cliënten (link aanwezig maar user bestaat niet). */
  missingClientCount: number;
}

/**
 * Publieke cliënt-samenvatting voor de dashboard-lijst. Minimaal —
 * géén holdings, géén bedragen tot je expliciet op een cliënt klikt.
 */
export interface AdvisorClientSummary {
  /** Gemaskeerde e-mail (b***@example.com). Display only. */
  maskedEmail: string;
  /** Stable identifier voor links (deterministische hash). */
  clientId: string;
  /** Billing-tier van de cliënt — voor display, geen autorisatie. */
  tier: BillingTier;
  /** Totaal aantal portefeuilles bij de cliënt. */
  portfolioCount: number;
  /** Totaal aantal posities (over alle portefeuilles). */
  positionCount: number;
  /** ISO-timestamp van laatste audit-event (proxy voor activity). */
  lastActivityAt: ISODateString | null;
  /** Wanneer is de cliënt aangemaakt? */
  createdAt: ISODateString;
}

/**
 * Detail-view per cliënt — voor `/advisor/clients/[clientId]`. Bevat
 * publieke metadata + een verwijzing naar de portfolio-id van de
 * primary portfolio (voor report-generation).
 */
export interface AdvisorClientDetail extends AdvisorClientSummary {
  /** Email-hash → mag in audit-log, geen raw e-mail. */
  clientEmailHash: string;
  /** Onbewerkte e-mail — NIET in logs, alleen voor server-actions
   *  binnen advisor-context. UI gebruikt `maskedEmail`. */
  unsafeEmail: string;
  /** ID van de primary portfolio — voor report-generation. */
  primaryPortfolioId: string | null;
  /** Snapshot-totaal in base currency (alleen voor de advisor-view). */
  totalValue: number | null;
  baseCurrency: string;
}

/**
 * Resultaat van de boundary-check.
 */
export interface AccessDecision {
  allowed: boolean;
  /** Reden — voor audit-trail. */
  reason:
    | "ok"
    | "not_an_advisor"
    | "not_linked"
    | "client_not_found"
    | "no_workspace_links";
}

/**
 * Resultaat van het laden van de cliëntenlijst.
 */
export interface LoadWorkspaceResult {
  workspace: AdvisorWorkspace;
}

/**
 * Env-var key voor workspace-links.
 *
 * **Format**:
 *   `advisor@example.com:client1@a.com,client2@b.com;advisor2@x.com:client3@y.com`
 *
 * Elk segment vóór `;` is één advisor + zijn cliënten. Voor de
 * advisor-e-mail komt `:`; cliënten zijn comma-separated. Whitespace
 * en case worden genormaliseerd.
 */
export const WORKSPACE_LINKS_ENV = "ADVISOR_WORKSPACE_LINKS";
