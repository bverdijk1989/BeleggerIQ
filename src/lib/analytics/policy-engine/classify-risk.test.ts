import { describe, expect, it } from "vitest";

import type { InstrumentClassification } from "@/lib/analytics/instruments";

import { classifyInstrumentRisk } from "./classify-risk";

interface MakeClassificationOverrides {
  instrumentType?: InstrumentClassification["instrumentType"];
  confidence?: InstrumentClassification["confidence"];
  metadata?: Partial<InstrumentClassification["metadata"]>;
}

function makeClassification(
  overrides: MakeClassificationOverrides = {},
): InstrumentClassification {
  return {
    instrumentType: overrides.instrumentType ?? "SINGLE_STOCK",
    confidence: overrides.confidence ?? "HIGH",
    rationale: [],
    metadata: {
      isBroadMarket: false,
      sectorFocus: null,
      isIncomeFocused: false,
      incomeStrategy: null,
      isSpeculative: false,
      supportsFactorScoring: true,
      eligibleForWinnerRule: true,
      ...(overrides.metadata ?? {}),
    },
    classifiedAt: "2026-04-24T00:00:00.000Z",
  };
}

describe("classifyInstrumentRisk", () => {
  it("LEVERAGED_OR_INVERSE → HIGH (altijd)", () => {
    const r = classifyInstrumentRisk({
      holding: { volatility: 0.15 }, // zelfs met lage vol: HIGH
      classification: makeClassification({ instrumentType: "LEVERAGED_OR_INVERSE" }),
    });
    expect(r.level).toBe("HIGH");
  });

  it("CRYPTO → HIGH", () => {
    const r = classifyInstrumentRisk({
      holding: { volatility: undefined },
      classification: makeClassification({ instrumentType: "CRYPTO" }),
    });
    expect(r.level).toBe("HIGH");
  });

  it("isSpeculative (bv. theme-ETF) → HIGH", () => {
    const r = classifyInstrumentRisk({
      holding: { volatility: 0.2 },
      classification: makeClassification({
        instrumentType: "THEME_ETF",
        metadata: { isSpeculative: true },
      }),
    });
    expect(r.level).toBe("HIGH");
  });

  it("Volatility ≥ 0.40 → HIGH (overstijgt defensieve type)", () => {
    const r = classifyInstrumentRisk({
      holding: { volatility: 0.45 },
      classification: makeClassification({ instrumentType: "SINGLE_STOCK" }),
    });
    expect(r.level).toBe("HIGH");
    expect(r.rationale[0]).toMatch(/45/);
  });

  it("Volatility 0.30–0.40 → ELEVATED", () => {
    const r = classifyInstrumentRisk({
      holding: { volatility: 0.32 },
      classification: makeClassification({ instrumentType: "SINGLE_STOCK" }),
    });
    expect(r.level).toBe("ELEVATED");
  });

  it("CASH → LOW", () => {
    const r = classifyInstrumentRisk({
      holding: { volatility: undefined },
      classification: makeClassification({ instrumentType: "CASH" }),
    });
    expect(r.level).toBe("LOW");
  });

  it("BOND_ETF → LOW", () => {
    const r = classifyInstrumentRisk({
      holding: { volatility: undefined },
      classification: makeClassification({ instrumentType: "BOND_ETF" }),
    });
    expect(r.level).toBe("LOW");
  });

  it("Broad-market ETF (IWDA) → LOW", () => {
    const r = classifyInstrumentRisk({
      holding: { volatility: 0.15 },
      classification: makeClassification({
        instrumentType: "BROAD_MARKET_ETF",
        metadata: { isBroadMarket: true, supportsFactorScoring: false, eligibleForWinnerRule: true },
      }),
    });
    expect(r.level).toBe("LOW");
  });

  it("Single stock met normale vol → MODERATE", () => {
    const r = classifyInstrumentRisk({
      holding: { volatility: 0.18 },
      classification: makeClassification({ instrumentType: "SINGLE_STOCK" }),
    });
    expect(r.level).toBe("MODERATE");
  });

  it("SECTOR_ETF → ELEVATED (concentration bias)", () => {
    const r = classifyInstrumentRisk({
      holding: { volatility: undefined },
      classification: makeClassification({ instrumentType: "SECTOR_ETF" }),
    });
    expect(r.level).toBe("ELEVATED");
  });

  it("INCOME_ETF (covered-call) → MODERATE", () => {
    const r = classifyInstrumentRisk({
      holding: { volatility: 0.15 },
      classification: makeClassification({
        instrumentType: "INCOME_ETF",
        metadata: { isIncomeFocused: true, incomeStrategy: "covered-call" },
      }),
    });
    expect(r.level).toBe("MODERATE");
  });

  it("FACTOR_ETF → MODERATE", () => {
    const r = classifyInstrumentRisk({
      holding: { volatility: 0.17 },
      classification: makeClassification({ instrumentType: "FACTOR_ETF" }),
    });
    expect(r.level).toBe("MODERATE");
  });

  it("THEME_ETF zonder isSpeculative-flag → HIGH (narrative risk)", () => {
    // Defensive: zelfs zonder classifier-flag moeten themes HIGH zijn.
    const r = classifyInstrumentRisk({
      holding: { volatility: undefined },
      classification: makeClassification({
        instrumentType: "THEME_ETF",
        metadata: { isSpeculative: false }, // bewust false
      }),
    });
    expect(r.level).toBe("HIGH");
  });

  it("UNKNOWN / UNKNOWN_ETF → ELEVATED (voorzichtig zijn)", () => {
    expect(
      classifyInstrumentRisk({
        holding: { volatility: undefined },
        classification: makeClassification({ instrumentType: "UNKNOWN" }),
      }).level,
    ).toBe("ELEVATED");
    expect(
      classifyInstrumentRisk({
        holding: { volatility: undefined },
        classification: makeClassification({ instrumentType: "UNKNOWN_ETF" }),
      }).level,
    ).toBe("ELEVATED");
  });

  it("Non-finite volatility wordt genegeerd", () => {
    const r = classifyInstrumentRisk({
      holding: { volatility: NaN },
      classification: makeClassification({ instrumentType: "SINGLE_STOCK" }),
    });
    expect(r.level).toBe("MODERATE"); // valt terug op SINGLE_STOCK baseline
  });
});
