/**
 * AI provider abstraction — dunne laag tussen onze app en concrete LLM-
 * leveranciers (OpenAI, Anthropic, of een toekomstige local model).
 *
 * **Doel**: één interface zodat we van model kunnen wisselen zonder de
 * briefing-/explain-laag aan te raken. De interface is bewust **klein**
 * (één `complete`-call) — meer geavanceerde features (tool calling,
 * streaming) komen pas wanneer we ze echt nodig hebben.
 *
 * **Garantie**: een provider mag faalen of `null` teruggeven; callers
 * MOETEN de deterministische fallback gebruiken in dat geval. Geen
 * exception laat de UI vallen.
 */

export type AIProviderId = "deterministic" | "openai" | "anthropic";

export interface AICompletionRequest {
  /** System-instructie (rules, persona, guardrails). */
  system: string;
  /** User-prompt met de feitelijke vraag + context (typisch JSON-blok). */
  user: string;
  /** Max output tokens — providers respecteren best-effort. */
  maxOutputTokens?: number;
  /** Temperatuur 0..1; **default 0** voor reproduceerbare output. Hoger
   *  alleen wanneer een caller bewust variatie wil (creative-style).
   *  Reproduceerbaarheid is de Simons-laag-default. */
  temperature?: number;
  /** Stop-tokens / stop-sequences. */
  stop?: string[];
  /** Per-request timeout in ms. */
  timeoutMs?: number;
}

export interface AICompletionResponse {
  /** De gegenereerde tekst (of `null` wanneer provider faalde). */
  text: string | null;
  /** Welke provider de response leverde. */
  providerId: AIProviderId;
  /** Welk model is gebruikt (voor audit). */
  model: string;
  /** Aantal input tokens (best-effort, mag 0 zijn). */
  inputTokens: number;
  /** Aantal output tokens (best-effort, mag 0 zijn). */
  outputTokens: number;
  /** Totale latency in ms. */
  latencyMs: number;
  /** Reden bij `text=null` — diagnose, niet voor UI. */
  errorReason?: string;
}

export interface AIProvider {
  /** Stabiele provider-identifier voor audit/cache-keys. */
  readonly id: AIProviderId;
  /** Modelnaam (bv. `claude-sonnet-4-6`, `gpt-4o-mini`). */
  readonly model: string;
  /**
   * Genereer een completion. Mag NOOIT throw'en — bij fouten retourneert
   * de provider `text=null` met een `errorReason`.
   */
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
}
