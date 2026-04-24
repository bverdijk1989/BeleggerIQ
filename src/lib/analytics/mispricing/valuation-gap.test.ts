import { describe, expect, it } from "vitest";

import type { FundamentalsSnapshot } from "@/types/factor";

import { detectValuationGap } from "./valuation-gap";

function fundamentals(
  overrides: Partial<FundamentalsSnapshot> = {},
): FundamentalsSnapshot {
  return {
    ticker: "X",
    asOf: "2026-04-24T00:00:00.000Z",
    currency: "EUR",
    source: "test",
    ...overrides,
  };
}

const NOW = "2026-04-24T00:00:00.000Z";

describe("detectValuationGap — happy paths", () => {
  it("triggert bij 30% P/E-discount t.o.v. benchmark", () => {
    const sig = detectValuationGap({
      ticker: "X",
      fundamentals: fundamentals({ pe: 14 }),
      benchmarkPE: 20,
      qualityScore: 75,
      now: NOW,
    });
    expect(sig).not.toBeNull();
    expect(sig!.type).toBe("valuation-gap");
    expect(sig!.mispricingScore).toBeGreaterThan(0);
    expect(sig!.expectedHoldingPeriodDays).toBe(365);
    expect(sig!.rationale.some((r) => /P\/E/.test(r))).toBe(true);
    expect(sig!.expiresAt > NOW).toBe(true);
  });

  it("triggert bij historische P/E-discount (5y median)", () => {
    const sig = detectValuationGap({
      ticker: "X",
      fundamentals: fundamentals({ pe: 12 }),
      benchmarkPE: 14, // kleine sector-discount
      historicalMedianPE: 20, // maar grote historical-discount
      now: NOW,
    });
    expect(sig).not.toBeNull();
    expect(
      sig!.rationale.some((r) => /5-jaar mediaan/.test(r)),
    ).toBe(true);
  });

  it("triggert bij hogere FCF-yield premium", () => {
    const sig = detectValuationGap({
      ticker: "X",
      fundamentals: fundamentals({ pe: 18, fcfYield: 0.08 }),
      benchmarkPE: 20, // onvoldoende P/E discount
      benchmarkFcfYield: 0.05, // wel FCF premium (+60%)
      now: NOW,
    });
    expect(sig).not.toBeNull();
    expect(sig!.rationale.some((r) => /FCF-yield/.test(r))).toBe(true);
  });

  it("sterker bij grotere discount + quality-bonus", () => {
    const narrow = detectValuationGap({
      ticker: "X",
      fundamentals: fundamentals({ pe: 14 }),
      benchmarkPE: 20,
      qualityScore: 40,
      now: NOW,
    })!;
    const wide = detectValuationGap({
      ticker: "X",
      fundamentals: fundamentals({ pe: 8 }),
      benchmarkPE: 20,
      qualityScore: 80,
      now: NOW,
    })!;
    expect(wide.mispricingScore).toBeGreaterThan(narrow.mispricingScore);
    expect(wide.confidence).toBeGreaterThan(narrow.confidence);
  });
});

describe("detectValuationGap — null-paden", () => {
  it("null zonder fundamentals", () => {
    expect(
      detectValuationGap({
        ticker: "X",
        fundamentals: null,
        benchmarkPE: 20,
        now: NOW,
      }),
    ).toBeNull();
  });

  it("null zonder benchmark én zonder historical median", () => {
    expect(
      detectValuationGap({
        ticker: "X",
        fundamentals: fundamentals({ pe: 14 }),
        now: NOW,
      }),
    ).toBeNull();
  });

  it("null bij discount onder drempel (-25%)", () => {
    expect(
      detectValuationGap({
        ticker: "X",
        fundamentals: fundamentals({ pe: 18 }),
        benchmarkPE: 20, // 10% discount, onvoldoende
        now: NOW,
      }),
    ).toBeNull();
  });

  it("null bij P/E ≤ 0 (afwezige winst)", () => {
    expect(
      detectValuationGap({
        ticker: "X",
        fundamentals: fundamentals({ pe: -5 }),
        benchmarkPE: 20,
        now: NOW,
      }),
    ).toBeNull();
  });
});

describe("detectValuationGap — risk-flags", () => {
  it("voegt earnings-deterioration-unknown toe bij onbekende quality", () => {
    const sig = detectValuationGap({
      ticker: "X",
      fundamentals: fundamentals({ pe: 12 }),
      benchmarkPE: 20,
      now: NOW,
    });
    expect(sig!.riskFlags.map((f) => f.code)).toContain(
      "earnings-deterioration-unknown",
    );
  });

  it("voegt altijd value-trap flag toe", () => {
    const sig = detectValuationGap({
      ticker: "X",
      fundamentals: fundamentals({ pe: 12 }),
      benchmarkPE: 20,
      qualityScore: 80,
      now: NOW,
    });
    expect(sig!.riskFlags.map((f) => f.code)).toContain("value-trap");
  });
});
