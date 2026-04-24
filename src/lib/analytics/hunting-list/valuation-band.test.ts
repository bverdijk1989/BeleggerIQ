import { describe, expect, it } from "vitest";

import type { FundamentalsSnapshot } from "@/types/factor";

import { detectValuationBand } from "./valuation-band";

const NOW = "2026-04-25T00:00:00.000Z";

function fundamentals(
  overrides: Partial<FundamentalsSnapshot> = {},
): FundamentalsSnapshot {
  return {
    ticker: "X",
    asOf: NOW,
    currency: "EUR",
    source: "test",
    ...overrides,
  };
}

describe("detectValuationBand — basisgedrag", () => {
  it("LOW wanneer exact op P/E-drempel", () => {
    const t = detectValuationBand({
      fundamentals: fundamentals({ pe: 15 }),
      valuationMaxPE: 15,
      valuationMinFcfYield: null,
      now: NOW,
    });
    expect(t).not.toBeNull();
    expect(t!.severity).toBe("LOW");
  });

  it("MEDIUM bij >10% onder P/E-drempel", () => {
    const t = detectValuationBand({
      fundamentals: fundamentals({ pe: 12 }), // ≤ 15 × 0.9
      valuationMaxPE: 15,
      valuationMinFcfYield: null,
      now: NOW,
    });
    expect(t!.severity).toBe("MEDIUM");
  });

  it("HIGH wanneer beide drempels doorbroken", () => {
    const t = detectValuationBand({
      fundamentals: fundamentals({ pe: 14, fcfYield: 0.07 }),
      valuationMaxPE: 15,
      valuationMinFcfYield: 0.05,
      now: NOW,
    });
    expect(t!.severity).toBe("HIGH");
  });

  it("MEDIUM bij FCF ≥ 1.1× drempel", () => {
    const t = detectValuationBand({
      fundamentals: fundamentals({ fcfYield: 0.07 }),
      valuationMaxPE: null,
      valuationMinFcfYield: 0.06,
      now: NOW,
    });
    expect(t!.severity).toBe("MEDIUM");
  });
});

describe("detectValuationBand — null-paden", () => {
  it("null als geen drempel geconfigureerd", () => {
    expect(
      detectValuationBand({
        fundamentals: fundamentals({ pe: 10 }),
        valuationMaxPE: null,
        valuationMinFcfYield: null,
        now: NOW,
      }),
    ).toBeNull();
  });

  it("null zonder fundamentals", () => {
    expect(
      detectValuationBand({
        fundamentals: null,
        valuationMaxPE: 15,
        valuationMinFcfYield: null,
        now: NOW,
      }),
    ).toBeNull();
  });

  it("null wanneer drempel niet doorbroken", () => {
    expect(
      detectValuationBand({
        fundamentals: fundamentals({ pe: 20 }),
        valuationMaxPE: 15,
        valuationMinFcfYield: null,
        now: NOW,
      }),
    ).toBeNull();
  });

  it("null wanneer P/E geconfigureerd maar fundamentals alleen FCF heeft", () => {
    expect(
      detectValuationBand({
        fundamentals: fundamentals({ fcfYield: 0.08 }),
        valuationMaxPE: 15,
        valuationMinFcfYield: null,
        now: NOW,
      }),
    ).toBeNull();
  });
});

describe("detectValuationBand — metadata", () => {
  it("rationale vermeldt welke drempel is doorbroken", () => {
    const t = detectValuationBand({
      fundamentals: fundamentals({ pe: 12, fcfYield: 0.04 }),
      valuationMaxPE: 15,
      valuationMinFcfYield: 0.05,
      now: NOW,
    })!;
    expect(t.rationale.some((r) => /P\/E/.test(r))).toBe(true);
    // Half-signaal wanneer FCF onder drempel
    expect(t.rationale.some((r) => /half-signaal/.test(r))).toBe(true);
  });

  it("snapshot bevat pe + fcfYield", () => {
    const t = detectValuationBand({
      fundamentals: fundamentals({ pe: 12, fcfYield: 0.08 }),
      valuationMaxPE: 15,
      valuationMinFcfYield: 0.05,
      price: 42,
      now: NOW,
    })!;
    expect(t.snapshot.pe).toBe(12);
    expect(t.snapshot.fcfYield).toBe(0.08);
    expect(t.snapshot.price).toBe(42);
  });
});
