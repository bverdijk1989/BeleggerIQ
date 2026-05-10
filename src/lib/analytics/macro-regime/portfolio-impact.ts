/**
 * Portfolio-impact: gegeven de huidige weging per asset-class én het
 * regime, hoe goed past de portefeuille bij dit klimaat?
 *
 * **Pure functie** — geen DB. Krijgt al-gemapte exposure als input.
 *
 * **Belangrijk**: dit is **geen advies om te kopen/verkopen**. Het is
 * een match-score tussen portefeuille en regime. UI noemt dit expliciet.
 */

import type {
  AssetClassImpact,
  AssetClassKey,
  AssetClassMapping,
  ImpactDirection,
  MacroRegime,
  PortfolioBucketImpact,
  PortfolioMacroImpact,
} from "./types";
import { ASSET_CLASS_LABELS } from "./types";

// ============================================================
//  Regime-vriendelijke baselines
// ============================================================

/**
 * Baseline-weging per asset-class per regime. Dit is **een referentie**
 * (geen aanbeveling) afgeleid uit Dalio All-Weather + bekende
 * scenario-portefeuilles. We tonen 'em zodat gebruikers visueel het
 * "advies-gat" kunnen zien.
 *
 * Som per regime ≤ 1; restant impliciet in CASH.
 */
const BASELINE: Record<MacroRegime, Record<AssetClassKey, number>> = {
  GOLDILOCKS: zeroAndAssign({
    EQUITY_GROWTH: 0.35,
    EQUITY_CYCLICAL: 0.20,
    EQUITY_VALUE: 0.10,
    EQUITY_DEFENSIVE: 0.10,
    BOND_CORPORATE: 0.10,
    BOND_GOVERNMENT: 0.05,
    REAL_ESTATE: 0.05,
    CASH: 0.05,
  }),
  REFLATION: zeroAndAssign({
    EQUITY_VALUE: 0.25,
    EQUITY_CYCLICAL: 0.25,
    COMMODITIES: 0.15,
    REAL_ESTATE: 0.10,
    EQUITY_DEFENSIVE: 0.10,
    GOLD: 0.05,
    CASH: 0.10,
  }),
  STAGFLATION: zeroAndAssign({
    EQUITY_DEFENSIVE: 0.25,
    GOLD: 0.20,
    COMMODITIES: 0.15,
    CASH: 0.20,
    EQUITY_VALUE: 0.10,
    BOND_GOVERNMENT: 0.10,
  }),
  DEFLATION: zeroAndAssign({
    BOND_GOVERNMENT: 0.30,
    EQUITY_DEFENSIVE: 0.25,
    EQUITY_GROWTH: 0.15,
    GOLD: 0.10,
    CASH: 0.15,
    BOND_CORPORATE: 0.05,
  }),
  TRANSITIONAL: zeroAndAssign({
    EQUITY_GROWTH: 0.20,
    EQUITY_VALUE: 0.15,
    EQUITY_DEFENSIVE: 0.15,
    BOND_GOVERNMENT: 0.15,
    GOLD: 0.10,
    CASH: 0.20,
    BOND_CORPORATE: 0.05,
  }),
};

// ============================================================
//  Public API
// ============================================================

export interface ComputePortfolioImpactInput {
  regime: MacroRegime;
  /** Huidige weging per asset-class 0..1. Som hoeft geen 1 te zijn —
   *  niet-toegekende weight wordt impliciet als CASH/onbekend behandeld. */
  weightsByAssetClass: Map<AssetClassKey, number>;
  /** Asset-mapping voor dit regime — bevat per bucket de richting/rationale. */
  assetMapping: AssetClassMapping;
}

export function computePortfolioMacroImpact(
  input: ComputePortfolioImpactInput,
): PortfolioMacroImpact {
  const baseline = BASELINE[input.regime];
  const mappingByKey = new Map(
    input.assetMapping.impacts.map((m) => [m.assetClass, m] as const),
  );

  const buckets: PortfolioBucketImpact[] = [];
  for (const key of Object.keys(baseline) as AssetClassKey[]) {
    const currentWeight = clampWeight(input.weightsByAssetClass.get(key) ?? 0);
    const baselineWeight = baseline[key];
    const gap = currentWeight - baselineWeight;
    const mapping = mappingByKey.get(key);
    buckets.push({
      assetClass: key,
      label: ASSET_CLASS_LABELS[key],
      currentWeight,
      regimeBaseline: baselineWeight,
      gap,
      direction: bucketDirection(mapping, gap),
      rationale: bucketRationale(mapping, gap, currentWeight, baselineWeight),
    });
  }

  // Top-4 grootste afwijkingen — magnitude × richting (tailwind ondergewicht
  // is meer relevant dan een minor over-weight in headwind).
  const topGaps = [...buckets]
    .sort((a, b) => severityScore(b, mappingByKey) - severityScore(a, mappingByKey))
    .slice(0, 4);

  const alignmentScore = computeAlignment(buckets, mappingByKey);
  const summary = buildSummary(input.regime, buckets, mappingByKey);

  return {
    regime: input.regime,
    summary,
    alignmentScore,
    topGaps,
    buckets,
  };
}

// ============================================================
//  Helpers
// ============================================================

function bucketDirection(
  mapping: AssetClassImpact | undefined,
  gap: number,
): ImpactDirection {
  if (!mapping) return "neutral";
  // De UI-richting reflecteert de gap-perspectief:
  //  - Tailwind asset + ondergewicht  → headwind voor portfolio (mist rugwind)
  //  - Tailwind asset + overgewicht   → tailwind voor portfolio (zit goed)
  //  - Headwind asset + ondergewicht  → tailwind voor portfolio (mijdt risico)
  //  - Headwind asset + overgewicht   → headwind voor portfolio (extra exposure)
  if (mapping.direction === "neutral") return "neutral";
  const overweight = gap > 0.02;
  const underweight = gap < -0.02;
  if (mapping.direction === "tailwind") {
    if (overweight) return "tailwind";
    if (underweight) return "headwind";
    return "neutral";
  }
  // headwind asset
  if (overweight) return "headwind";
  if (underweight) return "tailwind";
  return "neutral";
}

function bucketRationale(
  mapping: AssetClassImpact | undefined,
  gap: number,
  current: number,
  baseline: number,
): string {
  const cur = `${(current * 100).toFixed(1)}%`;
  const base = `${(baseline * 100).toFixed(1)}%`;
  const baseRationale = mapping?.rationale ?? "";
  if (Math.abs(gap) < 0.02) {
    return `Weging ${cur} ligt rond de regime-baseline (${base}). ${baseRationale}`.trim();
  }
  if (gap > 0) {
    return `Overgewicht: ${cur} t.o.v. baseline ${base}. ${baseRationale}`.trim();
  }
  return `Ondergewicht: ${cur} t.o.v. baseline ${base}. ${baseRationale}`.trim();
}

function severityScore(
  bucket: PortfolioBucketImpact,
  mappingByKey: Map<AssetClassKey, AssetClassImpact>,
): number {
  const mapping = mappingByKey.get(bucket.assetClass);
  if (!mapping) return Math.abs(bucket.gap);
  return Math.abs(bucket.gap) * (mapping.magnitude || 0.3);
}

/**
 * Alignment-score: 100 wanneer portefeuille perfect bij baseline ligt.
 * Daalt evenredig met gewogen-gap × asset-impact-magnitude.
 */
function computeAlignment(
  buckets: PortfolioBucketImpact[],
  mappingByKey: Map<AssetClassKey, AssetClassImpact>,
): number {
  let weightedGap = 0;
  let totalMagnitude = 0;
  for (const b of buckets) {
    const mapping = mappingByKey.get(b.assetClass);
    if (!mapping || mapping.direction === "neutral") continue;
    const m = mapping.magnitude || 0.3;
    weightedGap += Math.abs(b.gap) * m;
    totalMagnitude += m;
  }
  if (totalMagnitude === 0) return 75; // geen sterke richting → neutraal
  // Schaal: gemiddelde gap-fractie × 200 = strafpunten (max ~100).
  const avgGap = weightedGap / totalMagnitude;
  const score = Math.max(0, Math.min(100, Math.round(100 - avgGap * 200)));
  return score;
}

function buildSummary(
  regime: MacroRegime,
  buckets: PortfolioBucketImpact[],
  mappingByKey: Map<AssetClassKey, AssetClassImpact>,
): string {
  // Pak top-2 over- en ondergewichten gewogen op magnitude.
  const sorted = [...buckets].sort(
    (a, b) => severityScore(b, mappingByKey) - severityScore(a, mappingByKey),
  );
  const overweight = sorted.find(
    (b) => b.gap > 0.05 && (mappingByKey.get(b.assetClass)?.direction === "headwind"),
  );
  const underweight = sorted.find(
    (b) => b.gap < -0.05 && (mappingByKey.get(b.assetClass)?.direction === "tailwind"),
  );

  const regimeText = regimeShortLabel(regime);
  if (overweight && underweight) {
    return `In een ${regimeText}-klimaat zit je portefeuille relatief zwaar in ${overweight.label.toLowerCase()} en licht in ${underweight.label.toLowerCase()}.`;
  }
  if (overweight) {
    return `In een ${regimeText}-klimaat zit je portefeuille relatief zwaar in ${overweight.label.toLowerCase()}.`;
  }
  if (underweight) {
    return `In een ${regimeText}-klimaat zit je portefeuille licht in ${underweight.label.toLowerCase()}.`;
  }
  return `Je portefeuille ligt redelijk dicht bij de ${regimeText}-baseline.`;
}

function regimeShortLabel(regime: MacroRegime): string {
  switch (regime) {
    case "GOLDILOCKS":
      return "Goldilocks";
    case "REFLATION":
      return "reflation";
    case "STAGFLATION":
      return "stagflation";
    case "DEFLATION":
      return "deflation";
    case "TRANSITIONAL":
      return "transitioneel";
  }
}

function clampWeight(v: number): number {
  if (!Number.isFinite(v) || v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function zeroAndAssign(
  partial: Partial<Record<AssetClassKey, number>>,
): Record<AssetClassKey, number> {
  const all: Record<AssetClassKey, number> = {
    EQUITY_GROWTH: 0,
    EQUITY_VALUE: 0,
    EQUITY_DEFENSIVE: 0,
    EQUITY_CYCLICAL: 0,
    BOND_GOVERNMENT: 0,
    BOND_CORPORATE: 0,
    GOLD: 0,
    COMMODITIES: 0,
    CASH: 0,
    REAL_ESTATE: 0,
  };
  for (const [k, v] of Object.entries(partial)) {
    if (typeof v === "number") all[k as AssetClassKey] = v;
  }
  return all;
}
