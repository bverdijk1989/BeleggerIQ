import { describe, expect, it } from "vitest";

import {
  deriveRelevantPeilYears,
  resolveYearBoundaries,
  type SnapshotInput,
} from "./year-boundary";

const D = (iso: string) => new Date(iso);

function snap(iso: string, value: number): SnapshotInput {
  return { capturedAt: D(iso), totalValue: value };
}

describe("resolveYearBoundaries", () => {
  it("exacte 1-1 snapshot → source=snapshot-exact, daysFromBoundary=0", () => {
    const r = resolveYearBoundaries({
      peilYears: [2026],
      snapshots: [snap("2026-01-01T00:00:00Z", 100_000)],
    });
    expect(r[0]?.source).toBe("snapshot-exact");
    expect(r[0]?.value).toBe(100_000);
    expect(r[0]?.daysFromBoundary).toBe(0);
  });

  it("snapshot 31-12 binnen window → source=snapshot-near, value gebruikt", () => {
    const r = resolveYearBoundaries({
      peilYears: [2026],
      snapshots: [snap("2025-12-31T22:00:00Z", 99_500)],
    });
    expect(r[0]?.source).toBe("snapshot-near");
    expect(r[0]?.value).toBe(99_500);
    expect(r[0]?.daysFromBoundary).toBeLessThanOrEqual(1);
  });

  it("snapshot 1 maand vóór 1-1 → source=missing (buiten 14-dagen window)", () => {
    const r = resolveYearBoundaries({
      peilYears: [2026],
      snapshots: [snap("2025-12-01T00:00:00Z", 99_500)],
    });
    expect(r[0]?.source).toBe("missing");
    expect(r[0]?.value).toBeNull();
    expect(r[0]?.asOf).toBeNull();
  });

  it("twee snapshots binnen window — closest-wins", () => {
    const r = resolveYearBoundaries({
      peilYears: [2026],
      snapshots: [
        snap("2025-12-28T12:00:00Z", 95_000), // 4 dagen
        snap("2026-01-03T12:00:00Z", 102_000), // 2 dagen
      ],
    });
    expect(r[0]?.value).toBe(102_000);
  });

  it("manual override beats snapshot", () => {
    const manual = new Map<number, { value: number; asOf: Date }>();
    manual.set(2026, { value: 250_000, asOf: D("2026-01-01") });
    const r = resolveYearBoundaries({
      peilYears: [2026],
      snapshots: [snap("2026-01-01T00:00:00Z", 100_000)],
      manualValuations: manual,
    });
    expect(r[0]?.source).toBe("manual");
    expect(r[0]?.value).toBe(250_000);
  });

  it("meerdere peil-jaren parallel — elk eigen snapshot", () => {
    const r = resolveYearBoundaries({
      peilYears: [2024, 2025, 2026],
      snapshots: [
        snap("2024-01-02", 80_000),
        snap("2025-01-01", 90_000),
        snap("2026-01-01", 100_000),
      ],
    });
    expect(r.map((x) => x.value)).toEqual([80_000, 90_000, 100_000]);
  });
});

describe("deriveRelevantPeilYears — boundary cases", () => {
  it("geen transacties → alleen huidig jaar", () => {
    const r = deriveRelevantPeilYears({
      earliestTxDate: null,
      now: D("2026-04-28"),
    });
    expect(r).toEqual([2026]);
  });

  it("eerste tx in juni 2024 → peil-jaren [2025, 2026]", () => {
    const r = deriveRelevantPeilYears({
      earliestTxDate: D("2024-06-15"),
      now: D("2026-04-28"),
    });
    expect(r).toEqual([2025, 2026]);
  });

  it("eerste tx 31-12-2025 → eerste peildatum 1-1-2026", () => {
    const r = deriveRelevantPeilYears({
      earliestTxDate: D("2025-12-31"),
      now: D("2026-04-28"),
    });
    expect(r).toEqual([2026]);
  });

  it("eerste tx in 2025, nu 2026 → alleen 2026", () => {
    const r = deriveRelevantPeilYears({
      earliestTxDate: D("2025-03-01"),
      now: D("2026-01-15"),
    });
    expect(r).toEqual([2026]);
  });

  it("eerste tx in 2024, nu nog 2024 → ook geen peil-jaren (eerste komt 1-1-2025)", () => {
    const r = deriveRelevantPeilYears({
      earliestTxDate: D("2024-03-01"),
      now: D("2024-12-31"),
    });
    // firstPeil = 2025 > currentYear 2024 → fallback [currentYear]
    expect(r).toEqual([2024]);
  });
});
