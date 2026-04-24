import { describe, expect, it } from "vitest";

import {
  runBacktest,
  type BacktestUniverseEntry,
} from "./engine";
import {
  equalWeightStrategy,
  qualityStrategy,
  regimeAwareStrategy,
} from "./strategies";
import type { BacktestConfig } from "@/types/backtest";
import type { FactorScore } from "@/types/factor";

/**
 * Genereer een simpele maandelijkse prijsreeks met constante groei-rate.
 * `growthPerMonth = 0.01` ≈ 12.68% annual.
 */
function series(
  startValue: number,
  growthPerMonth: number,
  months: string[],
): BacktestUniverseEntry["monthly"] {
  const out: BacktestUniverseEntry["monthly"] = [];
  let value = startValue;
  for (const date of months) {
    out.push({ date, close: Math.round(value * 100) / 100 });
    value *= 1 + growthPerMonth;
  }
  return out;
}

function monthKeys(startYear: number, startMonth: number, count: number): string[] {
  const out: string[] = [];
  let y = startYear;
  let m = startMonth;
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

function factorScore(
  quality: number,
  value: number,
  momentum: number,
  lowVol: number,
  composite?: number,
): FactorScore {
  return {
    ticker: "X",
    asOf: "2023-01-01T00:00:00.000Z",
    subScores: { quality, value, momentum, lowVol },
    composite: composite ?? (quality + value + momentum + lowVol) / 4,
    confidence: 0.8,
  };
}

function baseConfig(overrides: Partial<BacktestConfig> = {}): BacktestConfig {
  return {
    name: "Test",
    startDate: "2022-01-01",
    endDate: "2023-12-31",
    initialCapital: 10_000,
    baseCurrency: "EUR",
    rebalance: "monthly",
    includeCosts: true,
    includeTaxes: false,
    commissionBps: 10,
    universe: [],
    maxPositions: 3,
    ...overrides,
  };
}

describe("runBacktest — equal weight op gelijke tickers", () => {
  it("groeit exact met de prijsreeks bij volledige allocatie en zonder kosten", () => {
    const months = monthKeys(2022, 1, 24);
    const member: BacktestUniverseEntry = {
      ticker: "AAA",
      monthly: series(100, 0.01, months),
    };
    const config = baseConfig({
      commissionBps: 0,
      maxPositions: 1,
    });

    const result = runBacktest({
      config,
      strategy: equalWeightStrategy,
      members: [member],
    });

    expect(result.equityCurve.length).toBe(24);
    // Na 23 maandelijkse returns van ~1% is de finalValue ~126.82.
    expect(result.finalValue).toBeGreaterThan(12_500);
    expect(result.finalValue).toBeLessThan(13_000);
    expect(result.cagr).toBeCloseTo(0.1268, 2);
    expect(result.maxDrawdown).toBe(0);
    expect(result.winRate).toBe(1);
  });
});

describe("runBacktest — quality strategie prefereert de top-scorers", () => {
  it("selecteert posities met hoogste quality-score", () => {
    const months = monthKeys(2022, 1, 12);
    const members: BacktestUniverseEntry[] = [
      {
        ticker: "HIGH",
        monthly: series(100, 0.02, months),
        factorScore: factorScore(90, 50, 50, 50),
      },
      {
        ticker: "MED",
        monthly: series(100, 0.01, months),
        factorScore: factorScore(60, 50, 50, 50),
      },
      {
        ticker: "LOW",
        monthly: series(100, -0.005, months),
        factorScore: factorScore(20, 50, 50, 50),
      },
    ];
    const config = baseConfig({
      maxPositions: 2,
      rebalance: "quarterly",
      commissionBps: 0,
      startDate: "2022-01-01",
      endDate: "2022-12-31",
    });

    const result = runBacktest({
      config,
      strategy: qualityStrategy,
      members,
    });

    // Met HIGH (+2%/m) en MED (+1%/m) verwachten we duidelijk positief rendement.
    expect(result.finalValue).toBeGreaterThan(config.initialCapital);
    expect(result.totalReturn).toBeGreaterThan(0.1);
  });
});

describe("runBacktest — transactiekosten drukken eindwaarde", () => {
  it("hogere commissionBps → lagere finalValue bij monthly rebalance", () => {
    const months = monthKeys(2022, 1, 12);
    const members: BacktestUniverseEntry[] = [
      {
        ticker: "A",
        monthly: series(100, 0.01, months),
        factorScore: factorScore(80, 50, 50, 50),
      },
      {
        ticker: "B",
        monthly: series(100, -0.01, months),
        factorScore: factorScore(80, 50, 50, 50),
      },
    ];
    const base = baseConfig({
      maxPositions: 2,
      rebalance: "monthly",
      startDate: "2022-01-01",
      endDate: "2022-12-31",
    });
    const noCost = runBacktest({
      config: { ...base, commissionBps: 0 },
      strategy: qualityStrategy,
      members,
    });
    const withCost = runBacktest({
      config: { ...base, commissionBps: 50 },
      strategy: qualityStrategy,
      members,
    });
    expect(withCost.finalValue).toBeLessThan(noCost.finalValue);
    expect(withCost.turnover).toBeGreaterThanOrEqual(0);
    expect(withCost.tradesCount).toBeGreaterThanOrEqual(noCost.tradesCount);
  });
});

describe("runBacktest — regime aware", () => {
  it("respecteert regime per maand", () => {
    const months = monthKeys(2022, 1, 12);
    const regimeByMonth = new Map<string, "expansion" | "recession">(
      months.map((m, i): [string, "expansion" | "recession"] => [
        m,
        i < 6 ? "expansion" : "recession",
      ]),
    );
    const members: BacktestUniverseEntry[] = [
      {
        ticker: "MOM",
        monthly: series(100, 0.02, months),
        factorScore: factorScore(60, 40, 90, 30),
      },
      {
        ticker: "QLT",
        monthly: series(100, 0.01, months),
        factorScore: factorScore(90, 50, 40, 80),
      },
    ];
    const config = baseConfig({
      maxPositions: 2,
      rebalance: "monthly",
      startDate: "2022-01-01",
      endDate: "2022-12-31",
    });
    const result = runBacktest({
      config,
      strategy: regimeAwareStrategy,
      members,
      regimeByMonth,
    });
    // Regime-aware produceert minstens één equity punt met regime-tag.
    expect(result.equityCurve.some((p) => p.regime !== undefined)).toBe(true);
  });
});

describe("runBacktest — benchmark comparison", () => {
  it("vult benchmark-metrics wanneer een benchmark is meegegeven", () => {
    const months = monthKeys(2022, 1, 12);
    const members: BacktestUniverseEntry[] = [
      {
        ticker: "A",
        monthly: series(100, 0.015, months),
        factorScore: factorScore(80, 50, 50, 50),
      },
    ];
    const result = runBacktest({
      config: baseConfig({
        maxPositions: 1,
        rebalance: "quarterly",
        startDate: "2022-01-01",
        endDate: "2022-12-31",
        benchmarkTicker: "IWDA",
      }),
      strategy: qualityStrategy,
      members,
      benchmark: {
        ticker: "IWDA",
        monthly: series(50, 0.008, months),
      },
    });
    expect(result.benchmark).toBeDefined();
    expect(result.benchmark?.ticker).toBe("IWDA");
    expect(result.benchmark?.totalReturn).toBeGreaterThan(0);
    expect(
      result.equityCurve.every((p) => p.benchmark !== undefined),
    ).toBe(true);
  });
});

describe("runBacktest — lege of ongeldige input", () => {
  it("retourneert lege result bij onzinnige datums", () => {
    const result = runBacktest({
      config: baseConfig({
        startDate: "2023-06-01",
        endDate: "2022-01-01",
      }),
      strategy: equalWeightStrategy,
      members: [],
    });
    expect(result.equityCurve).toEqual([]);
    expect(result.finalValue).toBe(10_000);
  });
});
