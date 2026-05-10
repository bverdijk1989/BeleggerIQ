/**
 * Guardrails voor LLM-output van de explainability-laag.
 *
 * Vier verdedigings-lagen, gespiegeld aan `briefing/guardrails.ts` maar
 * generic over alle 6 domeinen:
 *
 *  1. JSON-parser (markdown-fence tolerant)
 *  2. Shape-check op de domain-explanation contract
 *  3. Banned phrases (geen "gegarandeerd", geen koersdoelen)
 *  4. Required hedged language ("overweeg", "let op", "mogelijk")
 *  5. Numeric-claim cross-check tegen JSON-context
 */

import type { ExplanationAction } from "./types";

const BANNED_PHRASES: ReadonlyArray<RegExp> = [
  /\bgegarandeerd\b/i,
  /\bzeker weten\b/i,
  /\b100%\s*(zeker|sure)\b/i,
  /\b(koers|prijs)(doel|target)\b/i,
  /\bgaat zeker\b/i,
  /\bbinnen\s+\d+\s+(dag|dagen|week|weken)\s+(stijgt|daalt|gaat|loopt)\b/i,
  /\bguaranteed\b/i,
];

const REQUIRED_HEDGED: ReadonlyArray<RegExp> = [
  /\boverweeg\b/i,
  /\blet op\b/i,
  /\bmogelijk\b/i,
  /\bkan\s+(duiden|wijzen|zijn|leiden)\b/i,
  /\bwijst op\b/i,
  /\bkan\b/i,
];

export interface ParsedExplanationDraft {
  summary: string;
  whyItMatters: string;
  positives: string[];
  risks: string[];
  possibleActions: ExplanationAction[];
  uncertainties: string[];
}

export interface GuardrailResult {
  ok: boolean;
  draft: ParsedExplanationDraft | null;
  rejectionReason?: string;
  rejectedClaims?: string[];
  bannedPhrases?: string[];
}

/**
 * Validate LLM-output voor één domein.
 *
 * @param text Raw LLM-respons (JSON of markdown-wrapped JSON).
 * @param contextJson `JSON.stringify` van de input-context — voor de
 *                    numeric-claim cross-check.
 */
export function validateExplanationOutput(
  text: string,
  contextJson: string,
): GuardrailResult {
  const parsed = tryParseJson(text);
  if (!parsed) {
    return { ok: false, draft: null, rejectionReason: "json-parse-failed" };
  }

  const shape = checkShape(parsed);
  if (!shape.ok || !shape.draft) {
    return { ok: false, draft: null, rejectionReason: shape.reason };
  }
  const draft = shape.draft;

  const allText = collectAllText(draft);

  const banned = scanBannedPhrases(allText);
  if (banned.length > 0) {
    return {
      ok: false,
      draft: null,
      rejectionReason: "banned-phrase",
      bannedPhrases: banned,
    };
  }

  if (!hasHedgedLanguage(allText)) {
    return {
      ok: false,
      draft: null,
      rejectionReason: "hedged-language-missing",
    };
  }

  const rejected = collectRejectedNumericClaims(allText, contextJson);
  if (rejected.length > 0) {
    return {
      ok: false,
      draft: null,
      rejectionReason: "numeric-claim-rejected",
      rejectedClaims: rejected,
    };
  }

  return { ok: true, draft };
}

// ============================================================
//  Helpers
// ============================================================

function tryParseJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function checkShape(
  raw: unknown,
): { ok: boolean; draft: ParsedExplanationDraft | null; reason?: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, draft: null, reason: "not-an-object" };
  }
  const obj = raw as Record<string, unknown>;

  const summary = stringField(obj.summary);
  const whyItMatters = stringField(obj.whyItMatters);
  if (!summary || !whyItMatters) {
    return { ok: false, draft: null, reason: "missing-summary-or-why" };
  }

  const positives = stringArray(obj.positives);
  const risks = stringArray(obj.risks);
  const uncertainties = stringArray(obj.uncertainties);
  if (positives === null || risks === null || uncertainties === null) {
    return { ok: false, draft: null, reason: "invalid-bullets" };
  }

  const actions = actionArray(obj.possibleActions);
  if (actions === null) {
    return { ok: false, draft: null, reason: "invalid-actions" };
  }

  return {
    ok: true,
    draft: {
      summary,
      whyItMatters,
      positives,
      risks,
      possibleActions: actions,
      uncertainties,
    },
  };
}

function stringField(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stringArray(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const trimmed = item.trim();
    if (trimmed.length > 0) out.push(trimmed);
  }
  return out;
}

function actionArray(raw: unknown): ExplanationAction[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ExplanationAction[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    const title = stringField(o.title);
    const rationale = stringField(o.rationale);
    if (!title || !rationale) return null;
    const link = typeof o.link === "string" && o.link.trim().length > 0 ? o.link : undefined;
    out.push({ title, rationale, link });
  }
  return out;
}

function collectAllText(draft: ParsedExplanationDraft): string {
  return [
    draft.summary,
    draft.whyItMatters,
    ...draft.positives,
    ...draft.risks,
    ...draft.uncertainties,
    ...draft.possibleActions.flatMap((a) => [a.title, a.rationale]),
  ].join("\n");
}

function scanBannedPhrases(text: string): string[] {
  const hits: string[] = [];
  for (const re of BANNED_PHRASES) {
    const m = text.match(re);
    if (m) hits.push(m[0]);
  }
  return hits;
}

function hasHedgedLanguage(text: string): boolean {
  return REQUIRED_HEDGED.some((re) => re.test(text));
}

const NUMERIC_PATTERN = /-?\d{1,3}(?:[.,]\d+)+%?|-?\d+%/g;

function collectRejectedNumericClaims(
  text: string,
  contextJson: string,
): string[] {
  const matches = text.match(NUMERIC_PATTERN) ?? [];
  const haystack = contextJson.replace(/\s+/g, "");
  const rejected: string[] = [];
  for (const claim of matches) {
    const norm = claim.replace(/\s+/g, "");
    if (haystack.includes(norm)) continue;
    // Tolerantie voor decimal-conventie (1,5% ↔ 1.5%).
    const swapped = norm.replace(/,/g, ".");
    if (haystack.includes(swapped)) continue;
    // Probeer percentage → fractie (12.5% → 0.125).
    if (claim.endsWith("%")) {
      const cleaned = claim.replace(/%$/, "").replace(/,/g, ".");
      const n = Number(cleaned);
      if (Number.isFinite(n)) {
        const fraction = (n / 100).toString();
        if (haystack.includes(fraction)) continue;
        const rounded = (Math.round((n / 100) * 10000) / 10000).toString();
        if (haystack.includes(rounded)) continue;
      }
    }
    rejected.push(claim);
  }
  return rejected;
}
