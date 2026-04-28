import { describe, expect, it } from "vitest";

import {
  buildSwitchHref,
  resolveSelection,
  type PortfolioStub,
} from "./selector";

const portfolios: PortfolioStub[] = [
  { id: "p1", name: "Hoofd", isPrimary: true },
  { id: "p2", name: "Kinderen", isPrimary: false },
  { id: "p3", name: "Pensioen", isPrimary: false },
];

describe("resolveSelection", () => {
  it("geen portefeuilles → kind=empty", () => {
    expect(resolveSelection({ available: [] })).toEqual({ kind: "empty" });
  });

  it("zonder URL/cookie → primary fallback (single user, geen URL-noise)", () => {
    const r = resolveSelection({ available: portfolios });
    expect(r).toEqual({
      kind: "single",
      portfolioId: "p1",
      source: "primary",
      isExplicit: false,
    });
  });

  it("URL=p2 → single-p2 (URL wint van cookie)", () => {
    const r = resolveSelection({
      available: portfolios,
      urlParam: "p2",
      cookieValue: "p3",
    });
    expect(r).toEqual({
      kind: "single",
      portfolioId: "p2",
      source: "url",
      isExplicit: true,
    });
  });

  it("URL=all → kind=all", () => {
    expect(
      resolveSelection({ available: portfolios, urlParam: "all" }),
    ).toEqual({ kind: "all", source: "url" });
  });

  it("URL=onbekend → val terug op primary (niet crashen)", () => {
    const r = resolveSelection({
      available: portfolios,
      urlParam: "p999-other-user",
    });
    expect(r).toEqual({
      kind: "single",
      portfolioId: "p1",
      source: "primary",
      isExplicit: false,
    });
  });

  it("alleen cookie → cookie-source", () => {
    const r = resolveSelection({
      available: portfolios,
      cookieValue: "p3",
    });
    expect(r).toEqual({
      kind: "single",
      portfolioId: "p3",
      source: "cookie",
      isExplicit: true,
    });
  });

  it("cookie met onbekende id → primary fallback", () => {
    const r = resolveSelection({
      available: portfolios,
      cookieValue: "stale-other-user-id",
    });
    expect(r).toEqual({
      kind: "single",
      portfolioId: "p1",
      source: "primary",
      isExplicit: false,
    });
  });

  it("URL=' p2 ' (whitespace) → genormaliseerd", () => {
    const r = resolveSelection({
      available: portfolios,
      urlParam: "  p2  ",
    });
    expect(r.kind).toBe("single");
    if (r.kind === "single") expect(r.portfolioId).toBe("p2");
  });

  it("geen primary aanwezig → eerste in lijst (geen crash)", () => {
    const r = resolveSelection({
      available: [
        { id: "x", name: "A", isPrimary: false },
        { id: "y", name: "B", isPrimary: false },
      ],
    });
    expect(r.kind).toBe("single");
    if (r.kind === "single") expect(r.portfolioId).toBe("x");
  });
});

describe("buildSwitchHref", () => {
  it("voegt p toe wanneer geen searchParams aanwezig zijn", () => {
    expect(buildSwitchHref("/dashboard", "", "p2")).toBe("/dashboard?p=p2");
  });

  it("behoudt bestaande searchParams (bv. year-filter)", () => {
    expect(
      buildSwitchHref("/transacties", "year=2025&type=BUY", "p3"),
    ).toBe("/transacties?year=2025&type=BUY&p=p3");
  });

  it("overschrijft bestaande p-param i.p.v. dupliceren", () => {
    const out = buildSwitchHref("/dashboard", "p=p1&year=2025", "p2");
    const params = new URLSearchParams(out.split("?")[1]);
    expect(params.getAll("p")).toEqual(["p2"]);
  });

  it("?p=all is geldig", () => {
    expect(buildSwitchHref("/dashboard", "", "all")).toBe("/dashboard?p=all");
  });
});
