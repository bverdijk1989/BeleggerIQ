import type { FactorScore, FundamentalsSnapshot } from "@/types/factor";

import type { SignalFusionInput, SignalInstrumentContext } from "./input";

/**
 * Test-fixtures voor de Signal Fusion Engine. Niet voor productie.
 */

export function makeFactorScore(
  overrides: Partial<FactorScore["subScores"]> = {},
  options: Partial<Omit<FactorScore, "subScores">> = {},
): FactorScore {
  return {
    ticker: "TEST",
    asOf: "2026-05-10",
    composite: 65,
    confidence: 0.8,
    subScores: {
      value: 60,
      quality: 70,
      momentum: 55,
      lowVol: 60,
      ...overrides,
    },
    ...options,
  };
}

export function makeFundamentals(
  overrides: Partial<FundamentalsSnapshot> = {},
): FundamentalsSnapshot {
  return {
    ticker: "TEST",
    asOf: "2026-05-10",
    currency: "EUR",
    pe: 18,
    fcfYield: 0.055,
    roic: 0.18,
    debtToEquity: 0.4,
    dividendYield: 0.025,
    payoutRatio: 0.45,
    dividendGrowth5y: 0.06,
    ...overrides,
  };
}

export function makeInstrumentContext(
  overrides: Partial<SignalInstrumentContext> = {},
): SignalInstrumentContext {
  return {
    ticker: "TEST",
    name: "Test Co",
    sector: "Technology",
    factorScore: makeFactorScore(),
    fundamentals: makeFundamentals(),
    assetClassKey: "EQUITY_GROWTH",
    ...overrides,
  };
}

export function makeFusionInput(
  overrides: Partial<SignalFusionInput> = {},
): SignalFusionInput {
  return {
    instrument: makeInstrumentContext(),
    portfolio: {
      currentWeight: 0.05,
      sectorWeight: 0.25,
      positionCount: 12,
      hhi: 0.10,
    },
    asOf: "2026-05-10T00:00:00.000Z",
    ...overrides,
  };
}
