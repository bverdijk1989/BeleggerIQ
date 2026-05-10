/**
 * AI Explainability Service — centrale orchestrator.
 *
 * Per domein één publieke functie: `explainHealth`, `explainConfidence`,
 * `explainMacro`, `explainBehavioral`, `explainRisk`, `explainScenarios`.
 *
 * **Pipeline** (identiek per domein):
 *  1. Bouw `PromptPayload` voor het domein.
 *  2. Cache-lookup op (domain + context-digest) — 12u TTL.
 *  3. Probeer AI-provider (skipt deterministic-provider).
 *  4. Valideer output via shared guardrails.
 *  5. Bij failure → deterministische fallback met dezelfde shape.
 *  6. Compose final `DomainExplanation` met sources + confidence + warning.
 *
 * **Pure i.t.t. de AI-roundtrip**: zelfde input → zelfde digest → cache-hit.
 */

import { TtlCache } from "@/lib/data/cache";
import type { ISODateString } from "@/types/common";

import type { BehavioralSignalWithState } from "@/lib/analytics/behavioral";
import type { PortfolioHealthScore } from "@/lib/analytics/health-score";
import type { MacroRegimeReport } from "@/lib/analytics/macro-regime";
import type { InvestmentConfidenceScore } from "@/lib/analytics/signal-fusion";
import type { PortfolioRiskSummary } from "@/types/risk";

import {
  resolveAIProvider,
  type AIProvider,
} from "../provider";

import {
  fallbackBehavioral,
  fallbackConfidence,
  fallbackHealth,
  fallbackMacro,
  fallbackRisk,
  fallbackScenarios,
} from "./fallbacks";
import {
  validateExplanationOutput,
  type GuardrailResult,
  type ParsedExplanationDraft,
} from "./guardrails";
import {
  buildBehavioralPrompt,
  buildConfidencePrompt,
  buildHealthPrompt,
  buildMacroPrompt,
  buildRiskPrompt,
  buildScenarioPrompt,
  type BehavioralExplainContext,
  type PromptPayload,
  type ScenarioExplainContext,
} from "./prompts";
import { mergeTraces, trace } from "./tracing";
import type {
  DomainExplanation,
  ExplainabilityDomain,
  ExplanationConfidence,
  SourceTrace,
} from "./types";
import { EXPLAINABILITY_DISCLAIMER } from "./types";

// ============================================================
//  Cache
// ============================================================

const TTL_SECONDS = 12 * 60 * 60;

const globalForCache = globalThis as unknown as {
  __aiExplainCache?: TtlCache;
};
const explainCache: TtlCache =
  globalForCache.__aiExplainCache ??
  (globalForCache.__aiExplainCache = new TtlCache({
    maxEntries: 500,
    sweepIntervalMs: 60_000,
  }));

export function resetExplainabilityCache(): void {
  explainCache.clear();
}

function cacheKey(
  domain: ExplainabilityDomain,
  digest: string,
): string {
  return `ai-explain:${domain}:${digest}`;
}

function fnv1aDigest(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

// ============================================================
//  Common pipeline
// ============================================================

const MAX_OUTPUT_TOKENS = 900;

interface ExplainOptions {
  /** Override provider voor tests. */
  provider?: AIProvider;
  /** Bypass cache (forceer regeneratie). */
  forceRefresh?: boolean;
  /** Override `now`. */
  now?: ISODateString;
}

interface DomainPipelineInput {
  domain: ExplainabilityDomain;
  prompt: PromptPayload;
  fallback: ParsedExplanationDraft;
  sources: SourceTrace[];
  baseConfidence: ExplanationConfidence;
  options?: ExplainOptions;
}

async function runDomainPipeline(
  input: DomainPipelineInput,
): Promise<DomainExplanation> {
  const opts = input.options ?? {};
  const digest = fnv1aDigest(input.prompt.contextJson);
  const key = cacheKey(input.domain, digest);

  if (!opts.forceRefresh) {
    const cached = explainCache.get<DomainExplanation>(key);
    if (cached) return cached;
  }

  const provider = opts.provider ?? resolveAIProvider();
  const generatedAt = opts.now ?? new Date().toISOString();

  let mode: DomainExplanation["mode"] = "fallback";
  let providerId = provider.id;
  let model = provider.model;
  let draft = input.fallback;
  let guardrailRejection: string | undefined;

  if (provider.id !== "deterministic") {
    const aiResult = await tryAi(provider, input.prompt);
    if (aiResult.ok && aiResult.draft) {
      mode = "ai";
      draft = aiResult.draft;
    } else {
      guardrailRejection = aiResult.rejectionReason;
    }
  }

  const confidence = deriveConfidence(input.baseConfidence, mode, guardrailRejection);
  const explanation: DomainExplanation = {
    domain: input.domain,
    generatedAt,
    mode,
    providerId,
    model,
    summary: draft.summary,
    whyItMatters: draft.whyItMatters,
    positives: draft.positives,
    risks: draft.risks,
    possibleActions: draft.possibleActions,
    uncertainties: appendGuardrailNote(draft.uncertainties, guardrailRejection),
    confidence,
    sources: mergeTraces(input.sources),
    disclaimer: EXPLAINABILITY_DISCLAIMER,
  };

  explainCache.set(key, explanation, TTL_SECONDS);
  return explanation;
}

async function tryAi(
  provider: AIProvider,
  prompt: PromptPayload,
): Promise<GuardrailResult> {
  try {
    const response = await provider.complete({
      system: prompt.system,
      user: prompt.user,
      temperature: 0.2,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });
    if (!response.text) {
      return {
        ok: false,
        draft: null,
        rejectionReason: response.errorReason ?? "provider-empty-text",
      };
    }
    return validateExplanationOutput(response.text, prompt.contextJson);
  } catch (err) {
    return {
      ok: false,
      draft: null,
      rejectionReason:
        err instanceof Error ? `provider-throw:${err.message}` : "provider-throw",
    };
  }
}

function deriveConfidence(
  base: ExplanationConfidence,
  mode: DomainExplanation["mode"],
  rejection: string | undefined,
): ExplanationConfidence {
  if (rejection) return "low";
  if (mode === "fallback" && base === "high") return "medium";
  return base;
}

function appendGuardrailNote(
  uncertainties: string[],
  rejection: string | undefined,
): string[] {
  if (!rejection) return uncertainties;
  return [
    ...uncertainties,
    `AI-uitleg afgewezen door guardrails (${rejection}); fallback gebruikt.`,
  ];
}

// ============================================================
//  Per-domain public APIs
// ============================================================

export async function explainHealth(
  score: PortfolioHealthScore,
  options?: ExplainOptions,
): Promise<DomainExplanation> {
  const baseConfidence: ExplanationConfidence =
    score.confidence >= 0.8 ? "high" : score.confidence >= 0.5 ? "medium" : "low";
  return runDomainPipeline({
    domain: "portfolio_health",
    prompt: buildHealthPrompt(score),
    fallback: fallbackHealth(score),
    sources: [
      trace("health-score", ["totalScore", "components", "topRecommendations"], score.asOf),
      trace("portfolio-view", ["valuations", "summary"]),
    ],
    baseConfidence,
    options,
  });
}

export async function explainConfidence(
  score: InvestmentConfidenceScore,
  options?: ExplainOptions,
): Promise<DomainExplanation> {
  const baseConfidence: ExplanationConfidence =
    score.dataQuality === "high"
      ? "high"
      : score.dataQuality === "medium"
        ? "medium"
        : "low";
  return runDomainPipeline({
    domain: "investment_confidence",
    prompt: buildConfidencePrompt(score),
    fallback: fallbackConfidence(score),
    sources: [
      trace("signal-fusion", ["totalScore", "tier", "signals"], score.asOf),
      trace("factor-engine", ["subScores"]),
      trace("macro-regime", ["assetMapping"]),
    ],
    baseConfidence,
    options,
  });
}

export async function explainMacro(
  report: MacroRegimeReport,
  options?: ExplainOptions,
): Promise<DomainExplanation> {
  const c = report.classification.confidence;
  const baseConfidence: ExplanationConfidence =
    c >= 0.7 ? "high" : c >= 0.45 ? "medium" : "low";
  return runDomainPipeline({
    domain: "macro_regime",
    prompt: buildMacroPrompt(report),
    fallback: fallbackMacro(report),
    sources: [
      trace(
        "macro-regime",
        ["classification", "assetMapping", "portfolioImpact"],
        report.classification.asOf,
      ),
    ],
    baseConfidence,
    options,
  });
}

export async function explainBehavioral(
  context: BehavioralExplainContext,
  options?: ExplainOptions,
): Promise<DomainExplanation> {
  // Confidence: actief = "high", geen actief = "medium" (geen patronen
  // is positief signaal maar ook niet "high-conf" zonder context).
  const baseConfidence: ExplanationConfidence =
    context.activeCount > 0 ? "high" : "medium";
  return runDomainPipeline({
    domain: "behavioral_coach",
    prompt: buildBehavioralPrompt(context),
    fallback: fallbackBehavioral(context),
    sources: [
      trace(
        "behavioral-coach",
        ["signals", "effectiveStatus", "reflectionQuestions"],
      ),
      trace("transactions", ["recent buys/sells"]),
    ],
    baseConfidence,
    options,
  });
}

export async function explainRisk(
  risk: PortfolioRiskSummary,
  options?: ExplainOptions,
): Promise<DomainExplanation> {
  const baseConfidence: ExplanationConfidence =
    typeof risk.portfolioVolatility === "number" && risk.flags.length > 0
      ? "high"
      : "medium";
  return runDomainPipeline({
    domain: "risk_analysis",
    prompt: buildRiskPrompt(risk),
    fallback: fallbackRisk(risk),
    sources: [
      trace(
        "risk-engine",
        ["overallSeverity", "concentrationHhi", "portfolioVolatility", "flags"],
        risk.asOf,
      ),
    ],
    baseConfidence,
    options,
  });
}

export async function explainScenarios(
  context: ScenarioExplainContext,
  options?: ExplainOptions,
): Promise<DomainExplanation> {
  const baseConfidence: ExplanationConfidence =
    context.scenarios.length >= 3 ? "high" : context.scenarios.length > 0 ? "medium" : "low";
  return runDomainPipeline({
    domain: "scenario_analysis",
    prompt: buildScenarioPrompt(context),
    fallback: fallbackScenarios(context),
    sources: [
      trace("macro-scenarios", ["name", "portfolioImpactPct", "severity"]),
    ],
    baseConfidence,
    options,
  });
}

// ============================================================
//  Generic adapter — voor het bouwen van een uitleg-stream over alle 6
// ============================================================

export interface AnyExplanationInput {
  health?: PortfolioHealthScore | null;
  confidence?: InvestmentConfidenceScore | null;
  macro?: MacroRegimeReport | null;
  behavioral?: BehavioralExplainContext | null;
  risk?: PortfolioRiskSummary | null;
  scenarios?: ScenarioExplainContext | null;
}

export interface ExplainAllResult {
  health: DomainExplanation | null;
  confidence: DomainExplanation | null;
  macro: DomainExplanation | null;
  behavioral: DomainExplanation | null;
  risk: DomainExplanation | null;
  scenarios: DomainExplanation | null;
}

/**
 * Convenience: vraagt parallel uitleg op voor alle aanwezige domeinen.
 * Skipt domeinen waar de input null is.
 */
export async function explainAll(
  input: AnyExplanationInput,
  options?: ExplainOptions,
): Promise<ExplainAllResult> {
  const [health, confidence, macro, behavioral, risk, scenarios] =
    await Promise.all([
      input.health ? explainHealth(input.health, options) : null,
      input.confidence ? explainConfidence(input.confidence, options) : null,
      input.macro ? explainMacro(input.macro, options) : null,
      input.behavioral ? explainBehavioral(input.behavioral, options) : null,
      input.risk ? explainRisk(input.risk, options) : null,
      input.scenarios ? explainScenarios(input.scenarios, options) : null,
    ]);
  return { health, confidence, macro, behavioral, risk, scenarios };
}
