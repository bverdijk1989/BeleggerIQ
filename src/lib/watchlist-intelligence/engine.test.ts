import { describe, expect, it } from "vitest";

import type { FactorScore, FundamentalsSnapshot } from "@/types/factor";
import type { MacroRegimeReport } from "@/lib/analytics/macro-regime";

import { buildWatchlistIntelligenceReport } from "./engine";
import type {
  SimilarUniverseEntry,
  WatchlistIntelligenceInput,
} from "./input";
import {
  extractAlternativesSignal,
  extractDividendSignal,
  extractEarningsSignal,
  extractMacroFitSignal,
  extractMomentumSignal,
  extractSentimentSignal,
  extractValuationSignal,
  findSimilarAlternatives,
} from "./signals";
import { WATCHLIST_SIGNAL_ORDER } from "./types";

const ASOF = "2026-05-10T12:00:00.000Z";

function makeFactor(
  overrides: Partial<FactorScore["subScores"]> & {
    composite?: number;
    confidence?: number;
  } = {},
): FactorScore {
  return {
    ticker: "TEST",
    asOf: ASOF,
    composite: overrides.composite ?? 65,
    confidence: overrides.confidence ?? 0.8,
    subScores: {
      value: 60,
      quality: 70,
      momentum: 55,
      lowVol: 60,
      ...overrides,
    },
  };
}

function makeFundamentals(
  overrides: Partial<FundamentalsSnapshot> = {},
): FundamentalsSnapshot {
  return {
    ticker: "TEST",
    asOf: ASOF,
    currency: "EUR",
    dividendYield: 0.025,
    pe: 18,
    fcfYield: 0.05,
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<WatchlistIntelligenceInput> = {},
): WatchlistIntelligenceInput {
  return {
    asOf: ASOF,
    macro: null,
    universe: [],
    current: {
      ticker: "ASML",
      name: "ASML Holding",
      sector: "Technology",
      assetClassKey: "EQUITY_GROWTH",
      factorScore: makeFactor(),
      previousFactorScore: makeFactor({ value: 55 }),
      fundamentals: makeFundamentals(),
      previousFundamentals: makeFundamentals(),
    },
    ...overrides,
  };
}

describe("extractValuationSignal", () => {
  it("value 75 + delta +10 → positive", () => {
    const sig = extractValuationSignal(
      makeInput({
        current: {
          ...makeInput().current,
          factorScore: makeFactor({ value: 75 }),
          previousFactorScore: makeFactor({ value: 65 }),
        },
      }),
    );
    expect(sig.direction).toBe("positive");
    expect(sig.metric).toBe(75);
  });

  it("value 30 → negative", () => {
    const sig = extractValuationSignal(
      makeInput({
        current: {
          ...makeInput().current,
          factorScore: makeFactor({ value: 30 }),
          previousFactorScore: makeFactor({ value: 35 }),
        },
      }),
    );
    expect(sig.direction).toBe("negative");
  });

  it("geen factor-score → not available", () => {
    const sig = extractValuationSignal(
      makeInput({
        current: { ...makeInput().current, factorScore: null },
      }),
    );
    expect(sig.available).toBe(false);
  });
});

describe("extractMomentumSignal", () => {
  it("delta +10 → positive", () => {
    const sig = extractMomentumSignal(
      makeInput({
        current: {
          ...makeInput().current,
          factorScore: makeFactor({ momentum: 70 }),
          previousFactorScore: makeFactor({ momentum: 55 }),
        },
      }),
    );
    expect(sig.direction).toBe("positive");
  });

  it("delta -10 → negative", () => {
    const sig = extractMomentumSignal(
      makeInput({
        current: {
          ...makeInput().current,
          factorScore: makeFactor({ momentum: 40 }),
          previousFactorScore: makeFactor({ momentum: 55 }),
        },
      }),
    );
    expect(sig.direction).toBe("negative");
  });

  it("geen previous → bepalt op level", () => {
    const sig = extractMomentumSignal(
      makeInput({
        current: {
          ...makeInput().current,
          factorScore: makeFactor({ momentum: 80 }),
          previousFactorScore: null,
        },
      }),
    );
    expect(sig.direction).toBe("positive");
  });
});

describe("extractEarningsSignal", () => {
  it("event over 3 dagen → strength hoog", () => {
    const futureDate = new Date(ASOF);
    futureDate.setUTCDate(futureDate.getUTCDate() + 3);
    const sig = extractEarningsSignal(
      makeInput({
        current: {
          ...makeInput().current,
          nextEarningsDate: futureDate.toISOString(),
        },
      }),
    );
    expect(sig.available).toBe(true);
    expect(sig.strength).toBeGreaterThan(80);
  });

  it("event > 14 dagen → lage strength", () => {
    const futureDate = new Date(ASOF);
    futureDate.setUTCDate(futureDate.getUTCDate() + 30);
    const sig = extractEarningsSignal(
      makeInput({
        current: {
          ...makeInput().current,
          nextEarningsDate: futureDate.toISOString(),
        },
      }),
    );
    expect(sig.strength).toBeLessThanOrEqual(30);
  });

  it("geen nextEarningsDate → not available", () => {
    const sig = extractEarningsSignal(makeInput());
    expect(sig.available).toBe(false);
  });
});

describe("extractDividendSignal", () => {
  it("yield-stijging → positive", () => {
    const sig = extractDividendSignal(
      makeInput({
        current: {
          ...makeInput().current,
          fundamentals: makeFundamentals({ dividendYield: 0.035 }),
          previousFundamentals: makeFundamentals({ dividendYield: 0.025 }),
        },
      }),
    );
    expect(sig.direction).toBe("positive");
  });

  it("yield-daling → negative", () => {
    const sig = extractDividendSignal(
      makeInput({
        current: {
          ...makeInput().current,
          fundamentals: makeFundamentals({ dividendYield: 0.020 }),
          previousFundamentals: makeFundamentals({ dividendYield: 0.030 }),
        },
      }),
    );
    expect(sig.direction).toBe("negative");
  });

  it("geen yield → not available", () => {
    const sig = extractDividendSignal(
      makeInput({
        current: {
          ...makeInput().current,
          fundamentals: makeFundamentals({ dividendYield: 0 }),
        },
      }),
    );
    expect(sig.available).toBe(false);
  });
});

describe("extractMacroFitSignal", () => {
  function makeMacro(
    direction: "tailwind" | "headwind" | "neutral",
  ): MacroRegimeReport {
    return {
      classification: {
        asOf: "2026-05-10",
        regime: "STAGFLATION",
        confidence: 0.7,
        narrative: "test",
        indicators: [],
        supportingIndicators: [],
        conflictingIndicators: [],
      },
      assetMapping: {
        regime: "STAGFLATION",
        impacts: [
          {
            assetClass: "EQUITY_GROWTH",
            label: "Groei-aandelen",
            direction,
            magnitude: 0.7,
            rationale: "test",
          },
        ],
      },
      portfolioImpact: null,
    };
  }

  it("tailwind → positive", () => {
    const sig = extractMacroFitSignal(
      makeInput({ macro: makeMacro("tailwind") }),
    );
    expect(sig.direction).toBe("positive");
  });

  it("headwind → negative", () => {
    const sig = extractMacroFitSignal(
      makeInput({ macro: makeMacro("headwind") }),
    );
    expect(sig.direction).toBe("negative");
  });

  it("zonder macro → not available", () => {
    const sig = extractMacroFitSignal(makeInput({ macro: null }));
    expect(sig.available).toBe(false);
  });
});

describe("extractSentimentSignal", () => {
  it("positief sentiment → positive", () => {
    const sig = extractSentimentSignal(
      makeInput({
        current: { ...makeInput().current, sentimentScore: 0.5 },
      }),
    );
    expect(sig.direction).toBe("positive");
  });

  it("negatief sentiment → negative", () => {
    const sig = extractSentimentSignal(
      makeInput({
        current: { ...makeInput().current, sentimentScore: -0.5 },
      }),
    );
    expect(sig.direction).toBe("negative");
  });

  it("neutraal + delta +0.4 → positive (dynamic)", () => {
    const sig = extractSentimentSignal(
      makeInput({
        current: {
          ...makeInput().current,
          sentimentScore: 0.05,
          sentimentDelta: 0.4,
        },
      }),
    );
    expect(sig.direction).toBe("positive");
  });

  it("geen sentiment → not available", () => {
    const sig = extractSentimentSignal(makeInput());
    expect(sig.available).toBe(false);
  });
});

describe("findSimilarAlternatives", () => {
  it("vindt alternatieven met hogere composite in dezelfde sector", () => {
    const universe: SimilarUniverseEntry[] = [
      { ticker: "MSFT", name: "Microsoft", sector: "Technology", compositeScore: 78, source: "portfolio" },
      { ticker: "AAPL", name: "Apple", sector: "Technology", compositeScore: 80, source: "watchlist" },
      { ticker: "JPM", name: "JPMorgan", sector: "Financials", compositeScore: 90, source: "portfolio" },
    ];
    const alts = findSimilarAlternatives(
      makeInput({
        current: {
          ...makeInput().current,
          factorScore: makeFactor({ composite: 65 }),
        },
        universe,
      }),
    );
    expect(alts).toHaveLength(2);
    // Hoogste composite eerst
    expect(alts[0]?.ticker).toBe("AAPL");
    expect(alts[1]?.ticker).toBe("MSFT");
    // JPM uitgesloten — andere sector
  });

  it("excludeert zichzelf", () => {
    const alts = findSimilarAlternatives(
      makeInput({
        current: {
          ...makeInput().current,
          ticker: "MSFT",
          factorScore: makeFactor({ composite: 65 }),
        },
        universe: [
          { ticker: "MSFT", name: "Microsoft", sector: "Technology", compositeScore: 90, source: "portfolio" },
        ],
      }),
    );
    expect(alts).toHaveLength(0);
  });

  it("alternatieven moeten ≥8 punt sterker zijn", () => {
    const alts = findSimilarAlternatives(
      makeInput({
        current: {
          ...makeInput().current,
          factorScore: makeFactor({ composite: 65 }),
        },
        universe: [
          { ticker: "X", name: "X", sector: "Technology", compositeScore: 70, source: "watchlist" },
        ],
      }),
    );
    expect(alts).toHaveLength(0);
  });
});

describe("extractAlternativesSignal", () => {
  it("alternatieven gevonden → negative direction", () => {
    const sig = extractAlternativesSignal(
      makeInput({
        current: {
          ...makeInput().current,
          factorScore: makeFactor({ composite: 60 }),
        },
        universe: [
          { ticker: "BETTER", name: "Better", sector: "Technology", compositeScore: 80, source: "portfolio" },
        ],
      }),
    );
    expect(sig.direction).toBe("negative");
    expect(sig.available).toBe(true);
  });

  it("geen alternatieven, maar wel data → positive (jij bent de beste)", () => {
    const sig = extractAlternativesSignal(makeInput());
    expect(sig.available).toBe(true);
    expect(sig.direction).toBe("positive");
  });

  it("geen sector → not available", () => {
    const sig = extractAlternativesSignal(
      makeInput({
        current: { ...makeInput().current, sector: null },
      }),
    );
    expect(sig.available).toBe(false);
  });
});

describe("buildWatchlistIntelligenceReport", () => {
  it("levert alle signalen in canonical volgorde (Module 9)", () => {
    const report = buildWatchlistIntelligenceReport(makeInput());
    expect(report.signals.map((s) => s.key)).toEqual([
      ...WATCHLIST_SIGNAL_ORDER,
    ]);
    // Module 9: 11 keys totaal (10 spec + bonus SENTIMENT_SHIFT).
    expect(report.signals.length).toBe(WATCHLIST_SIGNAL_ORDER.length);
  });

  it("sterke positieve signalen → STRONG_OPPORTUNITY tier", () => {
    const futureDate = new Date(ASOF);
    futureDate.setUTCDate(futureDate.getUTCDate() + 3);
    const report = buildWatchlistIntelligenceReport(
      makeInput({
        current: {
          ...makeInput().current,
          factorScore: makeFactor({ value: 80, momentum: 80, composite: 80 }),
          previousFactorScore: makeFactor({ value: 65, momentum: 65 }),
          fundamentals: makeFundamentals({ dividendYield: 0.035 }),
          previousFundamentals: makeFundamentals({ dividendYield: 0.025 }),
          sentimentScore: 0.6,
        },
      }),
    );
    expect(["STRONG_OPPORTUNITY", "POSITIVE"]).toContain(report.tier);
  });

  it("zwakke signalen → WAIT of NEUTRAL", () => {
    const report = buildWatchlistIntelligenceReport(
      makeInput({
        current: {
          ...makeInput().current,
          factorScore: makeFactor({ value: 30, momentum: 30, composite: 30 }),
          previousFactorScore: makeFactor({ value: 40, momentum: 40 }),
        },
      }),
    );
    expect(["WAIT", "NEUTRAL"]).toContain(report.tier);
  });

  it("alternatives in report wanneer universe levert", () => {
    const report = buildWatchlistIntelligenceReport(
      makeInput({
        current: {
          ...makeInput().current,
          factorScore: makeFactor({ composite: 60 }),
        },
        universe: [
          { ticker: "BETTER", name: "Better", sector: "Technology", compositeScore: 85, source: "watchlist" },
        ],
      }),
    );
    expect(report.alternatives.length).toBeGreaterThanOrEqual(1);
  });

  it("zelfde input → identieke output (determinisme)", () => {
    const a = buildWatchlistIntelligenceReport(makeInput());
    const b = buildWatchlistIntelligenceReport(makeInput());
    expect(a).toEqual(b);
  });

  it("sources-list reflecteert beschikbare data", () => {
    const report = buildWatchlistIntelligenceReport(makeInput());
    expect(report.sources).toContain("factor-engine");
    expect(report.sources).toContain("fundamentals");
  });
});
