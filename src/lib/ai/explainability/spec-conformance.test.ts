import { describe, expect, it } from "vitest";

import {
  fallbackBehavioral,
  fallbackConfidence,
  fallbackHealth,
  fallbackMacro,
  fallbackMonthlyDecision,
  fallbackRisk,
  fallbackScenarios,
  fallbackWatchlist,
} from "./fallbacks";
import {
  makeAllocationPlanFixture,
  makeBehavioralContextFixture,
  makeConfidenceScoreFixture,
  makeHealthScoreFixture,
  makeMacroReportFixture,
  makeRiskFixture,
  makeScenarioContextFixture,
  makeWatchlistReportFixture,
} from "./fixtures";
import { DOMAIN_LABELS, type ExplainabilityDomain } from "./types";

/**
 * Module 8 — AI Explainability Layer spec-conformance.
 *
 * Het Module 8-spec eist 7 ondersteunde domeinen + een uniform
 * output-format. Wij dekken 8 (de 7 spec-domeinen plus `risk_analysis`
 * dat al van eerder bestaat). Deze tests bevriezen:
 *
 *  1. Alle 7 spec-domeinen zijn aanwezig in `ExplainabilityDomain`.
 *  2. Iedere fallback levert het canonieke 6-veld output-schema
 *     (summary, whyItMatters, positives[], risks[], possibleActions[],
 *     uncertainties[]) — exact wat het Module 8-output-format eist.
 *  3. Fallbacks bevatten GEEN harde koop/verkoop-imperatief (geen
 *     'koop', 'verkoop', 'sell now' op zinsbegin).
 *  4. Uncertainties worden expliciet benoemd als data ontbreekt
 *     (no-silent-data-gap regel).
 */

const ALL_FALLBACK_OUTPUTS = (() => [
  ["portfolio_health", fallbackHealth(makeHealthScoreFixture())] as const,
  [
    "investment_confidence",
    fallbackConfidence(makeConfidenceScoreFixture()),
  ] as const,
  ["macro_regime", fallbackMacro(makeMacroReportFixture())] as const,
  [
    "behavioral_coach",
    fallbackBehavioral(makeBehavioralContextFixture()),
  ] as const,
  ["risk_analysis", fallbackRisk(makeRiskFixture())] as const,
  [
    "scenario_analysis",
    fallbackScenarios(makeScenarioContextFixture()),
  ] as const,
  [
    "monthly_decision",
    fallbackMonthlyDecision(makeAllocationPlanFixture()),
  ] as const,
  [
    "watchlist_signals",
    fallbackWatchlist(makeWatchlistReportFixture()),
  ] as const,
])();

describe("Module 8 — alle 7 spec-domeinen aanwezig", () => {
  it("DOMAIN_LABELS dekt de 7 spec-componenten", () => {
    // Module 8-spec: portfolio_health, investment_confidence, macro_regime,
    // behavioral_coach, scenario_analysis (= stress-test), monthly_decision,
    // watchlist_signals.
    const required: ExplainabilityDomain[] = [
      "portfolio_health",
      "investment_confidence",
      "macro_regime",
      "behavioral_coach",
      "scenario_analysis",
      "monthly_decision",
      "watchlist_signals",
    ];
    for (const d of required) {
      expect(DOMAIN_LABELS[d]).toBeDefined();
      expect(DOMAIN_LABELS[d].length).toBeGreaterThan(0);
    }
  });
});

describe("Module 8 — canoniek output-schema per domein", () => {
  for (const [domain, output] of ALL_FALLBACK_OUTPUTS) {
    it(`${domain}: bevat 6 verplichte velden conform spec`, () => {
      expect(typeof output.summary).toBe("string");
      expect(output.summary.length).toBeGreaterThan(0);

      expect(typeof output.whyItMatters).toBe("string");
      expect(output.whyItMatters.length).toBeGreaterThan(0);

      expect(Array.isArray(output.positives)).toBe(true);
      expect(output.positives.length).toBeGreaterThan(0);

      expect(Array.isArray(output.risks)).toBe(true);
      expect(output.risks.length).toBeGreaterThan(0);

      expect(Array.isArray(output.possibleActions)).toBe(true);
      expect(output.possibleActions.length).toBeGreaterThan(0);
      for (const a of output.possibleActions) {
        expect(typeof a.title).toBe("string");
        expect(typeof a.rationale).toBe("string");
      }

      expect(Array.isArray(output.uncertainties)).toBe(true);
      expect(output.uncertainties.length).toBeGreaterThan(0);
    });
  }
});

describe("Module 8 — geen hard koop/verkoop-advies (hedged-language)", () => {
  // Module 8-spec: "AI geeft geen persoonlijk financieel advies, maar
  // analyse-informatie." Een geïsoleerd 'koop' / 'verkoop' op zinsbegin
  // duidt op een imperatief advies; 'overweeg te kopen' is OK.
  const FORBIDDEN_OPENERS = [
    /^Koop\s/i,
    /^Verkoop\s/i,
    /^Sell\s/i,
    /^Buy\s/i,
  ];

  for (const [domain, output] of ALL_FALLBACK_OUTPUTS) {
    it(`${domain}: geen koop/verkoop-imperatief op zinsbegin`, () => {
      const all = [
        output.summary,
        output.whyItMatters,
        ...output.positives,
        ...output.risks,
        ...output.possibleActions.map((a) => `${a.title}. ${a.rationale}`),
      ];
      for (const text of all) {
        for (const pattern of FORBIDDEN_OPENERS) {
          expect(text).not.toMatch(pattern);
        }
      }
    });
  }
});

describe("Module 8 — ontbrekende data → expliciete uncertainty (geen silent gap)", () => {
  it("monthly_decision zonder simulatie noemt dit expliciet", () => {
    const plan = makeAllocationPlanFixture({ simulation: undefined });
    const out = fallbackMonthlyDecision(plan);
    expect(out.uncertainties.some((u) => /projectie|simulatie/i.test(u))).toBe(
      true,
    );
  });

  it("watchlist zonder dividend + sentiment-feed noemt dit expliciet", () => {
    const out = fallbackWatchlist(makeWatchlistReportFixture());
    // Dividend + Sentiment hebben available=false in de fixture.
    expect(
      out.uncertainties.some(
        (u) => /Dividend|Sentiment|signal/i.test(u),
      ),
    ).toBe(true);
  });

  it("lege scenario-context noemt expliciet dat data ontbreekt", () => {
    const out = fallbackScenarios(makeScenarioContextFixture({ scenarios: [] }));
    expect(out.uncertainties.some((u) => /data|gedraaid/i.test(u))).toBe(true);
  });
});
