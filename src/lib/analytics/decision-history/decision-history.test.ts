import { describe, expect, it } from "vitest";

import type { DashboardAction } from "@/lib/analytics/actions";

import {
  buildDecisionSnapshots,
  bucketStart,
  isValidStatusTransition,
} from "./snapshot-builder";
import { summarizeDecisionHistory } from "./summary";
import type { DecisionRecord, DecisionStatus } from "./types";

const NOW = new Date("2026-04-27T12:30:00.000Z");

// ============================================================
//  Fixtures
// ============================================================

function action(
  overrides: Partial<DashboardAction> = {},
): DashboardAction {
  return {
    id: "RISK_REDUCTION:RHM",
    type: "RISK_REDUCTION",
    title: "Verkoop 1 aandeel Rheinmetall",
    description: "Concentratie boven cap.",
    urgency: "HIGH",
    confidence: 0.9,
    reason: "Concentration boven cap.",
    sourceEngine: "rebalance-engine",
    symbol: "RHM",
    shares: 1,
    amount: 600,
    ...overrides,
  };
}

function record(
  overrides: Partial<DecisionRecord> = {},
): DecisionRecord {
  return {
    id: "rec1",
    decisionKey: "RISK_REDUCTION:RHM",
    suggestedAt: "2026-04-27T10:00:00.000Z",
    expiresAt: "2026-05-11T10:00:00.000Z",
    actionType: "RISK_REDUCTION",
    symbol: "RHM",
    shares: 1,
    amount: 600,
    baseCurrency: "EUR",
    title: "Verkoop 1 aandeel Rheinmetall",
    rationale: "Concentration boven cap.",
    confidence: 0.9,
    sourceEngine: "rebalance-engine",
    status: "SUGGESTED",
    statusUpdatedAt: "2026-04-27T10:00:00.000Z",
    statusNote: null,
    ...overrides,
  };
}

// ============================================================
//  buildDecisionSnapshots
// ============================================================

describe("buildDecisionSnapshots", () => {
  it("mapt DashboardAction → DecisionSnapshotInput", () => {
    const out = buildDecisionSnapshots({
      actions: [action()],
      baseCurrency: "EUR",
      now: NOW,
    });
    expect(out.length).toBe(1);
    const s = out[0]!;
    expect(s.decisionKey).toBe("RISK_REDUCTION:RHM");
    expect(s.actionType).toBe("RISK_REDUCTION");
    expect(s.symbol).toBe("RHM");
    expect(s.shares).toBe(1);
    expect(s.amount).toBe(600);
    expect(s.title).toContain("Verkoop");
    expect(s.confidence).toBeCloseTo(0.9, 4);
    expect(s.suggestedAt).toEqual(NOW);
  });

  it("DO_NOTHING actions worden gefilterd", () => {
    const out = buildDecisionSnapshots({
      actions: [action({ id: "DO_NOTHING:global", type: "DO_NOTHING" })],
      baseCurrency: "EUR",
      now: NOW,
    });
    expect(out).toEqual([]);
  });

  it("expiresAt = now + ttlDays (default 14)", () => {
    const out = buildDecisionSnapshots({
      actions: [action()],
      baseCurrency: "EUR",
      now: NOW,
    });
    const expected = new Date(NOW);
    expected.setDate(expected.getDate() + 14);
    expect(out[0]?.expiresAt.getTime()).toBe(expected.getTime());
  });

  it("ttlDays is configureerbaar", () => {
    const out = buildDecisionSnapshots({
      actions: [action()],
      baseCurrency: "EUR",
      now: NOW,
      ttlDays: 7,
    });
    const expected = new Date(NOW);
    expected.setDate(expected.getDate() + 7);
    expect(out[0]?.expiresAt.getTime()).toBe(expected.getTime());
  });

  it("suggestedBucket is de uur-grens (minuten/seconden = 0)", () => {
    const out = buildDecisionSnapshots({
      actions: [action()],
      baseCurrency: "EUR",
      now: NOW,
    });
    const b = out[0]!.suggestedBucket;
    expect(b.getMinutes()).toBe(0);
    expect(b.getSeconds()).toBe(0);
    expect(b.getMilliseconds()).toBe(0);
    expect(b.getUTCHours()).toBe(NOW.getUTCHours());
  });

  it("amount/shares vallen op null wanneer engine ze niet levert", () => {
    const out = buildDecisionSnapshots({
      actions: [
        action({ id: "BUY_OPPORTUNITY:ASML", type: "BUY_OPPORTUNITY", shares: undefined, amount: undefined }),
      ],
      baseCurrency: "EUR",
      now: NOW,
    });
    expect(out[0]?.shares).toBe(null);
    expect(out[0]?.amount).toBe(null);
  });

  it("confidence wordt geclamped op [0,1]", () => {
    const out = buildDecisionSnapshots({
      actions: [action({ confidence: 1.5 })],
      baseCurrency: "EUR",
      now: NOW,
    });
    expect(out[0]?.confidence).toBe(1);
  });

  it("determinisme: identieke input → identieke output", () => {
    const a = buildDecisionSnapshots({ actions: [action()], baseCurrency: "EUR", now: NOW });
    const b = buildDecisionSnapshots({ actions: [action()], baseCurrency: "EUR", now: NOW });
    expect(a).toEqual(b);
  });
});

describe("bucketStart", () => {
  it("normaliseert naar uur-grens", () => {
    const result = bucketStart(new Date("2026-04-27T12:34:56.789Z"));
    expect(result.toISOString()).toBe("2026-04-27T12:00:00.000Z");
  });
});

describe("isValidStatusTransition", () => {
  const all: DecisionStatus[] = ["SUGGESTED", "MARKED_DONE", "IGNORED", "EXPIRED"];

  it("SUGGESTED → MARKED_DONE / IGNORED / EXPIRED is geldig", () => {
    expect(isValidStatusTransition("SUGGESTED", "MARKED_DONE")).toBe(true);
    expect(isValidStatusTransition("SUGGESTED", "IGNORED")).toBe(true);
    expect(isValidStatusTransition("SUGGESTED", "EXPIRED")).toBe(true);
  });

  it("zelfde status → ongeldig", () => {
    for (const s of all) expect(isValidStatusTransition(s, s)).toBe(false);
  });

  it("eindstatus → andere status is ongeldig", () => {
    for (const from of all) {
      if (from === "SUGGESTED") continue;
      for (const to of all) {
        expect(isValidStatusTransition(from, to)).toBe(false);
      }
    }
  });
});

// ============================================================
//  summarizeDecisionHistory
// ============================================================

describe("summarizeDecisionHistory", () => {
  it("lege input → fallback-headline + nul-buckets", () => {
    const s = summarizeDecisionHistory({ records: [], now: NOW.toISOString() });
    expect(s.total).toBe(0);
    expect(s.bucketCounts).toEqual({
      SUGGESTED: 0,
      MARKED_DONE: 0,
      IGNORED: 0,
      EXPIRED: 0,
    });
    expect(s.actionableCount).toBe(0);
    expect(s.headline).toContain("Nog geen adviezen");
  });

  it("telt buckets per status", () => {
    const records = [
      record({ id: "1", status: "SUGGESTED" }),
      record({ id: "2", status: "MARKED_DONE" }),
      record({ id: "3", status: "IGNORED" }),
      record({ id: "4", status: "EXPIRED" }),
    ];
    const s = summarizeDecisionHistory({
      records,
      now: NOW.toISOString(),
    });
    expect(s.bucketCounts.SUGGESTED).toBe(1);
    expect(s.bucketCounts.MARKED_DONE).toBe(1);
    expect(s.bucketCounts.IGNORED).toBe(1);
    expect(s.bucketCounts.EXPIRED).toBe(1);
  });

  it("actionableCount = SUGGESTED én niet-verlopen", () => {
    const records = [
      record({ id: "1", status: "SUGGESTED", expiresAt: "2026-05-01T00:00:00.000Z" }),
      // verlopen — telt niet als actionable
      record({ id: "2", status: "SUGGESTED", expiresAt: "2026-04-01T00:00:00.000Z" }),
      record({ id: "3", status: "MARKED_DONE" }),
    ];
    const s = summarizeDecisionHistory({
      records,
      now: NOW.toISOString(),
    });
    expect(s.actionableCount).toBe(1);
  });

  it("recent gesorteerd op suggestedAt desc, max 3", () => {
    const records = [
      record({ id: "a", suggestedAt: "2026-04-25T10:00:00.000Z" }),
      record({ id: "b", suggestedAt: "2026-04-27T10:00:00.000Z" }),
      record({ id: "c", suggestedAt: "2026-04-26T10:00:00.000Z" }),
      record({ id: "d", suggestedAt: "2026-04-24T10:00:00.000Z" }),
    ];
    const s = summarizeDecisionHistory({ records, now: NOW.toISOString() });
    expect(s.recent.map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(s.recent.length).toBe(3);
  });

  it("recentLimit configureerbaar", () => {
    const records = [
      record({ id: "a", suggestedAt: "2026-04-26T10:00:00.000Z" }),
      record({ id: "b", suggestedAt: "2026-04-27T10:00:00.000Z" }),
    ];
    const s = summarizeDecisionHistory({
      records,
      now: NOW.toISOString(),
      recentLimit: 1,
    });
    expect(s.recent.length).toBe(1);
    expect(s.recent[0]?.id).toBe("b");
  });

  it("headline samenvat: actief + uitgevoerd + genegeerd", () => {
    const records = [
      record({ id: "1", status: "SUGGESTED", expiresAt: "2026-05-01T00:00:00.000Z" }),
      record({ id: "2", status: "MARKED_DONE" }),
      record({ id: "3", status: "IGNORED" }),
    ];
    const s = summarizeDecisionHistory({ records, now: NOW.toISOString() });
    expect(s.headline).toContain("1 actief advies");
    expect(s.headline).toContain("1 uitgevoerd");
    expect(s.headline).toContain("1 genegeerd");
  });

  it("determinisme: identieke input → identieke output", () => {
    const records = [record({ id: "x" })];
    const a = summarizeDecisionHistory({ records, now: NOW.toISOString() });
    const b = summarizeDecisionHistory({ records, now: NOW.toISOString() });
    expect(a).toEqual(b);
  });
});
