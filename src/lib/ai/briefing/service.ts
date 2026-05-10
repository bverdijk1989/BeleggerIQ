/**
 * Daily Briefing service — main orchestrator.
 *
 * Stappen:
 *   1. Build context-digest → cache lookup. Hit → return.
 *   2. Bouw deterministische fallback (altijd, als safety net).
 *   3. Probeer AI-provider. Bij succes + guardrails-pass: gebruik AI-versie.
 *   4. Bouw final `DailyBriefing` met audit-velden + cache-set.
 *
 * **Belangrijk**: deze service mag NOOIT throw'en op AI-fouten. Bij elke
 * uitzondering valt hij terug op de deterministische versie zodat de UI
 * altijd iets toont.
 */

import type { ISODateString } from "@/types/common";

import {
  resolveAIProvider,
  type AIProvider,
} from "../provider";

import {
  buildBriefingCacheKey,
  computeContextDigest,
  getCachedBriefing,
  setCachedBriefing,
} from "./cache";
import { renderDeterministicBriefing } from "./deterministic";
import {
  decideMode,
  draftToSections,
  validateBriefingOutput,
  type GuardrailResult,
} from "./guardrails";
import { buildBriefingPrompt } from "./prompt";
import type {
  BriefingConfidence,
  BriefingContext,
  DailyBriefing,
} from "./types";

const DEFAULT_DISCLAIMER =
  "Deze briefing geeft inzicht op basis van engine-output en (waar beschikbaar) AI-redactie. Geen gegarandeerde voorspelling, geen persoonlijk financieel advies. Verifieer altijd voor je handelt.";

const MAX_OUTPUT_TOKENS = 1200;

export interface LoadDailyBriefingInput {
  context: BriefingContext;
  /** Override provider voor tests. */
  provider?: AIProvider;
  /** Bypass cache (forceer regeneratie). */
  forceRefresh?: boolean;
  /** Override `now` voor deterministische tests. */
  now?: ISODateString;
}

export async function loadDailyBriefing(
  input: LoadDailyBriefingInput,
): Promise<DailyBriefing> {
  const ctx = input.context;
  const digest = computeContextDigest(ctx);
  const cacheKey = buildBriefingCacheKey(
    ctx.portfolioId,
    ctx.briefingDate,
    digest,
  );

  if (!input.forceRefresh) {
    const cached = getCachedBriefing(cacheKey);
    if (cached) return cached;
  }

  const provider = input.provider ?? resolveAIProvider();
  const fallback = renderDeterministicBriefing(ctx);
  const generatedAt = input.now ?? new Date().toISOString();

  // Probeer AI alleen als het géén deterministic-provider is — anders
  // sparen we de roundtrip.
  let mode: DailyBriefing["mode"] = "fallback";
  let providerId = provider.id;
  let model = provider.model;
  let headline = fallback.headline;
  let sections = fallback.sections;
  let focusActionText = fallback.focusAction;
  let guardrailRejection: string | undefined;

  if (provider.id !== "deterministic") {
    const aiResult = await tryAi(provider, ctx);
    if (aiResult.ok && aiResult.draft) {
      mode = decideMode(aiResult);
      headline = aiResult.draft.headline;
      sections = draftToSections(aiResult.draft);
      focusActionText = aiResult.draft.focusAction;
    } else {
      guardrailRejection = aiResult.rejectionReason;
      providerId = provider.id; // bewaar provider-id voor audit
      mode = "fallback";
    }
  }

  const briefing: DailyBriefing = {
    portfolioId: ctx.portfolioId,
    briefingDate: ctx.briefingDate,
    generatedAt,
    mode,
    providerId,
    model,
    headline,
    sections,
    focusAction: focusActionText,
    confidenceTier: deriveConfidenceTier(ctx),
    sources: collectSources(ctx),
    dataLimitations: collectLimitations(ctx, guardrailRejection),
    disclaimer: DEFAULT_DISCLAIMER,
  };

  setCachedBriefing(cacheKey, briefing);
  return briefing;
}

// ============================================================
//  AI-roundtrip + guardrails
// ============================================================

async function tryAi(
  provider: AIProvider,
  ctx: BriefingContext,
): Promise<GuardrailResult> {
  try {
    const prompt = buildBriefingPrompt(ctx);
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
    return validateBriefingOutput(response.text, ctx);
  } catch (err) {
    return {
      ok: false,
      draft: null,
      rejectionReason:
        err instanceof Error ? `provider-throw:${err.message}` : "provider-throw",
    };
  }
}

// ============================================================
//  Confidence + sources + limitations
// ============================================================

function deriveConfidenceTier(ctx: BriefingContext): BriefingConfidence {
  let score = 0;
  if (ctx.dataSources.snapshots >= 30) score += 1;
  if (ctx.dataSources.snapshots >= 60) score += 1;
  if (ctx.dataSources.regimeAvailable) score += 1;
  if (ctx.dataSources.factorScored >= 3) score += 1;
  if (ctx.dataSources.riskActionsAvailable >= 1) score += 1;
  if (score >= 4) return "high";
  if (score >= 2) return "medium";
  return "low";
}

function collectSources(ctx: BriefingContext): string[] {
  const sources = new Set<string>(["portfolio-view", "risk-engine"]);
  if (ctx.dataSources.snapshots > 0) sources.add("portfolio-snapshots");
  if (ctx.dataSources.regimeAvailable) sources.add("market-regime");
  if (ctx.dataSources.factorScored > 0) sources.add("factor-engine");
  if (ctx.focusAction) sources.add("dashboard-actions");
  return [...sources];
}

function collectLimitations(
  ctx: BriefingContext,
  guardrailRejection?: string,
): string[] {
  const out: string[] = [];
  if (ctx.dataSources.snapshots < 30) {
    out.push("Beperkte snapshot-historie — week- en maandtrends mogelijk minder betrouwbaar.");
  }
  if (!ctx.dataSources.regimeAvailable) {
    out.push("Geen actuele marktregime-snapshot — macro-laag is afgeleid van eerdere data of afwezig.");
  }
  if (ctx.dataSources.factorScored === 0) {
    out.push("Geen factor-scores beschikbaar — kwaliteits- en valuation-context ontbreekt.");
  }
  if (!ctx.earningsNews.available) {
    out.push("Earnings-/nieuwsfeed niet aangesloten — die sectie is niet gevuld.");
  }
  if (guardrailRejection) {
    out.push(
      `AI-output afgewezen door guardrails (${guardrailRejection}); fallback-renderer gebruikt.`,
    );
  }
  return out;
}
