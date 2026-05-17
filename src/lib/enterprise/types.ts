/**
 * Advisor / Enterprise — fundament-types.
 *
 * **Status**: voorbereidende laag. We modelleren organisaties,
 * memberships, rollen, white-label-config en feature-flags op type-
 * niveau zonder NU al Prisma-tabellen toe te voegen. De runtime-laag
 * leest uit JSON-blobs en env-vars; migratie naar dedicated tabellen
 * staat beschreven in `docs/ADVISOR_ENTERPRISE_FOUNDATION.md`.
 *
 * **Bewuste keuze**: geen "grote rewrite". Het bestaande User → Portfolio-
 * model blijft de canonical structuur voor individuele beleggers.
 * Enterprise-functionaliteit is een **aanvullende laag** die overheen
 * gelegd wordt zodra organisaties verschijnen.
 *
 * **Topbelegger-laag**:
 *  - Buffett: B2B recurring revenue is duurzaam — dus contract-level
 *    state (org, role, billing-anchor) staat centraal.
 *  - Dalio: advisors willen risicodashboards — `OrgPolicyDefaults` voor
 *    org-brede risk-thresholds.
 *  - Lynch: rapporten begrijpelijk — `ReportSpec` heeft expliciete
 *    sections + disclaimer-blok.
 *  - Simons: data + signalen schaalbaar — feature-flags per scope, geen
 *    monolithische "advisor mode aan/uit".
 *  - Wood: platformisering — multi-tenant boundary (`OrgScope`) is
 *    expliciet zodat data-leakage tussen tenants onmogelijk is.
 */

import type { ISODateString } from "@/types/common";

/**
 * Rollen binnen een organisatie. **Nooit hernoemen** — deze keys
 * landen in audit-logs en (toekomstige) DB-rijen.
 */
export type OrgRole =
  /** Eigenaar/beheerder van de organisatie. Kan billing, members en
   *  white-label-config wijzigen. */
  | "OWNER"
  /** Beheerder; kan members en advisor-toegang regelen, maar geen billing. */
  | "ADMIN"
  /** Advisor; kan client-portefeuilles inzien, rapportages genereren,
   *  geen members beheren. */
  | "ADVISOR"
  /** Read-only; kan rapporten zien maar niet genereren of wijzigen. */
  | "VIEWER"
  /** Cliënt; eigenaar van de eigen portefeuille die door een advisor
   *  beheerd wordt. Heeft normale individuele rechten op eigen data. */
  | "CLIENT";

export const ORG_ROLE_ORDER: ReadonlyArray<OrgRole> = [
  "OWNER",
  "ADMIN",
  "ADVISOR",
  "VIEWER",
  "CLIENT",
];

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  OWNER: "Eigenaar",
  ADMIN: "Beheerder",
  ADVISOR: "Adviseur",
  VIEWER: "Lezer",
  CLIENT: "Cliënt",
};

/**
 * Permission-keys — fijnmazig genoeg om beslissingen op uit te lezen
 * zonder een volledige RBAC-engine te bouwen.
 */
export type OrgPermission =
  | "org.manage" // members + settings
  | "org.billing"
  | "org.white_label"
  | "client.list" // welke cliënten zie ik?
  | "client.read" // detail-data van cliënt
  | "client.write" // wijzigingen op cliënt-portefeuille
  | "report.generate" // PDF/Excel exports starten
  | "report.read" // bestaande rapporten openen
  | "audit.read"; // audit-log inzien

/**
 * Organisatie-record. Wordt in v1 niet gepersisteerd in DB; gebruikt
 * voor type-grenzen + service-laag. Migratie-pad in
 * `docs/ADVISOR_ENTERPRISE_FOUNDATION.md`.
 */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  /** ISO-2 (bv. NL, BE, DE). Beïnvloedt disclaimer-keuze (AFM, FSMA, BaFin). */
  jurisdiction: string;
  createdAt: ISODateString;
  /** ID van de OWNER-user (initiele aanmaker). */
  ownerUserId: string;
  /** White-label config — null = default BeleggerIQ branding. */
  whiteLabel: WhiteLabelConfig | null;
  /** Feature-flag overrides per org. */
  featureFlags: Partial<Record<EnterpriseFeatureFlag, boolean>>;
}

/**
 * Membership: een gebruiker met een rol binnen één organisatie.
 * Een user kan meerdere memberships hebben (bv. ADVISOR in firma X +
 * CLIENT in eigen org).
 */
export interface OrgMembership {
  organizationId: string;
  userId: string;
  role: OrgRole;
  /** Sinds wanneer? Voor audit + billing-proration. */
  joinedAt: ISODateString;
  /** Optioneel: scope-restrictie binnen org (bv. alleen cliënten in regio NL). */
  clientScope?: ClientScopeFilter;
}

/**
 * Sub-laag waarmee we kunnen beperken welke cliënten een ADVISOR mag
 * zien. v1: alleen "alle cliënten van de org". v2 voegt regio/segment-
 * filters toe.
 */
export interface ClientScopeFilter {
  /** Wanneer leeg → alle cliënten van de org. Anders specifieke userIds. */
  allowedClientUserIds?: ReadonlyArray<string>;
}

/**
 * White-label branding-config. Gebruikt in PDF-rapporten + (toekomstig)
 * eigen domein-rendering.
 */
export interface WhiteLabelConfig {
  /** Display-naam getoond ipv "BeleggerIQ" (rapporten + UI-headers). */
  brandName: string;
  /** Hex-kleur voor primary actions/headers. */
  primaryColor: string;
  /** URL naar logo-asset (PNG/SVG, bij voorkeur transparante achtergrond). */
  logoUrl: string | null;
  /** Eigen domein (bv. portal.advisorfirm.nl). v2: DNS-flow + cert. */
  customDomain: string | null;
  /** Footer-tekst voor rapporten — typisch firma-naam + KvK + AFM-licentie. */
  footerText: string | null;
  /** Contact-block in rapporten. */
  supportEmail: string | null;
  supportPhone: string | null;
}

export const DEFAULT_WHITE_LABEL: WhiteLabelConfig = {
  brandName: "BeleggerIQ",
  primaryColor: "#22c55e",
  logoUrl: null,
  customDomain: null,
  footerText: null,
  supportEmail: null,
  supportPhone: null,
};

/**
 * Enterprise feature-flags — runtime toggleable per env / per org.
 * **Niet** te verwarren met `entitlements.FeatureKey` (die regelt
 * billing-tier-toegang). Flags hier zijn voor gefaseerde rollout van
 * functionaliteit ongeacht tier.
 */
export type EnterpriseFeatureFlag =
  | "advisor.dashboard" // Advisor multi-client overzicht
  | "advisor.client_switch" // Snel switchen tussen cliënt-views
  | "report.pdf_export" // PDF-rapport-generator
  | "report.excel_export" // Excel-rapport-generator
  | "white_label.custom_domain" // Eigen domein onder white-label
  | "audit.advanced_filters" // Extra filters in audit-log UI
  | "team.invite_flow" // E-mail-invite voor org-members
  | "compliance.afm_disclaimer"; // AFM-conforme disclaimer-set (NL)

export const ENTERPRISE_FLAG_LABELS: Record<EnterpriseFeatureFlag, string> = {
  "advisor.dashboard": "Advisor multi-client dashboard",
  "advisor.client_switch": "Cliënt-switcher in header",
  "report.pdf_export": "PDF-rapportage",
  "report.excel_export": "Excel-export",
  "white_label.custom_domain": "Eigen domein (white-label)",
  "audit.advanced_filters": "Audit-log geavanceerde filters",
  "team.invite_flow": "Team-uitnodigingen",
  "compliance.afm_disclaimer": "AFM-disclaimer-set",
};

/**
 * Default-flag-state. Alles uit; gefaseerd inschakelen via env of org.
 */
export const DEFAULT_ENTERPRISE_FLAGS: Record<EnterpriseFeatureFlag, boolean> = {
  "advisor.dashboard": false,
  "advisor.client_switch": false,
  "report.pdf_export": false,
  "report.excel_export": false,
  "white_label.custom_domain": false,
  "audit.advanced_filters": false,
  "team.invite_flow": false,
  "compliance.afm_disclaimer": false,
};

// ============================================================
//  Compliance disclaimers
// ============================================================

/**
 * Disclaimer-context — bepaalt welke set teksten getoond wordt.
 */
export type DisclaimerContext =
  | "advisor.report" // Advisor-gegenereerde rapportage aan cliënt
  | "advisor.recommendation" // Aanbeveling-blok in rapport
  | "white_label.footer" // Footer onder white-label rapporten
  | "general.investment_data"; // Algemeen disclaimer dat data informatief is

export interface ComplianceDisclaimer {
  context: DisclaimerContext;
  /** ISO-2 jurisdictie-code. Wanneer null, is 'em jurisdictieneutraal. */
  jurisdiction: string | null;
  /** Korte titel boven de tekst. */
  title: string;
  /** De disclaimer-tekst zelf — NL, formele toon. */
  body: string;
  /** Versie-getal — bumpen wanneer juridisch reviewen. */
  version: number;
}

// ============================================================
//  Report spec — voor toekomstige PDF/Excel-export
// ============================================================

export type ReportSection =
  | "summary"
  | "allocation"
  | "performance"
  | "risk"
  | "holdings"
  | "transactions"
  | "tax"
  | "scenario"
  | "appendix";

export interface ReportSpec {
  /** Wie heeft dit rapport opgezet? Voor audit. */
  generatedByUserId: string;
  /** Welke organisatie genereert? null = privé (geen white-label, geen advisor-flow). */
  organizationId: string | null;
  /** Doel-portefeuille. */
  portfolioId: string;
  /** ISO-datum waarop rapport is gegenereerd. */
  asOf: ISODateString;
  /** Welke secties zijn opgenomen — explicit list ipv "alles". */
  sections: ReadonlyArray<ReportSection>;
  /** Disclaimers die mee moeten — automatisch ingevoegd vanuit
   *  disclaimer-catalog op basis van jurisdictie + sections. */
  disclaimers: ReadonlyArray<ComplianceDisclaimer>;
  /** White-label-config of default. */
  whiteLabel: WhiteLabelConfig;
  /** Optionele eigen titel — anders default "Portefeuille-rapportage". */
  title: string;
  /** Optionele advisor-notitie aan cliënt. */
  advisorNote: string | null;
}

/**
 * **Audit-context** — wat we extra meegeven aan `audit.record` wanneer
 * een actie binnen een advisor-flow gebeurt. Sluit aan bij bestaande
 * `AuditInput` in `src/lib/audit/index.ts`.
 */
export interface AdvisorAuditContext {
  organizationId: string;
  /** UserId van de advisor (de uitvoerder). */
  advisorUserId: string;
  /** UserId van de cliënt op wiens data de actie plaatsvindt. */
  onBehalfOfUserId: string | null;
  /** Membership-rol op het moment van de actie — voor compliance. */
  role: OrgRole;
}
