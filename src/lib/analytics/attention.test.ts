import { describe, expect, it } from "vitest";

import {
  buildAttentionItems,
  countAttentionBySeverity,
} from "./attention";
import type {
  RebalancePlan,
  RebalanceRecommendation,
} from "@/types/rebalance";
import type { PortfolioRiskSummary, RiskFlag } from "@/types/risk";

function emptyRisk(overrides: Partial<PortfolioRiskSummary> = {}): PortfolioRiskSummary {
  return {
    portfolioId: "p1",
    asOf: "2026-01-01T00:00:00.000Z",
    overallSeverity: "low",
    concentrationHhi: 0,
    largestPositionWeight: 0,
    sectorConcentrationHhi: 0,
    regionConcentrationHhi: 0,
    exposures: { byAssetClass: [], bySector: [], byRegion: [] },
    positions: [],
    flags: [],
    ...overrides,
  };
}

function emptyPlan(overrides: Partial<RebalancePlan> = {}): RebalancePlan {
  return {
    portfolioId: "p1",
    asOf: "2026-01-01T00:00:00.000Z",
    baseCurrency: "EUR",
    totalValue: 10_000,
    recommendations: [],
    totalTurnover: 0,
    summary: {
      NO_ACTION: 0,
      TRIM_LIGHT: 0,
      TRIM_HEAVY: 0,
      RECONSIDER: 0,
    },
    ...overrides,
  };
}

function rec(
  overrides: Partial<RebalanceRecommendation> & {
    action: RebalanceRecommendation["action"];
    ticker: string;
  },
): RebalanceRecommendation {
  return {
    ticker: overrides.ticker,
    name: overrides.name ?? overrides.ticker,
    action: overrides.action,
    concentrationType: overrides.concentrationType ?? "NEUTRAL",
    fragilityScore: overrides.fragilityScore ?? 0,
    currentWeight: overrides.currentWeight ?? 0.1,
    targetWeight: overrides.targetWeight ?? 0.05,
    deltaWeight: overrides.deltaWeight ?? -0.05,
    deltaAmount: overrides.deltaAmount ?? -500,
    reasons: overrides.reasons ?? [],
    confidence: overrides.confidence ?? 0.8,
    factorSnapshot: overrides.factorSnapshot ?? {
      quality: null,
      value: null,
      momentum: null,
      composite: null,
      volatility: null,
      sector: null,
      sectorCyclicality: "low",
    },
    quantityPlan: overrides.quantityPlan,
  };
}

function flag(overrides: Partial<RiskFlag> & { code: string }): RiskFlag {
  return {
    code: overrides.code,
    label: overrides.label ?? overrides.code,
    severity: overrides.severity ?? "moderate",
    message: overrides.message,
    metric: overrides.metric,
    threshold: overrides.threshold,
  };
}

describe("buildAttentionItems", () => {
  it("retourneert een lege lijst zonder signalen", () => {
    expect(buildAttentionItems(emptyRisk(), emptyPlan())).toEqual([]);
  });

  it("sorteert RECONSIDER > TRIM_HEAVY > critical risk > high risk > TRIM_LIGHT", () => {
    const plan = emptyPlan({
      recommendations: [
        rec({ ticker: "T1", action: "TRIM_LIGHT" }),
        rec({ ticker: "T2", action: "RECONSIDER" }),
        rec({ ticker: "T3", action: "TRIM_HEAVY" }),
      ],
    });
    const risk = emptyRisk({
      flags: [
        flag({ code: "foreign", severity: "critical" }),
        flag({ code: "vol", severity: "high" }),
        flag({ code: "noise", severity: "low" }),
      ],
    });
    const items = buildAttentionItems(risk, plan, 10);
    const ids = items.map((i) => i.id);
    expect(ids[0]).toContain("reconsider");
    expect(ids[1]).toContain("heavy");
    expect(ids[2]).toBe("risk.foreign");
    expect(ids[3]).toBe("risk.vol");
    expect(ids[ids.length - 1]).toContain("light");
    // Severity "low" wordt gefilterd
    expect(ids).not.toContain("risk.noise");
  });

  it("respecteert limit parameter", () => {
    const plan = emptyPlan({
      recommendations: [
        rec({ ticker: "A", action: "TRIM_HEAVY" }),
        rec({ ticker: "B", action: "TRIM_HEAVY" }),
        rec({ ticker: "C", action: "TRIM_HEAVY" }),
        rec({ ticker: "D", action: "TRIM_HEAVY" }),
      ],
    });
    expect(buildAttentionItems(emptyRisk(), plan, 2)).toHaveLength(2);
  });

  it("NO_ACTION items worden weggefilterd", () => {
    const plan = emptyPlan({
      recommendations: [rec({ ticker: "A", action: "NO_ACTION" })],
    });
    expect(buildAttentionItems(emptyRisk(), plan)).toEqual([]);
  });

  it("valt terug op default message wanneer reasons leeg zijn", () => {
    const plan = emptyPlan({
      recommendations: [
        rec({ ticker: "X", action: "RECONSIDER", reasons: [] }),
      ],
    });
    const [item] = buildAttentionItems(emptyRisk(), plan);
    expect(item).toBeDefined();
    expect(item!.message.length).toBeGreaterThan(0);
  });

  it("quantityPlan wordt doorgegeven van recommendation naar attention-item", () => {
    const qPlan = {
      symbol: "RHM",
      actionLabel: "licht afbouwen" as const,
      currentWeight: 17.53,
      targetWeight: 10,
      currentValue: 17530,
      targetValue: 10000,
      excessValue: 7530,
      currentPrice: 1750,
      sharesToSell: 4,
      amountToSell: 7000,
      postSellWeight: 10.53,
      reason: "Boven policy-cap van 10%; verkoop 4 aandelen.",
      confidence: "HIGH" as const,
      warnings: [],
    };
    const plan = emptyPlan({
      recommendations: [
        rec({
          ticker: "RHM",
          action: "TRIM_LIGHT",
          reasons: ["Factor-reason"],
          quantityPlan: qPlan,
        }),
      ],
    });
    const [item] = buildAttentionItems(emptyRisk(), plan);
    expect(item?.quantityPlan).toBeDefined();
    expect(item?.quantityPlan?.sharesToSell).toBe(4);
    expect(item?.quantityPlan?.amountToSell).toBe(7000);
    // Als quantityPlan een reason heeft, wint die over rec.reasons
    expect(item?.message).toContain("verkoop 4 aandelen");
  });

  it("quantityPlan ontbreekt → geen crash, message valt terug op reasons", () => {
    const plan = emptyPlan({
      recommendations: [
        rec({
          ticker: "Y",
          action: "TRIM_HEAVY",
          reasons: ["Manual reason"],
          // quantityPlan weggelaten
        }),
      ],
    });
    const [item] = buildAttentionItems(emptyRisk(), plan);
    expect(item?.quantityPlan).toBeUndefined();
    expect(item?.message).toBe("Manual reason");
  });
});

describe("countAttentionBySeverity", () => {
  it("retourneert een zero-tellerobject bij lege lijst", () => {
    expect(countAttentionBySeverity([])).toEqual({
      moderate: 0,
      high: 0,
      critical: 0,
    });
  });

  it("telt severities correct", () => {
    const plan = emptyPlan({
      recommendations: [
        rec({ ticker: "A", action: "RECONSIDER" }),
        rec({ ticker: "B", action: "TRIM_HEAVY" }),
        rec({ ticker: "C", action: "TRIM_LIGHT" }),
      ],
    });
    const items = buildAttentionItems(emptyRisk(), plan, 10);
    const counts = countAttentionBySeverity(items);
    expect(counts.critical).toBe(1);
    expect(counts.high).toBe(1);
    expect(counts.moderate).toBe(1);
  });
});
