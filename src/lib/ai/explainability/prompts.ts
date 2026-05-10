/**
 * Prompt-templates per domein.
 *
 * Elke template:
 *  - System-prompt: persona + strikte regels (Buffett/Dalio/Lynch/Simons-laag).
 *  - User-prompt: domein-specifieke context als JSON + uitleg-opdracht.
 *
 * **Strikte regels op alle prompts**:
 *  1. Cijfers UITSLUITEND uit CONTEXT — verzin geen nieuwe waarden.
 *  2. Hedged taal verplicht ("overweeg", "let op", "mogelijk").
 *  3. Geen koop/verkoopadvies; suggesties alleen als "overweeg X".
 *  4. Output strikt JSON met `summary`/`whyItMatters`/`positives[]`/
 *     `risks[]`/`possibleActions[]`/`uncertainties[]`.
 */

import type { BehavioralSignalWithState } from "@/lib/analytics/behavioral";
import type {
  PortfolioHealthScore,
} from "@/lib/analytics/health-score";
import type { MacroRegimeReport } from "@/lib/analytics/macro-regime";
import type { InvestmentConfidenceScore } from "@/lib/analytics/signal-fusion";
import type { PortfolioRiskSummary } from "@/types/risk";

import type { ExplainabilityDomain } from "./types";

export interface PromptPayload {
  system: string;
  user: string;
  /** JSON-stringified context — voor numeric-claim cross-check. */
  contextJson: string;
}

const COMMON_RULES = [
  "Strikte regels:",
  "1. Gebruik UITSLUITEND cijfers, percentages en bedragen die in CONTEXT staan. Verzin geen nieuwe data.",
  "2. Schrijf hedged: gebruik 'overweeg', 'let op', 'mogelijk', 'kan duiden'. NOOIT 'gegarandeerd' of koersdoelen.",
  "3. Geef GEEN koop/verkoop-advies; suggesties zijn 'overweeg X gegeven Y'.",
  "4. Schrijf compact, zakelijk Nederlands. Geen marketing-taal.",
  "5. Output uitsluitend JSON volgens onderstaand schema; geen markdown, geen prose buiten de JSON.",
  "",
  "Output-schema:",
  "{",
  '  "summary": string,                       // 1 zin conclusie',
  '  "whyItMatters": string,                  // 1–2 zinnen waarom belangrijk',
  '  "positives": string[],                   // 1–4 bullets',
  '  "risks": string[],                       // 1–4 bullets',
  '  "possibleActions": [{                    // 1–3 acties',
  '    "title": string, "rationale": string, "link"?: string',
  "  }],",
  '  "uncertainties": string[]                // 1–3 data-beperkingen',
  "}",
].join("\n");

const PERSONAS: Record<ExplainabilityDomain, string> = {
  portfolio_health:
    "Je bent BeleggerIQ Health-Explainer. Vat de 10-component Portfolio Health Score samen voor een gewone belegger (Lynch-laag): wat is goed, wat kan beter, wat te doen.",
  investment_confidence:
    "Je bent BeleggerIQ Confidence-Explainer. Leg uit hoe de Investment Confidence Score (10 signalen) tot stand kwam — Buffett-laag: kwaliteit + waardering centraal, Lynch-laag: in spreektaal.",
  macro_regime:
    "Je bent BeleggerIQ Macro-Explainer. Vat het huidige regime + de impact op de portefeuille samen — Dalio-laag: groei × inflatie eerst, dan asset-class implicaties.",
  behavioral_coach:
    "Je bent BeleggerIQ Behavioral Coach. Vertaal gedrags-signalen in coachende reflectie, niet in verwijten. Toon helder maar uitnodigend.",
  risk_analysis:
    "Je bent BeleggerIQ Risk-Explainer. Beschrijf de portefeuille-risico's in beleggers-taal — concentratie, volatiliteit, valuta. Hedge altijd ('mogelijk risico', 'let op').",
  scenario_analysis:
    "Je bent BeleggerIQ Scenario-Explainer. Verklaar wat verschillende macro-scenario's met de portefeuille zouden doen — Dalio-laag: risico's expliciet maken zonder paniek-toon.",
};

function buildSystemPrompt(domain: ExplainabilityDomain): string {
  return [
    PERSONAS[domain],
    "",
    COMMON_RULES,
    "",
    "Houd de uitleg zakelijk en uitlegbaar. Een gebruiker moet binnen 30 seconden snappen wat de score betekent.",
  ].join("\n");
}

function buildUserPrompt(
  domain: ExplainabilityDomain,
  context: unknown,
  goal: string,
): { user: string; contextJson: string } {
  const contextJson = JSON.stringify(context, null, 2);
  const user = [
    `Use case: ${domain}.`,
    "",
    "CONTEXT (engine-output, niet aanpassen):",
    "```json",
    contextJson,
    "```",
    "",
    goal,
    "Citeer cijfers letterlijk uit CONTEXT. Hedged taal verplicht. Eindig met `}` — geen tekst na de JSON.",
  ].join("\n");
  return { user, contextJson };
}

// ============================================================
//  Per-domain builders
// ============================================================

export function buildHealthPrompt(score: PortfolioHealthScore): PromptPayload {
  const goal = `Geef de gebruiker een korte uitleg van de Portfolio Health Score ${score.totalScore}/100 (grade ${score.grade}). Benoem de sterkste en zwakste components, koppel ze aan concrete acties uit \`topRecommendations\`, en noem onzekerheid wanneer \`effectiveWeight\` < 0.8.`;
  const { user, contextJson } = buildUserPrompt("portfolio_health", score, goal);
  return { system: buildSystemPrompt("portfolio_health"), user, contextJson };
}

export function buildConfidencePrompt(
  score: InvestmentConfidenceScore,
): PromptPayload {
  const goal = `Leg uit waarom ${score.ticker} de score ${score.totalScore}/100 (tier ${score.tier}) kreeg. Benoem de signalen die het zwaarst doorwerken (positief én negatief), én welke signalen ontbreken (\`dataQuality === 'missing'\`).`;
  const { user, contextJson } = buildUserPrompt(
    "investment_confidence",
    score,
    goal,
  );
  return {
    system: buildSystemPrompt("investment_confidence"),
    user,
    contextJson,
  };
}

export function buildMacroPrompt(report: MacroRegimeReport): PromptPayload {
  const goal = `Vat het ${report.classification.regime}-regime samen (groei × inflatie + bevestigende indicators). Benoem de portfolio-impact uit \`portfolioImpact.summary\` indien aanwezig, en wat dat globaal betekent voor de gebruiker.`;
  const { user, contextJson } = buildUserPrompt("macro_regime", report, goal);
  return { system: buildSystemPrompt("macro_regime"), user, contextJson };
}

export interface BehavioralExplainContext {
  signals: BehavioralSignalWithState[];
  /** Aantal actieve signals (na state-merge). */
  activeCount: number;
}

export function buildBehavioralPrompt(
  context: BehavioralExplainContext,
): PromptPayload {
  const goal =
    context.activeCount === 0
      ? `Er zijn momenteel 0 actieve gedragspatronen. Geef een korte bevestiging van bewust handelen + benoem reflectiepunten voor de toekomst (vraag-vorm, geen veroordeling).`
      : `Vat de top-${Math.min(3, context.activeCount)} actieve gedrags-signalen samen. Coachend, niet betuttelend — geen "je hebt fout gehandeld", wel "wil je deze keuze bewust maken?". Verbind aan \`reflectionQuestions\`.`;
  const { user, contextJson } = buildUserPrompt(
    "behavioral_coach",
    context,
    goal,
  );
  return { system: buildSystemPrompt("behavioral_coach"), user, contextJson };
}

export function buildRiskPrompt(risk: PortfolioRiskSummary): PromptPayload {
  const goal = `Vat de portefeuille-risico's samen op basis van de top flags + concentratie- en volatility-cijfers. Beschrijf in spreektaal welke 1–3 risico's de meeste aandacht verdienen, zonder alarmistische toon.`;
  const { user, contextJson } = buildUserPrompt("risk_analysis", risk, goal);
  return { system: buildSystemPrompt("risk_analysis"), user, contextJson };
}

export interface ScenarioExplainContext {
  /** Naam → impact-percentage / bedrag. */
  scenarios: Array<{
    name: string;
    description: string;
    portfolioImpactPct: number;
    severity: "low" | "moderate" | "high";
  }>;
  baseCurrency: string;
}

export function buildScenarioPrompt(
  context: ScenarioExplainContext,
): PromptPayload {
  const goal = `Geef per scenario in 1 zin uitleg wat dit met de portefeuille zou doen — nuchter, niet alarmistisch. Benoem het zwaarste scenario en eventuele defensieve acties die overwogen kunnen worden.`;
  const { user, contextJson } = buildUserPrompt(
    "scenario_analysis",
    context,
    goal,
  );
  return { system: buildSystemPrompt("scenario_analysis"), user, contextJson };
}
