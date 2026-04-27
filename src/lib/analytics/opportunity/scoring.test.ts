import { describe, expect, it } from "vitest";

import type { OpportunitySignal } from "@/lib/analytics/opportunity-radar";

import {
  buildRationale,
  deriveConfidence,
  deriveRiskLevel,
} from "./scoring";

const NOW = "2026-04-25T00:00:00.000Z";

function sig(
  type: OpportunitySignal["type"],
  confidence: OpportunitySignal["confidence"],
  rationale: string[] = ["Default reden."],
): OpportunitySignal {
  return {
    type,
    strength: 70,
    confidence,
    rationale,
    riskNote: "Risico-nota",
    detectedAt: NOW,
  };
}

describe("deriveConfidence", () => {
  it("0 bij lege signaal-lijst", () => {
    expect(deriveConfidence([])).toBe(0);
  });

  it("HIGH wint over MEDIUM", () => {
    const r = deriveConfidence([
      sig("quality-pullback", "MEDIUM"),
      sig("value-dislocation", "HIGH"),
    ]);
    expect(r).toBe(0.85);
  });

  it("LOW geeft 0.35", () => {
    expect(deriveConfidence([sig("quality-pullback", "LOW")])).toBe(0.35);
  });
});

describe("deriveRiskLevel", () => {
  it("MOMENTUM_REVERSAL minimaal MEDIUM", () => {
    expect(deriveRiskLevel("MOMENTUM_REVERSAL", 0.95)).toBe("MEDIUM");
  });

  it("MOMENTUM_REVERSAL met lage confidence → HIGH", () => {
    expect(deriveRiskLevel("MOMENTUM_REVERSAL", 0.4)).toBe("HIGH");
  });

  it("Andere types: HIGH conf → LOW risk", () => {
    expect(deriveRiskLevel("QUALITY_PULLBACK", 0.85)).toBe("LOW");
  });

  it("Andere types: lage confidence → HIGH risk", () => {
    expect(deriveRiskLevel("VALUE_MISPRICING", 0.35)).toBe("HIGH");
  });

  it("Andere types: medium confidence → MEDIUM risk", () => {
    expect(deriveRiskLevel("UNDERWEIGHT_HIGH_CONVICTION", 0.6)).toBe("MEDIUM");
  });
});

describe("buildRationale", () => {
  it("pakt eerste rationale-bullet", () => {
    expect(buildRationale(sig("quality-pullback", "HIGH", ["Eerste reden.", "Tweede"]))).toBe("Eerste reden.");
  });

  it("trim wit", () => {
    expect(buildRationale(sig("quality-pullback", "HIGH", ["  Met spaties  "]))).toBe("Met spaties");
  });

  it("fallback bij lege rationale", () => {
    const s = sig("quality-pullback", "HIGH", []);
    expect(buildRationale(s)).toBe("—");
  });
});
