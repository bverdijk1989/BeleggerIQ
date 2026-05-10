/**
 * Guardrails voor LLM-output.
 *
 * Drie lagen verdediging:
 *
 * **1. JSON-parser** — text → strict shape. Bij parse-fout → reject.
 *
 * **2. Numeric-claim validator** — elk getal/percentage in de output moet
 *    voorkomen in `JSON.stringify(context)`. Voorkomt verzonnen cijfers.
 *
 * **3. Banned-phrase + required-language scan**:
 *    - Banned: "gegarandeerd", "zeker weten", price targets, etc.
 *    - Required (best-effort): hedged-language ("overweeg", "let op",
 *      "mogelijk", "kan", "wijst op") moet ergens voorkomen — dwingt
 *      een non-bullshit toon af.
 *
 * Bij rejection retourneert de service een `mode="fallback"` briefing.
 */

import type {
  BriefingContext,
  BriefingMode,
  BriefingSection,
  BriefingSectionKey,
} from "./types";
import { BRIEFING_SECTION_ORDER, BRIEFING_SECTION_LABELS } from "./types";

export interface ParsedBriefingDraft {
  headline: string;
  sections: Array<{
    key: BriefingSectionKey;
    body: string;
    dataAvailable: boolean;
  }>;
  focusAction: string;
}

export interface GuardrailResult {
  ok: boolean;
  draft: ParsedBriefingDraft | null;
  rejectionReason?: string;
  rejectedClaims?: string[];
  bannedPhrases?: string[];
}

const BANNED_PHRASES: ReadonlyArray<RegExp> = [
  /\bgegarandeerd\b/i,
  /\bzeker weten\b/i,
  /\b100%\s*(zeker|sure)\b/i,
  /\b(koers|prijs)(doel|target)\b/i,
  /\bgaat zeker\b/i,
  /\bbinnen\s+\d+\s+(dag|dagen|week|weken)\s+(stijgt|daalt|gaat|loopt)\b/i,
  /\bguaranteed\b/i,
];

const REQUIRED_HEDGED_TERMS: ReadonlyArray<RegExp> = [
  /\boverweeg\b/i,
  /\blet op\b/i,
  /\bmogelijk\b/i,
  /\bkan\s+(duiden|wijzen|zijn)\b/i,
  /\bwijst op\b/i,
  /\bkan\b/i,
];

const VALID_KEYS = new Set<string>(BRIEFING_SECTION_ORDER);

/**
 * Parse + valideer LLM-output. Bij succes → ParsedBriefingDraft.
 */
export function validateBriefingOutput(
  text: string,
  context: BriefingContext,
): GuardrailResult {
  // 1. JSON parse
  const parsed = tryParseJson(text);
  if (!parsed) {
    return { ok: false, draft: null, rejectionReason: "json-parse-failed" };
  }

  // 2. Shape check
  const shape = checkShape(parsed);
  if (!shape.ok || !shape.draft) {
    return { ok: false, draft: null, rejectionReason: shape.reason };
  }
  const draft = shape.draft;

  // 3. Banned phrases anywhere in the text (incl. headline + body)
  const allText = [
    draft.headline,
    draft.focusAction,
    ...draft.sections.map((s) => s.body),
  ].join("\n");
  const banned = scanBannedPhrases(allText);
  if (banned.length > 0) {
    return {
      ok: false,
      draft: null,
      rejectionReason: "banned-phrase",
      bannedPhrases: banned,
    };
  }

  // 4. Hedged-language required: ergens in de output moet minstens één
  //    hedged term staan. (Tolerant — niet per sectie verplicht.)
  if (!hasHedgedLanguage(allText)) {
    return {
      ok: false,
      draft: null,
      rejectionReason: "hedged-language-missing",
    };
  }

  // 5. Numeric-claim cross-check tegen context
  const claims = collectNumericClaims(allText);
  const rejected = claims.filter((c) => !numericClaimAppearsInContext(c, context));
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

/**
 * Convert validated draft → final BriefingSection-array. Vult labels in
 * en ordent de secties in de canonical volgorde.
 */
export function draftToSections(draft: ParsedBriefingDraft): BriefingSection[] {
  const byKey = new Map<BriefingSectionKey, BriefingSection>();
  for (const s of draft.sections) {
    byKey.set(s.key, {
      key: s.key,
      label: BRIEFING_SECTION_LABELS[s.key],
      body: s.body.trim(),
      dataAvailable: s.dataAvailable !== false,
    });
  }
  return BRIEFING_SECTION_ORDER.map(
    (key) =>
      byKey.get(key) ?? {
        key,
        label: BRIEFING_SECTION_LABELS[key],
        body: "Geen data beschikbaar voor deze sectie.",
        dataAvailable: false,
      },
  );
}

/**
 * Helper for the service: combineer guardrail-uitkomst + mode label.
 */
export function decideMode(result: GuardrailResult): BriefingMode {
  return result.ok && result.draft !== null ? "ai" : "fallback";
}

// ============================================================
//  Helpers
// ============================================================

function tryParseJson(text: string): unknown {
  // Tolerant aan markdown-fence: strip ```json … ``` als de LLM dat doet.
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

function checkShape(parsed: unknown): {
  ok: boolean;
  draft: ParsedBriefingDraft | null;
  reason?: string;
} {
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, draft: null, reason: "not-an-object" };
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.headline !== "string" || obj.headline.trim().length === 0) {
    return { ok: false, draft: null, reason: "missing-headline" };
  }
  if (typeof obj.focusAction !== "string") {
    return { ok: false, draft: null, reason: "missing-focusAction" };
  }
  if (!Array.isArray(obj.sections)) {
    return { ok: false, draft: null, reason: "missing-sections" };
  }
  const sections = obj.sections;
  const validated: ParsedBriefingDraft["sections"] = [];
  for (const raw of sections) {
    if (!raw || typeof raw !== "object") {
      return { ok: false, draft: null, reason: "section-not-object" };
    }
    const s = raw as Record<string, unknown>;
    if (typeof s.key !== "string" || !VALID_KEYS.has(s.key)) {
      return { ok: false, draft: null, reason: "section-invalid-key" };
    }
    if (typeof s.body !== "string") {
      return { ok: false, draft: null, reason: "section-body-not-string" };
    }
    validated.push({
      key: s.key as BriefingSectionKey,
      body: s.body,
      dataAvailable: s.dataAvailable !== false,
    });
  }
  return {
    ok: true,
    draft: {
      headline: obj.headline.trim(),
      sections: validated,
      focusAction: obj.focusAction.trim(),
    },
  };
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
  return REQUIRED_HEDGED_TERMS.some((re) => re.test(text));
}

/**
 * Verzamel numerieke tokens. Voorbeelden:
 *   "12,5%" → "12,5%"
 *   "€1.250" → "1.250"
 *   "0.45" → "0.45"
 * Tickers + jaren ≤ 2099 zijn doorgaans niet ambiguous, maar we whitelisten
 * gebruikelijke jaartallen via een lengte-filter.
 */
const NUMERIC_PATTERN = /-?\d{1,3}(?:[.,]\d+)+%?|-?\d+%/g;

function collectNumericClaims(text: string): string[] {
  const matches = text.match(NUMERIC_PATTERN) ?? [];
  return matches.map((m) => m.trim()).filter((m) => m.length > 0);
}

/**
 * Cross-check: de string moet ergens in de context-JSON terugkomen, met
 * tolerantie voor decimal-formatting (1,5% vs 0.015 vs 1.5%).
 */
function numericClaimAppearsInContext(
  claim: string,
  context: BriefingContext,
): boolean {
  const haystack = JSON.stringify(context);
  if (haystack.includes(claim)) return true;
  // Probeer beide decimal-conventies (Euro 1,5 ↔ JSON 1.5).
  const swapped = claim.replace(/,/g, ".");
  if (haystack.includes(swapped)) return true;
  // Probeer decimal-fractie: "12.5%" → "0.125"
  const numericPart = claim.replace(/[%.,]/g, "");
  if (claim.endsWith("%") && /^\d+$/.test(numericPart) === false) {
    const cleaned = claim.replace(/%$/, "").replace(/,/g, ".");
    const n = Number(cleaned);
    if (Number.isFinite(n)) {
      // 12.5% → 0.125 ; let op decimal-precision rounding
      const fraction = (n / 100).toString();
      if (haystack.includes(fraction)) return true;
      // Check ook tot 4 decimalen
      const rounded = (Math.round((n / 100) * 10000) / 10000).toString();
      if (haystack.includes(rounded)) return true;
    }
  }
  return false;
}
