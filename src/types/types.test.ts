import { describe, expectTypeOf, it } from "vitest";

import type {
  AllocationPlan,
  AllocationRecommendation,
  AllocationSlice,
  BacktestConfig,
  BacktestResult,
  BenchmarkComparison,
  FactorScore,
  FactorSubScores,
  FactorWeights,
  FundamentalsSnapshot,
  Holding,
  MarketRegime,
  PolicySettings,
  Portfolio,
  PortfolioHealthSummary,
  PortfolioRiskSummary,
  PortfolioSummary,
  Position,
  PositionRiskAnalysis,
  StrategyPreset,
  UserProfile,
} from "./index";

// Compile-time contracten. Deze "tests" draaien vrijwel niks at runtime,
// maar breken de build zodra een type-shift een contract breekt.

describe("domain types", () => {
  it("Holding mag verrijkingsvelden optioneel bevatten", () => {
    const h: Holding = {
      id: "h1",
      portfolioId: "p1",
      ticker: "ASML",
      name: "ASML",
      assetClass: "EQUITY",
      currency: "EUR",
      quantity: 1,
      avgCostPrice: 600,
    };

    expectTypeOf(h).toMatchTypeOf<Holding>();
    expectTypeOf<Holding["beta"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<Holding["factorScore"]>().toEqualTypeOf<
      FactorScore | undefined
    >();
    expectTypeOf<Holding["riskAnalysis"]>().toEqualTypeOf<
      PositionRiskAnalysis | undefined
    >();
    expectTypeOf<Holding["targetWeight"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<Holding["convictionScore"]>().toEqualTypeOf<
      number | undefined
    >();
    expectTypeOf<Holding["moatLikeScore"]>().toEqualTypeOf<
      number | undefined
    >();
  });

  it("Position is een alias van Holding", () => {
    expectTypeOf<Position>().toEqualTypeOf<Holding>();
  });

  it("FactorSubScores vereist de vier kernfactoren", () => {
    const sub: FactorSubScores = { value: 0, quality: 0, momentum: 0, lowVol: 0 };
    expectTypeOf(sub).toMatchTypeOf<FactorSubScores>();
    expectTypeOf<FactorWeights["growth"]>().toEqualTypeOf<number | undefined>();
  });

  it("UserProfile accepteert een optionele PolicySettings", () => {
    expectTypeOf<UserProfile["policy"]>().toEqualTypeOf<
      PolicySettings | undefined
    >();
    expectTypeOf<PolicySettings["maxPositionWeight"]>().toEqualTypeOf<
      number | undefined
    >();
  });

  it("AllocationPlan bundelt recommendations en optioneel regime", () => {
    expectTypeOf<AllocationPlan["recommendations"]>().toEqualTypeOf<
      AllocationRecommendation[]
    >();
    expectTypeOf<AllocationPlan["regime"]>().toEqualTypeOf<
      MarketRegime | undefined
    >();
  });

  it("Risk types en summary types delen AllocationSlice", () => {
    expectTypeOf<PortfolioRiskSummary["exposures"]["bySector"]>().toEqualTypeOf<
      AllocationSlice[]
    >();
    expectTypeOf<PortfolioSummary["allocationBySector"]>().toEqualTypeOf<
      AllocationSlice[]
    >();
  });

  it("Backtest result refereert zijn config en benchmark", () => {
    expectTypeOf<BacktestResult["config"]>().toEqualTypeOf<BacktestConfig>();
    expectTypeOf<BacktestResult["benchmark"]>().toEqualTypeOf<
      BenchmarkComparison | undefined
    >();
    expectTypeOf<StrategyPreset["factorWeights"]>().toEqualTypeOf<FactorWeights>();
  });

  it("Health summary levert grade + signalen", () => {
    expectTypeOf<PortfolioHealthSummary["grade"]>().toEqualTypeOf<
      "A" | "B" | "C" | "D" | "F"
    >();
  });

  it("FundamentalsSnapshot en Portfolio blijven los gekoppeld", () => {
    expectTypeOf<FundamentalsSnapshot["ticker"]>().toEqualTypeOf<string>();
    expectTypeOf<Portfolio["holdings"]>().toEqualTypeOf<Holding[]>();
  });
});
