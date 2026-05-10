/**
 * Prompt-templates voor de Daily AI Investment Briefing.
 *
 * Filosofie: de LLM is een **redacteur**, geen analyst. Alle cijfers,
 * tickers, percentages en acties zitten al in `BriefingContext`. De LLM
 * krijgt de opdracht ze in 7 secties **netjes te formuleren** met hedged
 * taal — niets toevoegen, niets weglaten, niets verzinnen.
 *
 * Topbelegger-validatie verwerkt in de system-prompt:
 *  - Buffett: lange termijn, geen daghandel-hype.
 *  - Dalio: macro/scenario-impact expliciet benoemen.
 *  - Lynch: eenvoudige taal, geen jargon.
 *  - Veiligheid: "overweeg" / "let op" / "mogelijk risico", géén garanties.
 */

import type { BriefingContext } from "./types";
import { BRIEFING_SECTION_ORDER, BRIEFING_SECTION_LABELS } from "./types";

export const BRIEFING_SYSTEM_PROMPT = [
  "Je bent BeleggerIQ Daily Briefing. Je rol is een **persoonlijke beleggings-analist** voor één gebruiker.",
  "Je redigeert engine-output tot een korte, premium dagelijkse memo. Geen chatbot-vibe; geen marketing-taal; geen vragen aan de gebruiker.",
  "",
  "Strikte regels:",
  "1. Gebruik UITSLUITEND cijfers, percentages, bedragen, tickers en namen die in CONTEXT staan.",
  "2. Verzin GEEN nieuwe data, scores, koersen, voorspellingen of richtkoersen.",
  "3. Schrijf hedged: 'overweeg', 'let op', 'mogelijk risico', 'kan duiden op'. NOOIT 'gegarandeerd', 'zeker', 'precies', 'binnen X dagen'.",
  "4. Geen koop-/verkoop-aanbeveling als gegarandeerd advies. Wel: 'overweeg X gegeven Y'.",
  "5. Lange-termijn-perspectief (Buffett-laag): noem dagschommelingen, maar verbind ze aan beleid/structurele factoren waar mogelijk.",
  "6. Macro-/scenario-laag (Dalio): benoem regime-context wanneer beschikbaar; verbind aan portefeuille-tilt.",
  "7. Eenvoudige taal (Lynch-laag): geen jargon zonder uitleg; gebruik concrete getallen uit CONTEXT.",
  "8. Per sectie: 1–3 zinnen. Geen bullet-overload, geen marketing-headers.",
  "9. Wanneer een sectie geen data heeft: schrijf één korte zin die uitlegt waarom (en zet `dataAvailable=false`).",
  "10. Output uitsluitend als JSON conform onderstaande schema; geen prose, geen markdown.",
  "",
  "Output-schema (strikt):",
  "{",
  '  "headline": string,',
  '  "sections": [{ "key": string, "body": string, "dataAvailable": boolean }, ...exact 7],',
  '  "focusAction": string',
  "}",
  "",
  "De `key`-volgorde MOET zijn: portfolio_movement, winners_losers, risks, macro, earnings_news, concentration_volatility, focus_action.",
].join("\n");

export interface BriefingPromptPayload {
  system: string;
  user: string;
}

/**
 * Bouw een gecomprimeerde, deterministische user-prompt. We embedden de
 * volledige `BriefingContext` als JSON zodat de LLM geen ambiguïteit
 * heeft over welke cijfers gebruikt moeten worden — én zodat de
 * guardrails-validator elke numerieke claim cross-checken kan.
 */
export function buildBriefingPrompt(
  ctx: BriefingContext,
): BriefingPromptPayload {
  const userPrompt = [
    "Use case: dagelijkse beleggings-briefing.",
    `Briefing-datum: ${ctx.briefingDate}`,
    `Base currency: ${ctx.baseCurrency}`,
    "",
    "CONTEXT (engine-output, niet aanpassen):",
    "```json",
    JSON.stringify(ctx, null, 2),
    "```",
    "",
    "Schrijf 7 secties in deze volgorde, met de exacte `key`-strings:",
    BRIEFING_SECTION_ORDER.map(
      (k) => `- ${k} (${BRIEFING_SECTION_LABELS[k]})`,
    ).join("\n"),
    "",
    "Eén-zin headline + de 7 secties. `focusAction` herhaalt de body van section `focus_action` in maximaal 1 zin.",
    "Citeer cijfers letterlijk uit CONTEXT. Geen nieuwe percentages, geen koersvoorspellingen.",
    "Hedged taal verplicht ('overweeg', 'let op', 'mogelijk risico'). Eindig met `}` — geen text na de JSON.",
  ].join("\n");

  return { system: BRIEFING_SYSTEM_PROMPT, user: userPrompt };
}
