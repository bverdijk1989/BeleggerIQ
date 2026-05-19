/**
 * Cross-Asset Correlation Studio — pure-function engine (Module 28).
 *
 * Neemt return-series per asset en bouwt een paarsgewijze
 * correlation-matrix + diversificatie-score + insight-extractie.
 *
 * **Pure**: geen I/O, geen Date.now buiten orchestrator. Deterministisch.
 *
 * **Statistiek**:
 *  - Pearson correlation (geannualizeerd niet relevant — we vergelijken
 *    co-movement, geen absolute returns)
 *  - Min-overlap 30 trading days (= ~6 weken) — onder dit aantal returnt
 *    de cell `null` en wordt asset uitgesloten van score
 */

import type { ISODateString } from "@/types/common";

import {
  CORRELATION_DISCLAIMER,
  HIGHLY_CORRELATED_THRESHOLD,
  MIN_SAMPLE_TRADING_DAYS,
  MODERATE_CORRELATED_THRESHOLD,
  NEGATIVE_CORRELATED_THRESHOLD,
  UNCORRELATED_BAND,
  type CorrelationAsset,
  type CorrelationCell,
  type CorrelationInsight,
  type CorrelationInsightKind,
  type CorrelationReport,
} from "./types";

export interface BuildCorrelationReportInput {
  generatedAt: ISODateString;
  lookbackTradingDays: number;
  /** Per asset: array van daily-returns (al berekend door loader). */
  assets: ReadonlyArray<{
    asset: CorrelationAsset;
    /** Daily-returns in chronologische volgorde. Lege array = niet meenemen. */
    dailyReturns: ReadonlyArray<number>;
    /** Datums per return (ISO) — gebruikt voor alignment. */
    dates: ReadonlyArray<ISODateString>;
  }>;
}

/**
 * Hoofd-aggregator.
 */
export function buildCorrelationReport(
  input: BuildCorrelationReportInput,
): CorrelationReport {
  // Filter assets met te weinig data direct uit.
  const filtered = input.assets.filter(
    (a) => a.dailyReturns.length >= MIN_SAMPLE_TRADING_DAYS,
  );
  const assets = filtered.map((a) => a.asset);

  if (assets.length < 2) {
    return emptyReport(input);
  }

  // Bouw alignment-map: per asset, datum → return.
  const indexByDate = filtered.map((a) => {
    const map = new Map<string, number>();
    for (let k = 0; k < a.dailyReturns.length; k++) {
      map.set(a.dates[k]!, a.dailyReturns[k]!);
    }
    return map;
  });

  const cells: CorrelationCell[] = [];
  const pairCorrs: number[] = [];

  for (let i = 0; i < filtered.length; i++) {
    for (let j = i + 1; j < filtered.length; j++) {
      const aligned = alignReturns(indexByDate[i]!, indexByDate[j]!);
      const c = aligned.length >= MIN_SAMPLE_TRADING_DAYS
        ? pearson(aligned.xs, aligned.ys)
        : null;
      cells.push({
        i,
        j,
        correlation: c,
        sampleSize: aligned.length,
      });
      if (c !== null) pairCorrs.push(c);
    }
  }

  const diversificationScore = computeDiversificationScore(pairCorrs);
  const diversificationVerdict = verdictFromScore(diversificationScore);
  const insights = extractInsights(assets, cells);

  const warning =
    pairCorrs.length === 0
      ? "Te weinig overlap tussen assets voor robuste correlatie-analyse."
      : pairCorrs.length < 5
        ? `Slechts ${pairCorrs.length} bruikbare correlatie-paren — interpreteer met voorzichtigheid.`
        : null;

  return {
    generatedAt: input.generatedAt,
    lookbackTradingDays: input.lookbackTradingDays,
    assets,
    cells,
    diversificationScore,
    diversificationVerdict,
    insights,
    warning,
    disclaimer: CORRELATION_DISCLAIMER,
  };
}

function emptyReport(input: BuildCorrelationReportInput): CorrelationReport {
  return {
    generatedAt: input.generatedAt,
    lookbackTradingDays: input.lookbackTradingDays,
    assets: [],
    cells: [],
    diversificationScore: 0,
    diversificationVerdict: "geconcentreerd",
    insights: [],
    warning:
      "Onvoldoende assets met genoeg history (minimaal 30 trading days vereist).",
    disclaimer: CORRELATION_DISCLAIMER,
  };
}

// ============================================================
//  Math helpers (pure)
// ============================================================

function alignReturns(
  a: Map<string, number>,
  b: Map<string, number>,
): { xs: number[]; ys: number[]; length: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [date, x] of a.entries()) {
    const y = b.get(date);
    if (y !== undefined && Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  }
  return { xs, ys, length: xs.length };
}

/** Pearson correlation. Returnt null bij <2 obs of nul-variantie. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n !== ys.length || n < 2) return null;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0,
    sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i]!;
    sumY += ys[i]!;
    sumXY += xs[i]! * ys[i]!;
    sumX2 += xs[i]! * xs[i]!;
    sumY2 += ys[i]! * ys[i]!;
  }
  const num = n * sumXY - sumX * sumY;
  const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (!Number.isFinite(denom) || denom === 0) return null;
  const r = num / denom;
  // Clamp aan [-1, 1] voor numerieke veiligheid.
  return Math.max(-1, Math.min(1, Math.round(r * 10000) / 10000));
}

/**
 * Diversification-score: 100 - (avg |correlation| × 100). Gebruikt
 * absolute waarde zodat zowel hoge positieve als hoge negatieve
 * correlaties (= sterk verbonden) de score verlagen.
 *
 * Wait — negatieve correlatie is JUIST diversifiërend. Beter:
 * gebruik raw correlation (niet abs). avg(cor) → score = (1 - avg) × 50
 * zodat:
 *  - avg = 1 (perfect gecorreleerd) → 0
 *  - avg = 0 (uncorrelated) → 50
 *  - avg = -1 (perfect hedged) → 100
 *
 * Maar veel correlaties zijn licht-positief in equity markten;
 * realistisch: avg = 0.4 → 30. We schalen iets agressiever:
 *   score = round((1 - avg) × 100 / 1.5) → bereik 0..100 met clip
 *   avg = 1 → 0
 *   avg = 0.5 → 33
 *   avg = 0 → 67
 *   avg = -0.5 → 100 (clip)
 */
function computeDiversificationScore(pairCorrs: number[]): number {
  if (pairCorrs.length === 0) return 0;
  const avg =
    pairCorrs.reduce((sum, c) => sum + c, 0) / pairCorrs.length;
  const raw = ((1 - avg) * 100) / 1.5;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function verdictFromScore(
  score: number,
): "uitstekend" | "goed" | "matig" | "geconcentreerd" {
  if (score >= 70) return "uitstekend";
  if (score >= 50) return "goed";
  if (score >= 30) return "matig";
  return "geconcentreerd";
}

// ============================================================
//  Insight extraction
// ============================================================

export function classifyPair(correlation: number): CorrelationInsightKind {
  if (correlation >= HIGHLY_CORRELATED_THRESHOLD) return "highly_correlated";
  if (correlation >= MODERATE_CORRELATED_THRESHOLD)
    return "moderately_correlated";
  if (correlation <= NEGATIVE_CORRELATED_THRESHOLD)
    return "negatively_correlated";
  if (Math.abs(correlation) < UNCORRELATED_BAND)
    return "uncorrelated_diversifier";
  return "moderately_correlated";
}

function extractInsights(
  assets: ReadonlyArray<CorrelationAsset>,
  cells: ReadonlyArray<CorrelationCell>,
): CorrelationInsight[] {
  const interesting: CorrelationInsight[] = [];

  for (const cell of cells) {
    if (cell.correlation === null) continue;
    const a = assets[cell.i];
    const b = assets[cell.j];
    if (!a || !b) continue;
    const kind = classifyPair(cell.correlation);
    // Alleen interessante kinds in insight-lijst (matige correlatie filteren).
    if (kind === "moderately_correlated") continue;
    interesting.push({
      kind,
      pairLabel: `${a.name} × ${b.name}`,
      tickerA: a.ticker,
      tickerB: b.ticker,
      correlation: cell.correlation,
      rationale: buildRationale(kind, a, b, cell.correlation),
    });
  }

  // Sort op |correlation| descending — sterkste signalen eerst.
  interesting.sort(
    (x, y) => Math.abs(y.correlation) - Math.abs(x.correlation),
  );
  // Cap op 10.
  return interesting.slice(0, 10);
}

function buildRationale(
  kind: CorrelationInsightKind,
  a: CorrelationAsset,
  b: CorrelationAsset,
  cor: number,
): string {
  const pct = Math.round(cor * 100);
  switch (kind) {
    case "highly_correlated":
      return `Bewegen vrijwel synchroon (correlatie ${pct}%) — beide samen geven beperkte extra diversificatie.`;
    case "negatively_correlated":
      return `Negatieve correlatie (${pct}%) — historisch hedge-effect, kan helpen bij stress-scenarios.`;
    case "uncorrelated_diversifier":
      return `Vrijwel onafhankelijk (correlatie ${pct}%) — sterke diversifier.`;
    case "moderately_correlated":
      return `Matig gecorreleerd (${pct}%).`;
  }
}
