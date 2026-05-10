/**
 * Provider-factory: selecteert de actieve AI-provider op basis van
 * environment-variabelen. Strikte volgorde:
 *
 *   1. `AI_BRIEFING_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` → Anthropic
 *   2. `AI_BRIEFING_PROVIDER=openai` + `OPENAI_API_KEY`       → OpenAI
 *   3. anders (incl. dev/CI zonder keys)                       → Deterministic
 *
 * **Singleton-pattern**: één provider-instance per process (provider-
 * objecten zijn stateless qua content; alleen API-key/baseUrl).
 */

import { AnthropicProvider } from "./anthropic";
import { DeterministicProvider } from "./deterministic";
import { OpenAIProvider } from "./openai";
import type { AIProvider, AIProviderId } from "./types";

let cachedProvider: AIProvider | null = null;

interface ResolveOptions {
  /** Override env voor tests. */
  env?: Partial<Record<string, string | undefined>>;
}

export function resolveAIProvider(options: ResolveOptions = {}): AIProvider {
  if (cachedProvider) return cachedProvider;
  cachedProvider = buildProvider(options.env ?? process.env);
  return cachedProvider;
}

/** Reset alleen voor tests. */
export function resetAIProviderCache(): void {
  cachedProvider = null;
}

function buildProvider(
  env: Partial<Record<string, string | undefined>>,
): AIProvider {
  const requested = (env.AI_BRIEFING_PROVIDER ?? "").toLowerCase() as AIProviderId | "";

  if (requested === "anthropic") {
    const key = env.ANTHROPIC_API_KEY;
    if (key && key.trim().length > 0) {
      return new AnthropicProvider({
        apiKey: key,
        model: env.AI_BRIEFING_MODEL,
      });
    }
  }
  if (requested === "openai") {
    const key = env.OPENAI_API_KEY;
    if (key && key.trim().length > 0) {
      return new OpenAIProvider({
        apiKey: key,
        model: env.AI_BRIEFING_MODEL,
      });
    }
  }

  // Auto-detect: kies eerste beschikbare key wanneer geen voorkeur is gezet.
  if (requested === "") {
    const anthropicKey = env.ANTHROPIC_API_KEY;
    if (anthropicKey && anthropicKey.trim().length > 0) {
      return new AnthropicProvider({
        apiKey: anthropicKey,
        model: env.AI_BRIEFING_MODEL,
      });
    }
    const openaiKey = env.OPENAI_API_KEY;
    if (openaiKey && openaiKey.trim().length > 0) {
      return new OpenAIProvider({
        apiKey: openaiKey,
        model: env.AI_BRIEFING_MODEL,
      });
    }
  }

  return new DeterministicProvider();
}
