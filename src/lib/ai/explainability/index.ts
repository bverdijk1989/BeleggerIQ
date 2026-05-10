/**
 * Public API voor de AI Explainability Layer.
 */

export {
  DOMAIN_LABELS,
  EXPLAINABILITY_DISCLAIMER,
  type DomainExplanation,
  type ExplainabilityDomain,
  type ExplanationAction,
  type ExplanationConfidence,
  type ExplanationMode,
  type SourceTrace,
} from "./types";
// `ParsedExplanationDraft` + `GuardrailResult` blijven INTERN — hun namen
// botsen met de briefing-module wanneer beide via `@/lib/ai` worden
// re-geëxporteerd. Internal callers kunnen rechtstreeks uit `./guardrails`.
export { validateExplanationOutput } from "./guardrails";
// `PromptPayload` blijft eveneens intern (zelfde collision-reden).
export {
  buildBehavioralPrompt,
  buildConfidencePrompt,
  buildHealthPrompt,
  buildMacroPrompt,
  buildRiskPrompt,
  buildScenarioPrompt,
  type BehavioralExplainContext,
  type ScenarioExplainContext,
} from "./prompts";
export {
  fallbackBehavioral,
  fallbackConfidence,
  fallbackHealth,
  fallbackMacro,
  fallbackRisk,
  fallbackScenarios,
} from "./fallbacks";
export {
  explainAll,
  explainBehavioral,
  explainConfidence,
  explainHealth,
  explainMacro,
  explainRisk,
  explainScenarios,
  resetExplainabilityCache,
  type AnyExplanationInput,
  type ExplainAllResult,
} from "./service";
export { mergeTraces, trace } from "./tracing";
