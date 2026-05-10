import { describe, expect, it } from "vitest";

import { runBehavioralEngine } from "./engine";
import { makeDetectorInput, makeTransaction } from "./fixtures";
import {
  applyWarningStates,
  deriveEffectiveStatus,
  partitionSignalsByStatus,
} from "./state";
import type { BehavioralWarningState } from "./types";

describe("runBehavioralEngine — combinaties", () => {
  it("schone portefeuille → 0 signalen, alle skip-reasons leeg", () => {
    const report = runBehavioralEngine(
      makeDetectorInput({
        positions: Array.from({ length: 12 }, (_, i) => ({
          ticker: `T${i}`,
          name: `Ticker ${i}`,
          sector: "Diversified",
          marketValueBase: 8_000,
          weight: 0.08,
          pnlPct: 0.05,
        })),
        sectorExposure: [
          { label: "Diversified", weight: 0.20 },
          { label: "Tech", weight: 0.20 },
          { label: "Health", weight: 0.20 },
          { label: "Industrials", weight: 0.20 },
          { label: "Consumer", weight: 0.15 },
        ],
      }),
    );
    expect(report.signals).toHaveLength(0);
    expect(report.counts).toEqual({ low: 0, moderate: 0, elevated: 0, high: 0 });
  });

  it("multi-issue portefeuille → meerdere signalen, gesorteerd op severity", () => {
    const report = runBehavioralEngine(
      makeDetectorInput({
        positions: [
          {
            ticker: "BIG",
            name: "BIG",
            sector: "Tech",
            marketValueBase: 35_000,
            weight: 0.35,
            pnlPct: 0.50,
          },
        ],
        sectorExposure: [{ label: "Technology", weight: 0.60 }],
        positionCount: 1,
        cashBalance: 50_000,
        totalValue: 100_000,
        recentTransactions: [
          makeTransaction({ ticker: "BIG", type: "BUY" }),
          ...Array.from({ length: 12 }, (_, i) =>
            makeTransaction({
              id: `tx-${i}`,
              ticker: "BIG",
              type: "BUY",
            }),
          ),
        ],
      }),
    );
    expect(report.signals.length).toBeGreaterThanOrEqual(3);
    // Severity desc-volgorde: high komt vóór moderate
    for (let i = 1; i < report.signals.length; i++) {
      const prev = severityRank(report.signals[i - 1]!.severity);
      const cur = severityRank(report.signals[i]!.severity);
      expect(prev).toBeGreaterThanOrEqual(cur);
    }
    // Counts moeten kloppen
    const total =
      report.counts.low +
      report.counts.moderate +
      report.counts.elevated +
      report.counts.high;
    expect(total).toBe(report.signals.length);
  });

  it("zelfde input → identieke output (determinisme)", () => {
    const input = makeDetectorInput({
      positions: [
        {
          ticker: "X",
          name: "X",
          sector: "T",
          marketValueBase: 20_000,
          weight: 0.20,
          pnlPct: 0.50,
        },
      ],
      sectorExposure: [{ label: "T", weight: 0.40 }],
    });
    const a = runBehavioralEngine(input);
    const b = runBehavioralEngine(input);
    expect(a).toEqual(b);
  });

  it("skip-reasons worden geregistreerd", () => {
    const report = runBehavioralEngine(
      makeDetectorInput({
        positions: [],
        recentTransactions: [],
        profile: null,
      }),
    );
    const keys = report.skippedDetectors.map((s) => s.key);
    expect(keys).toContain("OVERCONCENTRATION");
    expect(keys).toContain("OVERTRADING");
    expect(keys).toContain("STRATEGY_DRIFT");
  });
});

describe("applyWarningStates", () => {
  it("zonder state-records → alles ACTIVE", () => {
    const report = runBehavioralEngine(
      makeDetectorInput({
        positions: [
          {
            ticker: "X",
            name: "X",
            sector: "T",
            marketValueBase: 25_000,
            weight: 0.25,
            pnlPct: 0,
          },
        ],
      }),
    );
    const merged = applyWarningStates(report.signals, [], new Date("2026-05-10"));
    for (const m of merged) {
      expect(m.effectiveStatus).toBe("ACTIVE");
      expect(m.state).toBeNull();
    }
  });

  it("DISMISSED state → blijft DISMISSED na merge", () => {
    const report = runBehavioralEngine(
      makeDetectorInput({
        positions: [
          {
            ticker: "X",
            name: "X",
            sector: "T",
            marketValueBase: 25_000,
            weight: 0.25,
            pnlPct: 0,
          },
        ],
      }),
    );
    const state: BehavioralWarningState = {
      userId: "u-1",
      signalId: "OVERCONCENTRATION:X",
      status: "DISMISSED",
      snoozedUntil: null,
      reasonNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const merged = applyWarningStates(report.signals, [state], new Date());
    const signal = merged.find((m) => m.id === "OVERCONCENTRATION:X");
    expect(signal?.effectiveStatus).toBe("DISMISSED");
  });

  it("SNOOZED tot in toekomst → SNOOZED", () => {
    const report = runBehavioralEngine(
      makeDetectorInput({
        positions: [
          {
            ticker: "X",
            name: "X",
            sector: "T",
            marketValueBase: 25_000,
            weight: 0.25,
            pnlPct: 0,
          },
        ],
      }),
    );
    const future = new Date("2026-12-01");
    const state: BehavioralWarningState = {
      userId: "u-1",
      signalId: "OVERCONCENTRATION:X",
      status: "SNOOZED",
      snoozedUntil: future,
      reasonNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const merged = applyWarningStates(
      report.signals,
      [state],
      new Date("2026-05-10"),
    );
    const signal = merged.find((m) => m.id === "OVERCONCENTRATION:X");
    expect(signal?.effectiveStatus).toBe("SNOOZED");
  });

  it("SNOOZED met verlopen datum → ACTIVE", () => {
    const report = runBehavioralEngine(
      makeDetectorInput({
        positions: [
          {
            ticker: "X",
            name: "X",
            sector: "T",
            marketValueBase: 25_000,
            weight: 0.25,
            pnlPct: 0,
          },
        ],
      }),
    );
    const past = new Date("2025-01-01");
    const state: BehavioralWarningState = {
      userId: "u-1",
      signalId: "OVERCONCENTRATION:X",
      status: "SNOOZED",
      snoozedUntil: past,
      reasonNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const merged = applyWarningStates(
      report.signals,
      [state],
      new Date("2026-05-10"),
    );
    expect(
      merged.find((m) => m.id === "OVERCONCENTRATION:X")?.effectiveStatus,
    ).toBe("ACTIVE");
  });
});

describe("deriveEffectiveStatus", () => {
  it("null state → ACTIVE", () => {
    expect(deriveEffectiveStatus(null, new Date())).toBe("ACTIVE");
  });

  it("SNOOZED zonder snoozedUntil → defensive ACTIVE", () => {
    const state: BehavioralWarningState = {
      userId: "u",
      signalId: "x",
      status: "SNOOZED",
      snoozedUntil: null,
      reasonNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(deriveEffectiveStatus(state, new Date())).toBe("ACTIVE");
  });
});

describe("partitionSignalsByStatus", () => {
  it("partitioneert in active/snoozed/dismissed", () => {
    const report = runBehavioralEngine(
      makeDetectorInput({
        positions: [
          {
            ticker: "A",
            name: "A",
            sector: "T",
            marketValueBase: 25_000,
            weight: 0.25,
            pnlPct: 0,
          },
          {
            ticker: "B",
            name: "B",
            sector: "T",
            marketValueBase: 22_000,
            weight: 0.22,
            pnlPct: 0,
          },
        ],
        sectorExposure: [{ label: "T", weight: 0.50 }],
      }),
    );
    const states: BehavioralWarningState[] = [
      {
        userId: "u",
        signalId: "OVERCONCENTRATION:A",
        status: "DISMISSED",
        snoozedUntil: null,
        reasonNote: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        userId: "u",
        signalId: "OVERCONCENTRATION:B",
        status: "SNOOZED",
        snoozedUntil: new Date("2026-12-01"),
        reasonNote: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const merged = applyWarningStates(
      report.signals,
      states,
      new Date("2026-05-10"),
    );
    const partition = partitionSignalsByStatus(merged);
    expect(partition.dismissed).toHaveLength(1);
    expect(partition.snoozed).toHaveLength(1);
    expect(partition.active.length).toBeGreaterThanOrEqual(1);
  });
});

function severityRank(s: string): number {
  if (s === "high") return 4;
  if (s === "elevated") return 3;
  if (s === "moderate") return 2;
  return 1;
}
