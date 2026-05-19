/**
 * Investment Case — AI prompt-template (Module 31, v2-hook).
 *
 * **Niet aangeroepen in v1**: v1 gebruikt deterministic fallback uit
 * `engine.ts`. Deze template ligt klaar voor v2 wanneer een AI-provider
 * is geconfigureerd en het prompt-guard-pad uit M8 explainability is
 * aangesloten op deze domain.
 *
 * **Strikte regels** (zelfde patroon als M8):
 *  1. Cijfers UITSLUITEND uit CONTEXT — geen verzonnen bedragen of feiten
 *  2. Geen koop/verkoop-advies — alleen "overweeg", "let op", "mogelijk"
 *  3. Bij ontbrekende data: zeg dat expliciet ("data ontbreekt") — niet verzinnen
 *  4. Output strikt JSON volgens schema
 */

import type { InvestmentCase } from "./types";

export interface InvestmentCasePromptPayload {
  system: string;
  user: string;
  /** JSON-stringified context — voor numeric-claim cross-check guardrails. */
  contextJson: string;
}

const COMMON_RULES = [
  "Strikte regels:",
  "1. Gebruik UITSLUITEND cijfers, percentages, sectoren en bedrijfsnamen die in CONTEXT staan. Verzin geen nieuwe data of bedrijfsfeiten.",
  "2. Bij ontbrekende informatie: zeg expliciet 'data ontbreekt' of 'classificatie onbekend'. Verzin NOOIT een bedrijfsbeschrijving.",
  "3. Geef GEEN koop/verkoop-advies. Hedged taal: 'overweeg', 'let op', 'mogelijk', 'lijkt'. NOOIT 'gegarandeerd' of koersdoelen.",
  "4. Schrijf compact, zakelijk Nederlands. Geen marketing-taal. Geen jargon zonder uitleg.",
  "5. Output uitsluitend JSON volgens onderstaand schema; geen markdown, geen prose buiten de JSON.",
  "",
  "Output-schema:",
  "{",
  '  "what_it_does": { "body": string, "bullets": string[] },',
  '  "why_interesting": { "body": string, "bullets": string[] },',
  '  "strengths": { "body": string, "bullets": string[] },',
  '  "risks": { "body": string, "bullets": string[] },',
  '  "signals_to_watch": { "body": string, "bullets": string[] },',
  '  "portfolio_fit": { "body": string, "bullets": string[] },',
  '  "missing_data": { "body": string, "bullets": string[] },',
  '  "conclusion": { "body": string, "bullets": [] }',
  "}",
].join("\n");

const PERSONA =
  "Je bent BeleggerIQ Stock-Story Explainer. Vat de beleggingscase van een aandeel of ETF samen in eenvoudige taal voor een gewone belegger (Lynch-laag). Buffett-laag: kwaliteit en lange termijn centraal. Simons-laag: alleen feiten uit CONTEXT — geen verzonnen bedrijfsgeschiedenis of marktclaims. Risicoanalist-laag: risico's expliciet zonder paniek.";

/**
 * Bouw prompt-payload voor één investment-case. Caller stuurt de payload
 * door de bestaande AI-pipeline + guardrails (M8) wanneer die in v2 aan
 * deze domain wordt gekoppeld.
 */
export function buildInvestmentCasePrompt(
  caseData: InvestmentCase,
  contextFields: {
    name: string | null;
    sector: string | null;
    industry: string | null;
    country: string | null;
    region: string | null;
    assetKind: string;
    fundamentals: Record<string, unknown> | null;
    confidenceTier: string | null;
    confidenceScore: number | null;
    factorComposite: number | null;
    portfolioWeight: number | null;
    dataDepthScore: number | null;
    dataDepthMissing: ReadonlyArray<string>;
  },
): InvestmentCasePromptPayload {
  const contextJson = JSON.stringify({
    ticker: caseData.ticker,
    asOf: caseData.generatedAt,
    ...contextFields,
  });

  const system = [PERSONA, "", COMMON_RULES].join("\n");

  const user = [
    `Genereer een investment-case voor ${caseData.ticker}.`,
    "",
    "CONTEXT (JSON, gebruik UITSLUITEND deze data):",
    contextJson,
    "",
    "Vul alle 8 cards. Voor 'missing_data' lijst je expliciet wat ontbreekt.",
    "Bij volledig ontbrekende bedrijfsbeschrijving: zeg dat de beschrijving ontbreekt en raadpleeg officiële bronnen.",
  ].join("\n");

  return { system, user, contextJson };
}
