import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  addLogSink,
  clearLogSinksForTest,
  type LogEvent,
} from "@/lib/log";

import {
  instrumentProvider,
  recordCacheEvent,
  recordProviderCall,
} from "./metrics";

let captured: LogEvent[];

beforeEach(() => {
  captured = [];
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  addLogSink({
    name: "capture",
    emit: (e) => captured.push(e),
  });
});

afterEach(() => {
  clearLogSinksForTest();
  vi.restoreAllMocks();
});

describe("recordProviderCall", () => {
  it("succes → metric=provider_call op INFO-level", () => {
    recordProviderCall({
      provider: "yahoo",
      operation: "quote",
      latencyMs: 42,
      success: true,
      fallbackUsed: false,
    });
    const ev = captured[0];
    expect(ev?.level).toBe("info");
    expect(ev?.fields).toMatchObject({
      metric: "provider_call",
      provider: "yahoo",
      operation: "quote",
      latencyMs: 42,
      success: true,
      fallbackUsed: false,
    });
  });

  it("failure → metric op WARN-level + error message", () => {
    recordProviderCall({
      provider: "yahoo",
      operation: "quote",
      latencyMs: 100,
      success: false,
      fallbackUsed: true,
      error: "429 rate limited",
    });
    const ev = captured[0];
    expect(ev?.level).toBe("warn");
    expect(ev?.fields.success).toBe(false);
    expect(ev?.fields.fallbackUsed).toBe(true);
    expect(ev?.fields.error).toBe("429 rate limited");
  });
});

describe("instrumentProvider", () => {
  it("meet latency en logt success", async () => {
    const result = await instrumentProvider({
      provider: "stub",
      operation: "fundamentals",
      fn: async () => ({ ticker: "AAPL" }),
    });
    expect(result).toEqual({ ticker: "AAPL" });
    expect(captured[0]?.fields).toMatchObject({
      metric: "provider_call",
      provider: "stub",
      operation: "fundamentals",
      success: true,
      fallbackUsed: false,
    });
    expect(typeof captured[0]?.fields.latencyMs).toBe("number");
  });

  it("gooit errors door (geen swallowing) maar logt 'em wel", async () => {
    await expect(
      instrumentProvider({
        provider: "yahoo",
        operation: "quote",
        fn: async () => {
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow("boom");
    expect(captured[0]?.level).toBe("warn");
    expect(captured[0]?.fields.success).toBe(false);
    expect(captured[0]?.fields.error).toBe("boom");
  });

  it("propageert fallbackUsed naar de log-event", async () => {
    await instrumentProvider({
      provider: "stub",
      operation: "quote",
      fn: async () => 1,
      fallbackUsed: true,
    });
    expect(captured[0]?.fields.fallbackUsed).toBe(true);
  });

  it("requestId wordt mee gepropageerd", async () => {
    await instrumentProvider({
      provider: "stub",
      operation: "quote",
      fn: async () => 1,
      requestId: "req_abc",
    });
    expect(captured[0]?.fields.requestId).toBe("req_abc");
  });
});

describe("recordCacheEvent", () => {
  it("hit met ageSeconds", () => {
    recordCacheEvent({ namespace: "quotes", hit: true, ageSeconds: 12 });
    expect(captured[0]?.fields).toMatchObject({
      metric: "cache_event",
      namespace: "quotes",
      hit: true,
      ageSeconds: 12,
    });
  });

  it("miss zonder ageSeconds", () => {
    recordCacheEvent({ namespace: "fundamentals", hit: false });
    expect(captured[0]?.fields).toMatchObject({
      metric: "cache_event",
      namespace: "fundamentals",
      hit: false,
    });
    expect(captured[0]?.fields.ageSeconds).toBeUndefined();
  });
});
