import { describe, expect, it, vi } from "vitest";

import {
  TimeoutError,
  isTransientError,
  withRetry,
  withTimeout,
} from "./resilience";

describe("withTimeout", () => {
  it("retourneert de waarde als de promise binnen de tijd resolvet", async () => {
    const result = await withTimeout(Promise.resolve(42), 100);
    expect(result).toBe(42);
  });

  it("gooit TimeoutError als de promise te lang duurt", async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve("late"), 200));
    await expect(withTimeout(slow, 20)).rejects.toBeInstanceOf(TimeoutError);
  });

  it("propagates rejection zonder te wachten op de timeout", async () => {
    const failing = Promise.reject(new Error("boom"));
    await expect(withTimeout(failing, 1000)).rejects.toThrow("boom");
  });
});

describe("isTransientError", () => {
  it("herkent TimeoutError", () => {
    expect(isTransientError(new TimeoutError(1000))).toBe(true);
  });

  it("herkent netwerk-errors via bericht", () => {
    expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
    expect(isTransientError(new Error("fetch failed"))).toBe(true);
    expect(isTransientError(new Error("network unreachable"))).toBe(true);
  });

  it("herkent 5xx status via bericht", () => {
    expect(isTransientError(new Error("HTTP 503"))).toBe(true);
    expect(isTransientError(new Error("HTTP 500 internal server error"))).toBe(
      true,
    );
  });

  it("herkent 4xx NIET als transient", () => {
    expect(isTransientError(new Error("HTTP 404"))).toBe(false);
    expect(isTransientError(new Error("HTTP 400 bad request"))).toBe(false);
  });

  it("domain-errors blijven niet-transient", () => {
    expect(isTransientError(new Error("Ticker niet gevonden"))).toBe(false);
    expect(isTransientError("some string")).toBe(false);
    expect(isTransientError(null)).toBe(false);
  });
});

describe("withRetry", () => {
  it("retourneert meteen bij eerste success", async () => {
    const producer = vi.fn(async () => "ok");
    const result = await withRetry(producer, { retries: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it("retryt bij transient error en geeft dan door", async () => {
    let calls = 0;
    const producer = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new TimeoutError(100);
      return "finally";
    });
    const result = await withRetry(producer, {
      retries: 3,
      baseDelayMs: 1,
      maxDelayMs: 5,
    });
    expect(result).toBe("finally");
    expect(producer).toHaveBeenCalledTimes(3);
  });

  it("stopt meteen bij niet-transient error", async () => {
    const producer = vi.fn(async () => {
      throw new Error("Ticker niet gevonden");
    });
    await expect(
      withRetry(producer, { retries: 3, baseDelayMs: 1, maxDelayMs: 5 }),
    ).rejects.toThrow("Ticker niet gevonden");
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it("geeft finale transient error door na max retries", async () => {
    const producer = vi.fn(async () => {
      throw new TimeoutError(50);
    });
    await expect(
      withRetry(producer, { retries: 2, baseDelayMs: 1, maxDelayMs: 5 }),
    ).rejects.toBeInstanceOf(TimeoutError);
    // 1 initial + 2 retries = 3 pogingen
    expect(producer).toHaveBeenCalledTimes(3);
  });

  it("custom isRetryable overschrijft default classifier", async () => {
    let calls = 0;
    const producer = vi.fn(async () => {
      calls++;
      if (calls < 2) throw new Error("custom-marker");
      return "ok";
    });
    const result = await withRetry(producer, {
      retries: 2,
      baseDelayMs: 1,
      maxDelayMs: 5,
      isRetryable: (err) =>
        err instanceof Error && err.message === "custom-marker",
    });
    expect(result).toBe("ok");
    expect(producer).toHaveBeenCalledTimes(2);
  });
});
