import { describe, expect, it } from "vitest";

import type { FactorScore, FundamentalsSnapshot } from "@/types/factor";
import type { Holding } from "@/types/portfolio";

import {
  buildResearchContext,
  buildResearchDossier,
  buildResearchDossierPrompt,
  renderResearchDossier,
  validateAiOutputAgainstContext,
} from "./research-dossier";

const NOW = "2026-04-25T00:00:00.000Z";

function fundamentals(
  overrides: Partial<FundamentalsSnapshot> = {},
): FundamentalsSnapshot {
  return {
    ticker: "ASML",
    asOf: NOW,
    currency: "EUR",
    source: "test",
    pe: 28.4,
    pb: 14.2,
    roic: 0.31,
    fcfYield: 0.04,
    dividendYield: 0.012,
    debtToEquity: 0.42,
    ...overrides,
  };
}

function factorScore(
  overrides: Partial<FactorScore["subScores"]> & {
    composite?: number;
    confidence?: number;
  } = {},
): FactorScore {
  return {
    ticker: "ASML",
    asOf: NOW,
    subScores: {
      quality: overrides.quality ?? 84,
      value: overrides.value ?? 38,
      momentum: overrides.momentum ?? 62,
      lowVol: overrides.lowVol ?? 51,
    },
    composite: overrides.composite ?? 70,
    confidence: overrides.confidence ?? 0.78,
    rationales: {
      quality: ["ROIC 31% — top kwartiel."],
      value: ["P/E 28 — hoger dan sector mediaan."],
      momentum: ["12m return +14%."],
      lowVol: ["Realized vol in lijn met mediaan."],
    },
  };
}

function holding(): Holding {
  return {
    id: "h1",
    portfolioId: "p1",
    ticker: "ASML",
    isin: "NL0010273215",
    name: "ASML Holding",
    assetClass: "EQUITY",
    currency: "EUR",
    quantity: 5,
    avgCostPrice: 600,
  };
}

describe("buildResearchContext", () => {
  it("verzamelt key-metrics uit factor + fundamentals", () => {
    const ctx = buildResearchContext({
      ticker: "asml",
      name: "ASML Holding",
      factorScore: factorScore(),
      fundamentals: fundamentals(),
      now: NOW,
    });
    expect(ctx.ticker).toBe("ASML");
    expect(ctx.keyMetrics.some((m) => m.label === "Composite")).toBe(true);
    expect(ctx.keyMetrics.some((m) => m.label === "P/E")).toBe(true);
    expect(ctx.keyMetrics.some((m) => m.label === "ROIC")).toBe(true);
    expect(ctx.sourceEngines).toContain("factor-engine");
    expect(ctx.sourceEngines).toContain("fundamentals");
  });

  it("genereert bull/bear-points uit factor strengths/weaknesses", () => {
    const ctx = buildResearchContext({
      ticker: "ASML",
      factorScore: factorScore({
        quality: 88,
        value: 28,
        momentum: 60,
        lowVol: 50,
      }),
      now: NOW,
    });
    expect(ctx.bullPoints.some((p) => /Quality/i.test(p.text))).toBe(true);
    expect(ctx.bearPoints.some((p) => /Value/i.test(p.text))).toBe(true);
  });

  it("dedupeert identieke evidence-points", () => {
    const ctx = buildResearchContext({
      ticker: "X",
      factorScore: factorScore(),
      mispricing: {
        ticker: "X",
        name: "X",
        signals: [
          {
            type: "valuation-gap",
            ticker: "X",
            mispricingScore: 70,
            confidence: 0.7,
            confidenceTier: "HIGH",
            expectedHoldingPeriodDays: 365,
            riskFlags: [],
            dataQuality: {
              required: {
                minHistoryDays: 0,
                requiresFundamentals: true,
                requiresFactorScore: false,
                requiresPeerBasket: false,
                minPeerCount: 0,
              },
              met: true,
              missing: [],
              score: 0.8,
            },
            rationale: ["Same line", "Same line"],
            riskNote: "n/a",
            detectedAt: NOW,
            expiresAt: NOW,
          },
          {
            type: "valuation-gap",
            ticker: "X",
            mispricingScore: 70,
            confidence: 0.7,
            confidenceTier: "HIGH",
            expectedHoldingPeriodDays: 365,
            riskFlags: [],
            dataQuality: {
              required: {
                minHistoryDays: 0,
                requiresFundamentals: true,
                requiresFactorScore: false,
                requiresPeerBasket: false,
                minPeerCount: 0,
              },
              met: true,
              missing: [],
              score: 0.8,
            },
            rationale: ["Same line"],
            riskNote: "n/a",
            detectedAt: NOW,
            expiresAt: NOW,
          },
        ],
        aggregateScore: 70,
        aggregateConfidence: 0.7,
        aggregateConfidenceTier: "HIGH",
        medianHoldingPeriodDays: 365,
        earliestExpiresAt: NOW,
        riskFlagCodes: [],
        summary: "x",
      },
      now: NOW,
    });
    const sameLineCount = ctx.bullPoints.filter(
      (p) => p.text === "Same line",
    ).length;
    expect(sameLineCount).toBe(1);
  });

  it("rapporteert ontbrekende data wanneer engine-output ontbreekt", () => {
    const ctx = buildResearchContext({ ticker: "X", now: NOW });
    expect(ctx.uncertainty.missingData).toContain("factor-scores");
    expect(ctx.uncertainty.missingData).toContain("fundamentals");
    expect(ctx.uncertainty.confidence).toBeLessThan(0.5);
  });

  it("bevat geen cijfers wanneer factor + fundamentals ontbreken", () => {
    const ctx = buildResearchContext({ ticker: "X", now: NOW });
    expect(ctx.keyMetrics).toEqual([]);
  });
});

describe("renderResearchDossier", () => {
  it("genereert thesis met composite-score letterlijk uit context", () => {
    const ctx = buildResearchContext({
      ticker: "ASML",
      name: "ASML Holding",
      factorScore: factorScore({ composite: 72 }),
      fundamentals: fundamentals(),
      now: NOW,
    });
    const d = renderResearchDossier(ctx);
    expect(d.thesis).toMatch(/72\/100/);
    expect(d.keyNumbers).toBe(ctx.keyMetrics);
    expect(d.confidence).toBe(ctx.uncertainty.confidence);
    expect(d.uncertaintyNote).toBe(ctx.uncertainty.note);
  });

  it("decisionChecklist bevat altijd reflectie-vragen", () => {
    const ctx = buildResearchContext({ ticker: "X", now: NOW });
    const d = renderResearchDossier(ctx);
    expect(d.decisionChecklist.length).toBeGreaterThanOrEqual(3);
    expect(
      d.decisionChecklist.some((q) => /beleggersprofiel/i.test(q)),
    ).toBe(true);
    expect(d.decisionChecklist.some((q) => /exit/i.test(q))).toBe(true);
  });

  it("voegt value-trap-vraag toe bij hoge value + lage momentum", () => {
    const ctx = buildResearchContext({
      ticker: "X",
      factorScore: factorScore({ value: 75, momentum: 40 }),
      now: NOW,
    });
    const d = renderResearchDossier(ctx);
    expect(d.decisionChecklist.some((q) => /value trap/i.test(q))).toBe(true);
  });

  it("voegt low-confidence vraag toe wanneer < 60%", () => {
    const ctx = buildResearchContext({ ticker: "X", now: NOW });
    const d = renderResearchDossier(ctx);
    // ctx.uncertainty.confidence < 0.6 → checklist heeft de extra vraag
    expect(d.decisionChecklist.some((q) => /onder 60%/.test(q))).toBe(true);
  });

  it("missingData en sourceEngines worden 1:1 doorgegeven", () => {
    const ctx = buildResearchContext({
      ticker: "ASML",
      factorScore: factorScore(),
      fundamentals: fundamentals(),
      holding: holding(),
      now: NOW,
    });
    const d = renderResearchDossier(ctx);
    expect(d.missingData).toBe(ctx.uncertainty.missingData);
    expect(d.sourceEngines).toEqual(ctx.sourceEngines);
  });
});

describe("buildResearchDossier — one-shot", () => {
  it("identieke input geeft identieke output", () => {
    const input = {
      ticker: "ASML",
      name: "ASML Holding",
      factorScore: factorScore(),
      fundamentals: fundamentals(),
      holding: holding(),
      now: NOW,
    };
    const a = buildResearchDossier(input);
    const b = buildResearchDossier(input);
    expect(a).toEqual(b);
  });
});

describe("buildResearchDossierPrompt", () => {
  it("system-prompt bevat strikte regels", () => {
    const ctx = buildResearchContext({
      ticker: "X",
      factorScore: factorScore(),
      now: NOW,
    });
    const p = buildResearchDossierPrompt(ctx);
    expect(p.system).toMatch(/Verzin geen nieuwe scores/);
    expect(p.system).toMatch(/factor-score, opportunity-score of mispricing-score aan/);
  });

  it("user-prompt bevat de context als JSON", () => {
    const ctx = buildResearchContext({
      ticker: "ASML",
      factorScore: factorScore({ composite: 72 }),
      now: NOW,
    });
    const p = buildResearchDossierPrompt(ctx);
    expect(p.user).toContain("ASML");
    // Composite-score komt als geformatteerde value in keyMetrics terecht.
    expect(p.user).toContain("\"value\": \"72/100\"");
    expect(p.user).toContain("Composite");
  });
});

describe("validateAiOutputAgainstContext", () => {
  it("accepteert tekst zonder cijfers", () => {
    const ctx = buildResearchContext({ ticker: "X", now: NOW });
    const r = validateAiOutputAgainstContext(
      "Geen cijfers in dit dossier — alleen kwalitatieve observaties.",
      ctx,
    );
    expect(r.ok).toBe(true);
  });

  it("accepteert cijfers die ook in keyMetrics voorkomen", () => {
    const ctx = buildResearchContext({
      ticker: "ASML",
      factorScore: factorScore({ composite: 72 }),
      fundamentals: fundamentals(),
      now: NOW,
    });
    const r = validateAiOutputAgainstContext(
      "Composite score 72/100 onderbouwt de thesis.",
      ctx,
    );
    expect(r.ok).toBe(true);
  });

  it("flag verzonnen cijfers", () => {
    const ctx = buildResearchContext({ ticker: "X", now: NOW });
    const r = validateAiOutputAgainstContext(
      "Strategy delivered +42% return last year.",
      ctx,
    );
    expect(r.ok).toBe(false);
    expect(r.rejectedClaims.some((c) => c.includes("42"))).toBe(true);
  });
});
