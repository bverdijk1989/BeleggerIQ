import { describe, expect, it } from "vitest";

import {
  backupHealthToHttpStatus,
  evaluateBackupHealth,
} from "./backup-health";

const NOW = new Date("2026-04-27T12:00:00.000Z");

describe("evaluateBackupHealth", () => {
  it("status=null → unknown + 503", () => {
    const v = evaluateBackupHealth({ status: null, now: NOW });
    expect(v.status).toBe("unknown");
    expect(v.ageHours).toBeNull();
    expect(backupHealthToHttpStatus(v)).toBe(503);
  });

  it("verse success (5u oud) → ok + 200", () => {
    const v = evaluateBackupHealth({
      status: {
        lastAttemptAt: new Date(NOW.getTime() - 5 * 3600_000).toISOString(),
        lastResult: "success",
        lastSuccessKey: "daily/x.sql.gz.age",
      },
      now: NOW,
    });
    expect(v.status).toBe("ok");
    expect(v.ageHours).toBeCloseTo(5, 5);
    expect(backupHealthToHttpStatus(v)).toBe(200);
  });

  it("oude success (31u) → stale + 503", () => {
    const v = evaluateBackupHealth({
      status: {
        lastAttemptAt: new Date(NOW.getTime() - 31 * 3600_000).toISOString(),
        lastResult: "success",
      },
      now: NOW,
    });
    expect(v.status).toBe("stale");
    expect(backupHealthToHttpStatus(v)).toBe(503);
  });

  it("failure (zelfs als recent) → failed + 503", () => {
    const v = evaluateBackupHealth({
      status: {
        lastAttemptAt: new Date(NOW.getTime() - 1 * 3600_000).toISOString(),
        lastResult: "failure",
        message: "pg_dump exit 1",
      },
      now: NOW,
    });
    expect(v.status).toBe("failed");
    expect(v.message).toMatch(/pg_dump/);
    expect(backupHealthToHttpStatus(v)).toBe(503);
  });

  it("ongeldige lastAttemptAt → unknown", () => {
    const v = evaluateBackupHealth({
      status: { lastAttemptAt: "niet-een-datum", lastResult: "success" },
      now: NOW,
    });
    expect(v.status).toBe("unknown");
  });

  it("custom drempel werkt", () => {
    const v = evaluateBackupHealth({
      status: {
        lastAttemptAt: new Date(NOW.getTime() - 7 * 3600_000).toISOString(),
        lastResult: "success",
      },
      now: NOW,
      thresholdHours: 6,
    });
    expect(v.status).toBe("stale");
    expect(v.thresholdHours).toBe(6);
  });
});
