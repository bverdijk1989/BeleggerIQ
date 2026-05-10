/**
 * Deterministische "provider" — geen LLM-call. Retourneert altijd
 * `text=null` zodat de caller naar de fallback-renderer terugvalt.
 *
 * Doel: in dev/CI/zonder API-key blijft de pipeline werken zonder dat
 * we per-call een if-branch op `provider===null` hoeven te schrijven.
 * Het briefing-service-orchestrator-pattern is consistent: roep altijd
 * `provider.complete(...)`, krijg `null` terug, render fallback.
 */

import type {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
} from "./types";

export class DeterministicProvider implements AIProvider {
  readonly id = "deterministic" as const;
  readonly model = "deterministic-template";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async complete(_request: AICompletionRequest): Promise<AICompletionResponse> {
    return {
      text: null,
      providerId: this.id,
      model: this.model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      errorReason: "deterministic-no-llm",
    };
  }
}
