import { describe, expect, it } from "vitest";

import { buildCandidate } from "./scoring";
import type {
  OpportunityConfidence,
  OpportunitySignal,
  OpportunitySignalType,
} from "./types";

function signal(
  type: OpportunitySignalType,
  strength: number,
  confidence: OpportunityConfidence = "HIGH",
): OpportunitySignal {
  return {
    type,
    strength,
    confidence,
    rationale: [`${type} triggered`],
    riskNote: "Standaard risico-nota.",
    detectedAt: "2026-04-24T00:00:00.000Z",
  };
}

describe("buildCandidate", () => {
  it("retourneert null wanneer geen signaal ≥ drempel (40)", () => {
    const r = buildCandidate({
      ticker: "X",
      name: "X",
      source: "screener",
      signals: [signal("quality-pullback", 35)],
    });
    expect(r).toBeNull();
  });

  it("single-signal kandidaat: score = strength (geen diversity-bonus)", () => {
    const r = buildCandidate({
      ticker: "X",
      name: "X",
      source: "screener",
      signals: [signal("quality-pullback", 70)],
    });
    expect(r).not.toBeNull();
    expect(r!.score).toBe(70);
    expect(r!.confidence).toBe("HIGH");
  });

  it("twee signalen: diversity-bonus van 8%", () => {
    const r = buildCandidate({
      ticker: "X",
      name: "X",
      source: "screener",
      signals: [
        signal("quality-pullback", 80),
        signal("value-dislocation", 70),
      ],
    });
    expect(r).not.toBeNull();
    // max 80 × 1.08 = 86.4 → round 86
    expect(r!.score).toBe(86);
    expect(r!.signals).toHaveLength(2);
    // Gesorteerd op strength desc
    expect(r!.signals[0]!.strength).toBe(80);
  });

  it("vijf signalen: diversity-bonus geclamped naar 1.25×", () => {
    const r = buildCandidate({
      ticker: "X",
      name: "X",
      source: "screener",
      signals: [
        signal("quality-pullback", 80),
        signal("value-dislocation", 60),
        signal("momentum-reversal", 55),
        signal("defensive-bargain", 50),
        signal("underweight-high-conviction", 45),
      ],
    });
    // max 80 × 1.25 = 100
    expect(r!.score).toBe(100);
  });

  it("confidence-aggregatie: LOW bij 2 LOW-signalen", () => {
    const r = buildCandidate({
      ticker: "X",
      name: "X",
      source: "screener",
      signals: [
        signal("quality-pullback", 60, "LOW"),
        signal("value-dislocation", 55, "LOW"),
      ],
    });
    expect(r!.confidence).toBe("LOW");
    expect(r!.warnings.some((w) => /lage confidence/i.test(w))).toBe(true);
  });

  it("confidence-aggregatie: MEDIUM bij gemixt", () => {
    const r = buildCandidate({
      ticker: "X",
      name: "X",
      source: "screener",
      signals: [
        signal("quality-pullback", 80, "HIGH"),
        signal("value-dislocation", 60, "LOW"),
      ],
    });
    // weighted avg: (1.0×80 + 0.3×60) / 140 = 98/140 ≈ 0.7 → MEDIUM
    expect(r!.confidence).toBe("MEDIUM");
  });

  it("summary leest de sterkste signaal-label", () => {
    const r = buildCandidate({
      ticker: "X",
      name: "X",
      source: "screener",
      signals: [
        signal("quality-pullback", 65),
        signal("value-dislocation", 90),
      ],
    });
    expect(r!.summary.toLowerCase()).toContain("value-dislocatie");
  });

  it("summary plural: '+1 ander signaal' met 2 signalen", () => {
    const r = buildCandidate({
      ticker: "X",
      name: "X",
      source: "screener",
      signals: [
        signal("quality-pullback", 80),
        signal("value-dislocation", 60),
      ],
    });
    expect(r!.summary).toMatch(/\+1 ander/);
  });

  it("summary plural: '+2 andere signalen' met 3 signalen", () => {
    const r = buildCandidate({
      ticker: "X",
      name: "X",
      source: "screener",
      signals: [
        signal("quality-pullback", 80),
        signal("value-dislocation", 60),
        signal("momentum-reversal", 55),
      ],
    });
    expect(r!.summary).toMatch(/\+2 andere signalen/);
  });

  it("warning bij ontbrekende currentPrice", () => {
    const r = buildCandidate({
      ticker: "X",
      name: "X",
      source: "screener",
      signals: [signal("quality-pullback", 70)],
      currentPrice: null,
    });
    expect(r!.warnings.some((w) => /actuele koers/i.test(w))).toBe(true);
  });

  it("filtert signalen onder minSignalStrength weg uit de candidate", () => {
    const r = buildCandidate(
      {
        ticker: "X",
        name: "X",
        source: "screener",
        signals: [
          signal("quality-pullback", 70),
          signal("value-dislocation", 30), // onder drempel
        ],
      },
      { minSignalStrength: 40 },
    );
    expect(r!.signals).toHaveLength(1);
    expect(r!.signals[0]!.type).toBe("quality-pullback");
  });
});
