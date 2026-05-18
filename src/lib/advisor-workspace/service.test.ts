import { describe, expect, it } from "vitest";

import {
  clientEmailHash,
  clientIdFromEmail,
  resolveClientIdInWorkspace,
  workspaceHeaderStats,
} from "./service";
import type { AdvisorWorkspace } from "./types";

/**
 * Module 24 — service-laag tests (pure helpers).
 *
 * Voor de async loaders gebruiken we runtime-integratie via e2e; deze
 * file dekt de pure-function helpers (hashing + resolve + stats).
 */

describe("clientIdFromEmail — deterministische hash", () => {
  it("returnt 12-char hex en is case-insensitive", () => {
    const a = clientIdFromEmail("Client@Example.com");
    const b = clientIdFromEmail("client@example.com");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
  });

  it("verschillende e-mails → verschillende ids", () => {
    expect(clientIdFromEmail("a@x.com")).not.toBe(clientIdFromEmail("b@x.com"));
  });

  it("trimt whitespace", () => {
    expect(clientIdFromEmail("  a@x.com  ")).toBe(clientIdFromEmail("a@x.com"));
  });
});

describe("clientEmailHash — full sha256 voor audit", () => {
  it("returnt 64-char hex", () => {
    expect(clientEmailHash("a@x.com")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("hash bevat geen onderdeel van raw e-mail", () => {
    const h = clientEmailHash("bart@example.com");
    expect(h).not.toContain("bart");
    expect(h).not.toContain("example");
  });
});

describe("resolveClientIdInWorkspace — boundary-resolve", () => {
  const ENV = "advisor@firm.com:c1@a.com,c2@b.com;advisor2@firm.com:c3@x.com";

  it("matcht een geldige clientId voor de juiste advisor", () => {
    const c1Id = clientIdFromEmail("c1@a.com");
    const r = resolveClientIdInWorkspace({
      advisorEmail: "advisor@firm.com",
      clientId: c1Id,
      envValue: ENV,
    });
    expect(r.clientEmail).toBe("c1@a.com");
  });

  it("geeft null wanneer clientId van een ANDERE advisor's cliënt is", () => {
    // c3 hoort bij advisor2 — advisor@firm.com mag 'em niet resolven.
    const c3Id = clientIdFromEmail("c3@x.com");
    const r = resolveClientIdInWorkspace({
      advisorEmail: "advisor@firm.com",
      clientId: c3Id,
      envValue: ENV,
    });
    expect(r.clientEmail).toBeNull();
  });

  it("geeft null voor verzonnen clientId-hash", () => {
    const r = resolveClientIdInWorkspace({
      advisorEmail: "advisor@firm.com",
      clientId: "deadbeef1234",
      envValue: ENV,
    });
    expect(r.clientEmail).toBeNull();
  });

  it("geeft null voor onbekende advisor", () => {
    const r = resolveClientIdInWorkspace({
      advisorEmail: "random@user.com",
      clientId: clientIdFromEmail("c1@a.com"),
      envValue: ENV,
    });
    expect(r.clientEmail).toBeNull();
  });
});

describe("workspaceHeaderStats", () => {
  it("aggregeert counts over alle cliënten", () => {
    const workspace: AdvisorWorkspace = {
      advisorEmail: "a@x.com",
      source: "env_allowlist",
      missingClientCount: 1,
      clients: [
        {
          maskedEmail: "c1***@a.com",
          clientId: "11",
          tier: "PRO",
          portfolioCount: 2,
          positionCount: 12,
          lastActivityAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          maskedEmail: "c2***@b.com",
          clientId: "22",
          tier: "FREE",
          portfolioCount: 1,
          positionCount: 3,
          lastActivityAt: null,
          createdAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    };
    const s = workspaceHeaderStats(workspace);
    expect(s.totalClients).toBe(2);
    expect(s.totalPortfolios).toBe(3);
    expect(s.totalPositions).toBe(15);
    expect(s.missingLinks).toBe(1);
  });

  it("lege workspace → alles 0", () => {
    const s = workspaceHeaderStats({
      advisorEmail: "a@x.com",
      source: "none",
      missingClientCount: 0,
      clients: [],
    });
    expect(s.totalClients).toBe(0);
    expect(s.totalPortfolios).toBe(0);
    expect(s.totalPositions).toBe(0);
  });
});
