import type {
  DashboardAction,
  DashboardActionUrgency,
} from "@/lib/analytics/actions";
import type {
  DashboardOpportunity,
  DashboardRiskAction,
} from "@/lib/analytics";
import type { ISODateString } from "@/types/common";
import type { MarketRegimeScore } from "@/types/regime";

/**
 * Dashboard Explainer — AI Explain Panel.
 *
 * Doel: AI legt **alleen uit** wat de engines hebben besloten. Geen
 * nieuwe scores, aantallen of koop-/verkoopadvies. Pure deterministische
 * renderer; voor een toekomstige LLM-swap leveren we een prompt-payload
 * met strikte guardrails én een numeric-claim validator.
 *
 * Architectuur (parallel aan `lib/ai/explain/action-decision.ts`):
 *  - `explainDashboardSummary`     — pure renderer.
 *  - `buildDashboardSummaryPrompt` — system + user prompt voor LLM-swap.
 *  - `validateDashboardSummary`    — numeric-claim cross-check.
 *
 * UX: deze output staat onder een collapse — gebruiker drukt op "Leg dit
 * advies uit". Het doel is een korte, scanbare tekst die expliciet
 * onzekerheid en datakwaliteit benoemt.
 */

// ============================================================
//  Types
// ============================================================

export type DashboardSummaryConfidence = "low" | "medium" | "high";

export interface DashboardSummaryExplanationInput {
  /** Top dashboard-actions zoals geleverd door `buildDashboardPrimaryActions`. */
  topActions: DashboardAction[];
  /** Top risk-actions uit `buildRiskActions`. */
  topRisks: DashboardRiskAction[];
  /** Top opportunities uit `prioritizeOpportunities`. */
  topOpportunities: DashboardOpportunity[];
  /** Markt-regime (optioneel). */
  regime: MarketRegimeScore | null;
  /** Datakwaliteit-notities, bv. uit policy/data-quality engines. */
  dataQualityNotes?: string[];
  /** Gemiddelde confidence van top-engine output (0..1). */
  overallConfidence?: number;
  /** Override `now` voor deterministische tests. */
  now?: string;
}

export interface DashboardSummaryExplanation {
  generatedAt: ISODateString;
  /** Eén-zin samenvatting van het dashboard. */
  headline: string;
  /** "Waarom deze acties bovenaan staan" — bullets. */
  whyTopActions: string[];
  /** "Welke onzekerheden er zijn" — bullets. */
  uncertainties: string[];
  /** "Welke data verbeteren" — bullets met concrete vragen. */
  improvementSuggestions: string[];
  /** Tekstuele tier (low/medium/high) voor UI-kleurcode. */
  confidenceTier: DashboardSummaryConfidence;
  /** 0..1 — overgenomen of afgeleid uit input. */
  confidence: number;
  /** Engine-bronnen die we hebben gelezen (audit). */
  sources: string[];
  /** Disclaimer onderaan. */
  disclaimer: string;
}

// ============================================================
//  Pure renderer
// ============================================================

const DISCLAIMER =
  "AI legt alleen uit wat de engines hebben berekend — geen nieuwe scores, geen koop-/verkoopadvies.";

const URGENCY_LABEL: Record<DashboardActionUrgency, string> = {
  HIGH: "hoge urgentie",
  MEDIUM: "middel urgentie",
  LOW: "lage urgentie",
};

export function explainDashboardSummary(
  input: DashboardSummaryExplanationInput,
): DashboardSummaryExplanation {
  const generatedAt = input.now ?? new Date().toISOString();

  const headline = buildHeadline(input);
  const whyTopActions = buildWhyTopActions(input);
  const uncertainties = buildUncertainties(input);
  const improvementSuggestions = buildImprovementSuggestions(input);
  const confidence = deriveConfidence(input);
  const confidenceTier = tierFor(confidence);

  return {
    generatedAt,
    headline,
    whyTopActions,
    uncertainties,
    improvementSuggestions,
    confidenceTier,
    confidence: round2(confidence),
    sources: collectSources(input),
    disclaimer: DISCLAIMER,
  };
}

// ============================================================
//  Headline + sections (deterministisch)
// ============================================================

function buildHeadline(
  input: DashboardSummaryExplanationInput,
): string {
  const top = input.topActions[0];
  const risksCount = input.topRisks.length;
  const oppsCount = input.topOpportunities.length;
  const regimeStance = input.regime?.stance ?? "NEUTRAL";

  if (!top) {
    return `Geen directe acties; ${risksCount} risico-flag${risksCount === 1 ? "" : "s"} en ${oppsCount} kans${oppsCount === 1 ? "" : "en"} zichtbaar bij ${regimeStance.toLowerCase()}-regime.`;
  }
  return `Engine-prioriteit: ${top.title} (${URGENCY_LABEL[top.urgency]}); regime ${regimeStance.toLowerCase()}, ${risksCount} risico-flag${risksCount === 1 ? "" : "s"} en ${oppsCount} kans${oppsCount === 1 ? "" : "en"}.`;
}

function buildWhyTopActions(
  input: DashboardSummaryExplanationInput,
): string[] {
  const out: string[] = [];
  for (const action of input.topActions.slice(0, 3)) {
    // Citeer letterlijk: title + reason. Geen herinterpretatie van cijfers.
    const conf = `${Math.round(action.confidence * 100)}%`;
    out.push(
      `${action.title} — ${URGENCY_LABEL[action.urgency]}, confidence ${conf}. Engine-reden: ${action.reason}`,
    );
  }
  if (out.length === 0) {
    out.push(
      "Geen actiegerichte triggers actief — engines zien geen aanleiding voor directe ingreep.",
    );
  }
  return out;
}

function buildUncertainties(
  input: DashboardSummaryExplanationInput,
): string[] {
  const out: string[] = [];

  // Lage-confidence dashboard-actions.
  for (const a of input.topActions) {
    if (a.confidence < 0.5) {
      out.push(
        `Actie "${a.title}" heeft lage engine-confidence (${Math.round(a.confidence * 100)}%) — verifieer onderliggende data.`,
      );
    }
  }

  // Lage-confidence opportunities.
  for (const o of input.topOpportunities) {
    if (o.lowConfidence && o.lowConfidenceReason) {
      out.push(
        `Kans "${o.symbol}" heeft lage confidence — ${o.lowConfidenceReason}`,
      );
    }
  }

  // Risks waarvan rebalance-quantity geen aantallen geeft.
  for (const r of input.topRisks) {
    if (r.insufficientData) {
      out.push(
        `Risico "${r.title}" mist betrouwbare aantallen — quantity-engine kon geen prijs vinden.`,
      );
    }
  }

  // Externe data-quality notes (uit policy / data-quality engine).
  for (const note of input.dataQualityNotes ?? []) {
    out.push(note);
  }

  if (out.length === 0) {
    out.push("Geen materiële onzekerheden — engines hebben voldoende data.");
  }
  return out;
}

function buildImprovementSuggestions(
  input: DashboardSummaryExplanationInput,
): string[] {
  const suggestions = new Set<string>();

  for (const r of input.topRisks) {
    if (r.insufficientData) {
      suggestions.add(
        `Vul koersdata aan voor ${r.symbol ?? "betreffende positie"} zodat de quantity-engine concrete aantallen kan leveren.`,
      );
    }
  }
  for (const o of input.topOpportunities) {
    if (o.lowConfidence) {
      suggestions.add(
        `Voeg fundamentals toe voor ${o.symbol} (factor-score / earnings) — Opportunity Radar wint dan aan zekerheid.`,
      );
    }
  }
  if (
    input.regime === null ||
    (input.regime?.confidence ?? 0) < 0.5
  ) {
    suggestions.add(
      "Marktregime-fetch is beperkt; controleer of de regime-bron beschikbaar is en alle drivers zijn opgehaald.",
    );
  }
  if ((input.overallConfidence ?? 1) < 0.5) {
    suggestions.add(
      "Vul ontbrekende holding-velden (sector, ISIN, asset-class) aan via portefeuille-import of een handmatige override.",
    );
  }

  if (suggestions.size === 0) {
    suggestions.add(
      "Geen extra data nodig — de huidige dataset is voldoende voor de getoonde adviezen.",
    );
  }
  return [...suggestions];
}

// ============================================================
//  Confidence + tier
// ============================================================

function deriveConfidence(
  input: DashboardSummaryExplanationInput,
): number {
  if (typeof input.overallConfidence === "number") {
    return clamp01(input.overallConfidence);
  }
  // Fallback: gemiddelde van top-action confidence.
  if (input.topActions.length === 0) return 0.5;
  const avg =
    input.topActions.reduce((s, a) => s + a.confidence, 0) /
    input.topActions.length;
  return clamp01(avg);
}

function tierFor(confidence: number): DashboardSummaryConfidence {
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}

function collectSources(
  input: DashboardSummaryExplanationInput,
): string[] {
  const sources = new Set<string>();
  for (const a of input.topActions) sources.add(a.sourceEngine);
  for (const r of input.topRisks) sources.add(r.sourceEngine);
  if (input.topOpportunities.length > 0) sources.add("opportunity-radar");
  if (input.regime) sources.add("market-regime");
  return [...sources];
}

// ============================================================
//  Prompt (LLM-swap-ready)
// ============================================================

export interface DashboardSummaryPromptPayload {
  system: string;
  user: string;
}

export const DASHBOARD_SUMMARY_SYSTEM_PROMPT = [
  "Je bent BeleggerIQ Dashboard-Explainer. Je enige taak is uitleggen wat de engines al hebben besloten.",
  "",
  "Strikte regels:",
  "1. Gebruik UITSLUITEND cijfers, percentages en bedragen die in CONTEXT staan.",
  "2. Verzin geen nieuwe scores, koersen, percentages, bedragen of aantallen.",
  "3. Pas de gekozen acties (RISK_REDUCTION/BUY_OPPORTUNITY/HOLD_CASH/DO_NOTHING), urgency of next-step NIET aan.",
  "4. Geef geen koop- of verkoopbeslissing; vat alleen samen wat de engines concludeerden.",
  "5. Benoem expliciet onzekerheid als confidence < 50% of als data-quality-notes aanwezig zijn.",
  "6. Schrijf compact, zakelijk Nederlands. Geen marketing-taal of superlatieven.",
  "7. Output-structuur: één headline-zin, dan drie korte secties (Waarom deze acties / Onzekerheden / Wat kan de gebruiker verbeteren).",
].join("\n");

export function buildDashboardSummaryPrompt(
  input: DashboardSummaryExplanationInput,
): DashboardSummaryPromptPayload {
  const user = [
    "Use case: dashboard-samenvatting.",
    "",
    "CONTEXT (engine-output, niet aanpassen):",
    "```json",
    JSON.stringify(
      {
        topActions: input.topActions,
        topRisks: input.topRisks,
        topOpportunities: input.topOpportunities,
        regime: input.regime,
        dataQualityNotes: input.dataQualityNotes ?? [],
        overallConfidence: input.overallConfidence ?? null,
      },
      null,
      2,
    ),
    "```",
    "",
    "Geef de output in dezelfde structuur als `DashboardSummaryExplanation`.",
    "Citeer cijfers letterlijk uit CONTEXT; voeg er zelf geen toe.",
  ].join("\n");
  return {
    system: DASHBOARD_SUMMARY_SYSTEM_PROMPT,
    user,
  };
}

// ============================================================
//  Validator (LLM-output guardrail)
// ============================================================

/**
 * Cross-check helper: verzamelt numerieke tokens uit `text` en kijkt of
 * elk token ook elders in `JSON.stringify(input)` voorkomt. Niet-gevonden
 * tokens komen in `rejectedClaims`.
 *
 * Niet runtime gebruikt door de pure renderer; voor LLM-swap.
 */
export function validateDashboardSummary(
  text: string,
  input: DashboardSummaryExplanationInput,
): { ok: boolean; rejectedClaims: string[] } {
  const haystack = JSON.stringify(input).replace(/\s+/g, "");
  const numericPattern = /-?\d+(?:[.,]\d+)?%?/g;
  const candidates = text.match(numericPattern) ?? [];
  const rejected: string[] = [];
  for (const c of candidates) {
    const norm = c.replace(/\s+/g, "");
    if (!haystack.includes(norm)) rejected.push(c);
  }
  return { ok: rejected.length === 0, rejectedClaims: rejected };
}

// ============================================================
//  Helpers (pure)
// ============================================================

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
