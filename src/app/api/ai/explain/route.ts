import { NextResponse, type NextRequest } from "next/server";

import { explain } from "@/lib/ai/explainers";
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

const VALID_USE_CASES: ReadonlySet<ExplainUseCase> = new Set([
  "holding_score",
  "fragile_concentration",
  "buy_plan",
  "market_regime",
  "portfolio_risks",
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

    const context = body.value.context as ExplainContext;
    const includePrompt = body.value.includePrompt === true;

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
  if (!VALID_USE_CASES.has(useCase as ExplainUseCase)) {
    return `Onbekende useCase: ${useCase}.`;
  }
  const ctx = context as Record<string, unknown>;

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
