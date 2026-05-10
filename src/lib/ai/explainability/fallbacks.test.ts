import { describe, expect, it } from "vitest";

import {
  fallbackBehavioral,
  fallbackConfidence,
  fallbackHealth,
  fallbackMacro,
  fallbackRisk,
  fallbackScenarios,
} from "./fallbacks";
import {
  makeBehavioralContextFixture,
  makeConfidenceScoreFixture,
  makeHealthScoreFixture,
  makeMacroReportFixture,
  makeRiskFixture,
  makeScenarioContextFixture,
} from "./fixtures";

describe("fallbackHealth", () => {
  it("levert volledige draft-shape", () => {
    const draft = fallbackHealth(makeHealthScoreFixture());
    expect(draft.summary.length).toBeGreaterThan(0);
    expect(draft.whyItMatters.length).toBeGreaterThan(0);
    expect(draft.positives.length).toBeGreaterThan(0);
    expect(draft.risks.length).toBeGreaterThan(0);
    expect(draft.possibleActions.length).toBeGreaterThan(0);
    expect(draft.uncertainties.length).toBeGreaterThan(0);
  });

  it("benoemt grade + score in summary", () => {
    const draft = fallbackHealth(
      makeHealthScoreFixture({ totalScore: 85, grade: "A" }),
    );
    expect(draft.summary).toContain("85");
    expect(draft.summary).toContain("A");
  });

  it("topRecommendations worden mapped naar possibleActions", () => {
    const draft = fallbackHealth(makeHealthScoreFixture());
    expect(draft.possibleActions[0]!.title).toBe("Diversifieer over sectoren");
    expect(draft.possibleActions[0]!.link).toBe("/maandbeslissing");
  });

  it("low effectiveWeight triggert uncertainty", () => {
    const draft = fallbackHealth(
      makeHealthScoreFixture({ effectiveWeight: 0.5 }),
    );
    expect(draft.uncertainties.join(" ")).toMatch(/data|gewicht/i);
  });
});

describe("fallbackConfidence", () => {
  it("levert volledige draft-shape", () => {
    const draft = fallbackConfidence(makeConfidenceScoreFixture());
    expect(draft.summary).toContain("ASML");
    expect(draft.positives.length).toBeGreaterThan(0);
  });

  it("STRONG-tier → 'overweeg aanhouden' actie", () => {
    const draft = fallbackConfidence(
      makeConfidenceScoreFixture({ tier: "STRONG", totalScore: 85 }),
    );
    expect(draft.possibleActions[0]!.title.toLowerCase()).toMatch(
      /houden|bijkopen|positie/,
    );
  });

  it("WEAK-tier → 'overweeg thesis' actie", () => {
    const draft = fallbackConfidence(
      makeConfidenceScoreFixture({ tier: "WEAK", totalScore: 35 }),
    );
    expect(draft.possibleActions[0]!.title.toLowerCase()).toMatch(/thesis|review|oorspronkelijke/);
  });
});

describe("fallbackMacro", () => {
  it("benoemt regime-naam in summary", () => {
    const draft = fallbackMacro(makeMacroReportFixture());
    expect(draft.summary.toLowerCase()).toMatch(/stagflation/);
  });

  it("toont tail- en headwinds in positives/risks", () => {
    const draft = fallbackMacro(makeMacroReportFixture());
    const allText = [...draft.positives, ...draft.risks].join(" ");
    expect(allText.toLowerCase()).toMatch(/goud|growth|stagflatie|tegenwind|rugwind/);
  });

  it("low alignment-score triggert tilt-actie", () => {
    const draft = fallbackMacro(
      makeMacroReportFixture({
        portfolioImpact: {
          regime: "STAGFLATION",
          summary: "Misalignment.",
          alignmentScore: 30,
          topGaps: [],
          buckets: [],
        },
      }),
    );
    expect(draft.possibleActions.some((a) => a.title.toLowerCase().includes("tilt"))).toBe(true);
  });
});

describe("fallbackBehavioral", () => {
  it("0 actieve patronen → bevestigende toon", () => {
    const draft = fallbackBehavioral(
      makeBehavioralContextFixture({ signals: [], activeCount: 0 }),
    );
    expect(draft.summary.toLowerCase()).toMatch(/geen actieve|synchroon/);
  });

  it("1+ actieve patronen → coachende toon, niet veroordelend", () => {
    const draft = fallbackBehavioral(makeBehavioralContextFixture());
    const allText = [draft.summary, draft.whyItMatters, ...draft.risks].join(" ");
    expect(allText.toLowerCase()).not.toMatch(/fout|verkeerd|gefaald/);
    expect(allText.toLowerCase()).toMatch(/reflectie|bewust|coach/);
  });
});

describe("fallbackRisk", () => {
  it("levert volledige draft", () => {
    const draft = fallbackRisk(makeRiskFixture());
    expect(draft.summary).toMatch(/moderate|risico/i);
    expect(draft.risks.length).toBeGreaterThan(0);
  });

  it("hoge largestPositionWeight → trim-actie", () => {
    const draft = fallbackRisk(
      makeRiskFixture({ largestPositionWeight: 0.30 }),
    );
    expect(draft.possibleActions.some((a) => a.title.toLowerCase().includes("trim"))).toBe(true);
  });
});

describe("fallbackScenarios", () => {
  it("levert volledige draft met worst- en best-case", () => {
    const draft = fallbackScenarios(makeScenarioContextFixture());
    expect(draft.summary).toMatch(/worst|best/i);
  });

  it("worst-case onder -15% → hedge-suggestie", () => {
    const draft = fallbackScenarios(makeScenarioContextFixture());
    expect(draft.possibleActions.some((a) => a.title.toLowerCase().includes("hedge"))).toBe(true);
  });

  it("lege scenarios → eerste run-CTA", () => {
    const draft = fallbackScenarios(
      makeScenarioContextFixture({ scenarios: [] }),
    );
    expect(draft.possibleActions[0]!.title.toLowerCase()).toMatch(/scenario|run/);
  });
});
