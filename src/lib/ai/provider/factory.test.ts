import { afterEach, describe, expect, it } from "vitest";

import { AnthropicProvider } from "./anthropic";
import { DeterministicProvider } from "./deterministic";
import { resetAIProviderCache, resolveAIProvider } from "./factory";
import { OpenAIProvider } from "./openai";

describe("resolveAIProvider", () => {
  afterEach(() => resetAIProviderCache());

  it("zonder env-keys → DeterministicProvider", () => {
    const p = resolveAIProvider({ env: {} });
    expect(p).toBeInstanceOf(DeterministicProvider);
    expect(p.id).toBe("deterministic");
  });

  it("expliciete provider=anthropic + key → AnthropicProvider", () => {
    const p = resolveAIProvider({
      env: {
        AI_BRIEFING_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "sk-ant-xxx",
      },
    });
    expect(p).toBeInstanceOf(AnthropicProvider);
    expect(p.id).toBe("anthropic");
  });

  it("expliciete provider=openai + key → OpenAIProvider", () => {
    const p = resolveAIProvider({
      env: {
        AI_BRIEFING_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-xxx",
      },
    });
    expect(p).toBeInstanceOf(OpenAIProvider);
    expect(p.id).toBe("openai");
  });

  it("expliciete provider zonder bijbehorende key → fallback Deterministic", () => {
    const p = resolveAIProvider({
      env: {
        AI_BRIEFING_PROVIDER: "anthropic",
        // geen ANTHROPIC_API_KEY
      },
    });
    expect(p).toBeInstanceOf(DeterministicProvider);
  });

  it("auto-detect: ANTHROPIC_API_KEY beats OPENAI_API_KEY", () => {
    const p = resolveAIProvider({
      env: {
        ANTHROPIC_API_KEY: "sk-ant-xxx",
        OPENAI_API_KEY: "sk-xxx",
      },
    });
    expect(p).toBeInstanceOf(AnthropicProvider);
  });

  it("auto-detect: alleen OPENAI_API_KEY → OpenAI", () => {
    const p = resolveAIProvider({
      env: { OPENAI_API_KEY: "sk-xxx" },
    });
    expect(p).toBeInstanceOf(OpenAIProvider);
  });

  it("custom model wordt doorgegeven aan provider", () => {
    const p = resolveAIProvider({
      env: {
        AI_BRIEFING_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-xxx",
        AI_BRIEFING_MODEL: "gpt-4o",
      },
    });
    expect(p.model).toBe("gpt-4o");
  });

  it("singleton-cache: 2 calls met dezelfde env → zelfde instance", () => {
    const env = { OPENAI_API_KEY: "sk-xxx" };
    const a = resolveAIProvider({ env });
    const b = resolveAIProvider({ env });
    expect(a).toBe(b);
  });
});

describe("DeterministicProvider", () => {
  it("complete() levert text=null met errorReason", async () => {
    const p = new DeterministicProvider();
    const res = await p.complete({ system: "x", user: "y" });
    expect(res.text).toBeNull();
    expect(res.providerId).toBe("deterministic");
    expect(res.errorReason).toBe("deterministic-no-llm");
  });
});
