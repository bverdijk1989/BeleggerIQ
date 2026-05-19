/**
 * Risk Trend & Snapshot History — types (Module 30).
 *
 * Compact tijdreeks-shape voor "hoe is mijn portfolio over tijd
 * veranderd?" — schrijft binnen bestaande `PortfolioSnapshot.metrics`
 * Json onder key `riskTrend` (additief, geen Prisma-migratie).
 *
 * **Privacy/data-minimalisatie**:
 *  - Alleen geaggregeerde scores (0..100) en fracties (0..1)
 *  - Geen ticker-namen, geen bedragen, geen e-mails
 *  - Per snapshot ≤ 200 bytes JSON-payload
 *
 * **Pure**: engine doet alleen delta-berekening + plain-language summary.
 */

import type { ISODateString } from "@/types/common";
import type { RiskTrendSnapshot } from "@/lib/analytics/snapshot";

export type { RiskTrendSnapshot };

/** Eén punt in de timeline. */
export interface RiskTrendPoint {
  /** ISO-datum (truncated naar dag voor charts). */
  date: ISODateString;
  /** Full ISO-timestamp voor sortering. */
  capturedAt: ISODateString;
  snapshot: RiskTrendSnapshot;
}

/** Welke richting wijst een delta op? */
export type TrendDirection = "improving" | "worsening" | "stable" | "unknown";

/** Welke metric. */
export type TrendMetricKey =
  | "healthScore"
  | "riskScore"
  | "concentrationHhi"
  | "largestPositionWeight"
  | "top5Weight"
  | "sectorHhi"
  | "volatility"
  | "maxDrawdown"
  | "foreignCurrencyExposure"
  | "dataDepthScore"
  | "driftAvg"
  | "positionCount";

/** Eén delta-meting (huidig vs vorig). */
export interface TrendDelta {
  key: TrendMetricKey;
  /** UI-label (NL). */
  label: string;
  /** Huidige waarde — schaal hangt af van metric. */
  current: number | null;
  /** Vorige waarde. */
  previous: number | null;
  /** Verandering (current - previous). */
  change: number | null;
  /** Richting na interpretatie van "hoger = beter/slechter". */
  direction: TrendDirection;
  /** Wanneer wordt deze als "significant" beschouwd? */
  significant: boolean;
  /** Hoe formatteer je 'em ("23%" vs "65/100" vs "12 posities"). */
  unit: "percent" | "score" | "fraction" | "count";
  /** Plain-language uitleg (NL). */
  message: string;
}

/** "Wat veranderde sinds vorige snapshot"-samenvatting. */
export interface TrendSummary {
  /** ISO-timestamp van huidige snapshot. */
  currentAt: ISODateString;
  /** ISO-timestamp van vorige snapshot (gebruikt voor vergelijking). */
  previousAt: ISODateString | null;
  /** Periode-omschrijving ("sinds vorige maand"). */
  periodLabel: string;
  /** Globale richting: gemiddelde net verandering. */
  overallDirection: TrendDirection;
  /** Per-metric deltas — sortable op significance. */
  deltas: ReadonlyArray<TrendDelta>;
  /** Top-3 op significance — voor headline-cards. */
  highlights: ReadonlyArray<TrendDelta>;
  /** 2-zin headline (NL spreektaal). */
  headline: string;
  /** Sample-size + caveats. */
  caveats: ReadonlyArray<string>;
}

/** Volledige UI-payload. */
export interface RiskTrendReport {
  generatedAt: ISODateString;
  /** Tijdreeks (chronologisch oplopend). */
  points: ReadonlyArray<RiskTrendPoint>;
  /** Delta-summary tussen meest recente twee. null wanneer < 2 snapshots. */
  summary: TrendSummary | null;
  /** Globale warning bij weinig data. */
  warning: string | null;
  /** Verplichte disclaimer onderaan UI. */
  disclaimer: string;
}

/** UI-labels. */
export const TREND_METRIC_LABELS: Record<TrendMetricKey, string> = {
  healthScore: "Health Score",
  riskScore: "Risico-score",
  concentrationHhi: "Concentratie (HHI)",
  largestPositionWeight: "Grootste positie",
  top5Weight: "Top-5 weging",
  sectorHhi: "Sector-concentratie",
  volatility: "Volatiliteit",
  maxDrawdown: "Max drawdown",
  foreignCurrencyExposure: "Vreemde valuta",
  dataDepthScore: "Datadekking",
  driftAvg: "Drift t.o.v. target",
  positionCount: "Aantal posities",
};

/**
 * Verplichte disclaimer onder rapport.
 */
export const RISK_TREND_DISCLAIMER =
  "Historische trends zijn een spiegel, geen voorspelling. Een verbeterde score betekent niet dat het risico vandaag laag is — het betekent dat het ten opzichte van eerder lager lijkt. Gebruik deze timeline om patronen in je eigen gedrag en portefeuille te herkennen, niet als koop/verkoop-advies.";
