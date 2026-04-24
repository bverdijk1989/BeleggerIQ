import { describe, expect, it } from "vitest";

import type { InstrumentClassification } from "@/lib/analytics/instruments";

import { detectPolicyViolations } from "./violations";

function mkCls(
  instrumentType: InstrumentClassification["instrumentType"],
  overrides: Partial<InstrumentClassification["metadata"]> = {},
): InstrumentClassification {
  return {
    instrumentType,
    confidence: "HIGH",
    rationale: [],
    metadata: {
      isBroadMarket: instrumentType === "BROAD_MARKET_ETF",
      sectorFocus: null,
      isIncomeFocused: false,
      incomeStrategy: null,
      isSpeculative: false,
      supportsFactorScoring: instrumentType === "SINGLE_STOCK",
      eligibleForWinnerRule: true,
      ...overrides,
    },
    classifiedAt: "2026-04-24T00:00:00.000Z",
  };
}

describe("detectPolicyViolations — severity-ladder", () => {
  it("binnen cap → ok", () => {
    const report = detectPolicyViolations({
      totalValue: 10_000,
      holdings: [
        {
          holding: { id: "h1", ticker: "NVDA" },
          marketValueBase: 900, // 9%, cap 10%
          classification: mkCls("SINGLE_STOCK"),
        },
      ],
    });
    const v = report.violations[0]!;
    expect(v.violationSeverity).toBe("ok");
    expect(v.excessWeight).toBe(0);
    expect(report.overallSeverity).toBe("ok");
  });

  it("1.0× < ratio ≤ 1.25× → minor", () => {
    // 11% vs cap 10% → ratio 1.1 → minor
    const report = detectPolicyViolations({
      totalValue: 10_000,
      holdings: [
        {
          holding: { id: "h1", ticker: "NVDA" },
          marketValueBase: 1_100,
          classification: mkCls("SINGLE_STOCK"),
        },
      ],
    });
    expect(report.violations[0]!.violationSeverity).toBe("minor");
    expect(report.violations[0]!.excessWeight).toBeCloseTo(0.01, 5);
  });

  it("1.25× < ratio ≤ 2× → major", () => {
    // 15% vs cap 10% → ratio 1.5 → major
    const report = detectPolicyViolations({
      totalValue: 10_000,
      holdings: [
        {
          holding: { id: "h1", ticker: "NVDA" },
          marketValueBase: 1_500,
          classification: mkCls("SINGLE_STOCK"),
        },
      ],
    });
    expect(report.violations[0]!.violationSeverity).toBe("major");
  });

  it("> 2× → critical", () => {
    // 25% vs cap 10% → ratio 2.5 → critical
    const report = detectPolicyViolations({
      totalValue: 10_000,
      holdings: [
        {
          holding: { id: "h1", ticker: "NVDA" },
          marketValueBase: 2_500,
          classification: mkCls("SINGLE_STOCK"),
        },
      ],
    });
    expect(report.violations[0]!.violationSeverity).toBe("critical");
  });
});

describe("detectPolicyViolations — differentiatie per type", () => {
  it("broad-market ETF met 35% → ok (cap 40%)", () => {
    const report = detectPolicyViolations({
      totalValue: 10_000,
      holdings: [
        {
          holding: { id: "h1", ticker: "IWDA" },
          marketValueBase: 3_500,
          classification: mkCls("BROAD_MARKET_ETF"),
        },
      ],
    });
    expect(report.violations[0]!.violationSeverity).toBe("ok");
  });

  it("sector ETF met 20% → major (cap 15%, ratio 1.33×)", () => {
    const report = detectPolicyViolations({
      totalValue: 10_000,
      holdings: [
        {
          holding: { id: "h1", ticker: "XLK" },
          marketValueBase: 2_000,
          classification: mkCls("SECTOR_ETF"),
        },
      ],
    });
    // Sector ELEVATED → 0.15 × 0.75 = 0.1125 cap → 20% vs 11.25% → ratio 1.78 → major
    expect(report.violations[0]!.violationSeverity).toBe("major");
  });

  it("covered-call income ETF met 22% → ok (cap 25%)", () => {
    const report = detectPolicyViolations({
      totalValue: 10_000,
      holdings: [
        {
          holding: { id: "h1", ticker: "JEPI" },
          marketValueBase: 2_200,
          classification: mkCls("INCOME_ETF", {
            isIncomeFocused: true,
            incomeStrategy: "covered-call",
          }),
        },
      ],
    });
    expect(report.violations[0]!.violationSeverity).toBe("ok");
  });

  it("leveraged ETF met 4% → critical (cap 1.5% na HIGH-adjust)", () => {
    const report = detectPolicyViolations({
      totalValue: 10_000,
      holdings: [
        {
          holding: { id: "h1", ticker: "TQQQ" },
          marketValueBase: 400,
          classification: mkCls("LEVERAGED_OR_INVERSE", { isSpeculative: true }),
        },
      ],
    });
    const v = report.violations[0]!;
    // 4% vs 1.5% → ratio 2.67× → critical
    expect(v.violationSeverity).toBe("critical");
    expect(v.riskLevel).toBe("HIGH");
  });

  it("cash positie nooit in violation — cap is Infinity", () => {
    const report = detectPolicyViolations({
      totalValue: 10_000,
      holdings: [
        {
          holding: { id: "h1", ticker: "CASH" },
          marketValueBase: 8_000,
          classification: mkCls("CASH"),
        },
      ],
    });
    expect(report.violations[0]!.violationSeverity).toBe("ok");
    expect(report.violations[0]!.allowedMaxWeight).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("detectPolicyViolations — portfolio-report", () => {
  it("counts en overallSeverity zijn correct aggregatie", () => {
    const report = detectPolicyViolations({
      totalValue: 10_000,
      holdings: [
        {
          holding: { id: "h1", ticker: "A" },
          marketValueBase: 900, // ok
          classification: mkCls("SINGLE_STOCK"),
        },
        {
          holding: { id: "h2", ticker: "B" },
          marketValueBase: 1_150, // minor
          classification: mkCls("SINGLE_STOCK"),
        },
        {
          holding: { id: "h3", ticker: "C" },
          marketValueBase: 1_500, // major
          classification: mkCls("SINGLE_STOCK"),
        },
      ],
    });
    expect(report.counts.ok).toBe(1);
    expect(report.counts.minor).toBe(1);
    expect(report.counts.major).toBe(1);
    expect(report.counts.critical).toBe(0);
    expect(report.overallSeverity).toBe("major");
  });

  it("policyReason vermeldt percentage-over-cap bij violation", () => {
    const report = detectPolicyViolations({
      totalValue: 10_000,
      holdings: [
        {
          holding: { id: "h1", ticker: "A" },
          marketValueBase: 1_300,
          classification: mkCls("SINGLE_STOCK"),
        },
      ],
    });
    const v = report.violations[0]!;
    expect(v.policyReason).toMatch(/\d+(\.\d+)?%pt over/i);
  });

  it("notes bevatten zowel risk- als cap-reden", () => {
    const report = detectPolicyViolations({
      totalValue: 10_000,
      holdings: [
        {
          holding: { id: "h1", ticker: "A" },
          marketValueBase: 900,
          classification: mkCls("SINGLE_STOCK"),
        },
      ],
    });
    const v = report.violations[0]!;
    expect(v.notes.length).toBeGreaterThanOrEqual(2);
    // 1 risk-rationale + 1 limit-reason
    expect(v.notes.some((n) => n.toLowerCase().includes("moderate"))).toBe(true);
    expect(v.notes.some((n) => n.toLowerCase().includes("single"))).toBe(true);
  });

  it("lege portefeuille: geen crash, overallSeverity=ok", () => {
    const report = detectPolicyViolations({
      totalValue: 0,
      holdings: [],
    });
    expect(report.violations).toEqual([]);
    expect(report.overallSeverity).toBe("ok");
  });

  it("totalValue=0 of negatief → alle weights 0, geen violations", () => {
    const report = detectPolicyViolations({
      totalValue: 0,
      holdings: [
        {
          holding: { id: "h1", ticker: "A" },
          marketValueBase: 1_000,
          classification: mkCls("SINGLE_STOCK"),
        },
      ],
    });
    expect(report.violations[0]!.currentWeight).toBe(0);
    expect(report.violations[0]!.violationSeverity).toBe("ok");
  });
});

describe("detectPolicyViolations — context overrides voeden door", () => {
  it("user-policy strenger dan default blijft strenger", () => {
    const report = detectPolicyViolations({
      totalValue: 10_000,
      holdings: [
        {
          holding: { id: "h1", ticker: "A" },
          marketValueBase: 700, // 7%
          classification: mkCls("SINGLE_STOCK"),
        },
      ],
      context: { userMaxSinglePositionWeight: 0.06 },
    });
    // cap nu 6%, positie 7% → ratio 1.17 → minor
    expect(report.violations[0]!.violationSeverity).toBe("minor");
  });

  it("per-type override slaat door in de rapportage", () => {
    const report = detectPolicyViolations({
      totalValue: 10_000,
      holdings: [
        {
          holding: { id: "h1", ticker: "IWDA" },
          marketValueBase: 5_000, // 50%
          classification: mkCls("BROAD_MARKET_ETF"),
        },
      ],
      context: {
        overrides: { limitsByType: { BROAD_MARKET_ETF: 0.30 } },
      },
    });
    // override cap 30%, positie 50% → ratio 1.67 → major
    expect(report.violations[0]!.violationSeverity).toBe("major");
    expect(report.violations[0]!.allowedMaxWeight).toBe(0.30);
  });
});
