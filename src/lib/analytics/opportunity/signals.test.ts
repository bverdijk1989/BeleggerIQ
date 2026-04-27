import { describe, expect, it } from "vitest";

import type { OpportunitySignal } from "@/lib/analytics/opportunity-radar";

import {
  filterPublicSignals,
  mapSignalType,
  pickPrimarySignal,
  SIGNAL_TYPE_MAP,
} from "./signals";

const NOW = "2026-04-25T00:00:00.000Z";

function sig(
  type: OpportunitySignal["type"],
  strength: number,
  confidence: OpportunitySignal["confidence"] = "MEDIUM",
): OpportunitySignal {
  return {
    type,
    strength,
    confidence,
    rationale: ["Reden"],
    riskNote: "Keerzijde",
    detectedAt: NOW,
  };
}

describe("mapSignalType", () => {
  it("mapt 5 publieke types", () => {
    expect(mapSignalType("quality-pullback")).toBe("QUALITY_PULLBACK");
    expect(mapSignalType("value-dislocation")).toBe("VALUE_MISPRICING");
    expect(mapSignalType("momentum-reversal")).toBe("MOMENTUM_REVERSAL");
    expect(mapSignalType("underweight-high-conviction")).toBe(
      "UNDERWEIGHT_HIGH_CONVICTION",
    );
    expect(mapSignalType("etf-core-rebalance")).toBe(
      "ETF_REBALANCE_OPPORTUNITY",
    );
  });

  it("retourneert null voor niet-gepubliceerde types", () => {
    expect(mapSignalType("watchlist-target")).toBeNull();
    expect(mapSignalType("defensive-bargain")).toBeNull();
    expect(mapSignalType("earnings-sentiment-placeholder")).toBeNull();
  });

  it("SIGNAL_TYPE_MAP heeft 5 entries", () => {
    expect(Object.keys(SIGNAL_TYPE_MAP).length).toBe(5);
  });
});

describe("filterPublicSignals", () => {
  it("verwijdert niet-publieke signalen, behoudt order", () => {
    const out = filterPublicSignals([
      sig("watchlist-target", 80),
      sig("quality-pullback", 60),
      sig("defensive-bargain", 90),
      sig("momentum-reversal", 50),
    ]);
    expect(out.map((s) => s.type)).toEqual([
      "quality-pullback",
      "momentum-reversal",
    ]);
  });
});

describe("pickPrimarySignal", () => {
  it("kiest signaal met hoogste strength", () => {
    const r = pickPrimarySignal([
      sig("quality-pullback", 60),
      sig("value-dislocation", 80),
    ]);
    expect(r?.type).toBe("value-dislocation");
  });

  it("tie-break alfabetisch op type", () => {
    const r = pickPrimarySignal([
      sig("value-dislocation", 70),
      sig("etf-core-rebalance", 70),
    ]);
    // 'etf-core-rebalance' < 'value-dislocation' alfabetisch
    expect(r?.type).toBe("etf-core-rebalance");
  });

  it("null bij geen publieke signalen", () => {
    expect(
      pickPrimarySignal([
        sig("watchlist-target", 90),
        sig("defensive-bargain", 80),
      ]),
    ).toBeNull();
  });

  it("null bij lege lijst", () => {
    expect(pickPrimarySignal([])).toBeNull();
  });
});
