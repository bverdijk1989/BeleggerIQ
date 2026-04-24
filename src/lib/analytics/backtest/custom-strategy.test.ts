import { describe, expect, it } from "vitest";

import { buildCustomStrategy, type CustomStrategyConfig } from "./custom-strategy";
import type { StrategyContext, UniverseMember } from "./strategies";
import type { BacktestConfig } from "@/types/backtest";
import type { FactorScore } from "@/types/factor";

function score(
  overrides: Partial<FactorScore["subScores"]> & {
    composite?: number;
    valueRationales?: string[];
    dividend?: number;
  } = {},
): FactorScore {
  return {
    ticker: "X",
    asOf: "2024-01-01T00:00:00.000Z",
    subScores: {
      quality: overrides.quality ?? 50,
      value: overrides.value ?? 50,
      momentum: overrides.momentum ?? 50,
      lowVol: overrides.lowVol ?? 50,
      dividend: overrides.dividend,
    },
    composite: overrides.composite ?? 50,
    confidence: 0.8,
    rationales: {
      quality: ["q"],
      value: overrides.valueRationales ?? ["v"],
      momentum: ["m"],
      lowVol: ["l"],
    },
  };
}

function member(
  overrides: Partial<UniverseMember>,
): UniverseMember {
  return {
    ticker: overrides.ticker ?? "X",
    sector: overrides.sector ?? "Technology",
    factorScore: overrides.factorScore ?? score(),
    ...overrides,
  };
}

function baseConfig(): BacktestConfig {
  return {
    name: "Test",
    startDate: "2024-01-01",
    endDate: "2024-06-30",
    initialCapital: 10_000,
    baseCurrency: "EUR",
    rebalance: "monthly",
    includeCosts: true,
    includeTaxes: false,
    universe: [],
  };
}

function baseContext(members: UniverseMember[]): StrategyContext {
  return {
    asOf: "2024-01",
    members,
    priceHistoryByTicker: new Map(),
    config: baseConfig(),
    regime: null,
  };
}

describe("buildCustomStrategy", () => {
  it("equal-weight bij enkel quality gewicht over 3 members", () => {
    const members = [
      member({ ticker: "A", factorScore: score({ quality: 90 }) }),
      member({ ticker: "B", factorScore: score({ quality: 60 }) }),
      member({ ticker: "C", factorScore: score({ quality: 30 }) }),
    ];
    const config: CustomStrategyConfig = {
      factorWeights: { quality: 1, value: 0, momentum: 0, lowVol: 0 },
      maxPositions: 2,
    };
    const strategy = buildCustomStrategy(config);
    const decision = strategy(baseContext(members));
    expect([...decision.weights.keys()]).toEqual(["A", "B"]);
    expect(decision.weights.get("A")).toBeCloseTo(0.5, 5);
    expect(decision.weights.get("B")).toBeCloseTo(0.5, 5);
  });

  it("requireDividend filtert candidates zonder signaal", () => {
    const members = [
      member({
        ticker: "NO_DIV",
        factorScore: score({ quality: 90 }),
      }),
      member({
        ticker: "DIV",
        factorScore: score({
          quality: 60,
          valueRationales: ["Aantrekkelijk dividend"],
        }),
      }),
    ];
    const strategy = buildCustomStrategy({
      factorWeights: { quality: 1, value: 0, momentum: 0, lowVol: 0 },
      requireDividend: true,
      maxPositions: 2,
    });
    const decision = strategy(baseContext(members));
    expect([...decision.weights.keys()]).toEqual(["DIV"]);
  });

  it("defensiveOverlay reserveert 20% cash", () => {
    const members = [
      member({ ticker: "A", factorScore: score({ quality: 80 }) }),
      member({ ticker: "B", factorScore: score({ quality: 70 }) }),
    ];
    const strategy = buildCustomStrategy({
      factorWeights: { quality: 1, value: 0, momentum: 0, lowVol: 0 },
      defensiveOverlay: true,
      maxPositions: 2,
    });
    const decision = strategy(baseContext(members));
    const total = Array.from(decision.weights.values()).reduce(
      (s, w) => s + w,
      0,
    );
    expect(total).toBeCloseTo(0.8, 2);
  });

  it("respecteert maxSectorWeight en slaat tickers over wanneer sector vol zit", () => {
    const members = [
      member({
        ticker: "TECH1",
        sector: "Technology",
        factorScore: score({ quality: 90 }),
      }),
      member({
        ticker: "TECH2",
        sector: "Technology",
        factorScore: score({ quality: 85 }),
      }),
      member({
        ticker: "HEALTH",
        sector: "Healthcare",
        factorScore: score({ quality: 70 }),
      }),
    ];
    const strategy = buildCustomStrategy({
      factorWeights: { quality: 1, value: 0, momentum: 0, lowVol: 0 },
      maxPositions: 3,
      maxSectorWeight: 0.4,
    });
    const decision = strategy(baseContext(members));
    const keys = [...decision.weights.keys()];
    // Met 3 positions krijgen elk initial 1/3 ≈ 0.33 cap 0.4 → Tech1 past (0.33),
    // Tech2 zou sector > 0.4 maken → skip, Health wel → 2 posities.
    expect(keys).toContain("TECH1");
    expect(keys).toContain("HEALTH");
    expect(keys).not.toContain("TECH2");
  });

  it("retourneert lege map bij ontbrekende factor scores", () => {
    const members = [
      member({ ticker: "UNKNOWN", factorScore: null }),
    ];
    const strategy = buildCustomStrategy({
      factorWeights: { quality: 1, value: 0, momentum: 0, lowVol: 0 },
    });
    const decision = strategy(baseContext(members));
    expect(decision.weights.size).toBe(0);
    expect(decision.rationale).toMatch(/voldoen aan de filters/i);
  });
});
