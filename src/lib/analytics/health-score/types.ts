import type { ISODateString } from "@/types/common";

/**
 * Portfolio Health Score — types.
 *
 * 10-component score (0..100 per component, 0..100 totaal). Elke
 * component is **uitlegbaar**: rationale-string + per-zwakke-component
 * concrete verbeteradviezen.
 *
 * **Niet** een vervanging van `health.ts` — die levert de simpele
 * 4-component basis-score voor de dashboard status-snapshot. Deze
 * engine is de "rijke" versie voor de detail-pagina.
 *
 * Conventies:
 *  - Alle scores zijn **0..100** (consistent met composite-factor-engine).
 *  - Status `low` = de component scoort goed (laag risico).
 *    `moderate`/`high` = aandachtspunten.
 *  - `score` is hoger = beter. Een hoge volatility levert dus een **lage**
 *    score op, niet andersom.
 */

export type HealthComponentKey =
  | "diversification"
  | "sector_concentration"
  | "geographic_concentration"
  | "volatility"
  | "max_drawdown"
  | "cash_buffer"
  | "dividend_quality"
  | "fundamental_quality"
  | "valuation_risk"
  | "macro_sensitivity";

export type HealthComponentStatus = "strong" | "ok" | "weak" | "critical" | "no_data";

export interface HealthComponent {
  key: HealthComponentKey;
  /** Human label voor UI (NL). i18n-vertaling gaat via `t(`health.component.${key}`)`. */
  label: string;
  /** 0..100. Hoger = beter. */
  score: number;
  /** Gewicht in de composite, fractie 0..1. Som van alle weights = 1.0. */
  weight: number;
  /** Bijdrage aan composite (= score × weight). */
  contribution: number;
  /** Status-tier voor UI-tone. */
  status: HealthComponentStatus;
  /** Een-zin uitleg waarom de component zo scoort. */
  rationale: string;
  /** Concrete verbeteradviezen — leeg wanneer status = strong/ok. */
  recommendations: HealthRecommendation[];
  /** Onderliggende metric-waarde (bv. portfolio-volatility 0.28). */
  metricValue?: number | null;
  /** Confidence 0..1 — hoe betrouwbaar is deze meting? Lage data-coverage = lage confidence. */
  confidence: number;
}

export interface HealthRecommendation {
  /** Kort label voor de actie ("Spreid breder", "Bouw cash op"). */
  title: string;
  /** Eén zin uitleg waarom dit helpt. */
  detail: string;
  /** Pad voor diepere actie (bv. "/maandbeslissing", "/transacties"). */
  link?: string;
  /** Verwachte score-impact bij opvolgen — 0..100 punten op de TOTALE score. */
  expectedImpact?: number;
}

export type HealthGrade = "A" | "B" | "C" | "D" | "F";

export type DataQualityTier = "high" | "medium" | "low" | "insufficient";

/**
 * Datakwaliteit-samenvatting — Module 1: 10e expliciete beoordeling.
 * Combineert (1) hoeveel components data hebben, (2) effectief gewicht
 * dat is overgebleven na renormalisatie, en (3) gemiddelde per-component
 * confidence.
 *
 * Pure afgeleide metric — telt NIET mee in `totalScore` (zou dubbele
 * penalty geven omdat per-component confidence al in de
 * weight-renormalisatie zit). De gebruiker ziet dit naast de score als
 * "data-zekerheid: hoog/middel/laag".
 *
 * Tiers:
 *  - `high`         score ≥ 80 — score is stevig onderbouwd
 *  - `medium`       score 55-79 — meeste components actief, OK confidence
 *  - `low`          score 30-54 — meerdere components ontbreken of zwakke confidence
 *  - `insufficient` score < 30 — te weinig data; behandel score met scepsis
 */
export interface PortfolioHealthDataQuality {
  /** 0..100 — combined score uit coverage + confidence. */
  score: number;
  tier: DataQualityTier;
  activeComponents: number;
  totalComponents: number;
  /** activeComponents / totalComponents (0..1). */
  coverageRatio: number;
  /** Gewogen gemiddelde confidence van actieve components (0..1). */
  meanConfidence: number;
  /** Waarschuwingstekst wanneer `low` of `insufficient`; anders null. */
  warning: string | null;
}

export interface PortfolioHealthScore {
  portfolioId: string;
  asOf: ISODateString;
  /** Totaalscore 0..100 — gewogen som van alle components. */
  totalScore: number;
  /** Letter-grade A..F voor at-a-glance reading. */
  grade: HealthGrade;
  /** Confidence van de TOTALE score 0..1 (gewogen gemiddelde van per-component confidence). */
  confidence: number;
  /** Eén-zin uitleg ("Solide spreiding maar hoge sectorconcentratie."). */
  headline: string;
  /** Top-3 verbeteringen, gesorteerd op `expectedImpact` desc. */
  topRecommendations: HealthRecommendation[];
  /** Volledige component-breakdown — voor de detail-pagina. */
  components: HealthComponent[];
  /** Total weight gebruikt — wanneer een component "no_data" is, valt 'em uit en wordt het totaal renormaliseert. */
  effectiveWeight: number;
  /**
   * Datakwaliteit-samenvatting — Module 1 expliciete 10e beoordeling.
   * Afgeleid uit components + confidence + coverage. Geen invloed op
   * `totalScore`; wel voor UI-disclosure.
   */
  dataQuality: PortfolioHealthDataQuality;
}

/**
 * Default-gewichten per component. Som = 1.0 wanneer alle components
 * data-bevestigd zijn. Bij missing data (bv. dividend_quality zonder
 * dividenden) wordt hergewogen over de actieve components.
 *
 * **Gewichten gemotiveerd via 5-lens consensus**:
 *  - Buffett: kwaliteit + spreiding zwaar (15% + 15%)
 *  - Dalio: concentratie + correlatie (sector 10% + macro 10%)
 *  - Simons: data-driven (volatility + drawdown 10% + 10%)
 *  - Lynch: niet zwaar gewogen op één axis — eerlijk verdeeld
 *  - Wood: macro 10% want regime-shifts zijn waar exponentiële kansen
 *    + risico's vandaan komen
 *
 * Aanpassen vereist een PR met 5-lens motivatie.
 */
export const DEFAULT_HEALTH_WEIGHTS: Record<HealthComponentKey, number> = {
  diversification: 0.15,
  sector_concentration: 0.10,
  geographic_concentration: 0.05,
  volatility: 0.10,
  max_drawdown: 0.10,
  cash_buffer: 0.10,
  dividend_quality: 0.05,
  fundamental_quality: 0.15,
  valuation_risk: 0.10,
  macro_sensitivity: 0.10,
};

export const HEALTH_COMPONENT_LABELS: Record<HealthComponentKey, string> = {
  diversification: "Spreiding",
  sector_concentration: "Sectorconcentratie",
  geographic_concentration: "Geografische spreiding",
  volatility: "Volatiliteit",
  max_drawdown: "Maximale drawdown",
  cash_buffer: "Cash-buffer",
  dividend_quality: "Dividendkwaliteit",
  fundamental_quality: "Fundamentele kwaliteit",
  valuation_risk: "Waarderingsrisico",
  macro_sensitivity: "Macro-gevoeligheid",
};

export const HEALTH_COMPONENT_LABELS_EN: Record<HealthComponentKey, string> = {
  diversification: "Diversification",
  sector_concentration: "Sector concentration",
  geographic_concentration: "Geographic spread",
  volatility: "Volatility",
  max_drawdown: "Maximum drawdown",
  cash_buffer: "Cash buffer",
  dividend_quality: "Dividend quality",
  fundamental_quality: "Fundamental quality",
  valuation_risk: "Valuation risk",
  macro_sensitivity: "Macro sensitivity",
};
