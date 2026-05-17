import { describe, expect, it } from "vitest";

import { recordAdvisorAudit } from "./audit-context";
import { DISCLAIMER_CATALOG } from "./disclaimers";
import { isEnterpriseFlagEnabled } from "./feature-flags";
import { buildReportSpec } from "./report-spec";
import { hasPermission, ROLE_PERMISSIONS } from "./roles";
import {
  DEFAULT_ENTERPRISE_FLAGS,
  DEFAULT_WHITE_LABEL,
  ENTERPRISE_FLAG_LABELS,
  ORG_ROLE_ORDER,
  type EnterpriseFeatureFlag,
  type Organization,
  type OrgPermission,
  type OrgRole,
} from "./types";

/**
 * Module 14 — Advisor/Enterprise foundation spec-conformance.
 *
 * Het Module 14-spec eist 10 voorbereidende deliverables (fundament,
 * geen rewrite). Deze tests bevriezen dat de bouwstenen aanwezig en
 * werkend zijn op type-niveau zonder Prisma-tabellen te raken.
 */

function makeOrg(over: Partial<Organization> = {}): Organization {
  return {
    id: "org-1",
    name: "Adviesbureau X",
    slug: "x",
    jurisdiction: "NL",
    createdAt: "2026-05-10T00:00:00.000Z",
    ownerUserId: "u-1",
    whiteLabel: null,
    featureFlags: {},
    ...over,
  };
}

describe("Module 14 — 10 fundament-deliverables aanwezig", () => {
  it("(1) Organisatieaccounts: Organization-type bestaat met core-velden", () => {
    const o = makeOrg();
    expect(o.id).toBeDefined();
    expect(o.jurisdiction).toBe("NL");
    expect(o.featureFlags).toBeDefined();
  });

  it("(2) Rollen + rechten: ROLE_PERMISSIONS bevat alle 5 OrgRole-keys", () => {
    const allRoles: OrgRole[] = [
      "OWNER",
      "ADMIN",
      "ADVISOR",
      "VIEWER",
      "CLIENT",
    ];
    for (const r of allRoles) {
      expect(ROLE_PERMISSIONS[r]).toBeDefined();
      expect(Array.isArray(ROLE_PERMISSIONS[r])).toBe(true);
    }
  });

  it("(3) Multi-client structuur: OrgMembership ondersteunt scope-restrictie", () => {
    const m: import("./types").OrgMembership = {
      organizationId: "org-1",
      userId: "u-2",
      role: "ADVISOR",
      joinedAt: "2026-05-10T00:00:00.000Z",
      clientScope: { allowedClientUserIds: ["u-3", "u-4"] },
    };
    expect(m.clientScope?.allowedClientUserIds).toHaveLength(2);
  });

  it("(4) Client portfolio overview: ADVISOR-role kan `client.read`", () => {
    expect(hasPermission("ADVISOR", "client.read")).toBe(true);
    expect(hasPermission("ADVISOR", "client.list")).toBe(true);
    // CLIENT mag eigen, niet andermans (geen list-rechten op org-cliënten).
    expect(hasPermission("CLIENT", "client.list")).toBe(false);
  });

  it("(5) Rapportage-export: report.generate + report.read permissions bestaan", () => {
    const reportPerms: OrgPermission[] = ["report.generate", "report.read"];
    for (const p of reportPerms) {
      expect(hasPermission("OWNER", p)).toBe(true);
    }
    expect(hasPermission("VIEWER", "report.read")).toBe(true);
    expect(hasPermission("VIEWER", "report.generate")).toBe(false);
  });

  it("(6) Advisor dashboard: feature-flag `advisor.dashboard` bestaat", () => {
    expect(ENTERPRISE_FLAG_LABELS["advisor.dashboard"]).toBeDefined();
    expect(DEFAULT_ENTERPRISE_FLAGS["advisor.dashboard"]).toBe(false);
  });

  it("(7) Audit logging: recordAdvisorAudit is een functie", () => {
    expect(typeof recordAdvisorAudit).toBe("function");
  });

  it("(8) White-label voorbereiding: DEFAULT_WHITE_LABEL + custom-domain flag", () => {
    expect(DEFAULT_WHITE_LABEL.brandName).toBe("BeleggerIQ");
    expect(DEFAULT_ENTERPRISE_FLAGS["white_label.custom_domain"]).toBe(false);
  });

  it("(9) Teamgebruik: ORG_ROLE_ORDER + team.invite_flow flag", () => {
    expect(ORG_ROLE_ORDER.length).toBeGreaterThanOrEqual(3);
    expect(ENTERPRISE_FLAG_LABELS["team.invite_flow"]).toBeDefined();
  });

  it("(10) Enterprise feature-flags: 4-laags resolver (default → env → org → user)", () => {
    // Geen overrides → default false.
    expect(isEnterpriseFlagEnabled("advisor.dashboard")).toBe(false);

    // Org-override → true.
    expect(
      isEnterpriseFlagEnabled("advisor.dashboard", {
        organization: makeOrg({
          featureFlags: { "advisor.dashboard": true },
        }),
      }),
    ).toBe(true);
  });
});

describe("Module 14 — privacy-boundary (data-leakage prevention)", () => {
  it("CLIENT-rol kan GEEN cliënten-lijst van anderen opvragen", () => {
    // CLIENT mag eigen data lezen (`client.read` met scope-check buiten role),
    // maar geen list-rechten op org-cliënten — voorkomt data-leakage.
    expect(hasPermission("CLIENT", "client.list")).toBe(false);
    expect(hasPermission("CLIENT", "client.write")).toBe(false);
    expect(hasPermission("CLIENT", "report.generate")).toBe(false);
    expect(hasPermission("CLIENT", "audit.read")).toBe(false);
  });

  it("VIEWER kan rapporten lezen maar niet genereren of org beheren", () => {
    expect(hasPermission("VIEWER", "report.read")).toBe(true);
    expect(hasPermission("VIEWER", "report.generate")).toBe(false);
    expect(hasPermission("VIEWER", "org.manage")).toBe(false);
    expect(hasPermission("VIEWER", "org.billing")).toBe(false);
  });

  it("ADVISOR kan GEEN billing of white-label aanpassen", () => {
    expect(hasPermission("ADVISOR", "org.billing")).toBe(false);
    expect(hasPermission("ADVISOR", "org.white_label")).toBe(false);
  });
});

describe("Module 14 — compliance-disclaimers + report-spec", () => {
  it("Disclaimer-catalog dekt minimaal advisor.report + white_label.footer", () => {
    const ctxs = new Set(DISCLAIMER_CATALOG.map((d) => d.context));
    expect(ctxs.has("advisor.report")).toBe(true);
    expect(ctxs.has("white_label.footer")).toBe(true);
  });

  it("buildReportSpec injecteert disclaimers automatisch", () => {
    const spec = buildReportSpec({
      generatedByUserId: "u-1",
      organization: makeOrg(),
      portfolioId: "p-1",
      asOf: "2026-05-10T00:00:00.000Z",
    });
    expect(spec.disclaimers.length).toBeGreaterThan(0);
    expect(spec.disclaimers.some((d) => d.context === "advisor.report")).toBe(
      true,
    );
  });
});

describe("Module 14 — geen rewrite-belofte: enterprise opt-in", () => {
  it("DEFAULT_ENTERPRISE_FLAGS staat alle flags op false", () => {
    for (const key of Object.keys(
      DEFAULT_ENTERPRISE_FLAGS,
    ) as EnterpriseFeatureFlag[]) {
      expect(DEFAULT_ENTERPRISE_FLAGS[key]).toBe(false);
    }
  });

  it("Retail-user zonder org-membership wordt niet beïnvloed (geen flag actief)", () => {
    expect(isEnterpriseFlagEnabled("advisor.dashboard")).toBe(false);
    expect(isEnterpriseFlagEnabled("report.pdf_export")).toBe(false);
    expect(isEnterpriseFlagEnabled("team.invite_flow")).toBe(false);
  });
});
