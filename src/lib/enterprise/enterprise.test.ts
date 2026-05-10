import { describe, expect, it } from "vitest";

import { selectDisclaimers, renderDisclaimerBlock, DISCLAIMER_CATALOG } from "./disclaimers";
import {
  envKeyForFlag,
  isEnterpriseFlagEnabled,
  parseUserFlagOverrides,
  resolveAllFlags,
} from "./feature-flags";
import { buildReportSpec } from "./report-spec";
import {
  ROLE_PERMISSIONS,
  can,
  canManageRole,
  hasPermission,
  rolesWithPermission,
} from "./roles";
import {
  DEFAULT_ENTERPRISE_FLAGS,
  DEFAULT_WHITE_LABEL,
  ORG_ROLE_ORDER,
  type Organization,
} from "./types";

// ============================================================
//  Roles + permissions
// ============================================================

describe("ROLE_PERMISSIONS — matrix", () => {
  it("dekt alle 5 rollen", () => {
    for (const role of ORG_ROLE_ORDER) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
    }
  });

  it("OWNER heeft strikt alle privileges van ADMIN", () => {
    for (const p of ROLE_PERMISSIONS.ADMIN) {
      expect(ROLE_PERMISSIONS.OWNER).toContain(p);
    }
  });

  it("CLIENT mag NIETS van org of audit", () => {
    expect(hasPermission("CLIENT", "org.manage")).toBe(false);
    expect(hasPermission("CLIENT", "org.billing")).toBe(false);
    expect(hasPermission("CLIENT", "audit.read")).toBe(false);
    expect(hasPermission("CLIENT", "client.list")).toBe(false);
  });

  it("VIEWER mag lezen, niet schrijven", () => {
    expect(hasPermission("VIEWER", "client.read")).toBe(true);
    expect(hasPermission("VIEWER", "client.write")).toBe(false);
    expect(hasPermission("VIEWER", "report.generate")).toBe(false);
  });

  it("ADVISOR kan rapporten genereren maar geen org-config wijzigen", () => {
    expect(can.generateReports("ADVISOR")).toBe(true);
    expect(can.manageClients("ADVISOR")).toBe(true);
    expect(can.configureWhiteLabel("ADVISOR")).toBe(false);
    expect(can.manageOrg("ADVISOR")).toBe(false);
  });

  it("ADMIN kan org configureren maar geen billing wijzigen", () => {
    expect(can.manageOrg("ADMIN")).toBe(true);
    expect(can.configureWhiteLabel("ADMIN")).toBe(true);
    expect(hasPermission("ADMIN", "org.billing")).toBe(false);
  });

  it("rolesWithPermission is consistent met de matrix", () => {
    const roles = rolesWithPermission("audit.read");
    expect(roles).toContain("OWNER");
    expect(roles).toContain("ADMIN");
    expect(roles).not.toContain("ADVISOR");
    expect(roles).not.toContain("CLIENT");
  });
});

describe("canManageRole", () => {
  it("OWNER kan ADMIN/ADVISOR/VIEWER managen, geen andere OWNER", () => {
    expect(canManageRole("OWNER", "ADMIN")).toBe(true);
    expect(canManageRole("OWNER", "ADVISOR")).toBe(true);
    expect(canManageRole("OWNER", "VIEWER")).toBe(true);
    expect(canManageRole("OWNER", "OWNER")).toBe(false);
  });

  it("ADMIN kan ADVISOR/VIEWER managen, geen OWNER of andere ADMIN", () => {
    expect(canManageRole("ADMIN", "ADVISOR")).toBe(true);
    expect(canManageRole("ADMIN", "VIEWER")).toBe(true);
    expect(canManageRole("ADMIN", "ADMIN")).toBe(false);
    expect(canManageRole("ADMIN", "OWNER")).toBe(false);
  });

  it("ADVISOR/VIEWER/CLIENT kunnen niemand managen", () => {
    for (const r of ["ADVISOR", "VIEWER", "CLIENT"] as const) {
      for (const t of ORG_ROLE_ORDER) {
        expect(canManageRole(r, t)).toBe(false);
      }
    }
  });
});

// ============================================================
//  Feature flags
// ============================================================

describe("isEnterpriseFlagEnabled", () => {
  it("default = uit voor alles", () => {
    for (const flag of Object.keys(DEFAULT_ENTERPRISE_FLAGS) as Array<
      keyof typeof DEFAULT_ENTERPRISE_FLAGS
    >) {
      expect(isEnterpriseFlagEnabled(flag, { env: {} })).toBe(false);
    }
  });

  it("env override true → flag aan", () => {
    expect(
      isEnterpriseFlagEnabled("advisor.dashboard", {
        env: { ENTERPRISE_FLAGS_ADVISOR_DASHBOARD: "true" },
      }),
    ).toBe(true);
  });

  it("env override false overschrijft default", () => {
    expect(
      isEnterpriseFlagEnabled("advisor.dashboard", {
        env: { ENTERPRISE_FLAGS_ADVISOR_DASHBOARD: "false" },
      }),
    ).toBe(false);
  });

  it("org-override overschrijft env", () => {
    const result = isEnterpriseFlagEnabled("advisor.dashboard", {
      env: { ENTERPRISE_FLAGS_ADVISOR_DASHBOARD: "false" },
      organization: {
        featureFlags: { "advisor.dashboard": true },
      } as Pick<Organization, "featureFlags">,
    });
    expect(result).toBe(true);
  });

  it("user-override heeft hoogste prioriteit", () => {
    const result = isEnterpriseFlagEnabled("advisor.dashboard", {
      env: { ENTERPRISE_FLAGS_ADVISOR_DASHBOARD: "true" },
      organization: {
        featureFlags: { "advisor.dashboard": true },
      } as Pick<Organization, "featureFlags">,
      userOverrides: { "advisor.dashboard": false },
    });
    expect(result).toBe(false);
  });

  it("envKeyForFlag converteert naar SCREAMING_SNAKE", () => {
    expect(envKeyForFlag("advisor.dashboard")).toBe(
      "ENTERPRISE_FLAGS_ADVISOR_DASHBOARD",
    );
    expect(envKeyForFlag("white_label.custom_domain")).toBe(
      "ENTERPRISE_FLAGS_WHITE_LABEL_CUSTOM_DOMAIN",
    );
  });
});

describe("parseUserFlagOverrides", () => {
  it("droppt onbekende keys", () => {
    const out = parseUserFlagOverrides({
      "advisor.dashboard": true,
      "not_a_flag": true,
    });
    expect(out["advisor.dashboard"]).toBe(true);
    expect(Object.keys(out)).toHaveLength(1);
  });

  it("droppt non-boolean waardes", () => {
    const out = parseUserFlagOverrides({
      "advisor.dashboard": "yes",
      "report.pdf_export": 1,
      "report.excel_export": false,
    });
    expect(out["advisor.dashboard"]).toBeUndefined();
    expect(out["report.pdf_export"]).toBeUndefined();
    expect(out["report.excel_export"]).toBe(false);
  });

  it("tolereert null/undefined/array", () => {
    expect(parseUserFlagOverrides(null)).toEqual({});
    expect(parseUserFlagOverrides([])).toEqual({});
    expect(parseUserFlagOverrides(undefined)).toEqual({});
  });
});

describe("resolveAllFlags", () => {
  it("levert alle keys met booleans", () => {
    const flags = resolveAllFlags({ env: {} });
    for (const key of Object.keys(DEFAULT_ENTERPRISE_FLAGS)) {
      expect(typeof flags[key as keyof typeof flags]).toBe("boolean");
    }
  });
});

// ============================================================
//  Disclaimers
// ============================================================

describe("selectDisclaimers", () => {
  it("levert algemene + jurisdictie-neutrale teksten standaard", () => {
    const out = selectDisclaimers({
      contexts: ["general.investment_data"],
      jurisdiction: null,
    });
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out.every((d) => d.context === "general.investment_data")).toBe(true);
  });

  it("filtert jurisdictie-specifieke teksten correct", () => {
    const nl = selectDisclaimers({
      contexts: ["advisor.report"],
      jurisdiction: "NL",
    });
    expect(nl.find((d) => d.jurisdiction === "NL")).toBeDefined();

    const be = selectDisclaimers({
      contexts: ["advisor.report"],
      jurisdiction: "BE",
    });
    expect(be.find((d) => d.jurisdiction === "NL")).toBeUndefined();
  });

  it("alle catalog-entries hebben non-empty body + version >= 1", () => {
    for (const d of DISCLAIMER_CATALOG) {
      expect(d.body.length).toBeGreaterThan(20);
      expect(d.version).toBeGreaterThanOrEqual(1);
    }
  });

  it("renderDisclaimerBlock produceert plat-tekst-blok", () => {
    const block = renderDisclaimerBlock([
      DISCLAIMER_CATALOG[0]!,
    ]);
    expect(block).toContain(DISCLAIMER_CATALOG[0]!.title);
    expect(block).toContain(DISCLAIMER_CATALOG[0]!.body);
    expect(block).toContain("---");
  });
});

// ============================================================
//  Report-spec
// ============================================================

describe("buildReportSpec", () => {
  it("zonder organisatie → default white-label, alleen general-disclaimer", () => {
    const spec = buildReportSpec({
      generatedByUserId: "u1",
      portfolioId: "p1",
    });
    expect(spec.organizationId).toBeNull();
    expect(spec.whiteLabel).toEqual(DEFAULT_WHITE_LABEL);
    expect(spec.disclaimers.every((d) => d.context === "general.investment_data")).toBe(true);
  });

  it("met organisatie → advisor + white-label disclaimers worden bijgevoegd", () => {
    const org: Pick<Organization, "id" | "jurisdiction" | "whiteLabel"> = {
      id: "org1",
      jurisdiction: "NL",
      whiteLabel: { ...DEFAULT_WHITE_LABEL, brandName: "AdvisorFirm" },
    };
    const spec = buildReportSpec({
      generatedByUserId: "u1",
      portfolioId: "p1",
      organization: org,
    });
    expect(spec.organizationId).toBe("org1");
    expect(spec.whiteLabel.brandName).toBe("AdvisorFirm");
    const contexts = spec.disclaimers.map((d) => d.context);
    expect(contexts).toContain("general.investment_data");
    expect(contexts).toContain("advisor.report");
    expect(contexts).toContain("white_label.footer");
  });

  it("NL-jurisdictie → AFM-disclaimer komt mee in advisor.report-context", () => {
    const spec = buildReportSpec({
      generatedByUserId: "u1",
      portfolioId: "p1",
      organization: {
        id: "org1",
        jurisdiction: "NL",
        whiteLabel: null,
      },
    });
    const afm = spec.disclaimers.find(
      (d) => d.jurisdiction === "NL" && d.context === "advisor.report",
    );
    expect(afm).toBeDefined();
  });

  it("scenario-section → recommendation-disclaimer wordt bijgevoegd", () => {
    const spec = buildReportSpec({
      generatedByUserId: "u1",
      portfolioId: "p1",
      sections: ["summary", "scenario"],
      organization: { id: "org1", jurisdiction: "NL", whiteLabel: null },
    });
    expect(
      spec.disclaimers.some((d) => d.context === "advisor.recommendation"),
    ).toBe(true);
  });

  it("default sections wanneer geen meegegeven", () => {
    const spec = buildReportSpec({
      generatedByUserId: "u1",
      portfolioId: "p1",
    });
    expect(spec.sections.length).toBeGreaterThan(0);
    expect(spec.sections).toContain("summary");
    expect(spec.sections).toContain("risk");
  });
});
