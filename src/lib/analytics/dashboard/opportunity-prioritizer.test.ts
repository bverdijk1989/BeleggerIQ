import { describe, expect, it } from "vitest";

import type { FactorScore } from "@/types/factor";
import type { MarketRegimeScore } from "@/types/regime";

import type {
  OpportunityCandidate,
  OpportunitySignal,
} from "../opportunity-radar";

import {
  prioritizeOpportunities,
  type PrioritizeOpportunitiesInput,
} from "./opportunity-prioritizer";

const NOW = "2026-04-27T00:00:00.000Z";

// ============================================================
//  Fixtures
// ============================================================

function signal(
  overrides: Partial<OpportunitySignal> = {},
): OpportunitySignal {
  return {
    type: "quality-pullback",
    strength: 70,
    confidence: "MEDIUM",
    rationale: ["Quality-score 80/100 — sterk fundamenteel profiel."],
    riskNote: "Pullback kan dieper worden bij negatieve earnings.",
    detectedAt: NOW,
    ...overrides,
  };
}

function candidate(
  overrides: Partial<OpportunityCandidate> = {},
): OpportunityCandidate {
  return {
    ticker: "ASML",
    name: "ASML Holding",
    isin: null,
    score: 65,
    confidence: "MEDIUM",
    signals: [signal()],
    source: "portfolio",
    currentPrice: 600,
    currency: "EUR",
    summary: "Quality-pullback op semiconductor leader.",
    warnings: [],
    ...overrides,
  };
}

function regime(stance: MarketRegimeScore["stance"]): MarketRegimeScore {
  return {
    asOf: NOW,
    score: stance === "DEFENSIVE" ? 25 : stance === "RISK_ON" ? 75 : 50,
    stance,
    confidence: 0.7,
    narrative: "test",
    subDrivers: [],
  };
}

function factorScore(): FactorScore {
  return {
    ticker: "ASML",
    composite: 70,
    subScores: { value: 70, quality: 80, momentum: 70, lowVol: 70 },
    confidence: 0.8,
    asOf: NOW,
    weights: { value: 1, quality: 1, momentum: 1, lowVol: 1 },
  };
}

function defaultInput(
  overrides: Partial<PrioritizeOpportunitiesInput> = {},
): PrioritizeOpportunitiesInput {
  return {
    candidates: [],
    ...overrides,
  };
}

// ============================================================
//  Tests
// ============================================================

describe("prioritizeOpportunities", () => {
  it("max 3 acties standaard", () => {
    const input = defaultInput({
      candidates: [
        candidate({ ticker: "A", score: 90 }),
        candidate({ ticker: "B", score: 80 }),
        candidate({ ticker: "C", score: 70 }),
        candidate({ ticker: "D", score: 60 }),
        candidate({ ticker: "E", score: 50 }),
      ],
    });
    expect(prioritizeOpportunities(input).length).toBe(3);
  });

  it("output bevat verwachte velden voor het top-resultaat", () => {
    const input = defaultInput({ candidates: [candidate()] });
    const top = prioritizeOpportunities(input)[0]!;
    expect(top.symbol).toBe("ASML");
    expect(top.opportunityType).toBe("QUALITY_PULLBACK");
    expect(top.score).toBeCloseTo(65, 0);
    expect(top.confidence).toBeCloseTo(0.6, 1);
    expect(top.reason).toContain("Quality-score");
    expect(top.suggestedNextStep).toMatch(
      /^(onderzoeken|kleine bijkoop overwegen|wachten op target)$/,
    );
    expect(top.expectedHorizon).toBe("6-18 maanden");
    expect(top.riskLevel).toMatch(/^(LOW|MEDIUM|HIGH)$/);
  });

  it("watchlist-bron → 'wachten op target'", () => {
    const input = defaultInput({
      candidates: [candidate({ source: "watchlist" })],
    });
    expect(prioritizeOpportunities(input)[0]?.suggestedNextStep).toBe(
      "wachten op target",
    );
  });

  it("lage confidence → 'wachten op target'", () => {
    const input = defaultInput({
      candidates: [
        candidate({
          signals: [signal({ confidence: "LOW" })],
        }),
      ],
    });
    const result = prioritizeOpportunities(input)[0]!;
    expect(result.suggestedNextStep).toBe("wachten op target");
    expect(result.lowConfidence).toBe(true);
    expect(result.lowConfidenceReason).toBeDefined();
  });

  it("UNDERWEIGHT_HIGH_CONVICTION + bestaande positie → 'kleine bijkoop overwegen'", () => {
    const input = defaultInput({
      candidates: [
        candidate({
          ticker: "MSFT",
          signals: [
            signal({
              type: "underweight-high-conviction",
              confidence: "HIGH",
              rationale: ["Onderwogen high-conviction MSFT."],
            }),
          ],
        }),
      ],
      portfolioWeights: new Map([["MSFT", 0.03]]),
    });
    const result = prioritizeOpportunities(input)[0]!;
    expect(result.opportunityType).toBe("UNDERWEIGHT_HIGH_CONVICTION");
    expect(result.suggestedNextStep).toBe("kleine bijkoop overwegen");
  });

  it("ETF_REBALANCE_OPPORTUNITY + hoge confidence + bestaande positie → 'kleine bijkoop overwegen'", () => {
    const input = defaultInput({
      candidates: [
        candidate({
          ticker: "VWCE",
          signals: [
            signal({
              type: "etf-core-rebalance",
              confidence: "HIGH",
              rationale: ["Core-ETF onder target."],
            }),
          ],
        }),
      ],
      portfolioWeights: new Map([["VWCE", 0.20]]),
    });
    const result = prioritizeOpportunities(input)[0]!;
    expect(result.suggestedNextStep).toBe("kleine bijkoop overwegen");
  });

  it("default → 'onderzoeken'", () => {
    const input = defaultInput({
      candidates: [
        candidate({
          source: "screener",
          signals: [signal({ confidence: "HIGH" })],
        }),
      ],
    });
    expect(prioritizeOpportunities(input)[0]?.suggestedNextStep).toBe(
      "onderzoeken",
    );
  });

  it("UNDERWEIGHT-rerank: zelfde baseline-score, maar onderwogen wint", () => {
    const baseline = candidate({
      ticker: "AAA",
      score: 70,
      signals: [signal({ confidence: "HIGH" })],
    });
    const underweight = candidate({
      ticker: "BBB",
      score: 70,
      signals: [
        signal({
          type: "underweight-high-conviction",
          confidence: "HIGH",
          rationale: ["Onderwogen."],
        }),
      ],
    });
    const input = defaultInput({
      candidates: [baseline, underweight],
      portfolioWeights: new Map([["BBB", 0.0]]),
    });
    const result = prioritizeOpportunities(input);
    expect(result[0]?.symbol).toBe("BBB");
    expect(result[0]?.score).toBeGreaterThan(baseline.score);
    expect(result[0]?.baselineScore).toBe(70);
  });

  it("regime-mismatch: DEFENSIVE regime + MOMENTUM_REVERSAL krijgt penalty", () => {
    const input = defaultInput({
      candidates: [
        candidate({
          ticker: "MOM",
          score: 80,
          signals: [
            signal({
              type: "momentum-reversal",
              strength: 80,
              confidence: "HIGH",
              rationale: ["Momentum keerpunt."],
            }),
          ],
        }),
      ],
      regime: regime("DEFENSIVE"),
    });
    const result = prioritizeOpportunities(input)[0]!;
    expect(result.score).toBeLessThan(80);
    expect(result.baselineScore).toBe(80);
  });

  it("low-confidence reason wordt gevuld bij confidence < 0.5", () => {
    const input = defaultInput({
      candidates: [
        candidate({
          signals: [signal({ confidence: "LOW" })],
          warnings: ["Dunne price-history"],
        }),
      ],
    });
    const result = prioritizeOpportunities(input)[0]!;
    expect(result.lowConfidence).toBe(true);
    expect(result.lowConfidenceReason).toContain("Confidence-tier LOW");
    expect(result.lowConfidenceReason).toContain("Datawaarschuwing");
  });

  it("publieke filter: signaal zonder publiek-mapping wordt overgeslagen", () => {
    const input = defaultInput({
      candidates: [
        candidate({
          signals: [
            signal({
              type: "defensive-bargain",
              rationale: ["Niet publiek."],
            }),
          ],
        }),
      ],
    });
    expect(prioritizeOpportunities(input)).toEqual([]);
  });

  it("sortering: hogere score wint", () => {
    const input = defaultInput({
      candidates: [
        candidate({ ticker: "B", score: 60 }),
        candidate({ ticker: "A", score: 90 }),
      ],
    });
    expect(prioritizeOpportunities(input).map((o) => o.symbol)).toEqual([
      "A",
      "B",
    ]);
  });

  it("currentWeight wordt bijgehouden voor UI-context", () => {
    const input = defaultInput({
      candidates: [candidate({ ticker: "PFE" })],
      portfolioWeights: new Map([["PFE", 0.07]]),
    });
    const result = prioritizeOpportunities(input)[0]!;
    expect(result.currentWeight).toBeCloseTo(0.07, 2);
  });

  it("currentWeight = null wanneer ticker niet in portfolio", () => {
    const input = defaultInput({
      candidates: [candidate({ ticker: "NEW" })],
      portfolioWeights: new Map(),
    });
    expect(prioritizeOpportunities(input)[0]?.currentWeight).toBeNull();
  });

  it("score blijft binnen [0, 100]", () => {
    const input = defaultInput({
      candidates: [
        candidate({
          ticker: "MAX",
          score: 99,
          signals: [
            signal({
              type: "underweight-high-conviction",
              confidence: "HIGH",
              rationale: ["High conviction onderwogen."],
            }),
          ],
        }),
      ],
      portfolioWeights: new Map([["MAX", 0.0]]),
    });
    const result = prioritizeOpportunities(input)[0]!;
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("determinisme: identieke input → identieke output", () => {
    const input = defaultInput({
      candidates: [
        candidate({ ticker: "A", score: 80 }),
        candidate({ ticker: "B", score: 70 }),
      ],
    });
    expect(prioritizeOpportunities(input)).toEqual(
      prioritizeOpportunities(input),
    );
  });

  it("maxOpportunities is configureerbaar", () => {
    const input = defaultInput({
      candidates: [
        candidate({ ticker: "A", score: 90 }),
        candidate({ ticker: "B", score: 80 }),
        candidate({ ticker: "C", score: 70 }),
      ],
      maxOpportunities: 1,
    });
    expect(prioritizeOpportunities(input).length).toBe(1);
  });

  it("lege input → lege output", () => {
    expect(prioritizeOpportunities(defaultInput())).toEqual([]);
  });

  it("factor-score afwezig → wordt vermeld in low-confidence reason", () => {
    const input = defaultInput({
      candidates: [
        candidate({
          signals: [signal({ confidence: "LOW" })],
        }),
      ],
      factorScores: new Map(),
    });
    const result = prioritizeOpportunities(input)[0]!;
    expect(result.lowConfidenceReason).toContain("factor-score");
  });

  it("alle uitkomsten hebben een NL next-step waarde", () => {
    const input = defaultInput({
      candidates: [
        candidate({ ticker: "A", source: "portfolio" }),
        candidate({ ticker: "B", source: "screener" }),
        candidate({ ticker: "C", source: "watchlist" }),
      ],
    });
    const allowed = new Set([
      "onderzoeken",
      "kleine bijkoop overwegen",
      "wachten op target",
    ]);
    for (const o of prioritizeOpportunities(input)) {
      expect(allowed.has(o.suggestedNextStep)).toBe(true);
    }
  });
});
