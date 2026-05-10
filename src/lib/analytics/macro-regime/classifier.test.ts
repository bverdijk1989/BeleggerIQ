import { describe, expect, it } from "vitest";

import { classifyMacroRegime } from "./classifier";
import type { RawMacroIndicator } from "./providers/types";
import type { MacroIndicatorKey } from "./types";

function ind(
  overrides: Partial<RawMacroIndicator> & { key: MacroIndicatorKey },
): RawMacroIndicator {
  return {
    value: 0,
    previousValue: 0,
    trend: "stable",
    asOf: "2026-05-10",
    source: "test",
    confidence: 0.8,
    ...overrides,
  } as RawMacroIndicator;
}

const ASOF = "2026-05-10";

describe("classifyMacroRegime — 4 quadrants + transitional", () => {
  it("groei stijgt + inflatie daalt → GOLDILOCKS", () => {
    const result = classifyMacroRegime({
      asOf: ASOF,
      rawIndicators: [
        ind({ key: "growth", value: 3.0, previousValue: 1.5, trend: "rising" }),
        ind({ key: "inflation", value: 1.8, previousValue: 2.6, trend: "falling" }),
        ind({ key: "rates", value: 3.5, previousValue: 4.0, trend: "falling" }),
        ind({ key: "liquidity", value: 5, trend: "rising" }),
        ind({ key: "recession_risk", value: 15, trend: "falling" }),
        ind({ key: "volatility", value: 14, trend: "falling" }),
        ind({ key: "sentiment", value: 70, trend: "rising" }),
      ],
    });
    expect(result.regime).toBe("GOLDILOCKS");
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.narrative).toMatch(/goldilocks|stijgende groei/i);
  });

  it("groei stijgt + inflatie stijgt → REFLATION", () => {
    const result = classifyMacroRegime({
      asOf: ASOF,
      rawIndicators: [
        ind({ key: "growth", value: 3.2, previousValue: 1.8, trend: "rising" }),
        ind({ key: "inflation", value: 4.0, previousValue: 2.5, trend: "rising" }),
        ind({ key: "rates", value: 4.5, previousValue: 3.8, trend: "rising" }),
        ind({ key: "liquidity", value: 4, trend: "stable" }),
        ind({ key: "recession_risk", value: 25, trend: "stable" }),
        ind({ key: "volatility", value: 18, trend: "stable" }),
        ind({ key: "sentiment", value: 60, trend: "rising" }),
      ],
    });
    expect(result.regime).toBe("REFLATION");
  });

  it("groei daalt + inflatie stijgt → STAGFLATION", () => {
    const result = classifyMacroRegime({
      asOf: ASOF,
      rawIndicators: [
        ind({ key: "growth", value: 0.5, previousValue: 1.5, trend: "falling" }),
        ind({ key: "inflation", value: 5.5, previousValue: 4.0, trend: "rising" }),
        ind({ key: "rates", value: 5.0, trend: "rising" }),
        ind({ key: "liquidity", value: -1, trend: "falling" }),
        ind({ key: "recession_risk", value: 60, trend: "rising" }),
        ind({ key: "volatility", value: 30, trend: "rising" }),
        ind({ key: "sentiment", value: 25, trend: "falling" }),
      ],
    });
    expect(result.regime).toBe("STAGFLATION");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("groei daalt + inflatie daalt → DEFLATION", () => {
    const result = classifyMacroRegime({
      asOf: ASOF,
      rawIndicators: [
        ind({ key: "growth", value: 0.2, previousValue: 1.6, trend: "falling" }),
        ind({ key: "inflation", value: 0.8, previousValue: 2.0, trend: "falling" }),
        ind({ key: "rates", value: 1.5, previousValue: 2.5, trend: "falling" }),
        ind({ key: "liquidity", value: -2, trend: "falling" }),
        ind({ key: "recession_risk", value: 70, trend: "rising" }),
        ind({ key: "volatility", value: 28, trend: "rising" }),
        ind({ key: "sentiment", value: 25, trend: "falling" }),
      ],
    });
    expect(result.regime).toBe("DEFLATION");
  });

  it("ontbrekende groei OF inflatie → TRANSITIONAL met lage confidence", () => {
    const result = classifyMacroRegime({
      asOf: ASOF,
      rawIndicators: [
        ind({ key: "rates", value: 4.0, trend: "rising" }),
        ind({ key: "volatility", value: 22, trend: "stable" }),
      ],
    });
    expect(result.regime).toBe("TRANSITIONAL");
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("stabiele groei en inflatie → TRANSITIONAL", () => {
    const result = classifyMacroRegime({
      asOf: ASOF,
      rawIndicators: [
        ind({ key: "growth", value: 2.0, trend: "stable" }),
        ind({ key: "inflation", value: 2.0, trend: "stable" }),
      ],
    });
    expect(result.regime).toBe("TRANSITIONAL");
  });
});

describe("classifyMacroRegime — indicator-shape", () => {
  it("levert exact 7 indicators in canonical volgorde", () => {
    const result = classifyMacroRegime({
      asOf: ASOF,
      rawIndicators: [
        ind({ key: "growth", value: 2.0, trend: "rising" }),
        ind({ key: "inflation", value: 1.5, trend: "falling" }),
      ],
    });
    expect(result.indicators).toHaveLength(7);
    expect(result.indicators.map((i) => i.key)).toEqual([
      "growth",
      "inflation",
      "rates",
      "liquidity",
      "recession_risk",
      "volatility",
      "sentiment",
    ]);
  });

  it("ontbrekende indicator → score=null en confidence=0", () => {
    const result = classifyMacroRegime({
      asOf: ASOF,
      rawIndicators: [
        ind({ key: "growth", value: 2.5, trend: "rising" }),
        ind({ key: "inflation", value: 1.5, trend: "falling" }),
      ],
    });
    const liquidity = result.indicators.find((i) => i.key === "liquidity")!;
    expect(liquidity.score).toBeNull();
    expect(liquidity.confidence).toBe(0);
  });

  it("inflatie boven target → rationale benoemt 'boven target'", () => {
    const result = classifyMacroRegime({
      asOf: ASOF,
      rawIndicators: [
        ind({ key: "growth", value: 2.0, trend: "rising" }),
        ind({ key: "inflation", value: 4.5, trend: "rising" }),
      ],
    });
    const inflation = result.indicators.find((i) => i.key === "inflation")!;
    expect(inflation.rationale).toMatch(/target|boven/i);
  });
});

describe("classifyMacroRegime — determinisme", () => {
  it("zelfde input → identieke output", () => {
    const inputs: RawMacroIndicator[] = [
      ind({ key: "growth", value: 2.5, trend: "rising" }),
      ind({ key: "inflation", value: 3.0, trend: "rising" }),
      ind({ key: "rates", value: 4.0, trend: "rising" }),
    ];
    const a = classifyMacroRegime({ asOf: ASOF, rawIndicators: inputs });
    const b = classifyMacroRegime({ asOf: ASOF, rawIndicators: inputs });
    expect(a).toEqual(b);
  });
});
