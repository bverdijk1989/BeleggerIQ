/**
 * Stock Story & Investment Case Layer — types (Module 31).
 *
 * Per asset 8 sub-cards in eenvoudige NL-taal — wat doet het, waarom
 * interessant, sterke punten, risico's, signalen om te volgen, fit met
 * portfolio, ontbrekende data, conclusie.
 *
 * **Filosofie**:
 *  - Buffett: helder, eenvoudig — geen jargon zonder uitleg
 *  - Lynch: een gewone belegger moet 'em snappen
 *  - Simons: alle "facts" komen uit harde inputs (fundamentals, classification);
 *    geen verzonnen bedrijfsfeiten
 *  - Wood: AI-prompt-template ligt klaar voor v2, maar v1 is deterministic
 *    zodat het werkt zonder API-key
 *
 * **Privacy/data-grounding**:
 *  - Bij ontbrekende data → expliciete "ontbreekt"-markering
 *  - Geen koop/verkoop-advies in suggesties
 *  - "Mogelijk", "lijkt", "let op" — hedged taal
 *  - Datakwaliteit (M26 data-depth) wordt gerendert naast elke card
 */

import type { ISODateString } from "@/types/common";

import type {
  AssetDataDepth,
} from "@/lib/analytics/data-depth";

/** Welke kind asset is het? Voor verschillende tonen per card. */
export type InvestmentCaseAssetKind =
  | "single_stock"
  | "broad_market_etf"
  | "income_etf"
  | "thematic_etf"
  | "bond"
  | "commodity"
  | "crypto"
  | "unknown";

/** 8 vaste sub-cards uit spec. */
export type InvestmentCaseCardKey =
  | "what_it_does"
  | "why_interesting"
  | "strengths"
  | "risks"
  | "signals_to_watch"
  | "portfolio_fit"
  | "missing_data"
  | "conclusion";

/**
 * Eén sub-card: titel + body (max 1-3 zinnen of bullet-list).
 */
export interface InvestmentCaseCard {
  key: InvestmentCaseCardKey;
  /** UI-label NL. */
  label: string;
  /** Hoofdtekst — plain-language, geen markdown. */
  body: string;
  /** Optionele bullets (voor strengths/risks/signals/missing_data). */
  bullets: ReadonlyArray<string>;
  /** Quality-flag: solid (data dekt) / partial (sommige data ontbreekt) /
   *  missing (te weinig data om iets zinvols te zeggen). */
  quality: "solid" | "partial" | "missing";
  /** Welke engine de input leverde — voor audit/trace. */
  source: string;
}

/**
 * Volledig investment-case-rapport voor één asset.
 */
export interface InvestmentCase {
  ticker: string;
  /** Display-naam (uit valuation/enrichment) — null wanneer onbekend. */
  name: string | null;
  /** Welke asset-kind (single-stock vs ETF vs crypto). */
  assetKind: InvestmentCaseAssetKind;
  generatedAt: ISODateString;
  /** 8 cards in vaste volgorde. */
  cards: ReadonlyArray<InvestmentCaseCard>;
  /** Data-depth attribution (M26) — wordt naast cards getoond. */
  dataDepth: AssetDataDepth | null;
  /** Generatie-mode: deterministic v1, ai v2. */
  mode: "deterministic" | "ai";
  /** Verplichte disclaimer. */
  disclaimer: string;
}

/** Labels per card (NL UI). */
export const CARD_LABELS: Record<InvestmentCaseCardKey, string> = {
  what_it_does: "Wat doet dit?",
  why_interesting: "Waarom kan dit interessant zijn?",
  strengths: "Sterke punten",
  risks: "Belangrijkste risico's",
  signals_to_watch: "Signalen om te volgen",
  portfolio_fit: "Past dit bij mijn portefeuille?",
  missing_data: "Welke data ontbreekt?",
  conclusion: "Korte conclusie",
};

/** Vaste volgorde — UI rendert in deze sequence. */
export const CARD_ORDER: ReadonlyArray<InvestmentCaseCardKey> = [
  "what_it_does",
  "why_interesting",
  "strengths",
  "risks",
  "signals_to_watch",
  "portfolio_fit",
  "missing_data",
  "conclusion",
];

/** Verplichte disclaimer onder rapport. */
export const INVESTMENT_CASE_DISCLAIMER =
  "Dit overzicht is een samenvatting van publieke data en factor-scores. Het is geen koopadvies, geen aanbeveling en geen voorspelling. Onze beschrijving van het bedrijf/fonds komt uit classificatie en metadata — bij ontbrekende data zeggen we dat expliciet. Doe eigen onderzoek voor je beleggingsbeslissingen.";
