import { describe, expect, it } from "vitest";

import { BOX3_RATES_2025, computeBox3 } from "./box3";

describe("computeBox3 — basis", () => {
  it("0 belasting onder heffingsvrij vermogen (alleenstaand)", () => {
    const r = computeBox3({ investmentWealth: 50_000 });
    expect(r.taxableWealth).toBe(0);
    expect(r.taxOwed).toBe(0);
  });

  it("0 belasting onder partner-vrijstelling", () => {
    const r = computeBox3({
      investmentWealth: 100_000,
      hasFiscalPartner: true,
    });
    expect(r.taxOwed).toBe(0);
  });

  it("100k − 57.684 vrijstelling → 36% × 6.04% × 42316 ≈ 920 EUR", () => {
    const r = computeBox3({ investmentWealth: 100_000 });
    expect(r.taxableWealth).toBeCloseTo(42_316, 0);
    expect(r.taxOwed).toBeCloseTo(42_316 * 0.0604 * 0.36, 0);
  });

  it("hogere vermogen → hogere effectieve druk", () => {
    const small = computeBox3({ investmentWealth: 100_000 });
    const big = computeBox3({ investmentWealth: 500_000 });
    expect(big.effectiveTaxOnPortfolio).toBeGreaterThan(
      small.effectiveTaxOnPortfolio,
    );
  });

  it("rationale bevat tariefcijfers", () => {
    const r = computeBox3({ investmentWealth: 100_000 });
    expect(r.rationale.some((x) => /6\.04%/.test(x))).toBe(true);
    expect(r.rationale.some((x) => /36%/.test(x))).toBe(true);
  });

  it("exemptionOverride werkt", () => {
    const r = computeBox3({
      investmentWealth: 100_000,
      exemptionOverride: 0,
    });
    expect(r.taxableWealth).toBe(100_000);
    expect(r.taxOwed).toBeCloseTo(100_000 * 0.0604 * 0.36, 0);
  });

  it("BOX3_RATES_2025 heeft de juiste tarieven", () => {
    expect(BOX3_RATES_2025.notionalReturnInvestments).toBeCloseTo(0.0604);
    expect(BOX3_RATES_2025.taxRate).toBe(0.36);
    expect(BOX3_RATES_2025.exemptionSingle).toBe(57_684);
    expect(BOX3_RATES_2025.exemptionPartners).toBe(115_368);
  });

  it("negatief vermogen wordt 0", () => {
    const r = computeBox3({ investmentWealth: -1000 });
    expect(r.taxOwed).toBe(0);
  });
});

describe("computeBox3 — cash + schulden", () => {
  it("spaargeld onder vrijstelling: geen belasting", () => {
    const r = computeBox3({ investmentWealth: 30_000, cashWealth: 20_000 });
    expect(r.taxOwed).toBe(0);
    expect(r.rationale.some((x) => /Spaargeld/.test(x))).toBe(true);
  });

  it("spaargeld + beleggingen tellen samen op", () => {
    const r = computeBox3({
      investmentWealth: 60_000,
      cashWealth: 40_000,
    });
    // grossBase 100k − vrijstelling 57.684 = 42.316 belastbaar.
    // notional gross = 60k × 6.04% + 40k × 1.44% = 3624 + 576 = 4200
    // ratio = 42.316 / 100.000 = 0.42316 → fictief inkomen ≈ 1777
    // tax ≈ 640.
    expect(r.taxableWealth).toBeCloseTo(42_316, 0);
    expect(r.taxOwed).toBeCloseTo(640, 0);
  });

  it("schulden boven drempel verlagen de belasting", () => {
    const noDebt = computeBox3({ investmentWealth: 100_000 });
    const withDebt = computeBox3({
      investmentWealth: 100_000,
      debtWealth: 20_000,
    });
    expect(withDebt.taxOwed).toBeLessThan(noDebt.taxOwed);
    expect(withDebt.rationale.some((x) => /Schulden/.test(x))).toBe(true);
  });

  it("schulden onder drempel tellen niet mee", () => {
    const noDebt = computeBox3({ investmentWealth: 100_000 });
    const tinyDebt = computeBox3({
      investmentWealth: 100_000,
      debtWealth: 2_000, // onder drempel 3.800
    });
    expect(tinyDebt.taxOwed).toBeCloseTo(noDebt.taxOwed, 0);
  });

  it("partner-drempel + vrijstelling samen → lagere belasting", () => {
    const single = computeBox3({
      investmentWealth: 200_000,
      debtWealth: 5_000,
    });
    const partner = computeBox3({
      investmentWealth: 200_000,
      debtWealth: 5_000,
      hasFiscalPartner: true,
    });
    expect(partner.taxOwed).toBeLessThan(single.taxOwed);
  });
});
