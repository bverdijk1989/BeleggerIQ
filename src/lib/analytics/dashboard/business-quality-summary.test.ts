import { describe, expect, it } from "vitest";

import type { BusinessQualityResult } from "@/lib/analytics/business";
import type { Holding } from "@/types/portfolio";

import {
  summarizeBusinessQuality,
  type SummarizeBusinessQualityInput,
} from "./business-quality-summary";

const NOW = "2026-04-27T00:00:00.000Z";

// ============================================================
//  Fixtures
// ============================================================

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: "h",
    portfolioId: "p",
    ticker: "X",
    name: "X Inc",
    assetClass: "EQUITY",
    currency: "EUR",
    quantity: 10,
    avgCostPrice: 100,
    sector: "Technology",
    region: "Europe",
    ...overrides,
  };
}

function result(
  overrides: Partial<BusinessQualityResult> = {},
): BusinessQualityResult {
  return {
    ticker: "X",
    asOf: NOW,
    moatScore: 70,
    earningsStability: 70,
    capitalEfficiency: 70,
    businessQualityScore: 70,
    label: "COMPOUNDER",
    canHoldLongTerm: true,
    confidence: 0.8,
    rationale: {
      moat: ["Brede gracht — sterke gross margins"],
      earnings: ["Stabiele earnings 5y"],
      capital: ["ROIC > 15%"],
    },
    warnings: [],
    ...overrides,
  };
}

function defaultInput(
  overrides: Partial<SummarizeBusinessQualityInput> = {},
): SummarizeBusinessQualityInput {
  const holdings = [holding({ ticker: "X" })];
  return {
    results: [result()],
    holdings,
    marketValueByTicker: new Map([["X", 10_000]]),
    totalValue: 100_000,
    ...overrides,
  };
}

// ============================================================
//  Tests
// ============================================================

describe("summarizeBusinessQuality", () => {
  it("compounder met hoge score komt in strongest", () => {
    const summary = summarizeBusinessQuality(defaultInput());
    expect(summary.strongestBusinesses.length).toBe(1);
    expect(summary.strongestBusinesses[0]?.ticker).toBe("X");
    expect(summary.strongestBusinesses[0]?.labelNL).toBe("Langetermijnhouder");
  });

  it("speculatieve positie met materieel gewicht (≥ 5%) komt in speculativeWarnings", () => {
    const input = defaultInput({
      results: [
        result({
          ticker: "SPEC",
          businessQualityScore: 30,
          label: "SPECULATIVE",
          canHoldLongTerm: false,
          confidence: 0.6,
        }),
      ],
      holdings: [holding({ ticker: "SPEC" })],
      marketValueByTicker: new Map([["SPEC", 10_000]]),
    });
    const summary = summarizeBusinessQuality(input);
    expect(summary.speculativeWarnings[0]?.ticker).toBe("SPEC");
    expect(summary.speculativeWarnings[0]?.labelNL).toBe("Speculatief");
  });

  it("cyclische positie met materieel gewicht komt ook in speculativeWarnings", () => {
    const input = defaultInput({
      results: [
        result({
          ticker: "CYC",
          businessQualityScore: 55,
          label: "CYCLICAL",
          canHoldLongTerm: false,
          confidence: 0.6,
        }),
      ],
      holdings: [holding({ ticker: "CYC", sector: "Energy" })],
      marketValueByTicker: new Map([["CYC", 8_000]]),
    });
    const summary = summarizeBusinessQuality(input);
    expect(summary.speculativeWarnings[0]?.ticker).toBe("CYC");
    expect(summary.speculativeWarnings[0]?.labelNL).toBe("Cyclisch");
  });

  it("ETF wordt overgeslagen — geen business-quality voor mandjes", () => {
    const input = defaultInput({
      results: [result({ ticker: "VWCE" })],
      holdings: [holding({ ticker: "VWCE", assetClass: "ETF" })],
      marketValueByTicker: new Map([["VWCE", 50_000]]),
    });
    const summary = summarizeBusinessQuality(input);
    expect(summary.evaluatedCount).toBe(0);
    expect(summary.skippedCount).toBe(1);
    expect(summary.strongestBusinesses).toEqual([]);
    expect(summary.warnings.length).toBeGreaterThan(0);
  });

  it("zwakke positie (score ≤ 50) komt in weakest", () => {
    const input = defaultInput({
      results: [
        result({
          ticker: "WEAK",
          businessQualityScore: 35,
          label: "SPECULATIVE",
          canHoldLongTerm: false,
          confidence: 0.4,
        }),
      ],
      holdings: [holding({ ticker: "WEAK" })],
      marketValueByTicker: new Map([["WEAK", 1_000]]),
    });
    const summary = summarizeBusinessQuality(input);
    expect(summary.weakestBusinesses[0]?.ticker).toBe("WEAK");
  });

  it("longTermHoldCandidates wordt gesorteerd op weight desc", () => {
    const input = defaultInput({
      results: [
        result({ ticker: "A", businessQualityScore: 75 }),
        result({ ticker: "B", businessQualityScore: 80 }),
      ],
      holdings: [holding({ ticker: "A" }), holding({ ticker: "B" })],
      marketValueByTicker: new Map([
        ["A", 5_000],
        ["B", 20_000],
      ]),
    });
    const summary = summarizeBusinessQuality(input);
    expect(summary.longTermHoldCandidates.map((c) => c.ticker)).toEqual([
      "B",
      "A",
    ]);
  });

  it("uncoveredWeight + warning bij grote dekking gat", () => {
    const input = defaultInput({
      results: [
        result({
          ticker: "LOW",
          confidence: 0.1,
          businessQualityScore: 45,
          label: "CYCLICAL",
          canHoldLongTerm: false,
        }),
      ],
      holdings: [holding({ ticker: "LOW" })],
      marketValueByTicker: new Map([["LOW", 40_000]]),
    });
    const summary = summarizeBusinessQuality(input);
    expect(summary.uncoveredWeight).toBeGreaterThan(0);
    expect(summary.warnings.join(" ")).toContain("portefeuille");
  });

  it("topN configureerbaar", () => {
    const input = defaultInput({
      results: [
        result({ ticker: "A", businessQualityScore: 80 }),
        result({ ticker: "B", businessQualityScore: 78 }),
        result({ ticker: "C", businessQualityScore: 75 }),
        result({ ticker: "D", businessQualityScore: 72 }),
      ],
      holdings: ["A", "B", "C", "D"].map((t) => holding({ ticker: t })),
      marketValueByTicker: new Map([
        ["A", 1000],
        ["B", 1000],
        ["C", 1000],
        ["D", 1000],
      ]),
      topN: 2,
    });
    const summary = summarizeBusinessQuality(input);
    expect(summary.strongestBusinesses.length).toBe(2);
  });

  it("speculative onder 5% weight wordt niet als warning getoond", () => {
    const input = defaultInput({
      results: [
        result({
          ticker: "TINY",
          label: "SPECULATIVE",
          businessQualityScore: 25,
          canHoldLongTerm: false,
        }),
      ],
      holdings: [holding({ ticker: "TINY" })],
      marketValueByTicker: new Map([["TINY", 1_000]]),
      totalValue: 100_000,
    });
    const summary = summarizeBusinessQuality(input);
    expect(summary.speculativeWarnings).toEqual([]);
  });

  it("labelNL mapping: COMPOUNDER → 'Sterk bedrijf' wanneer niet 10y-houder", () => {
    const input = defaultInput({
      results: [
        result({
          ticker: "COMP",
          businessQualityScore: 72,
          label: "COMPOUNDER",
          canHoldLongTerm: false,
        }),
      ],
      holdings: [holding({ ticker: "COMP" })],
      marketValueByTicker: new Map([["COMP", 5_000]]),
    });
    const summary = summarizeBusinessQuality(input);
    expect(summary.strongestBusinesses[0]?.labelNL).toBe("Sterk bedrijf");
  });

  it("topRationale uit pillar met hoogste sub-score", () => {
    const input = defaultInput({
      results: [
        result({
          rationale: {
            moat: ["Moat-bullet"],
            earnings: ["Earnings-bullet"],
            capital: ["Capital-bullet"],
          },
          moatScore: 50,
          earningsStability: 90,
          capitalEfficiency: 70,
        }),
      ],
    });
    const summary = summarizeBusinessQuality(input);
    expect(summary.strongestBusinesses[0]?.topRationale).toBe(
      "Earnings-bullet",
    );
  });

  it("REIT telt mee als evaluable", () => {
    const input = defaultInput({
      results: [result({ ticker: "REIT" })],
      holdings: [holding({ ticker: "REIT", assetClass: "REIT" })],
      marketValueByTicker: new Map([["REIT", 10_000]]),
    });
    const summary = summarizeBusinessQuality(input);
    expect(summary.evaluatedCount).toBe(1);
  });

  it("lege portefeuille → lege output + warning", () => {
    const summary = summarizeBusinessQuality({
      results: [],
      holdings: [],
      marketValueByTicker: new Map(),
      totalValue: 0,
    });
    expect(summary.strongestBusinesses).toEqual([]);
    expect(summary.warnings.length).toBeGreaterThan(0);
  });

  it("determinisme: identieke input → identieke output", () => {
    const input = defaultInput();
    expect(summarizeBusinessQuality(input)).toEqual(
      summarizeBusinessQuality(input),
    );
  });

  it("alle items hebben confidence ∈ [0,1]", () => {
    const summary = summarizeBusinessQuality(defaultInput());
    for (const item of [
      ...summary.strongestBusinesses,
      ...summary.weakestBusinesses,
      ...summary.longTermHoldCandidates,
      ...summary.speculativeWarnings,
    ]) {
      expect(item.confidence).toBeGreaterThanOrEqual(0);
      expect(item.confidence).toBeLessThanOrEqual(1);
    }
  });
});
