/**
 * Anthropic Messages-API provider — minimal HTTP-client (geen SDK).
 *
 * Spiegelt de OpenAI-provider in shape; Messages-endpoint heeft alleen
 * een net-iets-andere request/response-shape (system buiten messages,
 * `content` als block-array).
 */

import type {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
} from "./types";

export interface AnthropicProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  apiVersion?: string;
}

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_API_VERSION = "2023-06-01";

interface AnthropicResponseShape {
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic" as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly apiVersion: string;

  constructor(options: AnthropicProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.baseUrl = options.baseUrl ?? "https://api.anthropic.com/v1";
    this.apiVersion = options.apiVersion ?? DEFAULT_API_VERSION;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const start = Date.now();
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": this.apiVersion,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxOutputTokens ?? 600,
          temperature: request.temperature ?? 0,
          stop_sequences: request.stop,
          system: request.system,
          messages: [{ role: "user", content: request.user }],
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
          errorReason: `anthropic-http-${res.status}`,
        };
      }

      const json = (await res.json()) as AnthropicResponseShape;
      // Concat alle text-blocks (Anthropic levert altijd een array, doorgaans 1).
      const text =
        json.content
          ?.filter((b) => b.type === "text" && typeof b.text === "string")
          .map((b) => b.text!)
          .join("\n")
          .trim() ?? "";

      return {
        text: text.length > 0 ? text : null,
        providerId: this.id,
        model: this.model,
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
        latencyMs,
        errorReason: text.length > 0 ? undefined : "anthropic-empty-content",
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const reason =
        err instanceof Error && err.name === "AbortError"
          ? "anthropic-timeout"
          : err instanceof Error
            ? `anthropic-error:${err.message}`
            : "anthropic-unknown";
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
