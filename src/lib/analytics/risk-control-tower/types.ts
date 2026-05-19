/**
 * Risk Control Tower — types (Module 29).
 *
 * **Doel**: aggregeer alle belangrijke portefeuillerisico's in één
 * geconsolideerd overzicht. 12 categorieën, elk met severity + score
 * + uitleg + suggestie.
 *
 * **Filosofie — geen rewrite**:
 *  - Bestaande engines (risk/health/stress/behavioral/crypto/macro/
 *    data-depth) blijven onaangetast — Control Tower is een
 *    aggregator-laag die deze bronnen leest.
 *  - Pure-function engine; loader doet alle I/O.
 *  - Severity-model: groen/oranje/rood/grijs. Grijs = "geen data".
 *
 * **Buffett-laag**: één overzicht, geen 12 losse pagina's; eenvoud.
 * **Dalio-laag**: risico expliciet per as; geen verstopte exposure.
 * **Risicoanalist-laag**: action-suggestions zijn aandachtspunten,
 *  geen orders ("overweeg", "controleer" — nooit "verkoop X").
 */

import type { ISODateString } from "@/types/common";

/**
 * 12 risicocategorieën — stable keys (audit + i18n koppelen hieraan).
 * Wijzig nooit; voeg alleen toe.
 */
export type RiskCategoryKey =
  | "concentration"
  | "sector"
  | "region"
  | "currency"
  | "interest_rate"
  | "macro_regime"
  | "drawdown"
  | "volatility"
  | "liquidity"
  | "data_quality"
  | "crypto_speculation"
  | "behavioral";

/**
 * 4-tier severity. **Grijs** is bewust apart van groen — wil zeggen
 * "we hebben geen data" i.p.v. "het is veilig".
 */
export type RiskSeverityTone = "green" | "orange" | "red" | "gray";

/**
 * Eén risicocategorie in de Control Tower.
 */
export interface RiskCategoryReport {
  key: RiskCategoryKey;
  /** NL UI-label. */
  label: string;
  /** Severity-tone — bepaalt UI-kleur. */
  severity: RiskSeverityTone;
  /** 0..100, hoger = meer risico. `null` wanneer severity = "gray". */
  score: number | null;
  /** Hoofdmetric als display-string ("18.4% volatiliteit", "ASML 27%"). */
  headlineMetric: string;
  /** Plain-language uitleg in NL (1 zin). */
  explanation: string;
  /** Concrete maar voorzichtige suggestie ("overweeg", "controleer"). */
  actionSuggestion: string;
  /** Welke bron-engine de input leverde (audit/traceability). */
  source: string;
  /** Optionele numerieke meet-waarde voor sortering en CSV-export. */
  metric: number | null;
  /** Optionele drempel waarboven de severity escaleert. */
  threshold: number | null;
}

/**
 * Risk-budget concept: hoeveel "risico-punten" gebruikt de portefeuille
 * van het maximum dat past bij het risicoprofiel.
 *
 *  - `used` = som van severity-scores per categorie (alleen wanneer
 *    severity !== "gray"). Range 0..maxBudget.
 *  - `maxBudget` = aantal categorieën met data × 100.
 *  - `headroom` = maxBudget - used.
 *  - `tone` afgeleid van utilisatie:
 *      < 40% → "green"  ruime headroom
 *      40-70% → "orange" gemiddeld
 *      > 70% → "red"     krap of overschreden
 */
export interface RiskBudget {
  used: number;
  maxBudget: number;
  /** 0..1 — utilisatie t.o.v. max. */
  utilization: number;
  tone: RiskSeverityTone;
  /** 1-zin plain-language samenvatting. */
  summary: string;
}

/** Volledig Control Tower rapport. */
export interface RiskControlTowerReport {
  generatedAt: ISODateString;
  /** Per-categorie rapport. */
  categories: ReadonlyArray<RiskCategoryReport>;
  /** Risk-budget aggregaat. */
  budget: RiskBudget;
  /** Aantal categorieën per tone — voor de top-summary. */
  counts: Record<RiskSeverityTone, number>;
  /** Headline voor de top-card. */
  headline: string;
  /** Verplichte disclaimer onderaan UI. */
  disclaimer: string;
}

// ============================================================
//  UI-labels
// ============================================================

export const RISK_CATEGORY_LABELS: Record<RiskCategoryKey, string> = {
  concentration: "Concentratierisico",
  sector: "Sectorrisico",
  region: "Regiorisico",
  currency: "Valutarisico",
  interest_rate: "Rentegevoeligheid",
  macro_regime: "Macroregime-kwetsbaarheid",
  drawdown: "Drawdown-at-risk",
  volatility: "Volatiliteit",
  liquidity: "Liquiditeitsrisico",
  data_quality: "Datakwaliteit",
  crypto_speculation: "Crypto/speculatie",
  behavioral: "Behavioral risk",
};

export const SEVERITY_LABELS: Record<RiskSeverityTone, string> = {
  green: "Laag",
  orange: "Verhoogd",
  red: "Hoog",
  gray: "Onbekend",
};

/**
 * Verplichte disclaimer onder rapport.
 */
export const RISK_CONTROL_TOWER_DISCLAIMER =
  "Het Risk Control Tower toont aandachtspunten op basis van je huidige posities. Het is geen koop/verkoop-advies. Geen enkele risico-meting voorspelt het volgende crisis-scenario — gebruik dit overzicht om gericht voorbereid te zijn, niet om je veilig te voelen.";
