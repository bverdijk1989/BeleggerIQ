import { describe, expect, it } from "vitest";

import { STRESS_SCENARIO_CATALOG, getStressScenario } from "./catalog";
import { buildCustomScenario } from "./custom";
import { runStressTest, type StressPositionInput } from "./engine";
import { STRESS_SCENARIO_ORDER } from "./types";

function makePosition(
  overrides: Partial<StressPositionInput> = {},
): StressPositionInput {
  return {
    ticker: "ASML",
    name: "ASML Holding",
    sector: "Technology",
    marketValueBase: 50_000,
    assetClass: "EQUITY",
    currency: "EUR",
    beta: 1.0,
    ...overrides,
  };
}

describe("STRESS_SCENARIO_CATALOG — integriteit", () => {
  it("levert exact 9 vooraf-gedefinieerde scenarios", () => {
    expect(STRESS_SCENARIO_CATALOG).toHaveLength(9);
  });

  it("ordering klopt met STRESS_SCENARIO_ORDER (excl. CUSTOM)", () => {
    const ids = STRESS_SCENARIO_CATALOG.map((s) => s.id);
    expect(ids).toEqual(STRESS_SCENARIO_ORDER);
  });

  it("alle scenarios hebben non-empty assumptions (Simons-laag)", () => {
    for (const s of STRESS_SCENARIO_CATALOG) {
      expect(s.assumptions.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("alle scenarios hebben sector-shocks voor alle 13 sectoren", () => {
    for (const s of STRESS_SCENARIO_CATALOG) {
      const keys = Object.keys(s.sectorShocks);
      expect(keys.length).toBe(13);
    }
  });

  it("getStressScenario met geldige id → object", () => {
    expect(getStressScenario("RECESSION")).not.toBeNull();
  });

  it("getStressScenario met onbekende id → null", () => {
    expect(getStressScenario("CUSTOM")).toBeNull();
  });
});

describe("runStressTest — basics", () => {
  const recession = getStressScenario("RECESSION")!;

  it("100% tech portfolio in recessie → forse negatieve impact", () => {
    const result = runStressTest({
      scenario: recession,
      positions: [makePosition({ marketValueBase: 100_000 })],
      cashBalance: 0,
      baseCurrency: "EUR",
      totalValue: 100_000,
    });
    expect(result.portfolioImpactPct).toBeLessThan(0);
    expect(result.portfolioImpactAmount).toBeLessThan(0);
    expect(result.defensiveStrength).toBeLessThan(80);
  });

  it("100% cash → 0 impact bij recessie", () => {
    const result = runStressTest({
      scenario: recession,
      positions: [],
      cashBalance: 100_000,
      baseCurrency: "EUR",
      totalValue: 100_000,
    });
    expect(result.portfolioImpactPct).toBe(0);
    expect(result.defensiveStrength).toBe(100);
  });

  it("biggestLosers worden gesorteerd op contribution asc", () => {
    const result = runStressTest({
      scenario: recession,
      positions: [
        makePosition({ ticker: "TECH1", sector: "Technology", marketValueBase: 30_000 }),
        makePosition({ ticker: "STAPLES1", sector: "Consumer Staples", marketValueBase: 30_000 }),
        makePosition({ ticker: "INDUSTRIAL1", sector: "Industrials", marketValueBase: 40_000 }),
      ],
      cashBalance: 0,
      baseCurrency: "EUR",
      totalValue: 100_000,
    });
    // Industrials/discretionary moeten zwaarder geraakt zijn dan staples
    const staples = result.biggestLosers.find((i) => i.ticker === "STAPLES1");
    if (staples) {
      const industrial = result.biggestLosers.find((i) => i.ticker === "INDUSTRIAL1");
      if (industrial) {
        expect(industrial.contribution).toBeLessThan(staples.contribution);
      }
    }
  });
});

describe("runStressTest — sector-specifiek", () => {
  it("TECH_SELLOFF raakt tech harder dan staples", () => {
    const tech = getStressScenario("TECH_SELLOFF")!;
    const result = runStressTest({
      scenario: tech,
      positions: [
        makePosition({ ticker: "TECH", sector: "Technology", marketValueBase: 50_000 }),
        makePosition({ ticker: "STAPLE", sector: "Consumer Staples", marketValueBase: 50_000 }),
      ],
      cashBalance: 0,
      baseCurrency: "EUR",
      totalValue: 100_000,
    });
    const techShock = result.biggestLosers.find((i) => i.ticker === "TECH");
    const stapleShock = result.biggestLosers.find((i) => i.ticker === "STAPLE")
      ?? result.biggestWinners.find((i) => i.ticker === "STAPLE");
    expect(techShock).toBeDefined();
    expect(stapleShock).toBeDefined();
    expect(techShock!.shock).toBeLessThan(stapleShock!.shock);
  });

  it("ENERGY_CRISIS levert positieve shock voor energy-aandelen", () => {
    const energy = getStressScenario("ENERGY_CRISIS")!;
    const result = runStressTest({
      scenario: energy,
      positions: [makePosition({ ticker: "OIL", sector: "Energy" })],
      cashBalance: 0,
      baseCurrency: "EUR",
      totalValue: 50_000,
    });
    expect(result.portfolioImpactPct).toBeGreaterThan(0);
  });

  it("RATES_UP_SHARP raakt REITs harder dan financials", () => {
    const rates = getStressScenario("RATES_UP_SHARP")!;
    const result = runStressTest({
      scenario: rates,
      positions: [
        makePosition({ ticker: "REIT", sector: "Real Estate", marketValueBase: 50_000 }),
        makePosition({ ticker: "BANK", sector: "Financials", marketValueBase: 50_000 }),
      ],
      cashBalance: 0,
      baseCurrency: "EUR",
      totalValue: 100_000,
    });
    const reit = [...result.biggestLosers, ...result.biggestWinners].find(
      (i) => i.ticker === "REIT",
    )!;
    const bank = [...result.biggestLosers, ...result.biggestWinners].find(
      (i) => i.ticker === "BANK",
    )!;
    expect(reit.shock).toBeLessThan(bank.shock);
  });
});

describe("runStressTest — currency-shock", () => {
  it("USD_EUR_SHOCK raakt USD-positie maar niet EUR-positie", () => {
    const usd = getStressScenario("USD_EUR_SHOCK")!;
    const result = runStressTest({
      scenario: usd,
      positions: [
        makePosition({ ticker: "USTECH", currency: "USD", marketValueBase: 50_000 }),
        makePosition({ ticker: "EURTECH", currency: "EUR", marketValueBase: 50_000 }),
      ],
      cashBalance: 0,
      baseCurrency: "EUR",
      totalValue: 100_000,
    });
    const us = [...result.biggestLosers, ...result.biggestWinners].find(
      (i) => i.ticker === "USTECH",
    )!;
    const eu = [...result.biggestLosers, ...result.biggestWinners].find(
      (i) => i.ticker === "EURTECH",
    )!;
    // USD-positie krijgt currency-shock van -0.10; EUR niet.
    expect(us.shock).toBeLessThan(eu.shock);
  });
});

describe("runStressTest — bonds + cash", () => {
  it("RECESSION → bonds krijgen rugwind (positief)", () => {
    const recession = getStressScenario("RECESSION")!;
    const result = runStressTest({
      scenario: recession,
      positions: [
        makePosition({ ticker: "BOND", assetClass: "BOND", marketValueBase: 50_000 }),
      ],
      cashBalance: 0,
      baseCurrency: "EUR",
      totalValue: 50_000,
    });
    const bond = [...result.biggestLosers, ...result.biggestWinners].find(
      (i) => i.ticker === "BOND",
    )!;
    expect(bond.shock).toBeGreaterThan(0);
  });

  it("STAGFLATION → cash krijgt negatieve shock (koopkracht-verlies)", () => {
    const stag = getStressScenario("STAGFLATION")!;
    const result = runStressTest({
      scenario: stag,
      positions: [],
      cashBalance: 50_000,
      baseCurrency: "EUR",
      totalValue: 50_000,
    });
    expect(result.portfolioImpactPct).toBeLessThan(0);
  });
});

describe("runStressTest — warnings", () => {
  it("posities zonder beta → warning", () => {
    const recession = getStressScenario("RECESSION")!;
    const result = runStressTest({
      scenario: recession,
      positions: Array.from({ length: 5 }, (_, i) =>
        makePosition({ ticker: `T${i}`, beta: null }),
      ),
      cashBalance: 0,
      baseCurrency: "EUR",
      totalValue: 250_000,
    });
    expect(result.warnings.some((w) => w.includes("bèta"))).toBe(true);
  });

  it("posities zonder sector → warning", () => {
    const recession = getStressScenario("RECESSION")!;
    const result = runStressTest({
      scenario: recession,
      positions: [makePosition({ ticker: "X", sector: null })],
      cashBalance: 0,
      baseCurrency: "EUR",
      totalValue: 50_000,
    });
    expect(result.warnings.some((w) => w.includes("sector"))).toBe(true);
  });
});

describe("runStressTest — determinisme", () => {
  it("zelfde input → identieke output", () => {
    const recession = getStressScenario("RECESSION")!;
    const positions = [makePosition()];
    const a = runStressTest({
      scenario: recession,
      positions,
      cashBalance: 10_000,
      baseCurrency: "EUR",
      totalValue: 60_000,
    });
    const b = runStressTest({
      scenario: recession,
      positions,
      cashBalance: 10_000,
      baseCurrency: "EUR",
      totalValue: 60_000,
    });
    expect(a).toEqual(b);
  });
});

describe("buildCustomScenario", () => {
  it("user input wordt geclampt binnen [-95%, +100%]", () => {
    const scenario = buildCustomScenario({
      label: "Extreme",
      description: "test",
      assumptions: ["test"],
      sectorShocks: { tech: -2.0 }, // out of range
      defaultShock: 0,
      currencyShock: 5.0, // out of range
      bondShock: 0,
      cashShock: 0,
      severity: "extreme",
    });
    expect(scenario.sectorShocks.tech).toBe(-0.95);
    expect(scenario.currencyShock).toBe(1.0);
  });

  it("default-shock wordt voor ontbrekende sectoren ingevuld", () => {
    const scenario = buildCustomScenario({
      label: "Mild",
      description: "test",
      assumptions: ["a"],
      sectorShocks: { tech: -0.10 },
      defaultShock: -0.05,
      currencyShock: 0,
      bondShock: 0,
      cashShock: 0,
      severity: "moderate",
    });
    expect(scenario.sectorShocks.tech).toBe(-0.10);
    expect(scenario.sectorShocks.healthcare).toBe(-0.05);
    expect(scenario.sectorShocks.unknown).toBe(-0.05);
  });

  it("lege label/description → fallback-tekst", () => {
    const scenario = buildCustomScenario({
      label: "",
      description: "",
      assumptions: [],
      defaultShock: 0,
      currencyShock: 0,
      bondShock: 0,
      cashShock: 0,
      severity: "moderate",
    });
    expect(scenario.label.length).toBeGreaterThan(0);
    expect(scenario.description.length).toBeGreaterThan(0);
    expect(scenario.assumptions.length).toBeGreaterThanOrEqual(1);
  });

  it("custom scenario in engine draait correct", () => {
    const scenario = buildCustomScenario({
      label: "Mijn scenario",
      description: "Custom test",
      assumptions: ["Test 1", "Test 2"],
      defaultShock: -0.10,
      currencyShock: 0,
      bondShock: 0.02,
      cashShock: 0,
      severity: "moderate",
    });
    const result = runStressTest({
      scenario,
      positions: [
        makePosition({ marketValueBase: 100_000, sector: "Technology" }),
      ],
      cashBalance: 0,
      baseCurrency: "EUR",
      totalValue: 100_000,
    });
    expect(result.portfolioImpactPct).toBeCloseTo(-0.10, 4);
    expect(result.label).toBe("Mijn scenario");
  });
});
