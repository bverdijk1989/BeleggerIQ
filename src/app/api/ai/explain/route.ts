import { NextResponse, type NextRequest } from "next/server";

import {
  buildDashboardSummaryPrompt,
  explainDashboardSummary,
  type DashboardSummaryExplanationInput,
} from "@/lib/ai/dashboard-explainer";
import { explain } from "@/lib/ai/explainers";
import {
  buildActionDecisionPrompt,
  explainActionDecision,
} from "@/lib/ai/explain";
import { buildExplainPrompt } from "@/lib/ai/prompts";
import {
  expectObject,
  jsonError,
  jsonServerError,
  safeJson,
} from "@/lib/http";
import type { ExplainContext, ExplainUseCase } from "@/types/ai";

/**
 * POST /api/ai/explain
 *
 * Verwacht body:
 * ```json
 * {
 *   "context": { "useCase": "holding_score", ... },
 *   "includePrompt": false
 * }
 * ```
 *
 * Retourneert een `ExplainResponse`. Als `includePrompt: true` wordt
 * óók de onderliggende prompt-payload meegestuurd (handig voor debug /
 * latere LLM-upgrade). De response zelf komt uit de deterministische
 * explainer — er is geen externe LLM-call.
 *
 * Voorbeeld-response:
 * ```json
 * {
 *   "useCase": "holding_score",
 *   "headline": "ASML (ASML.AS) · composite 72/100 — bovengemiddeld",
 *   "narrative": "Composite 72/100 — bovengemiddeld profiel...",
 *   "bullets": ["Quality 85/100 — Sterke ROIC (22%)."],
 *   "confidence": "high",
 *   "usedContextKeys": ["factorScore.composite", ...]
 * }
 * ```
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExtraUseCase = "action_decision" | "dashboard_summary";

const VALID_USE_CASES: ReadonlySet<ExplainUseCase | ExtraUseCase> = new Set([
  "holding_score",
  "fragile_concentration",
  "buy_plan",
  "market_regime",
  "portfolio_risks",
  "action_decision",
  "dashboard_summary",
]);

export async function POST(request: NextRequest) {
  try {
    const raw = await safeJson(request);
    if (raw === undefined) {
      return jsonError("Ongeldige JSON body.", 400);
    }
    const body = expectObject(raw);
    if (!body.ok) return jsonError(body.error, 400);

    const validationError = validateContext(body.value.context);
    if (validationError) return jsonError(validationError, 400);

    const rawCtx = body.value.context as Record<string, unknown>;
    const useCase = rawCtx.useCase as ExplainUseCase | ExtraUseCase;
    const includePrompt = body.value.includePrompt === true;

    // Dashboard-summary pad: AI Explain Panel onderaan de cockpit.
    if (useCase === "dashboard_summary") {
      const input: DashboardSummaryExplanationInput = {
        topActions:
          (rawCtx.topActions ??
            []) as DashboardSummaryExplanationInput["topActions"],
        topRisks:
          (rawCtx.topRisks ??
            []) as DashboardSummaryExplanationInput["topRisks"],
        topOpportunities:
          (rawCtx.topOpportunities ??
            []) as DashboardSummaryExplanationInput["topOpportunities"],
        regime:
          (rawCtx.regime ?? null) as DashboardSummaryExplanationInput["regime"],
        dataQualityNotes: Array.isArray(rawCtx.dataQualityNotes)
          ? (rawCtx.dataQualityNotes as string[])
          : [],
        overallConfidence:
          typeof rawCtx.overallConfidence === "number"
            ? rawCtx.overallConfidence
            : undefined,
      };
      const response = explainDashboardSummary(input);
      if (includePrompt) {
        return NextResponse.json({
          response,
          prompt: buildDashboardSummaryPrompt(input),
        });
      }
      return NextResponse.json(response);
    }

    // Action-decision pad: aparte module met eigen renderer + prompt.
    if (useCase === "action_decision") {
      const input = {
        action: rawCtx.action as Parameters<typeof explainActionDecision>[0]["action"],
        factorScore: (rawCtx.factorScore ?? null) as Parameters<typeof explainActionDecision>[0]["factorScore"],
        positionRisk: (rawCtx.positionRisk ?? null) as Parameters<typeof explainActionDecision>[0]["positionRisk"],
      };
      const response = explainActionDecision(input);
      if (includePrompt) {
        return NextResponse.json({
          response,
          prompt: buildActionDecisionPrompt(input),
        });
      }
      return NextResponse.json(response);
    }

    const context = body.value.context as ExplainContext;
    const response = explain(context);
    if (includePrompt) {
      return NextResponse.json({
        response,
        prompt: buildExplainPrompt(context),
      });
    }
    return NextResponse.json(response);
  } catch (error) {
    return jsonServerError(
      "api:ai:explain",
      error,
      "Kon uitleg niet genereren.",
    );
  }
}

// ============================================================
//  Lightweight runtime validation (zonder extra dependency)
// ============================================================

function validateContext(context: unknown): string | null {
  if (!context || typeof context !== "object") {
    return "Field `context` ontbreekt of is geen object.";
  }
  const useCase = (context as { useCase?: unknown }).useCase;
  if (typeof useCase !== "string") {
    return "Field `context.useCase` ontbreekt of is geen string.";
  }
  if (!VALID_USE_CASES.has(useCase as ExplainUseCase | ExtraUseCase)) {
    return `Onbekende useCase: ${useCase}.`;
  }
  const ctx = context as Record<string, unknown>;

  if (useCase === "dashboard_summary") {
    // Tolerant: alle velden zijn optioneel; de renderer geeft fallback-tekst
    // wanneer arrays leeg zijn. We checken alleen op shape-correctheid.
    if (
      ctx.topActions !== undefined &&
      !Array.isArray(ctx.topActions)
    ) {
      return "dashboard_summary: `topActions` moet een array zijn.";
    }
    if (ctx.topRisks !== undefined && !Array.isArray(ctx.topRisks)) {
      return "dashboard_summary: `topRisks` moet een array zijn.";
    }
    if (
      ctx.topOpportunities !== undefined &&
      !Array.isArray(ctx.topOpportunities)
    ) {
      return "dashboard_summary: `topOpportunities` moet een array zijn.";
    }
    return null;
  }

  if (useCase === "action_decision") {
    const action = ctx.action as Record<string, unknown> | undefined;
    if (!action || typeof action !== "object") {
      return "action_decision vereist `action` (PositionAction).";
    }
    if (
      typeof action.symbol !== "string" ||
      typeof action.action !== "string" ||
      typeof action.urgency !== "string"
    ) {
      return "action_decision: `action.symbol`, `action.action` en `action.urgency` zijn verplicht.";
    }
    return null;
  }

  switch (useCase as ExplainUseCase) {
    case "holding_score":
      if (!ctx.factorScore || typeof ctx.factorScore !== "object") {
        return "holding_score vereist `factorScore`.";
      }
      if (typeof ctx.ticker !== "string" || typeof ctx.name !== "string") {
        return "holding_score vereist `ticker` en `name`.";
      }
      return null;
    case "fragile_concentration":
      if (
        typeof ctx.ticker !== "string" ||
        typeof ctx.name !== "string" ||
        typeof ctx.positionWeight !== "number" ||
        typeof ctx.fragilityScore !== "number" ||
        typeof ctx.concentrationType !== "string"
      ) {
        return "fragile_concentration ontbreekt vereiste velden.";
      }
      return null;
    case "buy_plan":
      if (!ctx.plan || typeof ctx.plan !== "object") {
        return "buy_plan vereist `plan`.";
      }
      return null;
    case "market_regime":
      if (!ctx.regime || typeof ctx.regime !== "object") {
        return "market_regime vereist `regime`.";
      }
      return null;
    case "portfolio_risks":
      if (!ctx.risk || typeof ctx.risk !== "object") {
        return "portfolio_risks vereist `risk`.";
      }
      return null;
    default:
      return "Onbekende useCase.";
  }
}
