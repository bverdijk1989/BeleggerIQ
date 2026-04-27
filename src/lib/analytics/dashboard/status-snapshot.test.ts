import { describe, expect, it } from "vitest";

import type { BenchmarkReport, TaxReport } from "@/lib/analytics";
import type { MarketRegimeScore } from "@/types/regime";
import type { PortfolioRiskSummary } from "@/types/risk";
import type {
  PortfolioHealthSummary,
  PortfolioSummary,
} from "@/types/summary";

import {
  buildPortfolioStatusSnapshot,
  type BuildPortfolioStatusInput,
} from "./status-snapshot";

const NOW = "2026-04-27T00:00:00.000Z";

// ============================================================
//  Fixtures
// ============================================================

function summary(overrides: Partial<PortfolioSummary> = {}): PortfolioSummary {
  return {
    portfolioId: "p",
    baseCurrency: "EUR",
    totalValue: 100_000,
    totalCost: 90_000,
    cashBalance: 5_000,
    unrealizedPnl: 10_000,
    unrealizedPnlPct: 0.1,
    positionCount: 8,
    largestPosition: null,
    topPositions: [],
    allocationByAssetClass: [],
    allocationBySector: [],
    allocationByRegion: [],
    allocationByCurrency: [],
    ...overrides,
  };
}

function health(
  overrides: Partial<PortfolioHealthSummary> = {},
): PortfolioHealthSummary {
  return {
    portfolioId: "p",
    asOf: NOW,
    grade: "B",
    score: 72,
    diversificationScore: 70,
    qualityScore: 70,
    riskAlignmentScore: 70,
    factorAlignmentScore: 70,
    signals: [],
    ...overrides,
  };
}

function risk(
  overrides: Partial<PortfolioRiskSummary> = {},
): PortfolioRiskSummary {
  return {
    portfolioId: "p",
    asOf: NOW,
    overallSeverity: "moderate",
    concentrationHhi: 0.1,
    largestPositionWeight: 0.1,
    sectorConcentrationHhi: 0.1,
    regionConcentrationHhi: 0.1,
    exposures: { byAssetClass: [], bySector: [], byRegion: [] },
    positions: [],
    flags: [],
    ...overrides,
  };
}

function benchmark(alpha: number, monthsObserved: number = 12): BenchmarkReport {
  return {
    generatedAt: NOW,
    performance: {
      benchmark: {
        id: "MSCI_WORLD",
        label: "MSCI World",
        ticker: "IWDA.AS",
        usedFallback: false,
      },
      periodStart: "2024-01",
      periodEnd: "2025-01",
      monthsObserved,
      portfolioReturn: 0.1 + alpha,
      benchmarkReturn: 0.1,
      alpha,
      trackingError: 0.04,
      informationRatio: 0.5,
      portfolioSeries: [],
      benchmarkSeries: [],
      warnings: [],
    },
    attribution: {
      sectors: [],
      factors: [],
      stocks: [],
      totalSectorContribution: 0,
      totalFactorContribution: 0,
      totalStockContribution: 0,
      residualAlpha: 0,
    },
    verdict: "test",
  };
}

function tax(netReturn: number): TaxReport {
  return {
    generatedAt: NOW,
    baseCurrency: "EUR",
    taxYear: 2025,
    result: {
      grossReturn: netReturn + 0.02,
      taxImpact: -0.02,
      netReturn,
      amounts: {
        grossReturnAmount: 0,
        taxAmount: 0,
        netReturnAmount: 0,
        box3Tax: 0,
        dividendTax: 0,
        foreignWht: 0,
      },
      box3: {
        taxableWealth: 0,
        exemption: 0,
        notionalReturnRate: 0.0604,
        notionalIncome: 0,
        taxRate: 0.36,
        taxOwed: 0,
        effectiveTaxOnPortfolio: 0,
        rationale: [],
      },
      dividend: {
        grossDividend: 0,
        foreignWithholdingTax: 0,
        dutchDividendTax: 0,
        creditableTax: 0,
        netDividend: 0,
        effectiveTaxRate: 0,
        perHolding: [],
      },
      warnings: [],
      confidence: 0.8,
    },
  };
}

function regime(
  stance: MarketRegimeScore["stance"],
  score = 50,
): MarketRegimeScore {
  return {
    stance,
    score,
    confidence: 0.7,
  } as MarketRegimeScore;
}

function input(
  overrides: Partial<BuildPortfolioStatusInput> = {},
): BuildPortfolioStatusInput {
  return {
    summary: summary(),
    health: health(),
    risk: risk(),
    benchmark: null,
    tax: null,
    regime: null,
    ...overrides,
  };
}

// ============================================================
//  Tests
// ============================================================

describe("buildPortfolioStatusSnapshot — 5 cards in vaste volgorde", () => {
  it("retourneert exact 5 cards in de juiste volgorde", () => {
    const r = buildPortfolioStatusSnapshot(input());
    expect(r.cards.map((c) => c.id)).toEqual([
      "TOTAL_VALUE",
      "HEALTH_SCORE",
      "VS_BENCHMARK",
      "NET_RETURN",
      "MARKET_REGIME",
    ]);
  });

  it("base currency wordt doorgegeven", () => {
    const r = buildPortfolioStatusSnapshot(input());
    expect(r.baseCurrency).toBe("EUR");
  });
});

describe("Card 1: Totale portefeuillewaarde", () => {
  it("GOOD bij P&L ≥ +5%", () => {
    const r = buildPortfolioStatusSnapshot(
      input({ summary: summary({ unrealizedPnlPct: 0.08 }) }),
    );
    expect(r.cards[0]!.status).toBe("GOOD");
    expect(r.cards[0]!.subValue).toMatch(/\+8/);
  });

  it("WARNING bij P&L ≤ -5%", () => {
    const r = buildPortfolioStatusSnapshot(
      input({ summary: summary({ unrealizedPnlPct: -0.07 }) }),
    );
    expect(r.cards[0]!.status).toBe("WARNING");
  });

  it("CRITICAL bij P&L ≤ -15%", () => {
    const r = buildPortfolioStatusSnapshot(
      input({ summary: summary({ unrealizedPnlPct: -0.18 }) }),
    );
    expect(r.cards[0]!.status).toBe("CRITICAL");
  });

  it("NEUTRAL bij P&L tussen -5% en +5%", () => {
    const r = buildPortfolioStatusSnapshot(
      input({ summary: summary({ unrealizedPnlPct: 0.02 }) }),
    );
    expect(r.cards[0]!.status).toBe("NEUTRAL");
  });

  it("waarde geformatteerd in EUR met 0 decimals", () => {
    const r = buildPortfolioStatusSnapshot(
      input({ summary: summary({ totalValue: 123_456 }) }),
    );
    expect(r.cards[0]!.value).toMatch(/€/);
    expect(r.cards[0]!.value).toMatch(/123/);
  });
});

describe("Card 2: Health score", () => {
  it("GOOD bij grade A of B", () => {
    expect(
      buildPortfolioStatusSnapshot(input({ health: health({ grade: "A", score: 90 }) }))
        .cards[1]!.status,
    ).toBe("GOOD");
    expect(
      buildPortfolioStatusSnapshot(input({ health: health({ grade: "B", score: 75 }) }))
        .cards[1]!.status,
    ).toBe("GOOD");
  });

  it("WARNING bij grade D, CRITICAL bij F", () => {
    expect(
      buildPortfolioStatusSnapshot(input({ health: health({ grade: "D", score: 35 }) }))
        .cards[1]!.status,
    ).toBe("WARNING");
    expect(
      buildPortfolioStatusSnapshot(input({ health: health({ grade: "F", score: 15 }) }))
        .cards[1]!.status,
    ).toBe("CRITICAL");
  });

  it("value bevat grade + score-fractie", () => {
    const r = buildPortfolioStatusSnapshot(
      input({ health: health({ grade: "B", score: 72 }) }),
    );
    expect(r.cards[1]!.value).toBe("B · 72/100");
  });
});

describe("Card 3: vs benchmark", () => {
  it("GOOD bij alpha ≥ +2%", () => {
    const r = buildPortfolioStatusSnapshot(
      input({ benchmark: benchmark(0.04) }),
    );
    expect(r.cards[2]!.status).toBe("GOOD");
    expect(r.cards[2]!.value).toMatch(/\+4/);
  });

  it("WARNING bij alpha tussen -5% en -2%", () => {
    const r = buildPortfolioStatusSnapshot(
      input({ benchmark: benchmark(-0.03) }),
    );
    expect(r.cards[2]!.status).toBe("WARNING");
  });

  it("CRITICAL bij alpha < -5%", () => {
    const r = buildPortfolioStatusSnapshot(
      input({ benchmark: benchmark(-0.08) }),
    );
    expect(r.cards[2]!.status).toBe("CRITICAL");
  });

  it("missing data fallback bij geen benchmark", () => {
    const r = buildPortfolioStatusSnapshot(input({ benchmark: null }));
    expect(r.cards[2]!.value).toBe("—");
    expect(r.cards[2]!.missingDataReason).toBeDefined();
    expect(r.cards[2]!.confidence).toBeLessThan(0.5);
  });

  it("missing data bij 0 maanden observed", () => {
    const r = buildPortfolioStatusSnapshot(
      input({ benchmark: benchmark(0.05, 0) }),
    );
    expect(r.cards[2]!.missingDataReason).toMatch(/overlappende/);
  });

  it("confidence schaalt met monthsObserved", () => {
    const lo = buildPortfolioStatusSnapshot(input({ benchmark: benchmark(0, 6) }))
      .cards[2]!.confidence;
    const hi = buildPortfolioStatusSnapshot(input({ benchmark: benchmark(0, 36) }))
      .cards[2]!.confidence;
    expect(hi).toBeGreaterThan(lo);
  });
});

describe("Card 4: Netto rendement", () => {
  it("GOOD bij netto ≥ 4%", () => {
    expect(
      buildPortfolioStatusSnapshot(input({ tax: tax(0.06) })).cards[3]!.status,
    ).toBe("GOOD");
  });

  it("NEUTRAL bij netto 0..4%", () => {
    expect(
      buildPortfolioStatusSnapshot(input({ tax: tax(0.02) })).cards[3]!.status,
    ).toBe("NEUTRAL");
  });

  it("WARNING bij netto -5% .. 0", () => {
    expect(
      buildPortfolioStatusSnapshot(input({ tax: tax(-0.03) })).cards[3]!.status,
    ).toBe("WARNING");
  });

  it("CRITICAL bij netto < -5%", () => {
    expect(
      buildPortfolioStatusSnapshot(input({ tax: tax(-0.07) })).cards[3]!.status,
    ).toBe("CRITICAL");
  });

  it("missing data fallback bij geen tax-report", () => {
    const r = buildPortfolioStatusSnapshot(input({ tax: null }));
    expect(r.cards[3]!.value).toBe("—");
    expect(r.cards[3]!.missingDataReason).toMatch(/Tax-engine/i);
  });
});

describe("Card 5: Marktregime", () => {
  it("GOOD bij RISK_ON + lage risk-severity", () => {
    const r = buildPortfolioStatusSnapshot(
      input({ regime: regime("RISK_ON", 70), risk: risk({ overallSeverity: "low" }) }),
    );
    expect(r.cards[4]!.status).toBe("GOOD");
  });

  it("WARNING bij DEFENSIVE regime", () => {
    const r = buildPortfolioStatusSnapshot(
      input({ regime: regime("DEFENSIVE", 25) }),
    );
    expect(r.cards[4]!.status).toBe("WARNING");
  });

  it("CRITICAL bij DEFENSIVE + critical risk", () => {
    const r = buildPortfolioStatusSnapshot(
      input({
        regime: regime("DEFENSIVE", 25),
        risk: risk({ overallSeverity: "critical" }),
      }),
    );
    expect(r.cards[4]!.status).toBe("CRITICAL");
  });

  it("missing data fallback bij null regime", () => {
    const r = buildPortfolioStatusSnapshot(input({ regime: null }));
    expect(r.cards[4]!.value).toBe("—");
    expect(r.cards[4]!.missingDataReason).toBeDefined();
  });
});

describe("buildPortfolioStatusSnapshot — determinisme", () => {
  it("identieke input geeft identieke output", () => {
    const args = input({
      benchmark: benchmark(0.03, 24),
      tax: tax(0.05),
      regime: regime("NEUTRAL", 55),
    });
    const a = buildPortfolioStatusSnapshot(args);
    const b = buildPortfolioStatusSnapshot(args);
    expect(a).toEqual(b);
  });

  it("alle cards hebben confidence ∈ [0, 1]", () => {
    const args = input({
      benchmark: benchmark(0.01, 12),
      tax: tax(0.03),
      regime: regime("NEUTRAL"),
    });
    const r = buildPortfolioStatusSnapshot(args);
    for (const card of r.cards) {
      expect(card.confidence).toBeGreaterThanOrEqual(0);
      expect(card.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("alle cards hebben non-empty explanation", () => {
    const r = buildPortfolioStatusSnapshot(input());
    for (const card of r.cards) {
      expect(card.explanation.length).toBeGreaterThan(0);
    }
  });
});
