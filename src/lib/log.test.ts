import { afterEach, describe, expect, it, vi } from "vitest";

import { log } from "./log";

describe("log", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
