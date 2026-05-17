import { describe, expect, it } from "vitest";

import { computeConfidenceScore } from "./engine";
import { makeFusionInput } from "./fixtures";
import { SIGNAL_ORDER } from "./types";

/**
 * Module 7 — Signal Fusion Engine spec-conformance.
 *
 * Het Module 7-spec stelt expliciete eisen die we hier 1-op-1 bevriezen
 * zodat een latere refactor niet stiekem de spec breekt:
 *
 *  1. Score 0..100 per asset.
 *  2. ALLE 10 spec-componenten zichtbaar (kwaliteit, waardering,
 *     momentum, volatiliteit, dividendkwaliteit, macrofit,
 *     portefeuillefit, datakwaliteit (meta), earnings/revisions,
 *     sentiment) — datakwaliteit is meta op de composite, de andere 9
 *     zijn `SignalKey`s.
 *  3. Geen black box: iedere component zichtbaar met score + rationale +
 *     dataQuality.
 *  4. Ontbrekende data → lagere confidence (lager `effectiveWeight`),
 *     géén crash.
 *  5. Geen koopadvies-presentatie — alleen score + tier.
 *  6. Warning bij lage datakwaliteit.
 */

describe("Module 7 — score-shape + 10 componenten", () => {
  it("score blijft binnen 0..100", () => {
    const result = computeConfidenceScore(makeFusionInput());
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.totalScore).toBeLessThanOrEqual(100);
  });

  it("alle 9 Module 7-signaal-keys zitten in de output (10e = meta-datakwaliteit)", () => {
    const result = computeConfidenceScore(makeFusionInput());
    const keys = result.signals.map((s) => s.key);

    // De 9 signaal-componenten uit de Module 7-spec.
    const required = [
      "fundamental_quality", // kwaliteit
      "valuation", // waardering
      "momentum",
      "volatility", // volatiliteit
      "dividend_quality", // dividendkwaliteit
      "macro_sensitivity", // macrofit
      "portfolio_fit", // portefeuillefit
      "earnings_revisions",
      "sentiment",
    ] as const;
    for (const k of required) {
      expect(keys).toContain(k);
    }

    // Het 10e Module 7-component (datakwaliteit) zit als meta op de composite.
    expect(result.dataQuality).toMatch(/^(high|medium|low|missing)$/);
    expect(typeof result.effectiveWeight).toBe("number");
  });

  it("signaal-volgorde volgt SIGNAL_ORDER (predictable layout)", () => {
    const result = computeConfidenceScore(makeFusionInput());
    expect(result.signals.map((s) => s.key)).toEqual([...SIGNAL_ORDER]);
  });

  it("geen black box: elk signaal heeft rationale + dataQuality + bron", () => {
    const result = computeConfidenceScore(makeFusionInput());
    for (const signal of result.signals) {
      expect(signal.rationale.length).toBeGreaterThan(0);
      expect(signal.dataQuality).toMatch(/^(high|medium|low|missing)$/);
      expect(signal.source.length).toBeGreaterThan(0);
    }
  });
});

describe("Module 7 — robuust bij ontbrekende data", () => {
  it("alles `null` → géén crash, lagere effectiveWeight, dataQuality=low/missing", () => {
    // Geen factor-score, fundamentals, portfolio, macro, etc.
    const result = computeConfidenceScore({
      instrument: {
        ticker: "X",
        name: "X",
        sector: null,
        factorScore: null,
        fundamentals: null,
        assetClassKey: null,
      },
      portfolio: null,
      asOf: "2026-05-10T00:00:00.000Z",
    });

    // Score moet nog steeds in [0, 100].
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.totalScore).toBeLessThanOrEqual(100);

    // EffectiveWeight moet lager zijn dan de happy path.
    const happy = computeConfidenceScore(makeFusionInput());
    expect(result.effectiveWeight).toBeLessThan(happy.effectiveWeight);

    // Data-kwaliteit op composite-niveau moet 'low' of slechter zijn,
    // en de warning moet de gebruiker waarschuwen.
    expect(result.dataQuality).toMatch(/^(low|missing)$/);
    expect(result.warning).not.toBeNull();
  });

  it("missende signalen tellen NIET mee in composite, maar staan WEL in de UI", () => {
    const result = computeConfidenceScore({
      instrument: {
        ticker: "Y",
        name: "Y",
        sector: null,
        factorScore: null,
        fundamentals: null,
        assetClassKey: null,
      },
      portfolio: null,
      asOf: "2026-05-10T00:00:00.000Z",
    });

    // Alle 10 signaal-rijen moeten zichtbaar zijn (transparantie-eis).
    expect(result.signals.length).toBe(SIGNAL_ORDER.length);
    // Maar score=null bij ontbrekende data — telt niet in composite.
    const missing = result.signals.filter((s) => s.score === null);
    expect(missing.length).toBeGreaterThan(0);
    // Een ontbrekend signaal heeft géén contribution.
    for (const s of missing) {
      expect(s.contribution).toBeNull();
    }
  });
});

describe("Module 7 — determinisme (Simons-laag)", () => {
  it("zelfde input → identieke output", () => {
    const a = computeConfidenceScore(makeFusionInput());
    const b = computeConfidenceScore(makeFusionInput());
    expect(a).toEqual(b);
  });
});
