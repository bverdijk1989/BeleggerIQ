import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  recordProviderCall,
  resetProviderHealth,
  snapshotProviderHealth,
  withProviderHealth,
} from "./store";

/**
 * Module 26 — Provider Health store tests.
 *
 * Test scenarios:
 *  - success + failure events worden correct geteld
 *  - latency-percentielen kloppen
 *  - stale-flag activeert na 1u inactivity
 *  - healthy-flag deactiveert wanneer geen recent success
 *  - withProviderHealth wrapt success + failure correct
 *  - geen PII in events
 */

beforeEach(() => {
  resetProviderHealth();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("recordProviderCall — telling + percentielen", () => {
  it("telt 5 successes correct + bouwt percentielen", () => {
    for (const ms of [10, 20, 30, 40, 50]) {
      recordProviderCall({
        provider: "yahoo",
        kind: "market-data",
        operation: "quote",
        durationMs: ms,
        ok: true,
      });
    }
    const snap = snapshotProviderHealth();
    const y = snap.byProvider.find((p) => p.provider === "yahoo")!;
    expect(y.callCount).toBe(5);
    expect(y.successCount).toBe(5);
    expect(y.failureCount).toBe(0);
    expect(y.latencyP50Ms).toBe(30);
    expect(y.latencyP95Ms).toBe(50);
    expect(y.avgLatencyMs).toBe(30);
  });

  it("failure-events updaten lastError + failureCount", () => {
    recordProviderCall({
      provider: "yahoo",
      kind: "market-data",
      operation: "quote",
      durationMs: 800,
      ok: false,
      errorName: "TimeoutError",
    });
    const snap = snapshotProviderHealth();
    const y = snap.byProvider.find((p) => p.provider === "yahoo")!;
    expect(y.failureCount).toBe(1);
    expect(y.lastError).toBe("TimeoutError");
    expect(y.lastFailureAt).toBeTruthy();
    expect(y.lastSuccessAt).toBeNull();
  });

  it("fallback-invocations worden apart geteld", () => {
    recordProviderCall({
      provider: "alpha",
      kind: "market-data",
      operation: "quote",
      durationMs: 100,
      ok: true,
      fromFallback: true,
    });
    const snap = snapshotProviderHealth();
    const a = snap.byProvider.find((p) => p.provider === "alpha")!;
    expect(a.fallbackInvocationCount).toBe(1);
  });

  it("event-buffer rotatie behoudt cumulatieve counters", () => {
    // Voer meer dan maxEventsPerProvider (500) events uit en check dat
    // cum-counters niet resetten — alleen percentile-buffer roteert.
    for (let i = 0; i < 600; i++) {
      recordProviderCall({
        provider: "yahoo",
        kind: "market-data",
        operation: "quote",
        durationMs: 10,
        ok: true,
      });
    }
    const snap = snapshotProviderHealth();
    const y = snap.byProvider.find((p) => p.provider === "yahoo")!;
    expect(y.callCount).toBe(600);
    expect(y.successCount).toBe(600);
  });
});

describe("snapshotProviderHealth — healthy + stale flags", () => {
  it("healthy=true wanneer recent success", () => {
    recordProviderCall({
      provider: "yahoo",
      kind: "market-data",
      operation: "quote",
      durationMs: 10,
      ok: true,
    });
    const snap = snapshotProviderHealth();
    expect(snap.byProvider[0]!.healthy).toBe(true);
    expect(snap.byProvider[0]!.stale).toBe(false);
  });

  it("healthy=false als geen success in window (5min)", () => {
    const start = Date.now();
    recordProviderCall({
      provider: "yahoo",
      kind: "market-data",
      operation: "quote",
      durationMs: 10,
      ok: true,
    });
    // 10 min later
    const snap = snapshotProviderHealth(start + 10 * 60_000);
    expect(snap.byProvider[0]!.healthy).toBe(false);
  });

  it("stale=true wanneer geen activity binnen 1u", () => {
    const start = Date.now();
    recordProviderCall({
      provider: "yahoo",
      kind: "market-data",
      operation: "quote",
      durationMs: 10,
      ok: true,
    });
    const snap = snapshotProviderHealth(start + 2 * 60 * 60_000);
    expect(snap.byProvider[0]!.stale).toBe(true);
  });
});

describe("withProviderHealth — wrapper", () => {
  it("succes-call → event + originele return", async () => {
    const result = await withProviderHealth(
      { provider: "yahoo", kind: "market-data", operation: "quote" },
      async () => "MSFT 420",
    );
    expect(result).toBe("MSFT 420");
    const snap = snapshotProviderHealth();
    expect(snap.byProvider[0]!.successCount).toBe(1);
  });

  it("failure → re-throw + failure-event", async () => {
    await expect(
      withProviderHealth(
        { provider: "yahoo", kind: "market-data", operation: "quote" },
        async () => {
          throw new TypeError("bad ticker");
        },
      ),
    ).rejects.toThrow(TypeError);
    const snap = snapshotProviderHealth();
    const y = snap.byProvider[0]!;
    expect(y.failureCount).toBe(1);
    expect(y.lastError).toBe("TypeError");
  });
});

describe("Module 26 — privacy + spec-conformance", () => {
  it("lastError wordt getrunkeerd op 80 chars (geen secret-leak)", () => {
    const longErr = "X".repeat(500);
    recordProviderCall({
      provider: "yahoo",
      kind: "market-data",
      operation: "quote",
      durationMs: 10,
      ok: false,
      errorName: longErr,
    });
    const snap = snapshotProviderHealth();
    const y = snap.byProvider[0]!;
    expect(y.lastError!.length).toBeLessThanOrEqual(80);
  });

  it("snapshot bevat geen call-by-call detail (privacy)", () => {
    recordProviderCall({
      provider: "yahoo",
      kind: "market-data",
      operation: "quote",
      durationMs: 10,
      ok: true,
    });
    const snap = snapshotProviderHealth();
    const json = JSON.stringify(snap);
    // Geen ticker, geen request-body, geen response-payload.
    expect(json).not.toContain("operation");
    expect(json).not.toContain("durationMs"); // we exposen geaggregeerd
  });

  it("multi-provider sortering is alfabetisch", () => {
    for (const p of ["z-provider", "a-provider", "m-provider"]) {
      recordProviderCall({
        provider: p,
        kind: "market-data",
        operation: "quote",
        durationMs: 10,
        ok: true,
      });
    }
    const snap = snapshotProviderHealth();
    const names = snap.byProvider.map((p) => p.provider);
    expect(names).toEqual(["a-provider", "m-provider", "z-provider"]);
  });
});
