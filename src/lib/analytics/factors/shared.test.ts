import { describe, expect, it } from "vitest";

import {
  buildSignal,
  rampDown,
  rampUp,
  scoreFromSignals,
} from "./shared";

describe("rampUp / rampDown", () => {
  it("rampUp retourneert 0 onder min en 100 boven max", () => {
    expect(rampUp(0, 1, 2)).toBe(0);
    expect(rampUp(3, 1, 2)).toBe(100);
    expect(rampUp(1.5, 1, 2)).toBe(50);
  });

  it("rampDown is het spiegelbeeld", () => {
    expect(rampDown(0, 1, 2)).toBe(100);
    expect(rampDown(3, 1, 2)).toBe(0);
    expect(rampDown(1.5, 1, 2)).toBe(50);
  });

  it("gaat veilig om met NaN / non-finite", () => {
    expect(rampUp(Number.NaN, 0, 1)).toBe(0);
    expect(rampDown(Number.NaN, 0, 1)).toBe(100);
  });
});

describe("buildSignal", () => {
  it("skipt null/undefined values (score = null)", () => {
    const s = buildSignal({
      key: "pe",
      label: "P/E",
      value: null,
      kind: "rampDown",
      min: 8,
      max: 40,
      rationale: () => "",
    });
    expect(s.score).toBeNull();
    expect(s.rationale).toBeUndefined();
  });

  it("genereert score + rationale voor geldige waarden", () => {
    const s = buildSignal({
      key: "roic",
      label: "ROIC",
      value: 0.2,
      kind: "rampUp",
      min: 0.05,
      max: 0.25,
      rationale: (score) =>
        score >= 70 ? "sterk" : score <= 30 ? "zwak" : "gemiddeld",
    });
    expect(s.score).toBe(75);
    expect(s.rationale).toBe("sterk");
  });
});

describe("scoreFromSignals", () => {
  it("retourneert neutraal 50 wanneer geen signalen data hebben", () => {
    const result = scoreFromSignals([
      { key: "a", label: "A", value: null, weight: 1, score: null },
      { key: "b", label: "B", value: null, weight: 1, score: null },
    ]);
    expect(result.score).toBe(50);
    expect(result.coverage).toBe(0);
  });

  it("middelen met gewicht", () => {
    const result = scoreFromSignals([
      { key: "a", label: "A", value: 0, weight: 1, score: 80 },
      { key: "b", label: "B", value: 0, weight: 3, score: 40 },
    ]);
    // (80*1 + 40*3) / 4 = 50
    expect(result.score).toBe(50);
    expect(result.coverage).toBe(1);
  });

  it("geeft top-3 meest afwijkende rationales terug", () => {
    const signals = [
      { key: "a", label: "A", value: 0, weight: 1, score: 95, rationale: "A sterk" },
      { key: "b", label: "B", value: 0, weight: 1, score: 52, rationale: "B neutraal" },
      { key: "c", label: "C", value: 0, weight: 1, score: 10, rationale: "C zwak" },
      { key: "d", label: "D", value: 0, weight: 1, score: 48, rationale: "D neutraal" },
    ];
    const result = scoreFromSignals(signals);
    expect(result.rationales).toEqual(["A sterk", "C zwak", "B neutraal"]);
  });
});
