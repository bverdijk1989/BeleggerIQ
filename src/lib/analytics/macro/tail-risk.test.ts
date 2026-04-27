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

describe("BLACK_SWAN scenario — Taleb tail-risk", () => {
  it("draait als 6e scenario in de batch", () => {
    const r = runMacroScenarios({
      positions: [pos("ASML", "Technology", 50_000)],
      totalValue: 50_000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const ids = r.scenarios.map((s) => s.scenario);
    expect(ids).toContain("BLACK_SWAN");
  });

  it("brede portefeuille verliest > 40% in black-swan", () => {
    const r = runMacroScenarios({
      positions: [
        pos("MSFT", "Technology", 30_000),
        pos("UL", "Consumer Staples", 30_000),
        pos("PFE", "Healthcare", 30_000),
      ],
      totalValue: 90_000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const swan = r.scenarios.find((s) => s.scenario === "BLACK_SWAN")!;
    expect(swan.portfolioImpact).toBeLessThan(-0.40);
  });

  it("defensieve portefeuille verliest minimaal 35% (correlatie-spike, niet 'safe')", () => {
    const r = runMacroScenarios({
      positions: [
        pos("UL", "Consumer Staples", 50_000),
        pos("DUK", "Utilities", 50_000),
      ],
      totalValue: 100_000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const swan = r.scenarios.find((s) => s.scenario === "BLACK_SWAN")!;
    // Defensief krijgt klap, maar minder dan all-tech. Voorkomt
    // schijnveiligheid.
    expect(swan.portfolioImpact).toBeLessThan(-0.35);
    expect(swan.portfolioImpact).toBeGreaterThan(-0.45);
  });

  it("tech-zwaar portfolio verliest meer dan defensief portfolio (relatieve buffer blijft)", () => {
    const tech = runMacroScenarios({
      positions: [pos("ASML", "Technology", 100_000)],
      totalValue: 100_000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const defensief = runMacroScenarios({
      positions: [pos("UL", "Consumer Staples", 100_000)],
      totalValue: 100_000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const techImpact = tech.scenarios.find((s) => s.scenario === "BLACK_SWAN")!
      .portfolioImpact;
    const defImpact = defensief.scenarios.find(
      (s) => s.scenario === "BLACK_SWAN",
    )!.portfolioImpact;
    expect(defImpact).toBeGreaterThan(techImpact);
  });

  it("description verwijst naar Taleb / correlation-spike", () => {
    const r = runMacroScenarios({
      positions: [pos("X", "Technology", 10_000)],
      totalValue: 10_000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const swan = r.scenarios.find((s) => s.scenario === "BLACK_SWAN")!;
    expect(swan.label.toLowerCase()).toContain("black swan");
    expect(swan.description.toLowerCase()).toMatch(/correla|tail|taleb/);
  });
});

describe("TOP_POSITION_BLOWUP scenario — single-name implosie", () => {
  it("draait als 7e scenario in de batch", () => {
    const r = runMacroScenarios({
      positions: [pos("ASML", "Technology", 30_000)],
      totalValue: 30_000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const ids = r.scenarios.map((s) => s.scenario);
    expect(ids).toContain("TOP_POSITION_BLOWUP");
  });

  it("portefeuille met 1 zware positie (60%) verliest ~42% (60% × -70%)", () => {
    const r = runMacroScenarios({
      positions: [
        pos("RHM", "Industrials", 60_000),
        pos("ASML", "Technology", 25_000),
        pos("MSFT", "Technology", 15_000),
      ],
      totalValue: 100_000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const blowup = r.scenarios.find(
      (s) => s.scenario === "TOP_POSITION_BLOWUP",
    )!;
    expect(blowup.portfolioImpact).toBeCloseTo(-0.42, 2);
  });

  it("alleen de grootste positie krijgt -70%; rest blijft 0", () => {
    const r = runMacroScenarios({
      positions: [
        pos("BIG", "Industrials", 50_000),
        pos("MID", "Technology", 30_000),
        pos("SMALL", "Healthcare", 20_000),
      ],
      totalValue: 100_000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const blowup = r.scenarios.find(
      (s) => s.scenario === "TOP_POSITION_BLOWUP",
    )!;
    const losers = blowup.biggestLosers;
    expect(losers.length).toBe(1);
    expect(losers[0]?.ticker).toBe("BIG");
    expect(losers[0]?.shock).toBe(-0.70);
  });

  it("goed-gediversificeerde portefeuille (geen positie boven 10%) → ~7% impact", () => {
    const positions = Array.from({ length: 12 }).map((_, i) =>
      pos(`T${i}`, "Technology", 10_000),
    );
    const r = runMacroScenarios({
      positions,
      totalValue: 120_000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const blowup = r.scenarios.find(
      (s) => s.scenario === "TOP_POSITION_BLOWUP",
    )!;
    // Eén positie 1/12 ≈ 8.3% × -70% ≈ -5.8%
    expect(blowup.portfolioImpact).toBeGreaterThan(-0.07);
    expect(blowup.portfolioImpact).toBeLessThan(-0.05);
  });

  it("description verwijst naar Enron/Wirecard-stijl", () => {
    const r = runMacroScenarios({
      positions: [pos("X", "Technology", 10_000)],
      totalValue: 10_000,
      baseCurrency: "EUR",
      now: NOW,
    });
    const blowup = r.scenarios.find(
      (s) => s.scenario === "TOP_POSITION_BLOWUP",
    )!;
    expect(blowup.description.toLowerCase()).toMatch(/enron|wirecard|fraude|implosie/);
  });
});
