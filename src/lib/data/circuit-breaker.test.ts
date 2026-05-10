import { afterEach, describe, expect, it } from "vitest";

import {
  CircuitBreakerOpenError,
  resetCircuitBreakersForTest,
  withCircuitBreaker,
} from "./resilience";

afterEach(() => {
  resetCircuitBreakersForTest();
});

describe("withCircuitBreaker", () => {
  it("succesvolle calls blijven succesvol; status closed", async () => {
    const r = await withCircuitBreaker(async () => "ok", {
      name: "test-1",
      failureThreshold: 3,
    });
    expect(r).toBe("ok");
  });

  it("opent na N opeenvolgende failures (threshold = 3)", async () => {
    const breaker = { name: "test-2", failureThreshold: 3, cooldownMs: 1_000 };
    for (let i = 0; i < 3; i++) {
      await expect(
        withCircuitBreaker(async () => {
          throw new Error("upstream down");
        }, breaker),
      ).rejects.toThrow(/upstream down/);
    }
    // 4e call → fail-fast met CircuitBreakerOpenError, niet de upstream-error
    await expect(
      withCircuitBreaker(async () => "should not run", breaker),
    ).rejects.toBeInstanceOf(CircuitBreakerOpenError);
  });

  it("succes reset de failure-counter", async () => {
    const breaker = { name: "test-3", failureThreshold: 3 };
    await expect(
      withCircuitBreaker(async () => {
        throw new Error("hick");
      }, breaker),
    ).rejects.toThrow();
    await expect(
      withCircuitBreaker(async () => {
        throw new Error("hick");
      }, breaker),
    ).rejects.toThrow();
    // Goede call resette de counter
    await withCircuitBreaker(async () => "ok", breaker);
    // Nog 2 failures: nog niet open (counter was 0 na reset)
    await expect(
      withCircuitBreaker(async () => {
        throw new Error("hick");
      }, breaker),
    ).rejects.toThrow();
    await expect(
      withCircuitBreaker(async () => {
        throw new Error("hick");
      }, breaker),
    ).rejects.toThrow();
    // Nog niet open — circuit is op 2, threshold = 3
    const r = await withCircuitBreaker(async () => "still ok", breaker);
    expect(r).toBe("still ok");
  });

  it("verschillende namen hebben onafhankelijke breakers", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(
        withCircuitBreaker(async () => {
          throw new Error("a fail");
        }, { name: "breaker-A", failureThreshold: 3 }),
      ).rejects.toThrow();
    }
    // breaker-B is nog vers
    const r = await withCircuitBreaker(
      async () => "B-ok",
      { name: "breaker-B" },
    );
    expect(r).toBe("B-ok");
  });

  it("half-open probe na cooldown — succes sluit weer", async () => {
    const breaker = {
      name: "test-cooldown",
      failureThreshold: 2,
      cooldownMs: 50,
    };
    for (let i = 0; i < 2; i++) {
      await expect(
        withCircuitBreaker(async () => {
          throw new Error("down");
        }, breaker),
      ).rejects.toThrow();
    }
    // Nu open
    await expect(
      withCircuitBreaker(async () => "no", breaker),
    ).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    // Wacht cooldown
    await new Promise((r) => setTimeout(r, 60));
    // Half-open probe: succes → closed
    const r = await withCircuitBreaker(async () => "recovered", breaker);
    expect(r).toBe("recovered");
    // Daarna gewoon doorlopen
    const r2 = await withCircuitBreaker(async () => "still ok", breaker);
    expect(r2).toBe("still ok");
  });

  it("half-open probe — fail → opnieuw open", async () => {
    const breaker = {
      name: "test-half-fail",
      failureThreshold: 2,
      cooldownMs: 50,
    };
    for (let i = 0; i < 2; i++) {
      await expect(
        withCircuitBreaker(async () => {
          throw new Error("down");
        }, breaker),
      ).rejects.toThrow();
    }
    await new Promise((r) => setTimeout(r, 60));
    // Half-open probe → faalt → terug open
    await expect(
      withCircuitBreaker(async () => {
        throw new Error("still down");
      }, breaker),
    ).rejects.toThrow(/still down/);
    // Volgende call: fail-fast want weer open
    await expect(
      withCircuitBreaker(async () => "no", breaker),
    ).rejects.toBeInstanceOf(CircuitBreakerOpenError);
  });
});
