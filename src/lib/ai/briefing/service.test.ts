import { afterEach, describe, expect, it, vi } from "vitest";

import { DeterministicProvider } from "../provider";

import { resetBriefingCache } from "./cache";
import { makeBriefingContext } from "./fixtures";
import { loadDailyBriefing } from "./service";
import type {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
} from "../provider/types";

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
  headline: "Overweeg vandaag de concentratie ASML.",
  focusAction: "Overweeg ASML te trimmen.",
  sections: [
    { key: "portfolio_movement", body: "Overweeg lange-termijnbeeld.", dataAvailable: true },
    { key: "winners_losers", body: "Mogelijk goed moment voor review.", dataAvailable: true },
    { key: "risks", body: "Let op single-name risico bij ASML.", dataAvailable: true },
    { key: "macro", body: "Regime is neutraal; mogelijk gebalanceerd.", dataAvailable: true },
    { key: "earnings_news", body: "Geen feed beschikbaar.", dataAvailable: false },
    { key: "concentration_volatility", body: "Sector tech zwaar; let op correlatie.", dataAvailable: true },
    { key: "focus_action", body: "Overweeg ASML te trimmen.", dataAvailable: true },
  ],
});

describe("loadDailyBriefing — provider behaviour", () => {
  afterEach(() => {
    resetBriefingCache();
    vi.restoreAllMocks();
  });

  it("zonder AI-provider (deterministic) → mode='fallback'", async () => {
    const briefing = await loadDailyBriefing({
      context: makeBriefingContext(),
      provider: new DeterministicProvider(),
    });
    expect(briefing.mode).toBe("fallback");
    expect(briefing.providerId).toBe("deterministic");
    expect(briefing.sections).toHaveLength(7);
    expect(briefing.disclaimer.length).toBeGreaterThan(0);
  });

  it("succesvolle AI-provider met valide output → mode='ai'", async () => {
    const stub = new StubProvider({
      text: VALID_AI_OUTPUT,
      providerId: "openai",
    });
    const briefing = await loadDailyBriefing({
      context: makeBriefingContext(),
      provider: stub,
    });
    expect(briefing.mode).toBe("ai");
    expect(briefing.headline).toMatch(/concentratie ASML/i);
    expect(briefing.providerId).toBe("openai");
  });

  it("AI-provider faalt → fallback met audit-trail", async () => {
    const stub = new StubProvider({
      text: null,
      errorReason: "openai-timeout",
    });
    const briefing = await loadDailyBriefing({
      context: makeBriefingContext(),
      provider: stub,
    });
    expect(briefing.mode).toBe("fallback");
    expect(
      briefing.dataLimitations.some((l) => l.toLowerCase().includes("guardrails")),
    ).toBe(true);
  });

  it("AI-output met banned phrase → fallback", async () => {
    const banned = JSON.stringify({
      headline: "Gegarandeerd hoger.",
      focusAction: "Trim ASML.",
      sections: [
        { key: "portfolio_movement", body: "Overweeg.", dataAvailable: true },
        { key: "winners_losers", body: "Overweeg.", dataAvailable: true },
        { key: "risks", body: "Overweeg.", dataAvailable: true },
        { key: "macro", body: "Overweeg.", dataAvailable: true },
        { key: "earnings_news", body: "Overweeg.", dataAvailable: false },
        { key: "concentration_volatility", body: "Overweeg.", dataAvailable: true },
        { key: "focus_action", body: "Overweeg.", dataAvailable: true },
      ],
    });
    const stub = new StubProvider({ text: banned });
    const briefing = await loadDailyBriefing({
      context: makeBriefingContext(),
      provider: stub,
    });
    expect(briefing.mode).toBe("fallback");
    expect(
      briefing.dataLimitations.some((l) =>
        l.toLowerCase().includes("banned-phrase"),
      ),
    ).toBe(true);
  });

  it("provider die throw't → fallback (geen crash)", async () => {
    const throwing: AIProvider = {
      id: "openai",
      model: "boom",
      complete: async () => {
        throw new Error("network down");
      },
    };
    const briefing = await loadDailyBriefing({
      context: makeBriefingContext(),
      provider: throwing,
    });
    expect(briefing.mode).toBe("fallback");
    expect(briefing.headline.length).toBeGreaterThan(0);
  });
});

describe("loadDailyBriefing — caching", () => {
  afterEach(() => resetBriefingCache());

  it("tweede call met dezelfde context → cache hit (provider niet aangeroepen)", async () => {
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
    const ctx = makeBriefingContext();
    const a = await loadDailyBriefing({ context: ctx, provider });
    const b = await loadDailyBriefing({ context: ctx, provider });
    expect(a).toEqual(b);
    expect(completeMock).toHaveBeenCalledTimes(1);
  });

  it("forceRefresh=true → bypass cache", async () => {
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
    const ctx = makeBriefingContext();
    await loadDailyBriefing({ context: ctx, provider });
    await loadDailyBriefing({ context: ctx, provider, forceRefresh: true });
    expect(completeMock).toHaveBeenCalledTimes(2);
  });

  it("verschillende context → 2 onderscheiden cache-entries", async () => {
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
    await loadDailyBriefing({
      context: makeBriefingContext({
        totals: {
          totalValue: 50000,
          cashBalance: 1000,
          cashShare: 0.02,
          positionCount: 5,
        },
      }),
      provider,
    });
    await loadDailyBriefing({
      context: makeBriefingContext({
        totals: {
          totalValue: 100000,
          cashBalance: 5000,
          cashShare: 0.05,
          positionCount: 12,
        },
      }),
      provider,
    });
    expect(completeMock).toHaveBeenCalledTimes(2);
  });
});

describe("loadDailyBriefing — confidence + sources", () => {
  afterEach(() => resetBriefingCache());

  it("rich data (snapshots≥60, regime, factors) → confidence 'high'", async () => {
    const briefing = await loadDailyBriefing({
      context: makeBriefingContext(),
      provider: new DeterministicProvider(),
    });
    expect(briefing.confidenceTier).toBe("high");
    expect(briefing.sources).toContain("portfolio-snapshots");
    expect(briefing.sources).toContain("market-regime");
    expect(briefing.sources).toContain("factor-engine");
  });

  it("schaarse data → confidence 'low'", async () => {
    const briefing = await loadDailyBriefing({
      context: makeBriefingContext({
        dataSources: {
          snapshots: 0,
          factorScored: 0,
          regimeAvailable: false,
          riskActionsAvailable: 0,
        },
      }),
      provider: new DeterministicProvider(),
    });
    expect(briefing.confidenceTier).toBe("low");
    expect(
      briefing.dataLimitations.some((l) => l.toLowerCase().includes("snapshot")),
    ).toBe(true);
  });
});
