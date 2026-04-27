import { describe, expect, it } from "vitest";

import type {
  MacroScenarioReport,
  MacroScenarioResult,
  PositionImpact,
} from "@/lib/analytics/macro";
import type { MarketRegimeScore } from "@/types/regime";

import {
  buildScenarioSnapshot,
  type BuildScenarioSnapshotInput,
} from "./scenario-snapshot";

const NOW = "2026-04-27T00:00:00.000Z";

// ============================================================
//  Fixtures
// ============================================================

function impact(
  ticker: string,
  contribution: number,
): PositionImpact {
  return {
    ticker,
    name: ticker,
    weight: 0.1,
    shock: contribution / 0.1,
    contribution,
  };
}

function scenario(
  overrides: Partial<MacroScenarioResult>,
): MacroScenarioResult {
  return {
    scenario: "MARKET_CRASH",
    label: "Markt -20%",
    description: "Brede markt -20%.",
    portfolioImpact: -0.18,
    portfolioImpactAmount: -18_000,
    biggestLosers: [impact("RHM", -0.04), impact("ASML", -0.03)],
    biggestWinners: [],
    defensiveStrength: 50,
    verdict: "Portefeuille verliest ~18%.",
    warnings: [],
    ...overrides,
  };
}

function macroReport(
  scenarios: MacroScenarioResult[],
): MacroScenarioReport {
  return {
    generatedAt: NOW,
    baseCurrency: "EUR",
    totalValue: 100_000,
    scenarios,
  };
}

function regime(
  stance: MarketRegimeScore["stance"],
): MarketRegimeScore {
  return {
    asOf: NOW,
    score: stance === "DEFENSIVE" ? 25 : stance === "RISK_ON" ? 75 : 50,
    stance,
    confidence: 0.7,
    narrative: "test",
    subDrivers: [],
  };
}

function defaultInput(
  overrides: Partial<BuildScenarioSnapshotInput> = {},
): BuildScenarioSnapshotInput {
  return {
    macroReport: macroReport([
      scenario({
        scenario: "RATES_UP_2",
        label: "Rente +2%",
        description: "Rente +200bps.",
        portfolioImpact: -0.07,
        portfolioImpactAmount: -7_000,
      }),
      scenario({
        scenario: "MARKET_CRASH",
        label: "Markt -20%",
        portfolioImpact: -0.18,
        portfolioImpactAmount: -18_000,
      }),
      scenario({
        scenario: "USD_UP_10",
        label: "USD +10%",
        description: "USD +10% vs base.",
        portfolioImpact: 0.04,
        portfolioImpactAmount: 4_000,
      }),
      scenario({
        scenario: "RECESSION",
        label: "Recessie",
        description: "Brede recessie.",
        portfolioImpact: -0.20,
        portfolioImpactAmount: -20_000,
      }),
    ]),
    regime: null,
    riskTolerance: null,
    foreignCurrencyWeight: 0.4,
    ...overrides,
  };
}

// ============================================================
//  Tests
// ============================================================

describe("buildScenarioSnapshot", () => {
  it("max 4 kaarten standaard", () => {
    const result = buildScenarioSnapshot(defaultInput());
    expect(result.cards.length).toBeLessThanOrEqual(4);
  });

  it("verwacht 4 dashboard scenarios: rates / crash / usd / defensief regime", () => {
    const result = buildScenarioSnapshot(defaultInput());
    const ids = result.cards.map((c) => c.id);
    expect(ids).toContain("RATES_UP_2");
    expect(ids).toContain("MARKET_CRASH");
    expect(ids).toContain("USD_UP_10");
    expect(ids).toContain("DEFENSIVE_REGIME_WORSENS");
  });

  it("zwaarste impact staat bovenaan (sortering op impactPercent asc)", () => {
    const result = buildScenarioSnapshot(defaultInput());
    expect(result.cards[0]?.estimatedImpactPercent).toBeLessThanOrEqual(
      result.cards[1]?.estimatedImpactPercent ?? 0,
    );
  });

  it("USD-scenario + hoge FX-exposure → hedge-preparation", () => {
    const result = buildScenarioSnapshot(
      defaultInput({ foreignCurrencyWeight: 0.7 }),
    );
    const usd = result.cards.find((c) => c.id === "USD_UP_10");
    expect(usd?.suggestedPreparation).toContain("EUR-hedged");
  });

  it("Severe loss + DEFENSIVE regime → 'verlaag risico-blootstelling'", () => {
    const result = buildScenarioSnapshot(
      defaultInput({ regime: regime("DEFENSIVE") }),
    );
    const crash = result.cards.find((c) => c.id === "MARKET_CRASH");
    expect(crash?.suggestedPreparation).toContain("Verlaag risico");
  });

  it("Severe loss + CONSERVATIVE riskTolerance → 'verlaag risico-blootstelling'", () => {
    const result = buildScenarioSnapshot(
      defaultInput({ riskTolerance: "CONSERVATIVE" }),
    );
    const crash = result.cards.find((c) => c.id === "MARKET_CRASH");
    expect(crash?.suggestedPreparation).toContain("Verlaag risico");
  });

  it("Moderate loss → 'controleer cash-buffer'", () => {
    const result = buildScenarioSnapshot(defaultInput());
    const rates = result.cards.find((c) => c.id === "RATES_UP_2");
    expect(rates?.suggestedPreparation).toContain("cash-buffer");
  });

  it("Robuuste portefeuille (impact > -5%) → 'geen voorbereiding nodig'", () => {
    const result = buildScenarioSnapshot(
      defaultInput({
        macroReport: macroReport([
          scenario({
            scenario: "RATES_UP_2",
            label: "Rente +2%",
            portfolioImpact: -0.02,
            portfolioImpactAmount: -2_000,
          }),
        ]),
      }),
    );
    const card = result.cards.find((c) => c.id === "RATES_UP_2");
    expect(card?.suggestedPreparation).toContain("robuust");
  });

  it("DEFENSIVE_REGIME_WORSENS card heeft eigen NL-naam + dempt impact bij defensief regime", () => {
    const result = buildScenarioSnapshot(
      defaultInput({ regime: regime("DEFENSIVE") }),
    );
    const card = result.cards.find(
      (c) => c.id === "DEFENSIVE_REGIME_WORSENS",
    );
    expect(card?.scenarioName).toBe("Defensief regime verslechtert");
    // Dampened impact ~ -0.20 * 0.7 = -0.14
    expect(card?.estimatedImpactPercent).toBeGreaterThan(-0.16);
    expect(card?.estimatedImpactPercent).toBeLessThan(-0.10);
    expect(card?.indicative).toBe(true);
  });

  it("mainDrivers max 3 tickers uit biggestLosers", () => {
    const result = buildScenarioSnapshot(defaultInput());
    for (const card of result.cards) {
      expect(card.mainDrivers.length).toBeLessThanOrEqual(3);
    }
  });

  it("tone-mapping: negatief / neutraal / positief", () => {
    const result = buildScenarioSnapshot(defaultInput());
    const usd = result.cards.find((c) => c.id === "USD_UP_10");
    const crash = result.cards.find((c) => c.id === "MARKET_CRASH");
    expect(crash?.tone).toBe("negative");
    expect(usd?.tone).toBe("positive");
  });

  it("warnings markeren kaart als indicative=true en verlagen confidence relatief", () => {
    const clean = scenario({
      scenario: "MARKET_CRASH",
      warnings: [],
      defensiveStrength: 50,
    });
    const noisy = scenario({
      scenario: "MARKET_CRASH",
      warnings: ["Te weinig data voor sector X", "Tweede waarschuwing"],
      defensiveStrength: 50,
    });
    const cleanResult = buildScenarioSnapshot(
      defaultInput({ macroReport: macroReport([clean]) }),
    );
    const noisyResult = buildScenarioSnapshot(
      defaultInput({ macroReport: macroReport([noisy]) }),
    );
    const cleanCard = cleanResult.cards.find((c) => c.id === "MARKET_CRASH");
    const noisyCard = noisyResult.cards.find((c) => c.id === "MARKET_CRASH");
    expect(noisyCard?.indicative).toBe(true);
    expect(cleanCard?.indicative).toBe(false);
    expect(noisyCard?.confidence).toBeLessThan(cleanCard?.confidence ?? 1);
    expect(noisyResult.hasIndicativeCards).toBe(true);
  });

  it("lege macroReport → lege output", () => {
    const result = buildScenarioSnapshot(defaultInput({ macroReport: null }));
    expect(result.cards).toEqual([]);
    expect(result.hasIndicativeCards).toBe(false);
  });

  it("confidence ligt altijd in [0,1]", () => {
    const result = buildScenarioSnapshot(defaultInput());
    for (const c of result.cards) {
      expect(c.confidence).toBeGreaterThanOrEqual(0);
      expect(c.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("determinisme: identieke input → identieke output", () => {
    const input = defaultInput();
    expect(buildScenarioSnapshot(input)).toEqual(buildScenarioSnapshot(input));
  });

  it("maxCards configureerbaar", () => {
    const result = buildScenarioSnapshot(
      defaultInput({ maxCards: 2 }),
    );
    expect(result.cards.length).toBe(2);
  });
});
