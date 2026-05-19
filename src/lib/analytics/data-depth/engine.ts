/**
 * Data-Depth Engine — pure-function scoring (Module 26).
 *
 * Neemt per asset een set boolean-flags ("hebben we live price? hebben we
 * fundamentals?") en produceert een depth-score + tier + plain-language
 * uitleg. Aggregator levert portfolio-coverage.
 *
 * **Pure**: geen I/O, geen Date.now buiten orchestrator. Tests dekken
 * alle dimension-weights + tier-grenzen.
 */

import type { ISODateString } from "@/types/common";

import {
  DIMENSION_LABELS,
  DIMENSION_WEIGHTS,
  TIER_EXPLANATIONS,
  type AssetDataDepth,
  type DataDepthDimension,
  type DataDepthTier,
  type PortfolioDataCoverage,
} from "./types";

const TIER_THRESHOLDS: Array<[number, DataDepthTier]> = [
  [85, "excellent"],
  [70, "good"],
  [50, "fair"],
  [25, "limited"],
  [0, "poor"],
];

/** Map 0..100 score → tier. */
export function tierFromScore(score: number): DataDepthTier {
  if (!Number.isFinite(score)) return "poor";
  for (const [threshold, tier] of TIER_THRESHOLDS) {
    if (score >= threshold) return tier;
  }
  return "poor";
}

export interface AssetDataDepthInput {
  ticker: string;
  /** Boolean per dimensie — caller bepaalt of de data echt aanwezig is. */
  flags: Partial<Record<DataDepthDimension, boolean>>;
  /** Optionele bron-attributie. */
  sources?: ReadonlyArray<string>;
}

/**
 * Bereken depth voor één asset.
 *
 * **Weighted-sum**: score = Σ (weight × isPresent). Score is direct 0..100.
 * Missende flag = niet aanwezig.
 */
export function computeAssetDataDepth(
  input: AssetDataDepthInput,
): AssetDataDepth {
  const present: DataDepthDimension[] = [];
  const missing: DataDepthDimension[] = [];
  let score = 0;

  const dims = Object.keys(DIMENSION_WEIGHTS) as DataDepthDimension[];
  for (const dim of dims) {
    const has = input.flags[dim] === true;
    if (has) {
      present.push(dim);
      score += DIMENSION_WEIGHTS[dim] * 100;
    } else {
      missing.push(dim);
    }
  }

  const finalScore = Math.round(score);
  const tier = tierFromScore(finalScore);
  return {
    ticker: input.ticker,
    score: finalScore,
    tier,
    present,
    missing,
    explanation: buildAssetExplanation(missing, tier),
    sources: input.sources ?? [],
  };
}

/**
 * Plain-language explanation per asset. Geen jargon. Geen percentages.
 */
function buildAssetExplanation(
  missing: ReadonlyArray<DataDepthDimension>,
  tier: DataDepthTier,
): string {
  if (missing.length === 0) {
    return "Alle databronnen aanwezig.";
  }
  if (missing.length === 1) {
    return `${TIER_EXPLANATIONS[tier]} Ontbreekt: ${DIMENSION_LABELS[missing[0]!].toLowerCase()}.`;
  }
  if (missing.length <= 3) {
    const labels = missing
      .map((m) => DIMENSION_LABELS[m].toLowerCase())
      .join(", ");
    return `${TIER_EXPLANATIONS[tier]} Ontbreekt: ${labels}.`;
  }
  return TIER_EXPLANATIONS[tier];
}

// ============================================================
//  Portfolio aggregator
// ============================================================

export interface AssessPortfolioCoverageInput {
  /** ISO-datum waarop de analyse draait. */
  generatedAt: ISODateString;
  /** Per-asset depth + weight (0..1). */
  assets: ReadonlyArray<{
    depth: AssetDataDepth;
    weight: number;
  }>;
}

export function assessPortfolioCoverage(
  input: AssessPortfolioCoverageInput,
): PortfolioDataCoverage {
  const assetCount = input.assets.length;

  if (assetCount === 0) {
    return emptyCoverage(input.generatedAt);
  }

  const totalWeight = input.assets.reduce((sum, a) => sum + a.weight, 0);
  const weightedScore =
    totalWeight > 0
      ? input.assets.reduce((sum, a) => sum + a.depth.score * a.weight, 0) /
        totalWeight
      : 0;

  // Per-dimensie aggregator.
  const dims = Object.keys(DIMENSION_WEIGHTS) as DataDepthDimension[];
  const dimensions = {} as PortfolioDataCoverage["dimensions"];
  for (const dim of dims) {
    let presentCount = 0;
    let weighted = 0;
    for (const a of input.assets) {
      const has = a.depth.present.includes(dim);
      if (has) {
        presentCount += 1;
        weighted += a.weight;
      }
    }
    dimensions[dim] = {
      presentCount,
      weightedCoverage:
        totalWeight > 0 ? Math.round((weighted / totalWeight) * 100) / 100 : 0,
    };
  }

  // Top-3 zwakste assets op gewogen-impact (laagste score × hoogste weight).
  const ranked = [...input.assets].sort(
    (a, b) => a.depth.score * a.weight - b.depth.score * b.weight,
  );
  const weakestAssets = ranked
    .filter((a) => a.depth.score < 85)
    .slice(0, 3)
    .map((a) => a.depth);

  const finalScore = Math.round(weightedScore);
  const tier = tierFromScore(finalScore);

  const warnings = buildPortfolioWarnings({ dimensions, weakestAssets, totalWeight });
  const summary = buildPortfolioSummary({ tier, finalScore, dimensions });

  return {
    generatedAt: input.generatedAt,
    assetCount,
    weightedScore: finalScore,
    tier,
    dimensions,
    weakestAssets,
    summary,
    warnings,
  };
}

function emptyCoverage(at: ISODateString): PortfolioDataCoverage {
  const dims = Object.keys(DIMENSION_WEIGHTS) as DataDepthDimension[];
  const dimensions = {} as PortfolioDataCoverage["dimensions"];
  for (const dim of dims) {
    dimensions[dim] = { presentCount: 0, weightedCoverage: 0 };
  }
  return {
    generatedAt: at,
    assetCount: 0,
    weightedScore: 0,
    tier: "poor",
    dimensions,
    weakestAssets: [],
    summary: "Geen posities in de portefeuille — datakwaliteit niet meetbaar.",
    warnings: [],
  };
}

function buildPortfolioSummary(args: {
  tier: DataDepthTier;
  finalScore: number;
  dimensions: PortfolioDataCoverage["dimensions"];
}): string {
  const base = TIER_EXPLANATIONS[args.tier];
  const lowestCoverage = (
    Object.entries(args.dimensions) as Array<
      [DataDepthDimension, { presentCount: number; weightedCoverage: number }]
    >
  ).sort((a, b) => a[1].weightedCoverage - b[1].weightedCoverage)[0];
  if (!lowestCoverage || lowestCoverage[1].weightedCoverage >= 0.9) {
    return base;
  }
  const dimLabel = DIMENSION_LABELS[lowestCoverage[0]].toLowerCase();
  return `${base} Zwakste bron in deze portefeuille: ${dimLabel}.`;
}

function buildPortfolioWarnings(args: {
  dimensions: PortfolioDataCoverage["dimensions"];
  weakestAssets: ReadonlyArray<AssetDataDepth>;
  totalWeight: number;
}): string[] {
  const out: string[] = [];

  // Per-dimensie threshold (waarschuw bij < 50% gewogen-coverage).
  const thresholds: Partial<Record<DataDepthDimension, [number, string]>> = {
    live_price: [0.5, "Meer dan helft van de portefeuille mist actuele koersen — scores zijn indicatief."],
    fundamentals: [0.5, "Meer dan helft van de portefeuille mist fundamentals — kwaliteit-signalen incompleet."],
    dividend: [0.3, "Beperkte dividend-data — dividend-projectie kan onvolledig zijn."],
    macro: [0.5, "Macro-context ontbreekt voor veel posities — regime-aligned scores zijn beperkt."],
    history: [0.5, "Veel posities missen koershistorie — volatiliteit/drawdown-analyse beperkt."],
  };

  const dims = Object.keys(thresholds) as DataDepthDimension[];
  for (const dim of dims) {
    const cov = args.dimensions[dim].weightedCoverage;
    const t = thresholds[dim];
    if (t && cov < t[0]) {
      out.push(t[1]);
    }
  }

  // Cap op 5.
  return out.slice(0, 5);
}

// ============================================================
//  Confidence-multiplier helper
// ============================================================

/**
 * Pas data-depth toe op een bestaande confidence-score (0..1). Hoge
 * depth → multiplier dichter bij 1 (geen straf). Lage depth → multiplier
 * tot 0.5 minimum (we eroderen confidence maar nooit naar 0 om gebruiker
 * niet alles te laten verliezen bij één missende bron).
 *
 * Pure, deterministisch. Caller-side integratie — niet automatisch
 * toegepast op alle engines om side-effects te voorkomen.
 */
export function applyDataDepthToConfidence(
  rawConfidence: number,
  depthScore: number,
): number {
  if (!Number.isFinite(rawConfidence) || rawConfidence <= 0) return 0;
  const safeDepth = Math.max(0, Math.min(100, depthScore));
  // multiplier: 0.5 (depth=0) → 1.0 (depth=100), lineair.
  const multiplier = 0.5 + (safeDepth / 100) * 0.5;
  const out = rawConfidence * multiplier;
  return Math.max(0, Math.min(1, out));
}
