/**
 * Risk Trend — pure-function delta-engine (Module 30).
 *
 * Neemt geordende `RiskTrendPoint[]` en produceert een `TrendSummary`:
 *  - Per metric: current vs previous + change + direction (improving /
 *    worsening / stable / unknown)
 *  - Top-3 highlights op significance
 *  - Plain-language headline + caveats
 *
 * **Geen overfit-magie**: significance is een vaste drempel per
 * metric (≥ 5%-punt verandering voor scores, ≥ 0.05 voor fracties).
 * Geen statistische test, geen p-value claims.
 */

import type { ISODateString } from "@/types/common";

import {
  RISK_TREND_DISCLAIMER,
  TREND_METRIC_LABELS,
  type RiskTrendPoint,
  type RiskTrendReport,
  type RiskTrendSnapshot,
  type TrendDelta,
  type TrendDirection,
  type TrendMetricKey,
  type TrendSummary,
} from "./types";

export interface BuildRiskTrendReportInput {
  generatedAt: ISODateString;
  /** Chronologisch geordende punten (oudste eerst). */
  points: ReadonlyArray<RiskTrendPoint>;
}

/**
 * Hoofd-aggregator.
 */
export function buildRiskTrendReport(
  input: BuildRiskTrendReportInput,
): RiskTrendReport {
  const points = input.points;
  if (points.length === 0) {
    return {
      generatedAt: input.generatedAt,
      points: [],
      summary: null,
      warning:
        "Nog geen historische snapshots. Snapshots worden maandelijks (of bij portfolio-wijziging) automatisch aangemaakt.",
      disclaimer: RISK_TREND_DISCLAIMER,
    };
  }
  if (points.length === 1) {
    return {
      generatedAt: input.generatedAt,
      points,
      summary: null,
      warning:
        "Eén snapshot beschikbaar — minimaal twee zijn nodig voor een trend.",
      disclaimer: RISK_TREND_DISCLAIMER,
    };
  }

  const latest = points[points.length - 1]!;
  const previous = points[points.length - 2]!;
  const summary = buildTrendSummary(latest, previous);

  return {
    generatedAt: input.generatedAt,
    points,
    summary,
    warning:
      points.length < 4
        ? `${points.length} snapshots — interpretatie verbetert vanaf ~6.`
        : null,
    disclaimer: RISK_TREND_DISCLAIMER,
  };
}

// ============================================================
//  Delta computation
// ============================================================

/**
 * Per-metric specificatie: drempel voor "significant" + interpretatie
 * van hoger-is-beter/-slechter.
 *
 * `improvementSign`:
 *   +1 = hoger is beter (bv. healthScore, dataDepthScore)
 *   -1 = hoger is slechter (bv. riskScore, concentratie, vola, drawdown)
 *    0 = neutraal/contextueel (bv. positionCount, FX-exposure)
 */
interface MetricSpec {
  unit: TrendDelta["unit"];
  significanceThreshold: number;
  /** +1 = up = beter; -1 = up = slechter; 0 = neutraal. */
  improvementSign: 1 | -1 | 0;
}

const METRIC_SPECS: Record<TrendMetricKey, MetricSpec> = {
  healthScore: { unit: "score", significanceThreshold: 5, improvementSign: 1 },
  riskScore: { unit: "score", significanceThreshold: 5, improvementSign: -1 },
  concentrationHhi: {
    unit: "fraction",
    significanceThreshold: 0.03,
    improvementSign: -1,
  },
  largestPositionWeight: {
    unit: "fraction",
    significanceThreshold: 0.03,
    improvementSign: -1,
  },
  top5Weight: {
    unit: "fraction",
    significanceThreshold: 0.05,
    improvementSign: -1,
  },
  sectorHhi: {
    unit: "fraction",
    significanceThreshold: 0.05,
    improvementSign: -1,
  },
  volatility: {
    unit: "fraction",
    significanceThreshold: 0.03,
    improvementSign: -1,
  },
  maxDrawdown: {
    unit: "fraction",
    significanceThreshold: 0.05,
    improvementSign: 1, // maxDrawdown is negatief; minder negatief = beter
  },
  foreignCurrencyExposure: {
    unit: "fraction",
    significanceThreshold: 0.1,
    improvementSign: 0,
  },
  dataDepthScore: {
    unit: "score",
    significanceThreshold: 5,
    improvementSign: 1,
  },
  driftAvg: {
    unit: "fraction",
    significanceThreshold: 0.03,
    improvementSign: -1,
  },
  positionCount: {
    unit: "count",
    significanceThreshold: 2,
    improvementSign: 0,
  },
};

/**
 * Bouw delta tussen twee snapshots.
 */
export function buildTrendDelta(
  key: TrendMetricKey,
  current: RiskTrendSnapshot,
  previous: RiskTrendSnapshot,
): TrendDelta {
  const cur = readMetric(current, key);
  const prev = readMetric(previous, key);
  const change =
    cur !== null && prev !== null ? cur - prev : null;
  const spec = METRIC_SPECS[key];

  const direction = computeDirection(change, spec);
  const significant =
    change !== null && Math.abs(change) >= spec.significanceThreshold;

  return {
    key,
    label: TREND_METRIC_LABELS[key],
    current: cur,
    previous: prev,
    change,
    direction,
    significant,
    unit: spec.unit,
    message: buildDeltaMessage(key, change, direction, significant, spec),
  };
}

function readMetric(
  snapshot: RiskTrendSnapshot,
  key: TrendMetricKey,
): number | null {
  const v = snapshot[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function computeDirection(
  change: number | null,
  spec: MetricSpec,
): TrendDirection {
  if (change === null) return "unknown";
  if (Math.abs(change) < spec.significanceThreshold / 2) return "stable";
  if (spec.improvementSign === 0) return "stable";
  if (spec.improvementSign === 1) {
    return change > 0 ? "improving" : "worsening";
  }
  // improvementSign === -1
  return change < 0 ? "improving" : "worsening";
}

function buildDeltaMessage(
  key: TrendMetricKey,
  change: number | null,
  direction: TrendDirection,
  significant: boolean,
  spec: MetricSpec,
): string {
  if (change === null) return "Geen vorige meting beschikbaar voor vergelijking.";
  const label = TREND_METRIC_LABELS[key];
  const fmt = formatChange(change, spec.unit);
  if (!significant) {
    return `${label}: nauwelijks veranderd (${fmt}).`;
  }
  switch (direction) {
    case "improving":
      return `${label} verbeterde (${fmt}).`;
    case "worsening":
      return `${label} verslechterde (${fmt}).`;
    case "stable":
      return `${label} bleef stabiel (${fmt}).`;
    case "unknown":
      return `${label}: data ontbreekt.`;
  }
}

function formatChange(change: number, unit: TrendDelta["unit"]): string {
  const sign = change > 0 ? "+" : "";
  switch (unit) {
    case "score":
      return `${sign}${change.toFixed(1)} pt`;
    case "fraction":
      return `${sign}${(change * 100).toFixed(1)}%-punt`;
    case "percent":
      return `${sign}${(change * 100).toFixed(1)}%`;
    case "count":
      return `${sign}${change}`;
  }
}

// ============================================================
//  Summary builder
// ============================================================

function buildTrendSummary(
  latest: RiskTrendPoint,
  previous: RiskTrendPoint,
): TrendSummary {
  const keys: TrendMetricKey[] = [
    "healthScore",
    "riskScore",
    "concentrationHhi",
    "largestPositionWeight",
    "top5Weight",
    "sectorHhi",
    "volatility",
    "maxDrawdown",
    "foreignCurrencyExposure",
    "dataDepthScore",
    "driftAvg",
    "positionCount",
  ];

  const deltas = keys.map((k) =>
    buildTrendDelta(k, latest.snapshot, previous.snapshot),
  );

  // Tel improving vs worsening (significant only).
  let improvingCount = 0;
  let worseningCount = 0;
  for (const d of deltas) {
    if (!d.significant) continue;
    if (d.direction === "improving") improvingCount += 1;
    else if (d.direction === "worsening") worseningCount += 1;
  }

  const overallDirection: TrendDirection =
    improvingCount > worseningCount
      ? "improving"
      : worseningCount > improvingCount
        ? "worsening"
        : "stable";

  // Highlights = significant deltas, sorted by |change-normalized|.
  const significantDeltas = deltas.filter((d) => d.significant);
  const highlights = [...significantDeltas]
    .sort((a, b) => {
      // Normaliseer: scores delen door 100, fracties blijven, counts delen door 5.
      const norm = (delta: TrendDelta): number => {
        if (delta.change === null) return 0;
        if (delta.unit === "score") return Math.abs(delta.change) / 100;
        if (delta.unit === "count") return Math.abs(delta.change) / 5;
        return Math.abs(delta.change);
      };
      return norm(b) - norm(a);
    })
    .slice(0, 3);

  const periodLabel = buildPeriodLabel(latest.capturedAt, previous.capturedAt);
  const headline = buildHeadline({
    overallDirection,
    significantCount: significantDeltas.length,
    periodLabel,
    highlights,
  });
  const caveats = buildCaveats(deltas);

  return {
    currentAt: latest.capturedAt,
    previousAt: previous.capturedAt,
    periodLabel,
    overallDirection,
    deltas,
    highlights,
    headline,
    caveats,
  };
}

function buildPeriodLabel(current: ISODateString, previous: ISODateString): string {
  try {
    const c = new Date(current).getTime();
    const p = new Date(previous).getTime();
    const days = Math.round((c - p) / 86_400_000);
    if (days <= 1) return "sinds gisteren";
    if (days <= 7) return `sinds ${days} dagen geleden`;
    if (days <= 35) return `sinds vorige maand`;
    if (days <= 100) return `sinds ${Math.round(days / 30)} maanden geleden`;
    return `sinds ~${Math.round(days / 30)} maanden`;
  } catch {
    return "sinds vorige snapshot";
  }
}

function buildHeadline(args: {
  overallDirection: TrendDirection;
  significantCount: number;
  periodLabel: string;
  highlights: ReadonlyArray<TrendDelta>;
}): string {
  if (args.significantCount === 0) {
    return `Portefeuille is ${args.periodLabel} nauwelijks veranderd — discipline of geen actie nodig.`;
  }
  const trend =
    args.overallDirection === "improving"
      ? "verbetert"
      : args.overallDirection === "worsening"
        ? "verslechtert"
        : "wisselt";
  const top = args.highlights[0];
  if (top) {
    return `Portefeuille ${trend} ${args.periodLabel}. Grootste verandering: ${top.label.toLowerCase()}.`;
  }
  return `Portefeuille ${trend} ${args.periodLabel}.`;
}

function buildCaveats(deltas: ReadonlyArray<TrendDelta>): string[] {
  const out: string[] = [];
  const missingCount = deltas.filter((d) => d.change === null).length;
  if (missingCount >= 4) {
    out.push(
      `${missingCount} metrics ontbreken in vergelijking — datadekking is incompleet over de periode.`,
    );
  }
  // Drawdown daling kan misleidend zijn (data-window short)
  const dd = deltas.find((d) => d.key === "maxDrawdown");
  if (dd?.significant && dd.direction === "improving") {
    out.push(
      "Drawdown-verbetering kan komen door korter window of geen recente crash — geen garantie voor toekomst.",
    );
  }
  return out;
}
