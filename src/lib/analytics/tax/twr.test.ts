import { describe, expect, it } from "vitest";

import type { PortfolioSnapshotRow } from "@/lib/data";

import { computeTwrYear } from "./twr";

function snap(
  capturedAt: string,
  totalValue: number,
  totalCost: number = totalValue,
): PortfolioSnapshotRow {
  return {
    id: `s-${capturedAt}`,
    portfolioId: "p",
    capturedAt,
    totalValue,
    totalCost,
    cashBalance: 0,
    unrealizedPnl: null,
    unrealizedPnlPct: null,
    volatility: null,
    drawdown: null,
    regimeLabel: null,
    healthGrade: null,
    healthScore: null,
    metrics: {} as PortfolioSnapshotRow["metrics"],
  };
}

const ASOF = new Date("2026-04-25T00:00:00.000Z");

describe("computeTwrYear", () => {
  it("null bij minder dan 2 snapshots in venster", () => {
    expect(
      computeTwrYear({ snapshots: [snap("2026-04-01", 100_000)], asOf: ASOF }),
    ).toBeNull();
  });

  it("null bij snapshots buiten 12m-venster", () => {
    expect(
      computeTwrYear({
        snapshots: [
          snap("2024-01-01", 100_000),
          snap("2024-06-01", 110_000),
        ],
        asOf: ASOF,
      }),
    ).toBeNull();
  });

  it("simpel: portfolio 100k → 110k zonder cashflows = +10%", () => {
    const r = computeTwrYear({
      snapshots: [
        snap("2025-05-01", 100_000, 100_000),
        snap("2026-04-01", 110_000, 100_000),
      ],
      asOf: ASOF,
    });
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0.1, 4);
  });

  it("filtert cashflows: 10k bijgestort dempt return", () => {
    // 100k → 110k maar 10k is bijgestort → echte return = 0%
    const r = computeTwrYear({
      snapshots: [
        snap("2025-05-01", 100_000, 100_000),
        snap("2026-04-01", 110_000, 110_000),
      ],
      asOf: ASOF,
    });
    expect(r!).toBeCloseTo(0, 4);
  });

  it("compound over meerdere periodes", () => {
    // Q1: 100→105 (+5%); Q2: 105→110 (+~4.76%); Q3: 110→100 (-9.09%)
    // TWR = 1.05 × (110/105) × (100/110) − 1 = 100/100 − 1 = 0%
    // Maar ronding-gevoelig; we accepteren ±0.001
    const r = computeTwrYear({
      snapshots: [
        snap("2025-05-01", 100_000, 100_000),
        snap("2025-08-01", 105_000, 100_000),
        snap("2025-11-01", 110_000, 100_000),
        snap("2026-02-01", 100_000, 100_000),
      ],
      asOf: ASOF,
    });
    expect(r!).toBeCloseTo(0, 3);
  });

  it("identieke input → identieke output", () => {
    const input = {
      snapshots: [
        snap("2025-05-01", 100_000, 100_000),
        snap("2026-04-01", 115_000, 100_000),
      ],
      asOf: ASOF,
    };
    expect(computeTwrYear(input)).toBe(computeTwrYear(input));
  });
});
