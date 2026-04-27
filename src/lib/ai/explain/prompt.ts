import type { ActionDecisionExplanationInput } from "./types";

/**
 * Prompt-payload voor toekomstige LLM-swap. De huidige
 * `explainActionDecision` is volledig deterministisch (geen LLM-call);
 * deze prompt staat klaar voor het moment dat we wel een LLM willen
 * gebruiken voor stilistische polishing.
 *
 * De system-prompt **verbiedt expliciet**:
 *  - nieuwe scores, percentages, bedragen of aantallen
 *  - aanpassen van de actie of urgency
 *  - koop-/verkoopadvies geven
 *
 * Validatie van de output gebeurt via `validateExplanationAgainstAction`
 * die elk numeric mention kruis-checkt tegen de input-action.
 */

export interface ExplainPromptPayload {
  system: string;
  user: string;
}

export const ACTION_DECISION_SYSTEM_PROMPT = [
  "Je bent BeleggerIQ Action-Explainer. Je enige taak is uitleggen wat de analytics-engine al heeft besloten.",
  "",
  "Strikte regels:",
  "1. Gebruik UITSLUITEND cijfers, percentages en bedragen die in CONTEXT staan.",
  "2. Verzin geen nieuwe scores, koersen, percentages of bedragen.",
  "3. Pas de gekozen actie (BUY/HOLD/TRIM/SELL/DO_NOTHING) of urgency NIET aan — alleen uitleggen.",
  "4. Geef geen nieuw koop- of verkoopadvies; je vat alleen samen wat de engine al concludeerde.",
  "5. Als de confidence onder 50% is, benoem dat expliciet.",
  "6. Schrijf compact, zakelijk Nederlands. Geen marketing-taal of superlatieven.",
  "7. Output-structuur: één headline-zin, dan drie korte secties (Waarom logisch / Risico's / Wat kan misgaan), elk 1-3 bullets.",
].join("\n");

export function buildActionDecisionPrompt(
  input: ActionDecisionExplanationInput,
): ExplainPromptPayload {
  const user = [
    `Use case: action-decision uitleg voor ${input.action.symbol}.`,
    "",
    "CONTEXT (engine-output, niet aanpassen):",
    "```json",
    JSON.stringify(
      {
        action: input.action,
        factorScore: input.factorScore ?? null,
        positionRisk: input.positionRisk ?? null,
      },
      null,
      2,
    ),
    "```",
    "",
    "Geef de output in dezelfde structuur als `ActionDecisionExplanation`.",
    "Citeer cijfers letterlijk uit CONTEXT.action; voeg er zelf geen toe.",
  ].join("\n");

  return {
    system: ACTION_DECISION_SYSTEM_PROMPT,
    user,
  };
}

// ============================================================
//  Validator
// ============================================================

/**
 * Cross-check helper voor toekomstige LLM-output. Verzamelt alle
 * numerieke tokens (`\d+%?`, EUR-bedragen, decimal-getallen) uit
 * `text` en kijkt of elk token ook elders in `JSON.stringify(input)`
 * voorkomt. Niet-gevonden tokens komen in `rejectedClaims`.
 *
 * Niet runtime gebruikt door de pure renderer; voor LLM-swap.
 */
export function validateExplanationAgainstAction(
  text: string,
  input: ActionDecisionExplanationInput,
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
