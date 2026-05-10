/**
 * Community Intelligence — types & privacy-constants.
 *
 * **Privacy-first**: geen individuele portefeuille is openbaar zonder
 * expliciete opt-in per scope. Aggregatie gebeurt op cohort-niveau met
 * k-anonimiteit (minimum sample-size); gebruikers krijgen pas een
 * vergelijking tegen real-community-data wanneer hun cohort >= K is —
 * tot dan toe vergelijken we tegen een **synthetische baseline** (geijkt
 * op publieke beleggersliteratuur, expliciet als zodanig gelabeld).
 *
 * Topbelegger-laag:
 *  - Buffett: geen hype-casino, geen "kijk wat anderen kopen"-feed.
 *  - Dalio: vergelijking op risico/spreiding ipv rendement-jacht.
 *  - Lynch: één-zin verdict per benchmark — geen dashboards-met-30-getallen.
 *  - Simons: drempels staan in const, k-anonimiteit is hard, output
 *    deterministisch.
 *  - Wood: geaggregeerde data wordt netwerk-effect — meer opt-ins = scherpere
 *    benchmarks zonder privacy-leak.
 */

import type { ISODateString } from "@/types/common";

/**
 * Welke scopes kan de gebruiker opt-in delen? Per scope onafhankelijk
 * — opt-in op een scope geeft *geen* impliciete toestemming voor andere
 * scopes.
 */
export type ConsentScope =
  | "PORTFOLIO_ALLOCATION" // sector + asset-class breakdown (gebucketeerd)
  | "RISK_PROFILE" // beta + volatility + diversification (gebucketeerd)
  | "DIVIDEND_STRATEGY" // yield + payout-concentration (gebucketeerd)
  | "SECTOR_BENCHMARK" // top sectors (anonymized)
  | "PERFORMANCE_BENCHMARK"; // YTD/3y returns (gebucketeerd)

export const CONSENT_SCOPE_ORDER: ReadonlyArray<ConsentScope> = [
  "PORTFOLIO_ALLOCATION",
  "RISK_PROFILE",
  "DIVIDEND_STRATEGY",
  "SECTOR_BENCHMARK",
  "PERFORMANCE_BENCHMARK",
];

export const CONSENT_SCOPE_LABELS: Record<ConsentScope, string> = {
  PORTFOLIO_ALLOCATION: "Asset-class verdeling",
  RISK_PROFILE: "Risicoprofiel",
  DIVIDEND_STRATEGY: "Dividend-strategie",
  SECTOR_BENCHMARK: "Sector-allocatie",
  PERFORMANCE_BENCHMARK: "Rendement (geaggregeerd)",
};

export const CONSENT_SCOPE_DESCRIPTIONS: Record<ConsentScope, string> = {
  PORTFOLIO_ALLOCATION:
    "Gebucketeerde asset-class verdeling (equity/bonds/REIT/cash) — geen tickers.",
  RISK_PROFILE:
    "Gebucketeerde portfolio-beta, volatility en diversificatie-score.",
  DIVIDEND_STRATEGY:
    "Yield-categorie en dividend-concentratie — geen individuele uitkeringen.",
  SECTOR_BENCHMARK:
    "Top-3 sectoren in je portefeuille (zonder gewichten of tickers).",
  PERFORMANCE_BENCHMARK:
    "Rendement-bracket (YTD), niet exact percentage. Gebruikt voor cohort-vergelijking.",
};

/**
 * Per-scope toestemming. Ontbrekende scopes = expliciet niet gegeven
 * (geen fallback naar "ja, je mag dit delen").
 */
export interface CommunityConsent {
  scopes: ReadonlyArray<ConsentScope>;
  /** Wanneer voor het laatst toestemming is geupdated. */
  updatedAt: ISODateString | null;
  /** Versie van de consent-tekst die de gebruiker accepteerde — voor audit. */
  consentTextVersion: number;
}

export const CONSENT_TEXT_VERSION = 1;

/**
 * Cohort-buckets — alleen coarse-grained categorieën om k-anonimiteit
 * mogelijk te maken zonder per-user-fingerprint te creëren.
 */
export type AgeBucket = "<30" | "30-45" | "45-60" | "60+";
export type RiskBucket = "conservative" | "balanced" | "growth" | "aggressive";
export type SizeBucket = "<10k" | "10-50k" | "50-200k" | "200k+";

export const AGE_BUCKETS: ReadonlyArray<AgeBucket> = ["<30", "30-45", "45-60", "60+"];
export const RISK_BUCKETS: ReadonlyArray<RiskBucket> = [
  "conservative",
  "balanced",
  "growth",
  "aggressive",
];
export const SIZE_BUCKETS: ReadonlyArray<SizeBucket> = ["<10k", "10-50k", "50-200k", "200k+"];

/**
 * Deterministische cohort-key (bv. `30-45|balanced|10-50k`). Gebruikt om
 * aggregaten te indexeren. Volgorde van velden is vast.
 */
export type CohortKey = string;

export interface Cohort {
  age: AgeBucket;
  risk: RiskBucket;
  size: SizeBucket;
  key: CohortKey;
}

/**
 * **K-anonimiteit drempel.** Pas wanneer een cohort >= K opt-ins heeft,
 * tonen we de cohort-aggregate als referentie. Beneden deze drempel
 * vallen we terug op de synthetische baseline (geijkt op publieke
 * beleggersliteratuur).
 */
export const K_ANONYMITY_THRESHOLD = 25;

/**
 * Yield-bracket als categorische bucket — vermijdt dat je iemand
 * herleidt aan z'n exacte yield.
 */
export type YieldBucket = "0-1%" | "1-2%" | "2-4%" | "4%+";

export const YIELD_BUCKETS: ReadonlyArray<YieldBucket> = ["0-1%", "1-2%", "2-4%", "4%+"];

/**
 * Performance-bracket (YTD return, gebucketeerd). Geen exacte cijfers
 * — alleen breed bandje.
 */
export type PerformanceBucket = "<-10%" | "-10..0%" | "0..+10%" | "+10..+25%" | "+25%+";

export const PERFORMANCE_BUCKETS: ReadonlyArray<PerformanceBucket> = [
  "<-10%",
  "-10..0%",
  "0..+10%",
  "+10..+25%",
  "+25%+",
];

/**
 * Gebucketeerde payload die de gebruiker (na opt-in) bijdraagt aan de
 * community-aggregaten. **Geen** ticker-lijst, **geen** individueel
 * gewicht, **geen** namen.
 */
export interface ContributorPayload {
  cohort: Cohort;
  /** ISO-datum waarop deze snapshot gegenereerd is. */
  asOf: ISODateString;
  scopes: {
    PORTFOLIO_ALLOCATION?: {
      equityPct: number; // [0,1]
      bondsPct: number;
      cashPct: number;
      altPct: number; // commodity + crypto + REIT + other
    };
    RISK_PROFILE?: {
      beta: number; // gebucketeerd in 0.1-stappen
      volatilityBucket: "low" | "medium" | "high";
      diversificationBucket: "low" | "medium" | "high";
    };
    DIVIDEND_STRATEGY?: {
      yieldBucket: YieldBucket;
      payoutConcentration: "low" | "medium" | "high"; // top-3 concentratie
    };
    SECTOR_BENCHMARK?: {
      /** Top-3 sectoren (sorted, geen gewichten). */
      topSectors: ReadonlyArray<string>;
    };
    PERFORMANCE_BENCHMARK?: {
      ytdBucket: PerformanceBucket;
    };
  };
}

/**
 * Geaggregeerde resultaten voor één cohort + scope. **Nooit** raw rijen
 * van bijdragers — altijd een statistische samenvatting.
 */
export interface CommunityAggregate {
  cohort: Cohort;
  /** Hoeveel opt-ins zitten er achter — getoond aan gebruiker. */
  sampleSize: number;
  /** Wanneer voor het laatst herberekend. */
  computedAt: ISODateString;
  /** Bron-label: real | synthetic-baseline. */
  source: "real" | "synthetic-baseline";
  scopes: {
    PORTFOLIO_ALLOCATION?: {
      equityPct: { p25: number; p50: number; p75: number };
      bondsPct: { p25: number; p50: number; p75: number };
      cashPct: { p25: number; p50: number; p75: number };
      altPct: { p25: number; p50: number; p75: number };
    };
    RISK_PROFILE?: {
      beta: { p25: number; p50: number; p75: number };
      volatilityDistribution: { low: number; medium: number; high: number };
      diversificationDistribution: { low: number; medium: number; high: number };
    };
    DIVIDEND_STRATEGY?: {
      yieldDistribution: Record<YieldBucket, number>;
      payoutConcentrationDistribution: { low: number; medium: number; high: number };
    };
    SECTOR_BENCHMARK?: {
      /** Sector → fraction of cohort that has it in top-3. */
      sectorPopularity: Record<string, number>;
    };
    PERFORMANCE_BENCHMARK?: {
      ytdDistribution: Record<PerformanceBucket, number>;
    };
  };
}

/**
 * Output van de benchmark-engine: per scope een vergelijking.
 */
export interface BenchmarkComparison {
  scope: ConsentScope;
  /** UI-titel NL. */
  label: string;
  /** Sample-size achter de aggregate (transparantie). */
  sampleSize: number;
  /** Bron-label: synthetische baseline of echte cohort. */
  source: "real" | "synthetic-baseline";
  /** Eén-zin verdict in spreektaal (Lynch-laag). */
  verdict: string;
  /** Optionele numerieke "where-am-I"-positie, 0..100 (percentile-style). */
  percentile: number | null;
  /** 1-3 detail-bullets — concrete metric vs cohort. */
  details: ReadonlyArray<string>;
  /** Tone voor UI: positive = beter dan cohort, neutral = vergelijkbaar, attention = afwijkend. */
  tone: "positive" | "neutral" | "attention";
}

export interface CommunityBenchmarkReport {
  generatedAt: ISODateString;
  cohort: Cohort;
  /** Welke scopes geactiveerd waren — er komt geen vergelijking voor scopes zonder opt-in. */
  activeScopes: ReadonlyArray<ConsentScope>;
  /** Per scope een comparison. */
  comparisons: ReadonlyArray<BenchmarkComparison>;
  /** k-anonimiteit + samples-info getoond bovenaan. */
  privacyNotice: string;
  /** Worst (meest afwijkend t.o.v. cohort) — voor coachende kop. */
  attentionPoint: BenchmarkComparison | null;
}

export const COMMUNITY_PRIVACY_NOTICE =
  `Vergelijking gebeurt anoniem op cohort-niveau (leeftijd + risicoprofiel + portfoliogrootte). ` +
  `Cohort-aggregaten worden alleen getoond bij minstens ${K_ANONYMITY_THRESHOLD} bijdragers; ` +
  `daaronder vergelijken we tegen een synthetische baseline. Geen tickers, namen, of exacte ` +
  `bedragen verlaten je portefeuille.`;
