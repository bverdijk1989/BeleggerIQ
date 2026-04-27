import { describe, expect, it } from "vitest";

import type {
  DashboardAction,
} from "@/lib/analytics/actions";
import type {
  DashboardOpportunity,
  DashboardRiskAction,
} from "@/lib/analytics";
import type { MarketRegimeScore } from "@/types/regime";

import {
  buildDashboardSummaryPrompt,
  DASHBOARD_SUMMARY_SYSTEM_PROMPT,
  explainDashboardSummary,
  validateDashboardSummary,
  type DashboardSummaryExplanationInput,
} from "./dashboard-explainer";

const NOW = "2026-04-27T00:00:00.000Z";

// ============================================================
//  Fixtures
// ============================================================

function action(
  overrides: Partial<DashboardAction> = {},
): DashboardAction {
  return {
    id: "RISK_REDUCTION:RHM",
    type: "RISK_REDUCTION",
    title: "Verkoop 1 aandeel Rheinmetall",
    description: "Concentratie boven cap.",
    urgency: "HIGH",
    confidence: 0.9,
    reason: "Concentration",
    sourceEngine: "rebalance-engine",
    ...overrides,
  };
}

function risk(
  overrides: Partial<DashboardRiskAction> = {},
): DashboardRiskAction {
  return {
    id: "POSITION_CONCENTRATION:RHM",
    riskType: "POSITION_CONCENTRATION",
    title: "Rheinmetall weegt 17,5%",
    impact: "Eén positie boven cap.",
    recommendedAction: "Verkoop 1 aandeel.",
    severity: "high",
    confidence: 0.9,
    explanation: "RHM 17,5% > 10%.",
    insufficientData: false,
    sourceEngine: "rebalance-engine",
    ...overrides,
  };
}

function opportunity(
  overrides: Partial<DashboardOpportunity> = {},
): DashboardOpportunity {
  return {
    id: "QUALITY_PULLBACK:ASML",
    symbol: "ASML",
    name: "ASML Holding",
    opportunityType: "QUALITY_PULLBACK",
    score: 75,
    baselineScore: 75,
    confidence: 0.7,
    reason: "Quality 80, momentum negative.",
    suggestedNextStep: "onderzoeken",
    riskLevel: "MEDIUM",
    expectedHorizon: "6-18 maanden",
    source: "portfolio",
    lowConfidence: false,
    currentWeight: 0.05,
    ...overrides,
  };
}

function regime(
  stance: MarketRegimeScore["stance"],
): MarketRegimeScore {
  return {
    asOf: NOW,
    score: stance === "DEFENSIVE" ? 25 : stance === "RISK_ON" ? 75 : 50,
    stance,
    confidence: 0.7,
    narrative: "test",
    subDrivers: [],
  };
}

function defaultInput(
  overrides: Partial<DashboardSummaryExplanationInput> = {},
): DashboardSummaryExplanationInput {
  return {
    topActions: [action()],
    topRisks: [risk()],
    topOpportunities: [opportunity()],
    regime: regime("NEUTRAL"),
    overallConfidence: 0.8,
    now: NOW,
    ...overrides,
  };
}

// ============================================================
//  Tests
// ============================================================

describe("explainDashboardSummary", () => {
  it("levert headline + drie secties", () => {
    const result = explainDashboardSummary(defaultInput());
    expect(result.headline).toContain("Verkoop 1 aandeel Rheinmetall");
    expect(result.whyTopActions.length).toBeGreaterThan(0);
    expect(result.uncertainties.length).toBeGreaterThan(0);
    expect(result.improvementSuggestions.length).toBeGreaterThan(0);
  });

  it("citeert title + reason letterlijk uit dashboard-action", () => {
    const result = explainDashboardSummary(defaultInput());
    expect(result.whyTopActions[0]).toContain("Verkoop 1 aandeel Rheinmetall");
    expect(result.whyTopActions[0]).toContain("hoge urgentie");
    expect(result.whyTopActions[0]).toContain("90%");
  });

  it("benoemt lage-confidence dashboard-action expliciet", () => {
    const result = explainDashboardSummary(
      defaultInput({
        topActions: [action({ confidence: 0.3 })],
      }),
    );
    expect(
      result.uncertainties.some((u) => u.includes("lage engine-confidence")),
    ).toBe(true);
  });

  it("benoemt lage-confidence opportunity expliciet", () => {
    const result = explainDashboardSummary(
      defaultInput({
        topOpportunities: [
          opportunity({
            lowConfidence: true,
            lowConfidenceReason: "Confidence-tier LOW.",
          }),
        ],
      }),
    );
    expect(
      result.uncertainties.some((u) => u.includes("Confidence-tier LOW")),
    ).toBe(true);
  });

  it("benoemt insufficientData op risk-actie", () => {
    const result = explainDashboardSummary(
      defaultInput({
        topRisks: [risk({ insufficientData: true })],
      }),
    );
    expect(
      result.uncertainties.some((u) => u.includes("mist betrouwbare aantallen")),
    ).toBe(true);
  });

  it("improvementSuggestions stelt fundamentals voor bij lage opportunity-confidence", () => {
    const result = explainDashboardSummary(
      defaultInput({
        topOpportunities: [
          opportunity({
            symbol: "ZZZ",
            lowConfidence: true,
            lowConfidenceReason: "Beperkte data.",
          }),
        ],
      }),
    );
    expect(
      result.improvementSuggestions.some(
        (s) => s.includes("ZZZ") && s.includes("fundamentals"),
      ),
    ).toBe(true);
  });

  it("improvementSuggestions stelt holding-velden voor bij lage overallConfidence", () => {
    const result = explainDashboardSummary(
      defaultInput({ overallConfidence: 0.3 }),
    );
    expect(
      result.improvementSuggestions.some((s) =>
        s.includes("holding-velden"),
      ),
    ).toBe(true);
  });

  it("confidenceTier mapping: high / medium / low", () => {
    expect(
      explainDashboardSummary(defaultInput({ overallConfidence: 0.9 }))
        .confidenceTier,
    ).toBe("high");
    expect(
      explainDashboardSummary(defaultInput({ overallConfidence: 0.6 }))
        .confidenceTier,
    ).toBe("medium");
    expect(
      explainDashboardSummary(defaultInput({ overallConfidence: 0.2 }))
        .confidenceTier,
    ).toBe("low");
  });

  it("sources verzamelt engine-bronnen uit input", () => {
    const result = explainDashboardSummary(defaultInput());
    expect(result.sources).toContain("rebalance-engine");
    expect(result.sources).toContain("opportunity-radar");
    expect(result.sources).toContain("market-regime");
  });

  it("disclaimer markeert AI-rol als 'alleen uitleggen'", () => {
    const result = explainDashboardSummary(defaultInput());
    expect(result.disclaimer.toLowerCase()).toContain("alleen uit");
    expect(result.disclaimer.toLowerCase()).toContain("engines");
  });

  it("lege input → fallback uncertainty + improvement-suggestion", () => {
    const result = explainDashboardSummary({
      topActions: [],
      topRisks: [],
      topOpportunities: [],
      regime: null,
      now: NOW,
    });
    expect(result.headline).toBeTruthy();
    expect(
      result.uncertainties.some((u) =>
        u.toLowerCase().includes("geen materiële onzekerheden"),
      ) || result.uncertainties.length > 0,
    ).toBe(true);
    expect(result.improvementSuggestions.length).toBeGreaterThan(0);
  });

  it("determinisme: identieke input → identieke output", () => {
    const input = defaultInput();
    expect(explainDashboardSummary(input)).toEqual(
      explainDashboardSummary(input),
    );
  });

  it("dataQualityNotes worden in uncertainties opgenomen", () => {
    const result = explainDashboardSummary(
      defaultInput({
        dataQualityNotes: ["3 holdings missen ISIN — symbol-resolver onzeker."],
      }),
    );
    expect(
      result.uncertainties.some((u) =>
        u.includes("3 holdings missen ISIN"),
      ),
    ).toBe(true);
  });
});

describe("buildDashboardSummaryPrompt", () => {
  it("system-prompt verbiedt nieuwe cijfers/koop-verkoopbeslissingen", () => {
    expect(DASHBOARD_SUMMARY_SYSTEM_PROMPT).toContain(
      "Verzin geen nieuwe scores",
    );
    expect(DASHBOARD_SUMMARY_SYSTEM_PROMPT).toContain(
      "Geef geen koop- of verkoopbeslissing",
    );
  });

  it("user-payload bevat de input-context als JSON-blok", () => {
    const payload = buildDashboardSummaryPrompt(defaultInput());
    expect(payload.user).toContain("CONTEXT");
    expect(payload.user).toContain("topActions");
    expect(payload.user).toContain("topRisks");
    expect(payload.user).toContain("topOpportunities");
  });
});

describe("validateDashboardSummary", () => {
  it("accepteert tekst die alleen cijfers uit context citeert", () => {
    // 0.9 confidence komt voor in de input — citaat van "0.9" is geldig.
    const input = defaultInput();
    const text = "Engine-confidence 0.9 voor de top-actie.";
    const result = validateDashboardSummary(text, input);
    expect(result.ok).toBe(true);
    expect(result.rejectedClaims).toEqual([]);
  });

  it("rejecteert tekst met verzonnen cijfers", () => {
    const input = defaultInput();
    const text = "ASML stijgt naar 1234 EUR met 99,9% kans.";
    const result = validateDashboardSummary(text, input);
    expect(result.ok).toBe(false);
    expect(result.rejectedClaims.length).toBeGreaterThan(0);
  });
});
