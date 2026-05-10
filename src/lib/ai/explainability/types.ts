/**
 * AI Explainability Layer — types.
 *
 * Eén centrale shape voor uitleg over alle BeleggerIQ-engines:
 * Portfolio Health (M1), Confidence Score (M6), Macro Regime (M5),
 * Behavioral Coach (M3), Risk Engine, en Scenario Analysis.
 *
 * **Filosofie**:
 *  - Buffett: helder, eenvoudig, betrouwbaar (no jargon zonder uitleg).
 *  - Dalio: risico's en scenario's expliciet benoemen.
 *  - Lynch: gewone belegger moet 'em snappen.
 *  - Simons: signalen verklaren zonder valse zekerheid.
 *  - Wood: AI maakt de ervaring superieur — maar fallback blijft werken.
 *
 * **Conventie**: één gemeenschappelijke `DomainExplanation`-shape voor
 * alle 6 domeinen. UI rendert generiek; alleen de prompt-template + de
 * fallback-renderer verschillen per domein.
 */

import type { ISODateString } from "@/types/common";

/** 6 ondersteunde uitleg-domeinen. */
export type ExplainabilityDomain =
  | "portfolio_health"
  | "investment_confidence"
  | "macro_regime"
  | "behavioral_coach"
  | "risk_analysis"
  | "scenario_analysis";

export type ExplanationMode = "ai" | "fallback";
export type ExplanationConfidence = "low" | "medium" | "high";

/**
 * Eén bron-trace: welke engine/object leverde een input voor de uitleg?
 * Bewaard zodat de UI kan tonen "deze uitleg gebruikt: factor-engine,
 * macro-regime, portfolio-view" + audit-trail mogelijk is.
 */
export interface SourceTrace {
  /** Stabiele engine/document-naam ("factor-engine", "health-score"). */
  source: string;
  /** Welke velden uit die bron zijn gelezen — voor traceability. */
  fields: string[];
  /** Optionele asOf-datum van de gebruikte data. */
  asOf?: ISODateString;
}

/**
 * Eén actie-suggestie. Geen koop/verkoop-advies; wel concrete vervolgstap.
 */
export interface ExplanationAction {
  /** Korte titel ("Trim ASML met 1 aandeel"). */
  title: string;
  /** 1-zin uitleg waarom deze actie helpt. */
  rationale: string;
  /** Optionele link naar de relevante app-route. */
  link?: string;
}

/**
 * **Hoofd-output-shape**. Identiek voor alle 6 domeinen.
 *
 * Velden komen 1-op-1 overeen met de spec:
 *  - korte conclusie         → `summary`
 *  - waarom dit belangrijk is → `whyItMatters`
 *  - belangrijkste positieve  → `positives[]`
 *  - belangrijkste risico's   → `risks[]`
 *  - mogelijke acties         → `possibleActions[]`
 *  - onzekerheden / data      → `uncertainties[]`
 *
 * Plus meta-laag:
 *  - `mode`: ai of fallback
 *  - `providerId` / `model`: audit
 *  - `sources[]`: brondata-tracing
 *  - `confidence`: low/medium/high
 *  - `disclaimer`: vast template
 */
export interface DomainExplanation {
  domain: ExplainabilityDomain;
  generatedAt: ISODateString;
  mode: ExplanationMode;
  providerId: string;
  model: string;

  /** 1-zin conclusie. Geen numeriek detail — dat staat in `positives`/`risks`. */
  summary: string;
  /** Waarom dit moment / deze score belangrijk is voor de gebruiker (1–2 zinnen). */
  whyItMatters: string;
  /** 1–4 positieve punten (bullets, 1 zin per stuk). */
  positives: string[];
  /** 1–4 risico's of aandachtspunten. */
  risks: string[];
  /** 1–3 mogelijke vervolg-acties — geen advies-imperatief, "overweeg …". */
  possibleActions: ExplanationAction[];
  /** 1–3 onzekerheden / data-beperkingen. */
  uncertainties: string[];

  /** Overall confidence — afgeleid uit input + mode. */
  confidence: ExplanationConfidence;
  /** Brondata-tracing (welke engines/data zijn gebruikt). */
  sources: SourceTrace[];
  /** Standaard disclaimer onderaan. */
  disclaimer: string;
}

/** Standaard-disclaimer (NL). */
export const EXPLAINABILITY_DISCLAIMER =
  "Deze uitleg geeft inzicht op basis van engine-output en (waar beschikbaar) AI-redactie. Geen gegarandeerde voorspelling, geen persoonlijk financieel advies.";

/** Domain-labels (NL) voor UI. */
export const DOMAIN_LABELS: Record<ExplainabilityDomain, string> = {
  portfolio_health: "Portfolio Health",
  investment_confidence: "Investment Confidence",
  macro_regime: "Macroregime",
  behavioral_coach: "Behavioral Coach",
  risk_analysis: "Risico-analyse",
  scenario_analysis: "Scenario-analyse",
};
