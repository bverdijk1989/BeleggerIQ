import { describe, expect, it } from "vitest";

import type { Holding } from "@/types/portfolio";

import { runMacroScenarios, type MacroPositionInput } from "./scenarios";

const NOW = "2026-04-27T00:00:00.000Z";

function holding(
  ticker: string,
  sector: string,
  assetClass: Holding["assetClass"] = "EQUITY",
): Holding {
  return {
    id: `h-${ticker}`,
    portfolioId: "p1",
    ticker,
    name: ticker,
    assetClass,
    currency: "EUR",
    quantity: 10,
    avgCostPrice: 100,
    sector,
  };
}

function pos(ticker: string, sector: string, value: number): MacroPositionInput {
  return { holding: holding(ticker, sector), marketValueBase: value };
}

describe("STAGFLATION scenario — macro-validatie", () => {
  it("draait als 5e scenario in de batch", () => {
    const r = runMacroScenarios({
      positions: [pos("ASML", "Technology", 50_000)],
      totalValue: 50_000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const ids = r.scenarios.map((s) => s.scenario);
    expect(ids).toContain("STAGFLATION");
  });

  it("growth/tech-portefeuille verliest fors in stagflatie", () => {
    const r = runMacroScenarios({
      positions: [pos("ASML", "Technology", 50_000)],
      totalValue: 50_000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const stag = r.scenarios.find((s) => s.scenario === "STAGFLATION")!;
    expect(stag.portfolioImpact).toBeLessThan(-0.15);
  });

  it("energie-zwaar portfolio profiteert juist (positieve impact)", () => {
    const r = runMacroScenarios({
      positions: [pos("SHEL", "Energy", 30_000)],
      totalValue: 30_000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const stag = r.scenarios.find((s) => s.scenario === "STAGFLATION")!;
    expect(stag.portfolioImpact).toBeGreaterThan(0);
  });

  it("staples-portefeuille verliest minder dan tech (defensief in stagflatie)", () => {
    const tech = runMacroScenarios({
      positions: [pos("MSFT", "Technology", 30_000)],
      totalValue: 30_000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const staples = runMacroScenarios({
      positions: [pos("UL", "Consumer Staples", 30_000)],
      totalValue: 30_000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const techImpact = tech.scenarios.find((s) => s.scenario === "STAGFLATION")!
      .portfolioImpact;
    const staplesImpact = staples.scenarios.find(
      (s) => s.scenario === "STAGFLATION",
    )!.portfolioImpact;
    expect(staplesImpact).toBeGreaterThan(techImpact);
  });

  it("verdict + label zijn NL en specifiek voor stagflatie", () => {
    const r = runMacroScenarios({
      positions: [pos("ASML", "Technology", 30_000)],
      totalValue: 30_000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const stag = r.scenarios.find((s) => s.scenario === "STAGFLATION")!;
    expect(stag.label).toBe("Stagflatie");
    expect(stag.description.toLowerCase()).toContain("inflatie");
  });
});
