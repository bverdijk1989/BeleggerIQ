import { describe, expect, it } from "vitest";

import { detectTargetZone } from "./target-zone";

const NOW = "2026-04-25T00:00:00.000Z";

describe("detectTargetZone — expliciete band", () => {
  it("HIGH bij koers binnen [targetPrice, targetPriceHigh]", () => {
    const t = detectTargetZone({
      currentPrice: 95,
      targetPrice: 90,
      targetPriceHigh: 100,
      buyZoneTolerance: 0.05,
      now: NOW,
    });
    expect(t).not.toBeNull();
    expect(t!.type).toBe("target-zone-reached");
    expect(t!.severity).toBe("HIGH");
  });

  it("HIGH bij koers onder de band-ondergrens", () => {
    const t = detectTargetZone({
      currentPrice: 80,
      targetPrice: 90,
      targetPriceHigh: 100,
      buyZoneTolerance: 0.05,
      now: NOW,
    });
    expect(t!.severity).toBe("HIGH");
    expect(t!.rationale.some((r) => /onder/.test(r))).toBe(true);
  });

  it("MEDIUM bij koers net boven de band maar binnen tolerantie", () => {
    const t = detectTargetZone({
      currentPrice: 103, // 3% boven 100
      targetPrice: 90,
      targetPriceHigh: 100,
      buyZoneTolerance: 0.05,
      now: NOW,
    });
    expect(t).not.toBeNull();
    expect(t!.severity).toBe("MEDIUM");
  });

  it("null bij koers ver boven de band", () => {
    const t = detectTargetZone({
      currentPrice: 120,
      targetPrice: 90,
      targetPriceHigh: 100,
      buyZoneTolerance: 0.05,
      now: NOW,
    });
    expect(t).toBeNull();
  });
});

describe("detectTargetZone — enkele target + tolerantie", () => {
  it("HIGH op of onder target", () => {
    const t = detectTargetZone({
      currentPrice: 98,
      targetPrice: 100,
      targetPriceHigh: null,
      buyZoneTolerance: 0.05,
      now: NOW,
    });
    expect(t!.severity).toBe("HIGH");
    expect(t!.type).toBe("target-zone-reached");
  });

  it("LOW (target-zone-near) binnen 5% boven target", () => {
    const t = detectTargetZone({
      currentPrice: 104,
      targetPrice: 100,
      targetPriceHigh: null,
      buyZoneTolerance: 0.05,
      now: NOW,
    });
    expect(t!.type).toBe("target-zone-near");
    expect(t!.severity).toBe("LOW");
  });

  it("null boven tolerantie-grens", () => {
    const t = detectTargetZone({
      currentPrice: 110,
      targetPrice: 100,
      targetPriceHigh: null,
      buyZoneTolerance: 0.05,
      now: NOW,
    });
    expect(t).toBeNull();
  });
});

describe("detectTargetZone — null-paden", () => {
  it("null zonder target", () => {
    expect(
      detectTargetZone({
        currentPrice: 100,
        targetPrice: null,
        targetPriceHigh: null,
        buyZoneTolerance: 0.05,
        now: NOW,
      }),
    ).toBeNull();
  });

  it("null zonder quote", () => {
    expect(
      detectTargetZone({
        currentPrice: null,
        targetPrice: 100,
        targetPriceHigh: null,
        buyZoneTolerance: 0.05,
        now: NOW,
      }),
    ).toBeNull();
  });

  it("null bij negatieve prijs", () => {
    expect(
      detectTargetZone({
        currentPrice: -1,
        targetPrice: 100,
        targetPriceHigh: null,
        buyZoneTolerance: 0.05,
        now: NOW,
      }),
    ).toBeNull();
  });
});

describe("detectTargetZone — metadata", () => {
  it("expiresAt = now + ttl", () => {
    const t = detectTargetZone({
      currentPrice: 95,
      targetPrice: 100,
      targetPriceHigh: null,
      buyZoneTolerance: 0.05,
      now: NOW,
      ttlDays: 7,
    })!;
    const expiresMs = Date.parse(t.expiresAt);
    const firedMs = Date.parse(t.firedAt);
    const diffDays = (expiresMs - firedMs) / (24 * 3600 * 1000);
    expect(Math.round(diffDays)).toBe(7);
  });

  it("snapshot bevat prijs + fundamentals", () => {
    const t = detectTargetZone({
      currentPrice: 95,
      targetPrice: 100,
      targetPriceHigh: null,
      buyZoneTolerance: 0.05,
      pe: 14,
      fcfYield: 0.06,
      now: NOW,
    })!;
    expect(t.snapshot.price).toBe(95);
    expect(t.snapshot.pe).toBe(14);
    expect(t.snapshot.fcfYield).toBe(0.06);
  });
});
