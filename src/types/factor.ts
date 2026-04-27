import type { Currency, ISODateString } from "./common";

/**
 * Factor-taxonomie. Houd deze set opzettelijk klein en uitbreidbaar:
 * de eerste vier zijn vereist voor elke scorende holding, de rest is
 * optioneel (afhankelijk van beschikbare data).
 */
export type FactorKey =
  | "value"
  | "quality"
  | "momentum"
  | "lowVol"
  | "growth"
  | "dividend"
  | "size";

/**
 * Sub-scores per factor, genormaliseerd naar het bereik 0..100
 * (0 = ongunstig, 50 = neutraal / onvoldoende data, 100 = zeer gunstig).
 * Voor `lowVol` en andere "penalty"-achtige factoren geldt: hogere score =
 * lager risico.
 * Optionele velden mogen ontbreken als de data er (nog) niet is.
 */
export interface FactorSubScores {
  value: number;
  quality: number;
  momentum: number;
  lowVol: number;
  growth?: number;
  dividend?: number;
  size?: number;
}

/**
 * Korte Nederlandstalige toelichtingen per factor, bedoeld voor UI-tooltips
 * en explainability. Elke array bevat nul of meer zinnen; de composite
 * rationale vat de belangrijkste drivers samen.
 */
export interface FactorRationales {
  quality: string[];
  value: string[];
  momentum: string[];
  lowVol: string[];
  composite?: string[];
}

/**
 * Gewichten voor de composiet-score. Som hoeft niet per se 1 te zijn;
 * de engine normaliseert binnen de relevante sub-scores.
 */
export interface FactorWeights {
  value: number;
  quality: number;
  momentum: number;
  lowVol: number;
  growth?: number;
  dividend?: number;
  size?: number;
}

/**
 * Eindresultaat van de factor scoring per ticker.
 * `composite` is de gewogen combinatie van sub-scores, genormaliseerd naar 0..100.
 * `percentile` plaatst de ticker cross-sectioneel binnen zijn universe (0..1).
 *
 * **`kind`-discriminator** vertelt downstream code (UI, business-quality
 * layer, action-engine) of de scores afkomstig zijn van een aandeel
 * (`STOCK` — quality/value/momentum/risk uit fundamentals) of een
 * ETF (`ETF` — cost/scale/track-record/fit uit fund-metadata). De
 * sub-score-shape blijft hetzelfde voor backwards-compat; de semantiek
 * verandert per kind. Rationales en `etfBreakdown` maken duidelijk
 * welke betekenis de scores in deze ticker hebben.
 */
export type FactorScoreKind = "STOCK" | "ETF";

export interface EtfFactorBreakdown {
  /** Kosten-efficiëntie 0..100 (lage TER = hoog). */
  cost: number;
  /** Schaal/liquiditeit 0..100 (groot AUM = hoog). */
  scale: number;
  /** Track-record 0..100 (oudere fonds + lagere tracking-error = hoog). */
  trackRecord: number;
  /** Pasvorm met user-objective + region/sector-fit 0..100. */
  fit: number;
}

export interface FactorScore {
  ticker: string;
  asOf: ISODateString;
  subScores: FactorSubScores;
  composite: number;
  percentile?: number;
  confidence?: number;
  model?: string;
  /** Gewichten waarmee de composite is opgebouwd (nuttig voor explainability). */
  weights?: FactorWeights;
  /** Korte redenen waarom (sub-)scores hoog of laag zijn. */
  rationales?: FactorRationales;
  /**
   * Welke engine produceerde deze score? Default `"STOCK"` voor
   * backwards-compat. ETF-scores krijgen `"ETF"` en een gevuld
   * `etfBreakdown`-blok zodat de UI ETF-relevante labels kan tonen.
   */
  kind?: FactorScoreKind;
  /** Alleen gevuld wanneer `kind = "ETF"`. */
  etfBreakdown?: EtfFactorBreakdown;
}

/**
 * Platte snapshot van fundamentals die als input dienen voor de scoring engine.
 * Ratio's zijn fracties (bv. 0.18 voor 18% ROIC), geen percentages.
 */
export interface FundamentalsSnapshot {
  ticker: string;
  asOf: ISODateString;
  currency: Currency;

  marketCap?: number;
  enterpriseValue?: number;

  // Waarderingsratio's
  pe?: number;
  forwardPe?: number;
  pb?: number;
  ps?: number;
  evEbitda?: number;
  evSales?: number;
  fcfYield?: number;

  // Kwaliteit / winstgevendheid
  roic?: number;
  roe?: number;
  roa?: number;
  grossMargin?: number;
  operatingMargin?: number;
  netMargin?: number;
  debtToEquity?: number;
  interestCoverage?: number;

  // Dividend
  dividendYield?: number;
  payoutRatio?: number;
  dividendGrowth5y?: number;

  // Groei
  revenueGrowth5y?: number;
  epsGrowth5y?: number;
  revenueGrowthTtm?: number;
  epsGrowthTtm?: number;

  source?: string;
}
