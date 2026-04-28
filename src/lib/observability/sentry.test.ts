import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSentrySink } from "./sentry";

interface CallLog {
  exceptions: Array<{ err: unknown; ctx?: unknown }>;
  messages: Array<{ msg: string; level?: string }>;
  breadcrumbs: Array<{
    level?: string;
    category?: string;
    message?: string;
    data?: Record<string, unknown>;
  }>;
}

function makeStub(): { client: Parameters<typeof createSentrySink>[0]; calls: CallLog } {
  const calls: CallLog = { exceptions: [], messages: [], breadcrumbs: [] };
  const client = {
    init: vi.fn(),
    captureException: (err: unknown, ctx?: unknown) =>
      calls.exceptions.push({ err, ctx }),
    captureMessage: (msg: string, level?: string) =>
      calls.messages.push({ msg, level }),
    addBreadcrumb: (b: CallLog["breadcrumbs"][number]) =>
      calls.breadcrumbs.push(b),
  };
  return { client, calls };
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSentrySink", () => {
  it("debug + info worden genegeerd (geen breadcrumb spam)", () => {
    const { client, calls } = makeStub();
    const sink = createSentrySink(client);
    sink.emit({
      level: "info",
      scope: "x",
      msg: "y",
      fields: {},
      ts: "2026-04-27T00:00:00Z",
    });
    sink.emit({
      level: "debug",
      scope: "x",
      msg: "y",
      fields: {},
      ts: "2026-04-27T00:00:00Z",
    });
    expect(calls.breadcrumbs).toHaveLength(0);
    expect(calls.exceptions).toHaveLength(0);
  });

  it("warn → breadcrumb, geen captureException", () => {
    const { client, calls } = makeStub();
    const sink = createSentrySink(client);
    sink.emit({
      level: "warn",
      scope: "yahoo",
      msg: "rate limited",
      fields: { provider: "yahoo" },
      ts: "2026-04-27T00:00:00Z",
    });
    expect(calls.breadcrumbs).toHaveLength(1);
    expect(calls.exceptions).toHaveLength(0);
    expect(calls.breadcrumbs[0]?.category).toBe("yahoo");
  });

  it("error met Error-shape field → captureException", () => {
    const { client, calls } = makeStub();
    const sink = createSentrySink(client);
    sink.emit({
      level: "error",
      scope: "api",
      msg: "boom",
      fields: { error: { name: "TypeError", message: "x is undefined" } },
      ts: "2026-04-27T00:00:00Z",
    });
    expect(calls.exceptions).toHaveLength(1);
    const err = calls.exceptions[0]?.err as Error;
    expect(err.message).toBe("x is undefined");
    expect(err.name).toBe("TypeError");
  });

  it("error zonder Error-field → captureMessage", () => {
    const { client, calls } = makeStub();
    const sink = createSentrySink(client);
    sink.emit({
      level: "error",
      scope: "api",
      msg: "validation_failed",
      fields: { code: "INVALID_INPUT" },
      ts: "2026-04-27T00:00:00Z",
    });
    expect(calls.messages).toHaveLength(1);
    expect(calls.messages[0]?.msg).toContain("validation_failed");
    expect(calls.messages[0]?.level).toBe("error");
  });

  it("client=null is een no-op (geen DSN, geen package)", () => {
    const sink = createSentrySink(null);
    expect(() =>
      sink.emit({
        level: "error",
        scope: "x",
        msg: "y",
        fields: {},
        ts: "2026-04-27T00:00:00Z",
      }),
    ).not.toThrow();
  });
});
