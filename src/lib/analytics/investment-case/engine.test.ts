import { describe, expect, it } from "vitest";

import { buildInvestmentCase } from "./engine";
import { buildInvestmentCasePrompt } from "./ai-prompt";
import { CARD_ORDER, type InvestmentCaseCardKey } from "./types";
import type { BuildInvestmentCaseInput } from "./engine";

/**
 * Module 31 — Stock Story & Investment Case tests.
 *
 * Pure-function engine. Tests dekken:
 *  - 8 cards in vaste volgorde
 *  - Card-quality (solid/partial/missing) op basis van input-data
 *  - Geen verzonnen feiten bij ontbrekende inputs
 *  - Asset-kind detection
 *  - Plain-language: geen "verkoop X" / "koop Y"
 *  - Disclaimer aanwezig
 */

const ASOF = "2026-05-19T00:00:00.000Z";

function input(
  overrides: Partial<BuildInvestmentCaseInput> = {},
): BuildInvestmentCaseInput {
  return {
    generatedAt: ASOF,
    ticker: "TEST",
    name: null,
    assetClass: "EQUITY",
    classification: null,
    sector: null,
    industry: null,
    country: null,
    region: null,
    businessSummary: null,
    fundamentals: null,
    factorScore: null,
    confidence: null,
    portfolioWeight: null,
    portfolioSectorHhi: null,
    dataDepth: null,
    ...overrides,
  };
}

describe("buildInvestmentCase — shape", () => {
  it("produceert altijd 8 cards in vaste volgorde", () => {
    const r = buildInvestmentCase(input());
    expect(r.cards).toHaveLength(8);
    expect(r.cards.map((c) => c.key)).toEqual(CARD_ORDER);
  });

  it("disclaimer altijd aanwezig en benoemt 'geen koopadvies'", () => {
    const r = buildInvestmentCase(input());
    expect(r.disclaimer).toMatch(/koopadvies|advies/i);
    expect(r.disclaimer).toMatch(/voorspelling|samenvatting/i);
  });

  it("mode = deterministic in v1", () => {
    const r = buildInvestmentCase(input());
    expect(r.mode).toBe("deterministic");
  });
});

describe("Asset-kind detection", () => {
  it("EQUITY → single_stock", () => {
    const r = buildInvestmentCase(input({ assetClass: "EQUITY" }));
    expect(r.assetKind).toBe("single_stock");
  });
  it("CRYPTO → crypto", () => {
    const r = buildInvestmentCase(input({ assetClass: "CRYPTO" }));
    expect(r.assetKind).toBe("crypto");
  });
  it("BOND → bond", () => {
    const r = buildInvestmentCase(input({ assetClass: "BOND" }));
    expect(r.assetKind).toBe("bond");
  });
  it("ETF + isBroadMarket → broad_market_etf", () => {
    const r = buildInvestmentCase(
      input({
        assetClass: "ETF",
        classification: {
          instrumentType: "BROAD_MARKET_ETF",
          confidence: "HIGH",
          isBroadMarket: true,
          isIncomeFocused: false,
          isSpeculative: false,
          sectorFocus: null,
          incomeStrategy: null,
          supportsFactorScoring: false,
          eligibleForWinnerRule: true,
        },
      }),
    );
    expect(r.assetKind).toBe("broad_market_etf");
  });
  it("ETF + isIncomeFocused → income_etf", () => {
    const r = buildInvestmentCase(
      input({
        assetClass: "ETF",
        classification: {
          instrumentType: "INCOME_ETF",
          confidence: "HIGH",
          isBroadMarket: false,
          isIncomeFocused: true,
          isSpeculative: false,
          sectorFocus: null,
          incomeStrategy: "HIGH_DIVIDEND",
          supportsFactorScoring: false,
          eligibleForWinnerRule: false,
        },
      }),
    );
    expect(r.assetKind).toBe("income_etf");
  });
  it("ETF zonder classification → thematic_etf", () => {
    const r = buildInvestmentCase(input({ assetClass: "ETF" }));
    expect(r.assetKind).toBe("thematic_etf");
  });
});

describe("what_it_does card — geen verzonnen feiten", () => {
  it("businessSummary aanwezig → quality=solid + body bevat de summary", () => {
    const r = buildInvestmentCase(
      input({
        assetClass: "EQUITY",
        businessSummary:
          "Microsoft Corporation develops, licenses, and supports software, services, devices, and solutions.",
      }),
    );
    const card = r.cards.find((c) => c.key === "what_it_does")!;
    expect(card.quality).toBe("solid");
    expect(card.body).toMatch(/Microsoft|software/);
  });

  it("Single-stock ZONDER businessSummary + alleen sector → quality=partial + zegt 'beschrijving ontbreekt'", () => {
    const r = buildInvestmentCase(
      input({
        assetClass: "EQUITY",
        name: "Mystery Inc.",
        sector: "Technology",
      }),
    );
    const card = r.cards.find((c) => c.key === "what_it_does")!;
    expect(card.quality).toBe("partial");
    expect(card.body.toLowerCase()).toContain("bedrijfsbeschrijving ontbreekt");
  });

  it("Geen enkele data → quality=missing + verwijst naar officiële kanalen", () => {
    const r = buildInvestmentCase(input({ ticker: "UNKNOWN" }));
    const card = r.cards.find((c) => c.key === "what_it_does")!;
    expect(card.quality).toBe("missing");
    expect(card.body).toMatch(/ontbreekt|officiële|onbekend/i);
  });

  it("Broad market ETF → body noemt 'spreiding' en 'breed-markt'", () => {
    const r = buildInvestmentCase(
      input({
        assetClass: "ETF",
        classification: {
          instrumentType: "BROAD_MARKET_ETF",
          confidence: "HIGH",
          isBroadMarket: true,
          isIncomeFocused: false,
          isSpeculative: false,
          sectorFocus: null,
          incomeStrategy: null,
          supportsFactorScoring: false,
          eligibleForWinnerRule: true,
        },
      }),
    );
    const card = r.cards.find((c) => c.key === "what_it_does")!;
    expect(card.body.toLowerCase()).toMatch(/spreiding|breed/);
  });
});

describe("strengths + risks cards — gegrond in fundamentals", () => {
  it("Sterke fundamentals → strengths-card heeft bullets", () => {
    const r = buildInvestmentCase(
      input({
        assetClass: "EQUITY",
        fundamentals: {
          ticker: "X",
          asOf: ASOF,
          currency: "USD" as const,
          roic: 0.25,
          netMargin: 0.22,
          debtToEquity: 0.3,
          fcfYield: 0.08,
        },
      }),
    );
    const strengths = r.cards.find((c) => c.key === "strengths")!;
    expect(strengths.quality).toBe("solid");
    expect(strengths.bullets.length).toBeGreaterThanOrEqual(3);
    // Geen verzonnen waarden
    expect(strengths.bullets.join(" ")).toMatch(/ROIC.*25/);
  });

  it("Zwakke fundamentals → risks-card heeft bullets", () => {
    const r = buildInvestmentCase(
      input({
        assetClass: "EQUITY",
        fundamentals: {
          ticker: "X",
          asOf: ASOF,
          currency: "USD" as const,
          debtToEquity: 2.5,
          pe: 45,
          netMargin: 0.02,
          payoutRatio: 0.95,
        },
      }),
    );
    const risks = r.cards.find((c) => c.key === "risks")!;
    expect(risks.quality).toBe("solid");
    expect(risks.bullets.length).toBeGreaterThanOrEqual(3);
    expect(risks.bullets.join(" ")).toMatch(/schuld|D\/E/);
  });

  it("Geen fundamentals → strengths + risks quality = missing/partial", () => {
    const r = buildInvestmentCase(input({ assetClass: "EQUITY" }));
    const strengths = r.cards.find((c) => c.key === "strengths")!;
    const risks = r.cards.find((c) => c.key === "risks")!;
    expect(strengths.quality).toBe("missing");
    expect(risks.quality).toBe("missing");
  });

  it("Crypto altijd risk-bullet voor 50%-verlies-warning", () => {
    const r = buildInvestmentCase(input({ assetClass: "CRYPTO" }));
    const risks = r.cards.find((c) => c.key === "risks")!;
    expect(risks.bullets.some((b) => /50%|maand|missen/i.test(b))).toBe(true);
  });
});

describe("portfolio_fit card", () => {
  it("Geen portfolio-weight → body zegt 'nog niet in je portefeuille'", () => {
    const r = buildInvestmentCase(input({ assetClass: "EQUITY" }));
    const fit = r.cards.find((c) => c.key === "portfolio_fit")!;
    expect(fit.body.toLowerCase()).toContain("nog niet in je portefeuille");
  });

  it("Weight ≥ 15% → bullets bevatten 'grote positie'-waarschuwing", () => {
    const r = buildInvestmentCase(
      input({ assetClass: "EQUITY", portfolioWeight: 0.2 }),
    );
    const fit = r.cards.find((c) => c.key === "portfolio_fit")!;
    expect(fit.bullets.join(" ").toLowerCase()).toContain("grote positie");
  });

  it("Crypto met weight ≥ 5% → extra volatility-warning", () => {
    const r = buildInvestmentCase(
      input({ assetClass: "CRYPTO", portfolioWeight: 0.08 }),
    );
    const fit = r.cards.find((c) => c.key === "portfolio_fit")!;
    expect(fit.bullets.join(" ").toLowerCase()).toMatch(/volat|crypto/);
  });
});

describe("missing_data card — datakwaliteit-eis", () => {
  it("Geen fundamentals/factorScore/sector → card noemt ze allemaal", () => {
    const r = buildInvestmentCase(input({ ticker: "TEST" }));
    const md = r.cards.find((c) => c.key === "missing_data")!;
    expect(md.quality).toBe("missing");
    expect(md.bullets.join(" ").toLowerCase()).toMatch(/fundament/);
  });

  it("Volledige data → card quality = solid + 'analyses betrouwbaar'", () => {
    const r = buildInvestmentCase(
      input({
        assetClass: "EQUITY",
        sector: "Tech",
        industry: "Software",
        businessSummary: "X develops software for enterprise customers.",
        fundamentals: {
          ticker: "X",
          asOf: ASOF,
          currency: "USD" as const,
          roic: 0.2,
          pe: 22,
        },
        factorScore: {
          ticker: "X",
          asOf: ASOF,
          subScores: { value: 0.6, quality: 0.7, momentum: 0.5, lowVol: 0.5 },
          composite: 0.62,
          confidence: 0.8,
        } as never,
        dataDepth: {
          ticker: "X",
          score: 90,
          tier: "excellent",
          present: ["live_price", "fundamentals", "dividend", "macro", "history"],
          missing: [],
          explanation: "Alle bronnen aanwezig.",
          sources: [],
        },
      }),
    );
    const md = r.cards.find((c) => c.key === "missing_data")!;
    expect(md.quality).toBe("solid");
  });
});

describe("conclusion card — confidence-tier mapping", () => {
  const confidenceStub = (tier: "STRONG" | "POSITIVE" | "NEUTRAL" | "WEAK" | "AVOID") => ({
    ticker: "X",
    asOf: ASOF,
    totalScore: 50,
    tier,
    headline: "",
    signals: [],
    effectiveWeight: 1,
    dataQuality: "high" as const,
    dataLimitations: [],
    warning: null,
  });

  it("STRONG → 'sterke case' + solid", () => {
    const r = buildInvestmentCase(
      input({ confidence: confidenceStub("STRONG") as never }),
    );
    const conc = r.cards.find((c) => c.key === "conclusion")!;
    expect(conc.body.toLowerCase()).toContain("sterke case");
    expect(conc.quality).toBe("solid");
  });

  it("AVOID → 'kritisch tegen het licht houden' (geen verkoop-advies)", () => {
    const r = buildInvestmentCase(
      input({ confidence: confidenceStub("AVOID") as never }),
    );
    const conc = r.cards.find((c) => c.key === "conclusion")!;
    expect(conc.body.toLowerCase()).toContain("kritisch");
    expect(conc.body.toLowerCase()).not.toMatch(/^verkoop/);
  });

  it("Geen confidence + geen data → quality = missing", () => {
    const r = buildInvestmentCase(input());
    const conc = r.cards.find((c) => c.key === "conclusion")!;
    expect(conc.quality).toBe("missing");
  });
});

describe("Module 31 — geen koop/verkoop-advies in bullets/body", () => {
  it("Geen enkele card body of bullet begint met 'verkoop' of 'koop'", () => {
    const r = buildInvestmentCase(
      input({
        assetClass: "EQUITY",
        fundamentals: {
          ticker: "X",
          asOf: ASOF,
          currency: "USD" as const,
          debtToEquity: 2.5,
          pe: 45,
        },
        confidence: {
          ticker: "X",
          asOf: ASOF,
          totalScore: 25,
          tier: "AVOID",
          headline: "",
          signals: [],
          effectiveWeight: 1,
          dataQuality: "high",
          dataLimitations: [],
          warning: null,
        } as never,
      }),
    );
    const all = r.cards.flatMap((c) => [c.body, ...c.bullets]);
    for (const text of all) {
      expect(text.toLowerCase()).not.toMatch(/^verkoop\s/);
      expect(text.toLowerCase()).not.toMatch(/^koop\s/);
    }
  });
});

describe("AI prompt template (v2-hook)", () => {
  it("buildInvestmentCasePrompt produceert system + user + contextJson", () => {
    const caseData = buildInvestmentCase(input({ ticker: "X" }));
    const p = buildInvestmentCasePrompt(caseData, {
      name: null,
      sector: null,
      industry: null,
      country: null,
      region: null,
      assetKind: "single_stock",
      fundamentals: null,
      confidenceTier: null,
      confidenceScore: null,
      factorComposite: null,
      portfolioWeight: null,
      dataDepthScore: null,
      dataDepthMissing: [],
    });
    expect(p.system).toMatch(/Stock-Story|BeleggerIQ/);
    expect(p.system).toMatch(/UITSLUITEND|verzin geen/i);
    expect(p.user).toMatch(/investment-case/);
    expect(p.contextJson).toMatch(/^{.*}$/);
  });

  it("Prompt eist strikt JSON-only + verbod op verzonnen feiten", () => {
    const caseData = buildInvestmentCase(input());
    const p = buildInvestmentCasePrompt(caseData, {
      name: null,
      sector: null,
      industry: null,
      country: null,
      region: null,
      assetKind: "unknown",
      fundamentals: null,
      confidenceTier: null,
      confidenceScore: null,
      factorComposite: null,
      portfolioWeight: null,
      dataDepthScore: null,
      dataDepthMissing: [],
    });
    expect(p.system).toMatch(/JSON/);
    expect(p.system).toMatch(/data ontbreekt|verzin/i);
  });
});

describe("Module 31 — spec-conformance", () => {
  it("Alle 8 cards uit spec aanwezig met UI-label", () => {
    const r = buildInvestmentCase(input());
    const expected: InvestmentCaseCardKey[] = [
      "what_it_does",
      "why_interesting",
      "strengths",
      "risks",
      "signals_to_watch",
      "portfolio_fit",
      "missing_data",
      "conclusion",
    ];
    expect(r.cards.map((c) => c.key)).toEqual(expected);
    for (const c of r.cards) {
      expect(c.label.length).toBeGreaterThan(0);
    }
  });

  it("Elke card heeft source-attribution voor audit", () => {
    const r = buildInvestmentCase(input());
    for (const c of r.cards) {
      expect(c.source.length).toBeGreaterThan(0);
    }
  });
});
