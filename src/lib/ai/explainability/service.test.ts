import { afterEach, describe, expect, it, vi } from "vitest";

import { DeterministicProvider } from "../provider";
import type {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
} from "../provider/types";

import {
  makeBehavioralContextFixture,
  makeConfidenceScoreFixture,
  makeHealthScoreFixture,
  makeMacroReportFixture,
  makeRiskFixture,
  makeScenarioContextFixture,
} from "./fixtures";
import {
  explainAll,
  explainBehavioral,
  explainConfidence,
  explainHealth,
  explainMacro,
  explainRisk,
  explainScenarios,
  resetExplainabilityCache,
} from "./service";

class StubProvider implements AIProvider {
  readonly id = "openai" as const;
  readonly model = "stub-model";
  constructor(private readonly response: Partial<AICompletionResponse>) {}
  async complete(_req: AICompletionRequest): Promise<AICompletionResponse> {
    return {
      text: null,
      providerId: this.id,
      model: this.model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 1,
      ...this.response,
    };
  }
}

const VALID_AI_OUTPUT = JSON.stringify({
  summary: "Overweeg de score van 72/100 als solide met aandachtspunt.",
  whyItMatters:
    "Mogelijk relevant: sectorconcentratie 42% kan duiden op extra risico.",
  positives: ["Spreiding sterk — mogelijk robuust profiel."],
  risks: ["Sectorshock kan portefeuille treffen."],
  possibleActions: [
    {
      title: "Overweeg complementaire sector",
      rationale: "Kan correlatie-risico dempen.",
    },
  ],
  uncertainties: ["Mogelijk meer data nodig over recente trades."],
});

describe("explainHealth — provider behaviour", () => {
  afterEach(() => {
    resetExplainabilityCache();
    vi.restoreAllMocks();
  });

  it("zonder AI-provider (deterministic) → mode='fallback'", async () => {
    const result = await explainHealth(makeHealthScoreFixture(), {
      provider: new DeterministicProvider(),
    });
    expect(result.mode).toBe("fallback");
    expect(result.providerId).toBe("deterministic");
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.disclaimer.length).toBeGreaterThan(0);
  });

  it("succesvolle AI-output → mode='ai'", async () => {
    const result = await explainHealth(makeHealthScoreFixture(), {
      provider: new StubProvider({ text: VALID_AI_OUTPUT }),
    });
    expect(result.mode).toBe("ai");
    expect(result.summary).toMatch(/72/);
  });

  it("AI-provider faalt → fallback met audit-trail", async () => {
    const result = await explainHealth(makeHealthScoreFixture(), {
      provider: new StubProvider({ text: null, errorReason: "openai-timeout" }),
    });
    expect(result.mode).toBe("fallback");
    expect(result.uncertainties.join(" ")).toMatch(/guardrails|fallback/i);
  });

  it("AI-output met banned phrase → fallback", async () => {
    const banned = JSON.stringify({
      summary: "Gegarandeerd 100%.",
      whyItMatters: "Mogelijk.",
      positives: ["mogelijk."],
      risks: ["mogelijk."],
      possibleActions: [{ title: "Overweeg", rationale: "Mogelijk." }],
      uncertainties: ["Mogelijk."],
    });
    const result = await explainHealth(makeHealthScoreFixture(), {
      provider: new StubProvider({ text: banned }),
    });
    expect(result.mode).toBe("fallback");
    expect(
      result.uncertainties.some((u) => u.toLowerCase().includes("banned")),
    ).toBe(true);
  });

  it("provider die throw't → fallback (geen crash)", async () => {
    const throwing: AIProvider = {
      id: "openai",
      model: "boom",
      complete: async () => {
        throw new Error("network");
      },
    };
    const result = await explainHealth(makeHealthScoreFixture(), {
      provider: throwing,
    });
    expect(result.mode).toBe("fallback");
  });
});

describe("alle 6 domain-explainers", () => {
  afterEach(() => resetExplainabilityCache());

  it("explainHealth output-shape", async () => {
    const r = await explainHealth(makeHealthScoreFixture(), {
      provider: new DeterministicProvider(),
    });
    expect(r.domain).toBe("portfolio_health");
    expect(r.sources.length).toBeGreaterThan(0);
  });

  it("explainConfidence output-shape", async () => {
    const r = await explainConfidence(makeConfidenceScoreFixture(), {
      provider: new DeterministicProvider(),
    });
    expect(r.domain).toBe("investment_confidence");
    expect(r.summary).toMatch(/ASML/i);
  });

  it("explainMacro output-shape", async () => {
    const r = await explainMacro(makeMacroReportFixture(), {
      provider: new DeterministicProvider(),
    });
    expect(r.domain).toBe("macro_regime");
    expect(r.sources.some((s) => s.source === "macro-regime")).toBe(true);
  });

  it("explainBehavioral output-shape", async () => {
    const r = await explainBehavioral(makeBehavioralContextFixture(), {
      provider: new DeterministicProvider(),
    });
    expect(r.domain).toBe("behavioral_coach");
  });

  it("explainRisk output-shape", async () => {
    const r = await explainRisk(makeRiskFixture(), {
      provider: new DeterministicProvider(),
    });
    expect(r.domain).toBe("risk_analysis");
  });

  it("explainScenarios output-shape", async () => {
    const r = await explainScenarios(makeScenarioContextFixture(), {
      provider: new DeterministicProvider(),
    });
    expect(r.domain).toBe("scenario_analysis");
  });
});

describe("explainAll", () => {
  afterEach(() => resetExplainabilityCache());

  it("levert alle 6 domeinen wanneer alle inputs aanwezig zijn", async () => {
    const result = await explainAll(
      {
        health: makeHealthScoreFixture(),
        confidence: makeConfidenceScoreFixture(),
        macro: makeMacroReportFixture(),
        behavioral: makeBehavioralContextFixture(),
        risk: makeRiskFixture(),
        scenarios: makeScenarioContextFixture(),
      },
      { provider: new DeterministicProvider() },
    );
    expect(result.health).not.toBeNull();
    expect(result.confidence).not.toBeNull();
    expect(result.macro).not.toBeNull();
    expect(result.behavioral).not.toBeNull();
    expect(result.risk).not.toBeNull();
    expect(result.scenarios).not.toBeNull();
  });

  it("skipt domeinen waar input null is", async () => {
    const result = await explainAll(
      {
        health: makeHealthScoreFixture(),
      },
      { provider: new DeterministicProvider() },
    );
    expect(result.health).not.toBeNull();
    expect(result.confidence).toBeNull();
    expect(result.macro).toBeNull();
  });
});

describe("caching", () => {
  afterEach(() => resetExplainabilityCache());

  it("tweede call met dezelfde input → cache hit (provider niet aangeroepen)", async () => {
    const completeMock = vi.fn(async (): Promise<AICompletionResponse> => ({
      text: VALID_AI_OUTPUT,
      providerId: "openai",
      model: "stub",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 1,
    }));
    const provider: AIProvider = {
      id: "openai",
      model: "stub",
      complete: completeMock,
    };
    const fixture = makeHealthScoreFixture();
    await explainHealth(fixture, { provider });
    await explainHealth(fixture, { provider });
    expect(completeMock).toHaveBeenCalledTimes(1);
  });

  it("forceRefresh=true bypass cache", async () => {
    const completeMock = vi.fn(async (): Promise<AICompletionResponse> => ({
      text: VALID_AI_OUTPUT,
      providerId: "openai",
      model: "stub",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 1,
    }));
    const provider: AIProvider = {
      id: "openai",
      model: "stub",
      complete: completeMock,
    };
    const fixture = makeHealthScoreFixture();
    await explainHealth(fixture, { provider });
    await explainHealth(fixture, { provider, forceRefresh: true });
    expect(completeMock).toHaveBeenCalledTimes(2);
  });
});
