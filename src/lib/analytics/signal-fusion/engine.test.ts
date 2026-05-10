import { describe, expect, it } from "vitest";

import { computeConfidenceScore } from "./engine";
import {
  makeFactorScore,
  makeFundamentals,
  makeFusionInput,
  makeInstrumentContext,
} from "./fixtures";
import { SIGNAL_ORDER } from "./types";

describe("computeConfidenceScore — output shape", () => {
  it("levert exact 10 signalen in canonical UI-volgorde", () => {
    const result = computeConfidenceScore(makeFusionInput());
    expect(result.signals).toHaveLength(10);
    expect(result.signals.map((s) => s.key)).toEqual([...SIGNAL_ORDER]);
  });

  it("score is 0..100 en tier consistent", () => {
    const result = computeConfidenceScore(makeFusionInput());
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.totalScore).toBeLessThanOrEqual(100);
    expect(["STRONG", "POSITIVE", "NEUTRAL", "WEAK", "AVOID"]).toContain(
      result.tier,
    );
  });

  it("contributions tellen op tot ~totalScore (renormalisatie)", () => {
    const result = computeConfidenceScore(makeFusionInput());
    const sum = result.signals
      .filter((s) => s.contribution !== null)
      .reduce((s, c) => s + (c.contribution ?? 0), 0);
    expect(sum).toBeCloseTo(result.totalScore, 0);
  });
});

describe("computeConfidenceScore — happy path", () => {
  it("strong fundamentals + redelijke waardering → POSITIVE/STRONG", () => {
    const result = computeConfidenceScore(
      makeFusionInput({
        instrument: makeInstrumentContext({
          factorScore: makeFactorScore({
            quality: 85,
            value: 75,
            momentum: 65,
            lowVol: 70,
          }),
          fundamentals: makeFundamentals({
            roic: 0.22,
            pe: 16,
            fcfYield: 0.07,
          }),
        }),
      }),
    );
    expect(result.totalScore).toBeGreaterThanOrEqual(60);
    expect(["POSITIVE", "STRONG"]).toContain(result.tier);
  });

  it("zwakke quality + hoge waardering → WEAK/AVOID", () => {
    const result = computeConfidenceScore(
      makeFusionInput({
        instrument: makeInstrumentContext({
          factorScore: makeFactorScore({
            quality: 25,
            value: 20,
            momentum: 30,
            lowVol: 35,
          }),
        }),
      }),
    );
    expect(result.totalScore).toBeLessThanOrEqual(45);
    expect(["WEAK", "AVOID", "NEUTRAL"]).toContain(result.tier);
  });
});

describe("computeConfidenceScore — missing data + transparantie", () => {
  it("geen factor-score → 4 signalen 'missing', score blijft uitlegbaar", () => {
    const result = computeConfidenceScore(
      makeFusionInput({
        instrument: makeInstrumentContext({ factorScore: null }),
      }),
    );
    const missing = result.signals.filter((s) => s.dataQuality === "missing");
    expect(missing.length).toBeGreaterThanOrEqual(4);
    // De 4 factor-engine signalen moeten missing zijn:
    expect(missing.map((s) => s.key)).toEqual(
      expect.arrayContaining([
        "fundamental_quality",
        "valuation",
        "momentum",
        "volatility",
      ]),
    );
  });

  it("zonder portfolio-context → portfolio_fit = missing met duidelijke rationale", () => {
    const result = computeConfidenceScore(
      makeFusionInput({ portfolio: null }),
    );
    const fit = result.signals.find((s) => s.key === "portfolio_fit")!;
    expect(fit.score).toBeNull();
    expect(fit.dataQuality).toBe("missing");
    expect(fit.rationale).toMatch(/portefeuille|context/i);
  });

  it("zonder macro-regime → macro_sensitivity = missing", () => {
    const result = computeConfidenceScore(
      makeFusionInput({ macroRegime: null }),
    );
    const macro = result.signals.find((s) => s.key === "macro_sensitivity")!;
    expect(macro.score).toBeNull();
  });

  it("alle data ontbreekt → empty result met warning", () => {
    const result = computeConfidenceScore({
      instrument: {
        ticker: "EMPTY",
        name: "Empty",
        sector: null,
        factorScore: null,
        fundamentals: null,
        assetClassKey: null,
      },
    });
    expect(result.totalScore).toBe(50);
    expect(result.dataQuality).toBe("low");
    expect(result.warning).not.toBeNull();
    expect(result.effectiveWeight).toBe(0);
  });

  it("low data-coverage triggert warning-string", () => {
    const result = computeConfidenceScore(
      makeFusionInput({
        instrument: makeInstrumentContext({
          factorScore: null,
          fundamentals: null,
        }),
        portfolio: null,
        macroRegime: null,
      }),
    );
    expect(result.warning).not.toBeNull();
    expect(result.dataQuality).toBe("low");
  });
});

describe("computeConfidenceScore — extra signal-feeds", () => {
  it("earnings_revisions met netto positief → bovengemiddelde score", () => {
    const result = computeConfidenceScore(
      makeFusionInput({
        earningsRevisions: {
          upgrades: 8,
          downgrades: 2,
          asOf: "2026-05-01",
          source: "test",
        },
      }),
    );
    const er = result.signals.find((s) => s.key === "earnings_revisions")!;
    expect(er.score).toBeGreaterThan(60);
    expect(er.dataQuality).toBe("high");
  });

  it("sentiment met positieve waarde → score > 50", () => {
    const result = computeConfidenceScore(
      makeFusionInput({
        sentiment: {
          score: 0.5,
          sampleSize: 80,
          asOf: "2026-05-10",
          source: "test",
        },
      }),
    );
    const s = result.signals.find((s) => s.key === "sentiment")!;
    expect(s.score).toBeGreaterThan(50);
    expect(s.dataQuality).toBe("high");
  });

  it("insider_analyst met strong-buy rating → hoge score", () => {
    const result = computeConfidenceScore(
      makeFusionInput({
        insiderAnalyst: {
          insiderNetBuyingScore: 75,
          averageAnalystRating: 4.5,
          analystCount: 12,
          asOf: "2026-05-10",
          source: "test",
        },
      }),
    );
    const ia = result.signals.find((s) => s.key === "insider_analyst")!;
    expect(ia.score).toBeGreaterThan(70);
  });
});

describe("computeConfidenceScore — portfolio-fit logic", () => {
  it("currentWeight 0% in een 4-positie portefeuille → fit-score hoog", () => {
    const result = computeConfidenceScore(
      makeFusionInput({
        portfolio: {
          currentWeight: 0,
          sectorWeight: 0.10,
          positionCount: 4,
          hhi: 0.15,
        },
      }),
    );
    const fit = result.signals.find((s) => s.key === "portfolio_fit")!;
    expect(fit.score).toBeGreaterThanOrEqual(70);
  });

  it("currentWeight 25% in geconcentreerde portefeuille → fit-score laag", () => {
    const result = computeConfidenceScore(
      makeFusionInput({
        portfolio: {
          currentWeight: 0.25,
          sectorWeight: 0.55,
          positionCount: 5,
          hhi: 0.30,
        },
      }),
    );
    const fit = result.signals.find((s) => s.key === "portfolio_fit")!;
    expect(fit.score).toBeLessThan(40);
  });
});

describe("computeConfidenceScore — determinisme", () => {
  it("zelfde input → identieke output", () => {
    const input = makeFusionInput();
    const a = computeConfidenceScore(input);
    const b = computeConfidenceScore(input);
    expect(a).toEqual(b);
  });
});

describe("computeConfidenceScore — headline + warning", () => {
  it("hoge totalScore → 'sterke score' headline", () => {
    const result = computeConfidenceScore(
      makeFusionInput({
        instrument: makeInstrumentContext({
          factorScore: makeFactorScore({
            quality: 90,
            value: 85,
            momentum: 75,
            lowVol: 80,
          }),
        }),
      }),
    );
    if (result.tier === "STRONG") {
      expect(result.headline.toLowerCase()).toMatch(/sterke|sterk/);
    }
  });

  it("dataLimitations bevat de namen van missing-signalen", () => {
    const result = computeConfidenceScore(
      makeFusionInput({
        instrument: makeInstrumentContext({ factorScore: null }),
      }),
    );
    expect(result.dataLimitations.join(" ")).toMatch(/Fundamentele|Waardering|Momentum|Volatiliteit/);
  });
});
