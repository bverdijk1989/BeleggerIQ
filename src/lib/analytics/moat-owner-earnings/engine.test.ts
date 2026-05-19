import { describe, expect, it } from "vitest";

import { buildMoatReport } from "./engine";
import { COMPONENT_ORDER, COMPONENT_WEIGHTS } from "./types";
import type { FundamentalsSnapshot } from "@/types/factor";

/**
 * Module 32 — Moat & Owner Earnings Engine tests.
 *
 * Pure-function engine — deterministisch. Tests dekken:
 *  - 10 componenten in vaste volgorde
 *  - GEEN nep-score 50 bij missing data (score=null, niet 50)
 *  - Composite null bij coverage < 0.4
 *  - Confidence-tier-mapping
 *  - Buffett-conform: owner-earnings + ROIC + low D/E
 *  - Risicoanalist: zwakke balanskwaliteit warning
 *  - Disclaimer aanwezig
 */

const ASOF = "2026-05-19T00:00:00.000Z";

function f(overrides: Partial<FundamentalsSnapshot> = {}): FundamentalsSnapshot {
  return {
    ticker: "TEST",
    asOf: ASOF,
    currency: "USD",
    ...overrides,
  };
}

describe("buildMoatReport — shape", () => {
  it("produceert altijd 10 componenten in vaste volgorde", () => {
    const r = buildMoatReport({ ticker: "X", asOf: ASOF, fundamentals: null });
    expect(r.components).toHaveLength(10);
    expect(r.components.map((c) => c.key)).toEqual(COMPONENT_ORDER);
  });

  it("disclaimer altijd aanwezig", () => {
    const r = buildMoatReport({ ticker: "X", asOf: ASOF, fundamentals: null });
    expect(r.disclaimer).toMatch(/moat|kwalitatief|onderzoek/i);
  });

  it("weights sommeren tot 1.0 (spec-conformance)", () => {
    const sum = Object.values(COMPONENT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });
});

describe("Geen nep-score bij missing data — kerneis", () => {
  it("null fundamentals → alle scoring-componenten score=null (behalve data_coverage)", () => {
    const r = buildMoatReport({ ticker: "X", asOf: ASOF, fundamentals: null });
    // data_coverage krijgt wel een lage score; alle anderen null.
    for (const c of r.components) {
      if (c.key === "data_coverage") continue;
      expect(c.score).toBeNull();
    }
  });

  it("composite null + grade='unknown' bij coverage < 0.4", () => {
    const r = buildMoatReport({ ticker: "X", asOf: ASOF, fundamentals: null });
    expect(r.compositeScore).toBeNull();
    expect(r.grade).toBe("unknown");
  });

  it("partial fundamentals (alleen ROIC) → andere componenten null, geen 50-fake", () => {
    const r = buildMoatReport({
      ticker: "X",
      asOf: ASOF,
      fundamentals: f({ roic: 0.2 }),
    });
    const fcf = r.components.find((c) => c.key === "fcf_quality")!;
    const debt = r.components.find((c) => c.key === "debt_sustainability")!;
    expect(fcf.score).toBeNull();
    expect(debt.score).toBeNull();
    const roc = r.components.find((c) => c.key === "return_on_capital")!;
    expect(roc.score).not.toBeNull();
    expect(roc.score!).toBeGreaterThan(50);
  });
});

describe("Component scoring — return on capital", () => {
  it("ROIC 22% → strong (>70)", () => {
    const r = buildMoatReport({
      ticker: "X",
      asOf: ASOF,
      fundamentals: f({ roic: 0.22 }),
    });
    const roc = r.components.find((c) => c.key === "return_on_capital")!;
    expect(roc.score!).toBeGreaterThan(70);
    expect(roc.rationale.toLowerCase()).toContain("sterke roic");
  });

  it("ROIC 3% → weak (<40)", () => {
    const r = buildMoatReport({
      ticker: "X",
      asOf: ASOF,
      fundamentals: f({ roic: 0.03 }),
    });
    const roc = r.components.find((c) => c.key === "return_on_capital")!;
    expect(roc.score!).toBeLessThanOrEqual(40);
  });

  it("ROIC ontbreekt maar ROE aanwezig → fallback met disclaimer", () => {
    const r = buildMoatReport({
      ticker: "X",
      asOf: ASOF,
      fundamentals: f({ roe: 0.18 }),
    });
    const roc = r.components.find((c) => c.key === "return_on_capital")!;
    expect(roc.score).not.toBeNull();
    expect(roc.rationale.toLowerCase()).toContain("roic ontbreekt");
  });
});

describe("Component scoring — owner earnings", () => {
  it("Negatieve FCF-yield → score 25 + rode flag in rationale", () => {
    const r = buildMoatReport({
      ticker: "X",
      asOf: ASOF,
      fundamentals: f({ fcfYield: -0.02, netMargin: 0.1 }),
    });
    const oe = r.components.find((c) => c.key === "owner_earnings")!;
    expect(oe.score).toBe(25);
    expect(oe.rationale.toLowerCase()).toMatch(/rode flag|negatief/);
  });

  it("FCF-yield 8% + sterke marges → high score", () => {
    const r = buildMoatReport({
      ticker: "X",
      asOf: ASOF,
      fundamentals: f({ fcfYield: 0.08, netMargin: 0.2 }),
    });
    const oe = r.components.find((c) => c.key === "owner_earnings")!;
    expect(oe.score!).toBeGreaterThanOrEqual(75);
  });

  it("FCF-yield 4% + zwakke marges → bonus negatief", () => {
    const r = buildMoatReport({
      ticker: "X",
      asOf: ASOF,
      fundamentals: f({ fcfYield: 0.04, netMargin: 0.02 }),
    });
    const oe = r.components.find((c) => c.key === "owner_earnings")!;
    // baseScore ~50, malus -8 → ~42
    expect(oe.score!).toBeLessThanOrEqual(50);
  });
});

describe("Component scoring — debt sustainability (risicoanalist-laag)", () => {
  it("Lage schuld + hoge rentedekking → solid", () => {
    const r = buildMoatReport({
      ticker: "X",
      asOf: ASOF,
      fundamentals: f({ debtToEquity: 0.2, interestCoverage: 12 }),
    });
    const debt = r.components.find((c) => c.key === "debt_sustainability")!;
    expect(debt.score!).toBeGreaterThan(70);
  });

  it("Hoge schuld → score laag + warning in report", () => {
    const r = buildMoatReport({
      ticker: "X",
      asOf: ASOF,
      fundamentals: f({ debtToEquity: 2.5, interestCoverage: 1.5 }),
    });
    const debt = r.components.find((c) => c.key === "debt_sustainability")!;
    expect(debt.score!).toBeLessThanOrEqual(40);
    expect(
      r.warnings.some((w) => /balanskwaliteit|schuld|rentedekking/i.test(w)),
    ).toBe(true);
  });
});

describe("Component scoring — dividend safety", () => {
  it("Geen dividend → component overgeslagen (score=null, niet 0)", () => {
    const r = buildMoatReport({
      ticker: "X",
      asOf: ASOF,
      fundamentals: f({ roic: 0.2 }),
      hasDividend: false,
    });
    const div = r.components.find((c) => c.key === "dividend_safety")!;
    expect(div.score).toBeNull();
    expect(div.rationale.toLowerCase()).toMatch(/geen dividend|overgeslagen/);
  });

  it("Hoge payout-ratio → laag (dividend kwetsbaar)", () => {
    const r = buildMoatReport({
      ticker: "X",
      asOf: ASOF,
      fundamentals: f({
        dividendYield: 0.05,
        payoutRatio: 0.95,
        dividendGrowth5y: -0.02,
      }),
    });
    const div = r.components.find((c) => c.key === "dividend_safety")!;
    expect(div.score!).toBeLessThanOrEqual(40);
  });

  it("Lage payout + groei → veilig", () => {
    const r = buildMoatReport({
      ticker: "X",
      asOf: ASOF,
      fundamentals: f({
        dividendYield: 0.03,
        payoutRatio: 0.35,
        dividendGrowth5y: 0.07,
      }),
    });
    const div = r.components.find((c) => c.key === "dividend_safety")!;
    expect(div.score!).toBeGreaterThan(65);
  });
});

describe("Composite + grade + confidence", () => {
  function highQualityFundamentals(): FundamentalsSnapshot {
    return f({
      roic: 0.22,
      roe: 0.28,
      fcfYield: 0.07,
      debtToEquity: 0.3,
      interestCoverage: 15,
      grossMargin: 0.55,
      operatingMargin: 0.28,
      netMargin: 0.22,
      epsGrowth5y: 0.12,
      revenueGrowth5y: 0.08,
      dividendYield: 0.02,
      payoutRatio: 0.4,
      dividendGrowth5y: 0.08,
    });
  }

  it("Buffett-stijl asset → grade='wide' + composite > 75", () => {
    const r = buildMoatReport({
      ticker: "MSFT",
      asOf: ASOF,
      fundamentals: highQualityFundamentals(),
    });
    expect(r.compositeScore!).toBeGreaterThan(75);
    expect(r.grade).toBe("wide");
    expect(r.confidence).toBe("high");
  });

  it("Zwakke fundamentals → grade='weak' + warnings", () => {
    const r = buildMoatReport({
      ticker: "X",
      asOf: ASOF,
      fundamentals: f({
        roic: 0.02,
        fcfYield: -0.01,
        debtToEquity: 3.0,
        interestCoverage: 1,
        grossMargin: 0.12,
        operatingMargin: 0.02,
        epsGrowth5y: -0.08,
      }),
    });
    expect(r.grade).toBe("weak");
    // Owner-earnings is negatief → kritiek
    expect(
      r.warnings.some((w) => /owner-earnings|negatief|kritiek/i.test(w)),
    ).toBe(true);
  });

  it("Partial data — coverage < 0.4 → composite null + grade 'unknown'", () => {
    const r = buildMoatReport({
      ticker: "X",
      asOf: ASOF,
      fundamentals: f({ roic: 0.2 }),
    });
    expect(r.coverage).toBeLessThan(0.4);
    expect(r.compositeScore).toBeNull();
    expect(r.grade).toBe("unknown");
  });

  it("Confidence-tier-mapping", () => {
    const high = buildMoatReport({
      ticker: "X",
      asOf: ASOF,
      fundamentals: f({
        roic: 0.2,
        fcfYield: 0.05,
        debtToEquity: 0.5,
        grossMargin: 0.4,
        operatingMargin: 0.15,
        epsGrowth5y: 0.1,
        revenueGrowth5y: 0.08,
        interestCoverage: 8,
        dividendYield: 0.02,
        payoutRatio: 0.4,
      }),
    });
    expect(high.confidence).toBe("high");

    const low = buildMoatReport({
      ticker: "X",
      asOf: ASOF,
      fundamentals: f({ roic: 0.15, fcfYield: 0.04 }),
    });
    expect(["low", "medium", "insufficient"]).toContain(low.confidence);
  });
});

describe("Data coverage component", () => {
  it("Geen fundamentals → coverage score laag + warning bij coverage < 0.4", () => {
    const r = buildMoatReport({ ticker: "X", asOf: ASOF, fundamentals: null });
    const dc = r.components.find((c) => c.key === "data_coverage")!;
    expect(dc.score!).toBeLessThan(15);
    expect(
      r.warnings.some((w) => /datadekking|coverage/i.test(w)),
    ).toBe(true);
  });

  it("Volledige fundamentals → coverage > 80", () => {
    const r = buildMoatReport({
      ticker: "X",
      asOf: ASOF,
      fundamentals: f({
        roic: 0.2,
        roe: 0.25,
        fcfYield: 0.05,
        debtToEquity: 0.5,
        interestCoverage: 8,
        grossMargin: 0.4,
        operatingMargin: 0.15,
        netMargin: 0.12,
        epsGrowth5y: 0.1,
        revenueGrowth5y: 0.08,
        dividendYield: 0.02,
        payoutRatio: 0.4,
      }),
    });
    const dc = r.components.find((c) => c.key === "data_coverage")!;
    expect(dc.score!).toBeGreaterThanOrEqual(80);
  });
});

describe("Module 32 — spec-conformance + risicoanalist", () => {
  it("Disclaimer expliciet 'geen koop-/verkoop-signaal'", () => {
    const r = buildMoatReport({ ticker: "X", asOf: ASOF, fundamentals: null });
    expect(r.disclaimer).toMatch(/geen.*koerswinst|geen.*verkoop|geen.*signaal/i);
  });

  it("Owner-earnings negatief → warning genoemd", () => {
    const r = buildMoatReport({
      ticker: "X",
      asOf: ASOF,
      fundamentals: f({ fcfYield: -0.03, netMargin: 0.05 }),
    });
    expect(
      r.warnings.some((w) => /owner-earnings/i.test(w)),
    ).toBe(true);
  });

  it("Zwakke balanskwaliteit → expliciete waarschuwing", () => {
    const r = buildMoatReport({
      ticker: "X",
      asOf: ASOF,
      fundamentals: f({ debtToEquity: 2.8, interestCoverage: 0.8 }),
    });
    expect(
      r.warnings.some((w) => /balanskwaliteit|schuld/i.test(w)),
    ).toBe(true);
  });

  it("Per component: inputsUsed + inputsMissing zijn arrays (audit-trail)", () => {
    const r = buildMoatReport({
      ticker: "X",
      asOf: ASOF,
      fundamentals: f({ roic: 0.2, fcfYield: 0.05 }),
    });
    for (const c of r.components) {
      expect(Array.isArray(c.inputsUsed)).toBe(true);
      expect(Array.isArray(c.inputsMissing)).toBe(true);
    }
  });
});
