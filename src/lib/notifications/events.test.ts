import { describe, expect, it } from "vitest";

import {
  detectNewRiskFlags,
  detectPositionCapExceeded,
  detectRegimeSwitch,
  detectWatchlistPriceAlerts,
} from "./events";

const NOW = new Date("2026-04-28T08:00:00.000Z");

describe("detectNewRiskFlags", () => {
  it("nieuw HIGH-flag → critical event", () => {
    const events = detectNewRiskFlags({
      userId: "u1",
      occurredAt: NOW,
      previous: [],
      current: [
        { ticker: "ASML", reason: "concentration", severity: "HIGH" },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.severity).toBe("critical");
    expect(events[0]?.title).toMatch(/HIGH/);
  });

  it("flag stond al actief → géén event (dedup via prev/curr diff)", () => {
    const flag = {
      ticker: "ASML",
      reason: "concentration",
      severity: "HIGH" as const,
    };
    const events = detectNewRiskFlags({
      userId: "u1",
      occurredAt: NOW,
      previous: [flag],
      current: [flag],
    });
    expect(events).toEqual([]);
  });

  it("LOW-severity wordt geskipt — geen alert-spam voor minor", () => {
    const events = detectNewRiskFlags({
      userId: "u1",
      occurredAt: NOW,
      previous: [],
      current: [{ ticker: "X", reason: "minor", severity: "LOW" }],
    });
    expect(events).toEqual([]);
  });

  it("idempotency-key bevat ticker + day + reason", () => {
    const events = detectNewRiskFlags({
      userId: "u1",
      occurredAt: NOW,
      previous: [],
      current: [{ ticker: "ASML", reason: "drawdown", severity: "MEDIUM" }],
    });
    expect(events[0]?.key).toMatch(/^NEW_RISK_FLAG:u1:2026-04-28:ASML:drawdown$/);
  });
});

describe("detectPositionCapExceeded", () => {
  it("weight = 1.5× cap → POSITION_CAP_EXCEEDED (informational)", () => {
    const events = detectPositionCapExceeded({
      userId: "u1",
      occurredAt: NOW,
      positions: [{ ticker: "ASML", weight: 0.15, cap: 0.1 }],
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("POSITION_CAP_EXCEEDED");
    expect(events[0]?.severity).toBe("informational");
  });

  it("weight = 2.5× cap → FRAGILE_CONCENTRATION (critical)", () => {
    const events = detectPositionCapExceeded({
      userId: "u1",
      occurredAt: NOW,
      positions: [{ ticker: "ASML", weight: 0.25, cap: 0.1 }],
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("FRAGILE_CONCENTRATION");
    expect(events[0]?.severity).toBe("critical");
  });

  it("weight binnen cap → geen event", () => {
    const events = detectPositionCapExceeded({
      userId: "u1",
      occurredAt: NOW,
      positions: [{ ticker: "ASML", weight: 0.08, cap: 0.1 }],
    });
    expect(events).toEqual([]);
  });

  it("cap=0 (geen limiet) → geen event (geen division-by-zero)", () => {
    const events = detectPositionCapExceeded({
      userId: "u1",
      occurredAt: NOW,
      positions: [{ ticker: "X", weight: 0.5, cap: 0 }],
    });
    expect(events).toEqual([]);
  });

  it("idempotency-key bevat ticker + day", () => {
    const events = detectPositionCapExceeded({
      userId: "u1",
      occurredAt: NOW,
      positions: [{ ticker: "ASML", weight: 0.15, cap: 0.1 }],
    });
    expect(events[0]?.key).toMatch(/^POSITION_CAP_EXCEEDED:u1:2026-04-28:ASML$/);
  });
});

describe("detectRegimeSwitch", () => {
  it("EXPANSION → SLOWDOWN levert critical event", () => {
    const events = detectRegimeSwitch({
      userId: "u1",
      occurredAt: NOW,
      previous: "EXPANSION",
      current: "SLOWDOWN",
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.severity).toBe("critical");
    expect(events[0]?.title).toMatch(/EXPANSION → SLOWDOWN/);
  });

  it("zelfde label → geen event", () => {
    expect(
      detectRegimeSwitch({
        userId: "u1",
        occurredAt: NOW,
        previous: "EXPANSION",
        current: "EXPANSION",
      }),
    ).toEqual([]);
  });

  it("UNKNOWN-naar-iets en eerste meting → geen event", () => {
    expect(
      detectRegimeSwitch({
        userId: "u1",
        occurredAt: NOW,
        previous: null,
        current: "EXPANSION",
      }),
    ).toEqual([]);
    expect(
      detectRegimeSwitch({
        userId: "u1",
        occurredAt: NOW,
        previous: "UNKNOWN",
        current: "EXPANSION",
      }),
    ).toEqual([]);
  });

  it("idempotency-key bevat dag + transitie", () => {
    const events = detectRegimeSwitch({
      userId: "u1",
      occurredAt: NOW,
      previous: "EXPANSION",
      current: "SLOWDOWN",
    });
    expect(events[0]?.key).toMatch(
      /^REGIME_SWITCH:u1:2026-04-28:EXPANSION:SLOWDOWN$/,
    );
  });
});

describe("detectWatchlistPriceAlerts", () => {
  it("prijs ≤ targetLow → ALERT met direction=BELOW", () => {
    const events = detectWatchlistPriceAlerts({
      userId: "u1",
      occurredAt: NOW,
      checks: [
        {
          watchlistItemId: "w1",
          ticker: "AAPL",
          currentPrice: 145,
          currency: "USD",
          targetLow: 150,
          targetHigh: null,
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.context.direction).toBe("BELOW");
  });

  it("prijs ≥ targetHigh → ALERT met direction=ABOVE", () => {
    const events = detectWatchlistPriceAlerts({
      userId: "u1",
      occurredAt: NOW,
      checks: [
        {
          watchlistItemId: "w1",
          ticker: "TSLA",
          currentPrice: 250,
          currency: "USD",
          targetLow: null,
          targetHigh: 240,
        },
      ],
    });
    expect(events[0]?.context.direction).toBe("ABOVE");
  });

  it("prijs tussen low en high (geen trigger) → geen event", () => {
    const events = detectWatchlistPriceAlerts({
      userId: "u1",
      occurredAt: NOW,
      checks: [
        {
          watchlistItemId: "w1",
          ticker: "X",
          currentPrice: 100,
          currency: "EUR",
          targetLow: 90,
          targetHigh: 110,
        },
      ],
    });
    expect(events).toEqual([]);
  });

  it("dezelfde dag, 2 ticks → zelfde key (idempotent dedup)", () => {
    const e1 = detectWatchlistPriceAlerts({
      userId: "u1",
      occurredAt: NOW,
      checks: [
        {
          watchlistItemId: "w1",
          ticker: "AAPL",
          currentPrice: 145,
          currency: "USD",
          targetLow: 150,
          targetHigh: null,
        },
      ],
    });
    const e2 = detectWatchlistPriceAlerts({
      userId: "u1",
      occurredAt: new Date("2026-04-28T15:00:00.000Z"),
      checks: [
        {
          watchlistItemId: "w1",
          ticker: "AAPL",
          currentPrice: 144,
          currency: "USD",
          targetLow: 150,
          targetHigh: null,
        },
      ],
    });
    expect(e1[0]?.key).toBe(e2[0]?.key);
  });
});
