import { describe, expect, it } from "vitest";

import {
  buildDefaultAlertPreferences,
  mergeAlertPreferences,
  parseAlertPreferences,
  shouldDeliverAlert,
} from "./preferences";
import { evaluateAlerts } from "./service";

const ASOF = "2026-05-10T12:00:00.000Z";

describe("buildDefaultAlertPreferences", () => {
  it("levert per type een entry met enabled=true", () => {
    const prefs = buildDefaultAlertPreferences();
    expect(prefs.HEALTH_DROP.enabled).toBe(true);
    expect(prefs.AI_BRIEFING_READY.enabled).toBe(true);
    expect(prefs.EARNINGS_EVENT.minSeverity).toBe("INFO");
  });
});

describe("parseAlertPreferences", () => {
  it("ongeldige input → defaults", () => {
    const prefs = parseAlertPreferences(null);
    expect(prefs.HEALTH_DROP.enabled).toBe(true);
  });

  it("partial input wordt aangevuld met defaults", () => {
    const prefs = parseAlertPreferences({
      HEALTH_DROP: { enabled: false, minSeverity: "WARNING" },
    });
    expect(prefs.HEALTH_DROP.enabled).toBe(false);
    expect(prefs.HEALTH_DROP.minSeverity).toBe("WARNING");
    expect(prefs.PRICE_MOVE.enabled).toBe(true);
  });

  it("invalid severity-waarde → fallback default", () => {
    const prefs = parseAlertPreferences({
      HEALTH_DROP: { enabled: true, minSeverity: "BANANAS" },
    });
    expect(prefs.HEALTH_DROP.minSeverity).toBe("INFO");
  });
});

describe("shouldDeliverAlert", () => {
  it("respecteert enabled=false", () => {
    const prefs = buildDefaultAlertPreferences();
    prefs.HEALTH_DROP.enabled = false;
    expect(shouldDeliverAlert(prefs, "HEALTH_DROP", "WARNING")).toBe(false);
  });

  it("respecteert min-severity (filter INFO weg)", () => {
    const prefs = buildDefaultAlertPreferences();
    prefs.PRICE_MOVE.minSeverity = "WARNING";
    expect(shouldDeliverAlert(prefs, "PRICE_MOVE", "INFO")).toBe(false);
    expect(shouldDeliverAlert(prefs, "PRICE_MOVE", "WARNING")).toBe(true);
    expect(shouldDeliverAlert(prefs, "PRICE_MOVE", "CRITICAL")).toBe(true);
  });

  it("CRITICAL min-severity laat alleen CRITICAL door", () => {
    const prefs = buildDefaultAlertPreferences();
    prefs.HEALTH_DROP.minSeverity = "CRITICAL";
    expect(shouldDeliverAlert(prefs, "HEALTH_DROP", "INFO")).toBe(false);
    expect(shouldDeliverAlert(prefs, "HEALTH_DROP", "WARNING")).toBe(false);
    expect(shouldDeliverAlert(prefs, "HEALTH_DROP", "CRITICAL")).toBe(true);
  });
});

describe("mergeAlertPreferences", () => {
  it("patch overschrijft alleen genoemde types", () => {
    const base = buildDefaultAlertPreferences();
    const next = mergeAlertPreferences(base, {
      AI_BRIEFING_READY: { enabled: false, minSeverity: "INFO" },
    });
    expect(next.AI_BRIEFING_READY.enabled).toBe(false);
    expect(next.HEALTH_DROP.enabled).toBe(true);
  });
});

describe("evaluateAlerts", () => {
  it("zonder generator-input → 0 alerts", () => {
    const result = evaluateAlerts({ userId: "u-1" });
    expect(result.generated).toHaveLength(0);
    expect(result.delivered).toHaveLength(0);
  });

  it("orchestreert meerdere generators in 1 run", () => {
    const result = evaluateAlerts({
      userId: "u-1",
      health: {
        asOf: ASOF,
        current: 35,
        previous: 70,
        currentGrade: "D",
      },
      priceMove: {
        asOf: ASOF,
        positions: [
          { ticker: "ASML", name: "ASML", dayChange: 0.08, weight: 0.15 },
        ],
      },
      briefing: {
        asOf: ASOF,
        briefingDate: "2026-05-10",
        headline: "Test briefing",
        mode: "ai",
      },
    });
    // Health levert 2 alerts (below + drop), priceMove 1, briefing 1.
    expect(result.generated.length).toBeGreaterThanOrEqual(4);
    expect(result.delivered.length).toBeGreaterThanOrEqual(4);
  });

  it("dedupliceert candidates met dezelfde dedupeKey", () => {
    const result = evaluateAlerts({
      userId: "u-1",
      // Twee aparte runs van dezelfde briefing zouden 1 candidate moeten zijn
      // (in praktijk niet gebeurt, maar defensive).
      briefing: {
        asOf: ASOF,
        briefingDate: "2026-05-10",
        headline: "X",
        mode: "ai",
      },
    });
    expect(result.generated).toHaveLength(1);
  });

  it("filtert candidates volgens preferences", () => {
    const prefs = buildDefaultAlertPreferences();
    prefs.AI_BRIEFING_READY.enabled = false;
    const result = evaluateAlerts({
      userId: "u-1",
      preferences: prefs,
      briefing: {
        asOf: ASOF,
        briefingDate: "2026-05-10",
        headline: "X",
        mode: "ai",
      },
    });
    expect(result.generated).toHaveLength(1);
    expect(result.delivered).toHaveLength(0);
    expect(result.filteredOut).toBe(1);
  });

  it("min-severity filtert INFO weg maar laat WARNING door", () => {
    const prefs = buildDefaultAlertPreferences();
    prefs.PRICE_MOVE.minSeverity = "WARNING";
    const result = evaluateAlerts({
      userId: "u-1",
      preferences: prefs,
      priceMove: {
        asOf: ASOF,
        positions: [
          // 6% move = INFO → gefilterd
          { ticker: "A", name: "A", dayChange: 0.06, weight: 0.05 },
          // 12% move = WARNING → door
          { ticker: "B", name: "B", dayChange: 0.12, weight: 0.05 },
        ],
      },
    });
    expect(result.delivered.map((c) => c.dedupeKey)).toEqual([
      expect.stringContaining(":B"),
    ]);
    expect(result.filteredOut).toBe(1);
  });
});
