import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Module 24 — audit-wrapper tests.
 *
 * Verify dat:
 *  - elke event-functie `audit.record` aanroept met de juiste category
 *  - clientEmailHash i.p.v. raw e-mail in resourceId belandt
 *  - PII-scrubber e-mails uit metadata weert
 */

const { recordMock } = vi.hoisted(() => ({
  recordMock: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  audit: { record: recordMock },
}));

// Imports MOETEN na vi.mock zodat de mock geactiveerd is wanneer
// `./audit` `@/lib/audit` binnen-hoist.
import {
  recordAdvisorAccessDenied,
  recordAdvisorClientOpened,
  recordAdvisorClientReportExported,
} from "./audit";
import { clientEmailHash } from "./service";

beforeEach(() => {
  recordMock.mockClear();
  recordMock.mockResolvedValue(undefined);
});

describe("recordAdvisorClientOpened", () => {
  it("schrijft audit-event met clientEmailHash i.p.v. raw e-mail", async () => {
    await recordAdvisorClientOpened({
      advisorEmail: "advisor@firm.com",
      clientEmail: "bart@example.com",
    });

    expect(recordMock).toHaveBeenCalledTimes(1);
    const call = recordMock.mock.calls[0]![0];
    expect(call.action).toBe("advisor_client_opened");
    expect(call.category).toBe("system");
    expect(call.resourceId).toBe(clientEmailHash("bart@example.com"));
    expect(JSON.stringify(call.metadata)).not.toContain("bart@example.com");
    expect(JSON.stringify(call.metadata)).toContain(
      clientEmailHash("bart@example.com"),
    );
  });

  it("scrubt e-mails uit user-supplied metadata", async () => {
    await recordAdvisorClientOpened({
      advisorEmail: "a@x.com",
      clientEmail: "c@y.com",
      metadata: { notitie: "stuur dit naar fiscalist@firm.com" },
    });
    const call = recordMock.mock.calls[0]![0];
    const meta = JSON.stringify(call.metadata);
    expect(meta).not.toContain("fiscalist@firm.com");
    expect(meta).toContain("[redacted-email]");
  });
});

describe("recordAdvisorClientReportExported", () => {
  it("includeert format + schemaVersion in metadata", async () => {
    await recordAdvisorClientReportExported({
      advisorEmail: "a@x.com",
      clientEmail: "c@y.com",
      format: "html",
      schemaVersion: 1,
    });
    const call = recordMock.mock.calls[0]![0];
    expect(call.action).toBe("advisor_client_report_exported");
    expect((call.metadata as Record<string, unknown>).format).toBe("html");
    expect((call.metadata as Record<string, unknown>).schemaVersion).toBe(1);
  });
});

describe("recordAdvisorAccessDenied", () => {
  it("schrijft auth-category event met reason", async () => {
    await recordAdvisorAccessDenied({
      advisorEmail: "a@x.com",
      attemptedClientId: "deadbeef1234",
      reason: "not_linked",
    });
    const call = recordMock.mock.calls[0]![0];
    expect(call.category).toBe("auth");
    expect(call.action).toBe("advisor_access_denied");
    expect((call.metadata as Record<string, unknown>).reason).toBe(
      "not_linked",
    );
  });

  it("trunkeert lange clientId-attempts (anti-log-spam)", async () => {
    const longId = "a".repeat(200);
    await recordAdvisorAccessDenied({
      advisorEmail: "a@x.com",
      attemptedClientId: longId,
      reason: "not_linked",
    });
    const call = recordMock.mock.calls[0]![0];
    expect((call.resourceId ?? "").length).toBeLessThanOrEqual(32);
  });
});

describe("Module 24 — privacy-spec-conformance", () => {
  it("geen raw e-mail in audit-metadata bij alle 3 events", async () => {
    const RAW = "bart-verdijk@example.com";

    await recordAdvisorClientOpened({
      advisorEmail: "advisor@firm.com",
      clientEmail: RAW,
    });
    await recordAdvisorClientReportExported({
      advisorEmail: "advisor@firm.com",
      clientEmail: RAW,
      format: "html",
      schemaVersion: 1,
    });
    await recordAdvisorAccessDenied({
      advisorEmail: "advisor@firm.com",
      attemptedClientId: clientEmailHash(RAW),
      reason: "not_linked",
    });

    expect(recordMock).toHaveBeenCalledTimes(3);
    for (const call of recordMock.mock.calls) {
      const serialized = JSON.stringify(call[0].metadata);
      expect(serialized).not.toContain(RAW);
      expect(serialized).not.toContain("bart-verdijk");
    }
  });
});
