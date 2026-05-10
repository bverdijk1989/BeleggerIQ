/**
 * OpenAI Chat Completions provider — minimal HTTP-client (geen SDK).
 *
 * **Waarom geen SDK**: dit is de enige plek waar we OpenAI-shape kennen,
 * en het bespaart een dependency. Bij meer use-cases (streaming, function
 * calling) overstappen op `openai`-pkg.
 *
 * **Foutbehandeling**: alle non-200 responses, timeouts, parse-fouten →
 * `text=null + errorReason`, NOOIT throw. De service kiest dan voor de
 * deterministische fallback.
 */

import type {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
} from "./types";

export interface OpenAIProviderOptions {
  apiKey: string;
  /** Default model — kan per request overschreven worden. */
  model?: string;
  /** Custom base URL (Azure OpenAI / proxy). */
  baseUrl?: string;
}

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 30_000;

interface OpenAIResponseShape {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAIProvider implements AIProvider {
  readonly id = "openai" as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: OpenAIProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const start = Date.now();
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: request.temperature ?? 0,
          max_tokens: request.maxOutputTokens ?? 600,
          stop: request.stop,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
        }),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        return {
          text: null,
          providerId: this.id,
          model: this.model,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs,
          errorReason: `openai-http-${res.status}`,
        };
      }

      const json = (await res.json()) as OpenAIResponseShape;
      const content = json.choices?.[0]?.message?.content ?? null;

      return {
        text: typeof content === "string" && content.trim().length > 0 ? content : null,
        providerId: this.id,
        model: this.model,
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
        latencyMs,
        errorReason:
          typeof content === "string" && content.trim().length > 0
            ? undefined
            : "openai-empty-content",
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const reason =
        err instanceof Error && err.name === "AbortError"
          ? "openai-timeout"
          : err instanceof Error
            ? `openai-error:${err.message}`
            : "openai-unknown";
      return {
        text: null,
        providerId: this.id,
        model: this.model,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs,
        errorReason: reason,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
