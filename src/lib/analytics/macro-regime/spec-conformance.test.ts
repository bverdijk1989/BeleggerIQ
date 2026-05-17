import { describe, expect, it } from "vitest";

import { classifyMacroRegime } from "./classifier";
import { SeedMacroProvider } from "./providers/seed";

/**
 * Module 6 — spec-conformance test.
 *
 * Het Module 6-spec stuurt expliciet op één voorbeeld-output:
 *
 *   "Het huidige regime lijkt op dalende groei met hardnekkige inflatie.
 *    Portefeuilles met veel cyclische groei kunnen dan gevoeliger zijn."
 *
 * Deze test bevriest dat de seed-snapshot (geen externe data nodig) door
 * de classifier exact dat STAGFLATION-narratief produceert. Als iemand
 * later de seed-waarden of normalisatie-drempels wijzigt, faalt dit
 * direct — bewust signaal dat de spec-voorbeeldtekst raakt.
 */

describe("Module 6 — seed-snapshot classificeert als STAGFLATION", () => {
  it("seed produceert dalende groei + hardnekkige inflatie → STAGFLATION", async () => {
    const provider = new SeedMacroProvider();
    const snapshot = await provider.fetch();

    const result = classifyMacroRegime({
      asOf: snapshot.asOf,
      rawIndicators: snapshot.indicators,
    });

    expect(result.regime).toBe("STAGFLATION");
    // Spec-voorbeeld: deze twee zinsneden moeten in de narrative zitten.
    expect(result.narrative).toMatch(/dalende groei/i);
    expect(result.narrative).toMatch(/hardnekkige inflatie/i);
    // Confidence is geen TRANSITIONAL-fallback (0.2) — quadrant is gepakt.
    expect(result.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it("alle 7 spec-indicators zitten in de output", async () => {
    const provider = new SeedMacroProvider();
    const snapshot = await provider.fetch();
    const result = classifyMacroRegime({
      asOf: snapshot.asOf,
      rawIndicators: snapshot.indicators,
    });

    const keys = result.indicators.map((i) => i.key).sort();
    // Module 6 spec: groei, inflatie, rente, liquiditeit, volatiliteit,
    // recessierisico, risk-on/off (sentiment).
    expect(keys).toEqual(
      [
        "growth",
        "inflation",
        "liquidity",
        "rates",
        "recession_risk",
        "sentiment",
        "volatility",
      ].sort(),
    );
  });
});
