import { describe, expect, it } from "vitest";

import { deriveIndicators } from "./position-indicators";

describe("deriveIndicators", () => {
  it("US-aandeel → us-dividend tag", () => {
    const r = deriveIndicators({
      ticker: "AAPL",
      isin: "US0378331005",
      assetClass: "EQUITY",
    });
    expect(r.tags).toContain("us-dividend");
  });

  it("REIT op assetClass → reit-warning", () => {
    const r = deriveIndicators({
      ticker: "O",
      isin: "US7561091049",
      assetClass: "REIT",
    });
    expect(r.tags).toContain("reit-warning");
    expect(r.tags).toContain("us-dividend");
  });

  it("naam bevat 'Real Estate' → reit-warning", () => {
    const r = deriveIndicators({
      ticker: "VNQ",
      isin: "US9229085538",
      assetClass: "ETF",
      name: "Vanguard Real Estate ETF",
    });
    expect(r.tags).toContain("reit-warning");
  });

  it("ACCUMULATING ETF policy → accumulating-etf + no-direct-cashflow", () => {
    const r = deriveIndicators({
      ticker: "VWCE",
      isin: "IE00BK5BQT80",
      assetClass: "ETF",
      distributionPolicy: "ACCUMULATING",
      name: "Vanguard FTSE All-World UCITS ETF",
    });
    expect(r.tags).toContain("accumulating-etf");
    expect(r.tags).toContain("no-direct-cashflow");
  });

  it("DISTRIBUTING ETF policy → géén accumulating-etf", () => {
    const r = deriveIndicators({
      ticker: "VWRL",
      isin: "IE00B3RBWM25",
      assetClass: "ETF",
      distributionPolicy: "DISTRIBUTING",
    });
    expect(r.tags).not.toContain("accumulating-etf");
  });

  it("ETF zonder policy maar naam bevat '(Acc)' → fallback naar accumulating", () => {
    const r = deriveIndicators({
      ticker: "VWCE",
      isin: "IE00BK5BQT80",
      assetClass: "ETF",
      name: "Vanguard FTSE All-World UCITS ETF (Acc)",
    });
    expect(r.tags).toContain("accumulating-etf");
  });

  it("EU-aandeel zonder REIT/ETF-context → geen tags", () => {
    const r = deriveIndicators({
      ticker: "ASML.AS",
      isin: "NL0010273215",
      assetClass: "EQUITY",
      name: "ASML Holding",
    });
    expect(r.tags).toEqual([]);
  });
});
