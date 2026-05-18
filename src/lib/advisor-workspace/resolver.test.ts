import { describe, expect, it } from "vitest";

import {
  checkClientAccess,
  getWorkspaceLinksForAdvisor,
  isWorkspaceAdvisor,
  parseWorkspaceLinks,
} from "./resolver";

/**
 * Module 24 — Advisor Pilot Workspace resolver tests.
 *
 * Pure-function tests — geen DB, geen mocks. Focus op privacy-boundary.
 */

const ENV = "advisor@firm.com:c1@a.com,c2@b.com;advisor2@firm.com:c3@x.com";

describe("parseWorkspaceLinks — env-parser", () => {
  it("lege env → lege array", () => {
    expect(parseWorkspaceLinks(undefined)).toEqual([]);
    expect(parseWorkspaceLinks("")).toEqual([]);
    expect(parseWorkspaceLinks("   ")).toEqual([]);
  });

  it("normaliseert hoofdletters en whitespace", () => {
    const links = parseWorkspaceLinks(
      "  ADVISOR@FIRM.com : C1@A.com , c2@b.com  ",
    );
    expect(links).toHaveLength(1);
    expect(links[0]!.advisorEmail).toBe("advisor@firm.com");
    expect(links[0]!.clientEmails).toEqual(["c1@a.com", "c2@b.com"]);
  });

  it("dedupliceert cliënt-e-mails binnen een link", () => {
    const links = parseWorkspaceLinks(
      "a@x.com:c1@y.com,C1@y.com,c1@y.com",
    );
    expect(links[0]!.clientEmails).toEqual(["c1@y.com"]);
  });

  it("merget meerdere segments voor dezelfde advisor", () => {
    const links = parseWorkspaceLinks(
      "a@x.com:c1@y.com;a@x.com:c2@y.com",
    );
    expect(links).toHaveLength(1);
    expect(links[0]!.clientEmails).toEqual(["c1@y.com", "c2@y.com"]);
  });

  it("negeert ongeldige segments (geen `:`, geen `@`)", () => {
    const links = parseWorkspaceLinks(
      "advisor-only;:nothing@x.com;advisor@x.com:;advisor@x.com:client@y.com",
    );
    expect(links).toHaveLength(1);
    expect(links[0]!.clientEmails).toEqual(["client@y.com"]);
  });

  it("ondersteunt meerdere advisors", () => {
    const links = parseWorkspaceLinks(ENV);
    expect(links).toHaveLength(2);
    const advisorEmails = links.map((l) => l.advisorEmail).sort();
    expect(advisorEmails).toEqual(["advisor2@firm.com", "advisor@firm.com"]);
  });
});

describe("getWorkspaceLinksForAdvisor", () => {
  it("returnt link wanneer advisor in allowlist staat", () => {
    const link = getWorkspaceLinksForAdvisor("advisor@firm.com", ENV);
    expect(link).not.toBeNull();
    expect(link!.clientEmails).toEqual(["c1@a.com", "c2@b.com"]);
  });

  it("returnt null voor onbekende advisor", () => {
    expect(getWorkspaceLinksForAdvisor("random@x.com", ENV)).toBeNull();
  });

  it("returnt null voor lege e-mail", () => {
    expect(getWorkspaceLinksForAdvisor(null, ENV)).toBeNull();
    expect(getWorkspaceLinksForAdvisor("", ENV)).toBeNull();
    expect(getWorkspaceLinksForAdvisor("   ", ENV)).toBeNull();
  });
});

describe("isWorkspaceAdvisor", () => {
  it("true wanneer advisor in allowlist", () => {
    expect(isWorkspaceAdvisor("advisor@firm.com", ENV)).toBe(true);
  });
  it("false zonder env", () => {
    expect(isWorkspaceAdvisor("advisor@firm.com", "")).toBe(false);
    expect(isWorkspaceAdvisor("advisor@firm.com", undefined)).toBe(false);
  });
});

describe("checkClientAccess — privacy-boundary", () => {
  it("ALLOW: advisor + gekoppelde cliënt → ok", () => {
    const d = checkClientAccess("advisor@firm.com", "c1@a.com", ENV);
    expect(d.allowed).toBe(true);
    expect(d.reason).toBe("ok");
  });

  it("DENY: advisor met workspace maar niet-gekoppelde cliënt → not_linked", () => {
    const d = checkClientAccess("advisor@firm.com", "stranger@x.com", ENV);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("not_linked");
  });

  it("DENY: cross-tenant — advisor1 probeert advisor2's cliënt → not_linked", () => {
    const d = checkClientAccess("advisor@firm.com", "c3@x.com", ENV);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("not_linked");
  });

  it("DENY: user die geen advisor is → not_an_advisor", () => {
    const d = checkClientAccess("random@x.com", "c1@a.com", ENV);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("not_an_advisor");
  });

  it("DENY: geen workspace-config geladen → no_workspace_links", () => {
    const d = checkClientAccess("advisor@firm.com", "c1@a.com", "");
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("no_workspace_links");
  });

  it("DENY: lege advisor of client → not_an_advisor", () => {
    expect(checkClientAccess("", "c1@a.com", ENV).allowed).toBe(false);
    expect(checkClientAccess("advisor@firm.com", "", ENV).allowed).toBe(false);
    expect(checkClientAccess(null, null, ENV).allowed).toBe(false);
  });

  it("case-insensitive match — Wegens normalisatie", () => {
    const d = checkClientAccess("ADVISOR@firm.com", "C1@A.com", ENV);
    expect(d.allowed).toBe(true);
  });
});

describe("Module 24 — boundary spec-conformance", () => {
  it("spec eist: advisor ziet ALLEEN gekoppelde clients — cross-link test", () => {
    // Drie advisors, alle in eigen scope. Geen overlap.
    const env =
      "a1@x.com:c1@y.com;a2@x.com:c2@y.com;a3@x.com:c3@y.com,c4@y.com";

    // Elk paar advisor↔andere-cliënt moet falen.
    expect(checkClientAccess("a1@x.com", "c2@y.com", env).allowed).toBe(false);
    expect(checkClientAccess("a1@x.com", "c3@y.com", env).allowed).toBe(false);
    expect(checkClientAccess("a2@x.com", "c1@y.com", env).allowed).toBe(false);
    expect(checkClientAccess("a3@x.com", "c1@y.com", env).allowed).toBe(false);

    // Elk advisor↔eigen-cliënt moet slagen.
    expect(checkClientAccess("a1@x.com", "c1@y.com", env).allowed).toBe(true);
    expect(checkClientAccess("a2@x.com", "c2@y.com", env).allowed).toBe(true);
    expect(checkClientAccess("a3@x.com", "c3@y.com", env).allowed).toBe(true);
    expect(checkClientAccess("a3@x.com", "c4@y.com", env).allowed).toBe(true);
  });

  it("retailgebruiker zonder workspace-config blijft onaangetast", () => {
    // Zonder ADVISOR_WORKSPACE_LINKS-env zou een retail-flow nooit
    // door isWorkspaceAdvisor heen mogen komen.
    expect(isWorkspaceAdvisor("retail@user.com", undefined)).toBe(false);
    expect(isWorkspaceAdvisor("retail@user.com", "")).toBe(false);

    // En zelfs met config zonder hun e-mail → false.
    expect(isWorkspaceAdvisor("retail@user.com", ENV)).toBe(false);
  });
});
