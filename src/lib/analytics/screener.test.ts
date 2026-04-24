import { describe, expect, it } from "vitest";

import {
  deriveStrengthsWeaknesses,
  passesPostScoreFilters,
  preFilter,
  type ScreenerCandidate,
} from "./screener";
import type { UniverseEntry } from "@/lib/data/screener-universe";
import type { FactorScore } from "@/types/factor";

const UNIVERSE: UniverseEntry[] = [
  { ticker: "ASML", name: "ASML", assetClass: "EQUITY", sector: "Technology", region: "Europe", currency: "EUR" },
  { ticker: "NESN", name: "Nestlé", assetClass: "EQUITY", sector: "Consumer Staples", region: "Europe", currency: "CHF" },
  { ticker: "XOM", name: "ExxonMobil", assetClass: "EQUITY", sector: "Energy", region: "North America", currency: "USD" },
  { ticker: "VWCE", name: "All-World ETF", assetClass: "ETF", sector: "Diversified", region: "Global", currency: "EUR" },
];

function makeCandidate(
  overrides: Partial<ScreenerCandidate> = {},
): ScreenerCandidate {
  const factorScore: FactorScore = {
    ticker: "TEST",
    asOf: "2026-04-01T00:00:00.000Z",
    subScores: { quality: 70, value: 60, momentum: 55, lowVol: 65 },
    composite: 63,
    rationales: {
      quality: ["Sterke ROIC"],
      value: ["Neutrale P/E"],
      momentum: ["Gemiddeld 12m"],
      lowVol: ["Lage beta"],
    },
    ...overrides.factorScore,
  };
  return {
    ticker: "TEST",
    name: "Test",
    sector: "Technology",
    region: "Europe",
    currency: "EUR",
    assetClass: "EQUITY",
    fundamentals: {
      ticker: "TEST",
      asOf: factorScore.asOf,
      currency: "EUR",
      marketCap: 50_000_000_000,
      pe: 18,
      dividendYield: 0.02,
      debtToEquity: 0.6,
    },
    factorScore,
    strengths: [],
    weaknesses: [],
    ...overrides,
  };
}

describe("preFilter", () => {
  it("filtert op regio + sector (AND)", () => {
    const result = preFilter(UNIVERSE, {
      regions: ["Europe"],
      sectors: ["Technology"],
    });
    expect(result.map((r) => r.ticker)).toEqual(["ASML"]);
  });

  it("filtert op asset class", () => {
    const result = preFilter(UNIVERSE, { assetClasses: ["ETF"] });
    expect(result.map((r) => r.ticker)).toEqual(["VWCE"]);
  });

  it("past excluded tickers toe", () => {
    const result = preFilter(UNIVERSE, { excludedTickers: ["ASML", "XOM"] });
    expect(result.map((r) => r.ticker)).toEqual(["NESN", "VWCE"]);
  });

  it("lege filters → volledig universe", () => {
    expect(preFilter(UNIVERSE, {}).length).toBe(UNIVERSE.length);
  });
});

describe("passesPostScoreFilters", () => {
  it("houdt candidate die aan alle drempels voldoet", () => {
    const c = makeCandidate();
    expect(
      passesPostScoreFilters(c, {
        factorMin: { quality: 60, value: 55 },
        minFactorComposite: 55,
        minDividendYield: 0.01,
        maxDebtToEquity: 1,
      }),
    ).toBe(true);
  });

  it("valt op factor-drempel", () => {
    const c = makeCandidate();
    expect(
      passesPostScoreFilters(c, { factorMin: { quality: 90 } }),
    ).toBe(false);
  });

  it("valt op composite drempel", () => {
    expect(
      passesPostScoreFilters(makeCandidate(), { minFactorComposite: 80 }),
    ).toBe(false);
  });

  it("valt op maxDebtToEquity", () => {
    const c = makeCandidate({
      fundamentals: {
        ticker: "TEST",
        asOf: "2026-04-01T00:00:00.000Z",
        currency: "EUR",
        debtToEquity: 2.5,
      },
    });
    expect(passesPostScoreFilters(c, { maxDebtToEquity: 2 })).toBe(false);
  });

  it("valt op minMarketCap wanneer fundamentals ontbreken", () => {
    const c = makeCandidate({ fundamentals: null });
    expect(
      passesPostScoreFilters(c, { minMarketCap: 1_000_000 }),
    ).toBe(false);
  });

  it("dividendOnly vereist positief rendement", () => {
    const c = makeCandidate({
      fundamentals: {
        ticker: "TEST",
        asOf: "2026-04-01T00:00:00.000Z",
        currency: "EUR",
        dividendYield: 0,
      },
    });
    expect(passesPostScoreFilters(c, { dividendOnly: true })).toBe(false);
  });
});

describe("deriveStrengthsWeaknesses", () => {
  const score: FactorScore = {
    ticker: "T",
    asOf: "2026-04-01T00:00:00.000Z",
    subScores: { quality: 82, value: 30, momentum: 70, lowVol: 20 },
    composite: 52,
    rationales: {
      quality: ["Sterke ROIC (22%)"],
      value: ["Hoge P/E (50)"],
      momentum: ["Sterk 12m rendement (40%)"],
      lowVol: ["Hoge volatiliteit (55%)"],
    },
  };

  it("pakt top rationales per sub-score", () => {
    const { strengths, weaknesses } = deriveStrengthsWeaknesses(score);
    expect(strengths).toContain("Quality: Sterke ROIC (22%)");
    expect(strengths).toContain("Momentum: Sterk 12m rendement (40%)");
    expect(weaknesses).toContain("Value: Hoge P/E (50)");
    expect(weaknesses).toContain("Risk: Hoge volatiliteit (55%)");
  });

  it("retourneert lege lijsten zonder duidelijke signalen", () => {
    const neutral: FactorScore = {
      ticker: "T",
      asOf: "2026-04-01T00:00:00.000Z",
      subScores: { quality: 52, value: 48, momentum: 50, lowVol: 55 },
      composite: 51,
      rationales: {
        quality: ["Gemiddeld"],
        value: ["Gemiddeld"],
        momentum: ["Gemiddeld"],
        lowVol: ["Gemiddeld"],
      },
    };
    const { strengths, weaknesses } = deriveStrengthsWeaknesses(neutral);
    expect(strengths).toEqual([]);
    expect(weaknesses).toEqual([]);
  });
});
