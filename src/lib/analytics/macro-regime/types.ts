/**
 * Macro Regime Engine — types.
 *
 * **Filosofie (Dalio-laag)**: classificeer de wereldeconomie langs 2
 * dominante assen — groei en inflatie — naar 4 quadranten plus een
 * "transitional" state. Daarbovenop 5 ondersteunende indicatoren (rente,
 * liquiditeit, recessierisico, volatiliteit, sentiment) die de classificatie
 * bevestigen of verzwakken (de confidence-laag).
 *
 * **Bewust simpel (Buffett-laag)**: 7 indicators, 4–5 regimes, één tabel
 * met asset-class-impact. Geen 50-factor model. Een belegger moet in 30
 * seconden snappen "waar staan we, wat past daarbij".
 *
 * **Reproduceerbaar (Simons-laag)**: alle drempels en quadrant-mappings
 * zijn `const` in code. Dezelfde input → identieke output.
 *
 * **Eenvoudig taalgebruik (Lynch-laag)**: NL-narrative en asset-tips
 * gebruiken concrete getallen + begrijpelijke termen.
 *
 * **Uitbreidbaar (Wood-laag)**: provider-abstractie zodat een toekomstige
 * AI-forecast-bron als drop-in kan worden ingehangen.
 */

import type { ISODateString } from "@/types/common";

// ============================================================
//  Indicator-niveau
// ============================================================

export type MacroIndicatorKey =
  | "growth"
  | "inflation"
  | "rates"
  | "liquidity"
  | "recession_risk"
  | "volatility"
  | "sentiment";

/** Trend-richting voor een macro-indicator. */
export type MacroTrend = "rising" | "falling" | "stable" | "unknown";

/**
 * Eén macro-indicator met genormaliseerde waarde + trend + raw-input.
 * `score` is 0..100 (50 = neutraal). Voor sommige indicators (recession-risk)
 * is hoog = slecht; de classifier gebruikt richting, niet alleen score.
 */
export interface MacroIndicator {
  key: MacroIndicatorKey;
  label: string;
  /** Trend over recente periode. */
  trend: MacroTrend;
  /** 0..100 score — semantiek per indicator (zie comment in classifier). */
  score: number | null;
  /** Ruwe waarde voor display (bv. 2.5 voor "2.5% YoY"). */
  rawValue: number | null;
  rawUnit?: string;
  /** Vertel de gebruiker wat we hier zien — 1 zin NL. */
  rationale: string;
  /** 0..1 — hoe betrouwbaar is deze meetwaarde. */
  confidence: number;
  asOf: ISODateString;
  source: string;
}

// ============================================================
//  Regime-classificatie
// ============================================================

/**
 * 5 macro-regimes — 4 Dalio-quadranten + transitional.
 *
 *   GOLDILOCKS  — groei stijgt, inflatie daalt: equities + growth.
 *   REFLATION   — groei stijgt, inflatie stijgt: cyclicals + commodities.
 *   STAGFLATION — groei daalt, inflatie stijgt: cash + gold + defensives.
 *   DEFLATION   — groei daalt, inflatie daalt: bonds + quality + defensives.
 *   TRANSITIONAL — onduidelijke fase, indicatoren tegenstrijdig.
 */
export type MacroRegime =
  | "GOLDILOCKS"
  | "REFLATION"
  | "STAGFLATION"
  | "DEFLATION"
  | "TRANSITIONAL";

export interface MacroRegimeClassification {
  asOf: ISODateString;
  regime: MacroRegime;
  /** 0..1 — fractie van actieve indicators die het regime bevestigt. */
  confidence: number;
  /** 1-zin NL-uitleg waarom (Lynch-laag). */
  narrative: string;
  /** 7 indicators, in canonical volgorde. */
  indicators: MacroIndicator[];
  /** Welke indicators dit regime ondersteunen. */
  supportingIndicators: MacroIndicatorKey[];
  /** Welke indicators tegenwerken (transitional-signaal). */
  conflictingIndicators: MacroIndicatorKey[];
}

// ============================================================
//  Asset-class impact
// ============================================================

export type AssetClassKey =
  | "EQUITY_GROWTH"
  | "EQUITY_VALUE"
  | "EQUITY_DEFENSIVE"
  | "EQUITY_CYCLICAL"
  | "BOND_GOVERNMENT"
  | "BOND_CORPORATE"
  | "GOLD"
  | "COMMODITIES"
  | "CASH"
  | "REAL_ESTATE";

export type ImpactDirection = "tailwind" | "headwind" | "neutral";

export interface AssetClassImpact {
  assetClass: AssetClassKey;
  label: string;
  direction: ImpactDirection;
  /** 0..1 — sterkte van de tail-/headwind. */
  magnitude: number;
  /** Korte NL-uitleg. */
  rationale: string;
}

export interface AssetClassMapping {
  regime: MacroRegime;
  impacts: AssetClassImpact[];
}

// ============================================================
//  Portfolio-impact
// ============================================================

/**
 * Per portfolio-bucket: hoe verhoudt de huidige weging zich tot wat het
 * regime gunstig zou doen? `gap` is het "advies-gat" t.o.v. een
 * regime-vriendelijke baseline.
 */
export interface PortfolioBucketImpact {
  assetClass: AssetClassKey;
  label: string;
  /** Huidige weging in user-portfolio 0..1. */
  currentWeight: number;
  /** Indicatieve regime-vriendelijke baseline 0..1 (geen advies). */
  regimeBaseline: number;
  /** currentWeight − regimeBaseline. */
  gap: number;
  direction: ImpactDirection;
  rationale: string;
}

export interface PortfolioMacroImpact {
  regime: MacroRegime;
  /** Eén regel: "Je portefeuille zit zwaar in cyclische groei …". */
  summary: string;
  /** 0..100 alignment-score: hoe goed past de portefeuille bij dit regime? */
  alignmentScore: number;
  /** 4 buckets met grootste afwijkingen, voor de UI. */
  topGaps: PortfolioBucketImpact[];
  /** Lijst van losse impacts (alle buckets). */
  buckets: PortfolioBucketImpact[];
}

// ============================================================
//  Engine output
// ============================================================

export interface MacroRegimeReport {
  classification: MacroRegimeClassification;
  assetMapping: AssetClassMapping;
  portfolioImpact: PortfolioMacroImpact | null;
}

// ============================================================
//  Labels (NL)
// ============================================================

export const MACRO_INDICATOR_LABELS: Record<MacroIndicatorKey, string> = {
  growth: "Groei",
  inflation: "Inflatie",
  rates: "Renteomgeving",
  liquidity: "Liquiditeit",
  recession_risk: "Recessierisico",
  volatility: "Volatiliteit",
  sentiment: "Risk-on / Risk-off",
};

export const MACRO_REGIME_LABELS: Record<MacroRegime, string> = {
  GOLDILOCKS: "Goldilocks",
  REFLATION: "Reflation",
  STAGFLATION: "Stagflation",
  DEFLATION: "Deflation",
  TRANSITIONAL: "Transitioneel",
};

export const MACRO_REGIME_DESCRIPTIONS: Record<MacroRegime, string> = {
  GOLDILOCKS:
    "Groei stijgt, inflatie onder controle. Markten belonen winstgroei en growth-aandelen.",
  REFLATION:
    "Groei + inflatie stijgen. Cyclische sectoren en grondstoffen krijgen rugwind.",
  STAGFLATION:
    "Groei daalt terwijl inflatie hardnekkig hoog blijft. Defensieve assets en cash zijn relatief sterk.",
  DEFLATION:
    "Groei daalt en inflatie daalt mee. Lange-rente-obligaties en defensieve quality-namen leiden.",
  TRANSITIONAL:
    "Indicatoren wijzen tegenstrijdige kanten op — markt zoekt richting.",
};

export const ASSET_CLASS_LABELS: Record<AssetClassKey, string> = {
  EQUITY_GROWTH: "Groei-aandelen",
  EQUITY_VALUE: "Value-aandelen",
  EQUITY_DEFENSIVE: "Defensieve aandelen",
  EQUITY_CYCLICAL: "Cyclische aandelen",
  BOND_GOVERNMENT: "Staatsobligaties",
  BOND_CORPORATE: "Bedrijfsobligaties",
  GOLD: "Goud",
  COMMODITIES: "Grondstoffen",
  CASH: "Cash",
  REAL_ESTATE: "Vastgoed",
};
