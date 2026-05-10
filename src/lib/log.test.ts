import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addLogSink,
  clearLogSinksForTest,
  log,
  type LogEvent,
} from "./log";

describe("log — basis", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearLogSinksForTest();
  });

  it("emit gestructureerde payload met scope en level", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    log.warn("market:quote", "provider failed", { ticker: "ASML" });
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.scope).toBe("market:quote");
    expect(arg.level).toBe("warn");
    expect(arg.msg).toBe("provider failed");
    expect(arg.ticker).toBe("ASML");
  });

  it("serialiseert Error-objecten naar { name, message }", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log.error("api", "boom", { error: new Error("bad") });
    const arg = spy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.error).toEqual({ name: "Error", message: "bad" });
  });

  it("debug gaat naar console.debug", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    log.debug("x", "y");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("log — secret-redactie", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearLogSinksForTest();
  });

  it("top-level password / token / secret worden geredacteerd", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    log.info("auth", "login", {
      email: "u@e.nl",
      password: "hunter2",
      token: "abc",
      secret: "shhh",
    });
    const arg = spy.mock.calls[0]?.[0] as Record<string, unknown>;
    // Email-VALUE wordt nu ook geredacteerd via value-level PII-scrubber
    // (Module 17). Defense-in-depth: niet alleen op veld-naam, ook op
    // string-pattern. `[email-redacted]` is de placeholder.
    expect(arg.email).toBe("[email-redacted]");
    expect(arg.password).toBe("[redacted]");
    expect(arg.token).toBe("[redacted]");
    expect(arg.secret).toBe("[redacted]");
  });

  it("nested headers.authorization wordt geredacteerd", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    log.info("http", "incoming", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer eyJxxxx",
        cookie: "session=abc",
      },
    });
    const arg = spy.mock.calls[0]?.[0] as Record<string, unknown>;
    const headers = arg.headers as Record<string, unknown>;
    expect(headers["content-type"]).toBe("application/json");
    expect(headers.authorization).toBe("[redacted]");
    expect(headers.cookie).toBe("[redacted]");
  });

  it("case-insensitief: API_KEY / Cookie / SET-COOKIE worden ook geredacteerd", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    log.info("x", "y", { API_KEY: "k", Cookie: "c", "Set-Cookie": "s" });
    const arg = spy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.API_KEY).toBe("[redacted]");
    expect(arg.Cookie).toBe("[redacted]");
    expect(arg["Set-Cookie"]).toBe("[redacted]");
  });

  it("redactie loopt niet eindeloos op cyclic objects", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const a: Record<string, unknown> = { name: "a" };
    const b: Record<string, unknown> = { name: "b", child: a };
    a.child = b; // cycle
    expect(() => log.info("x", "y", { tree: a })).not.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("log — sinks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearLogSinksForTest();
  });

  it("sink ontvangt LogEvent met geredacteerde fields", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const events: LogEvent[] = [];
    addLogSink({
      name: "memory",
      emit: (e) => events.push(e),
    });
    log.info("auth", "login", { email: "u@e.nl", password: "hunter2" });
    expect(events).toHaveLength(1);
    expect(events[0]?.scope).toBe("auth");
    expect(events[0]?.fields.password).toBe("[redacted]");
    // Email-VALUE wordt geredacteerd via value-level PII-scrubber (Module 17).
    expect(events[0]?.fields.email).toBe("[email-redacted]");
    expect(typeof events[0]?.ts).toBe("string");
  });

  it("falende sink breekt console-logging niet", () => {
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    addLogSink({
      name: "broken",
      emit: () => {
        throw new Error("upstream down");
      },
    });
    expect(() => log.info("x", "y")).not.toThrow();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });
});
