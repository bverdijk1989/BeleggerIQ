/**
 * Signal Fusion Engine — orchestrator.
 *
 * Stappen:
 *  1. Run alle 10 extractors → 10 `SignalContribution`-objecten.
 *  2. Renormaliseer weights over de signalen mét data (effectiveWeight).
 *  3. Bereken `contribution = score × renormalizedWeight` voor active signalen.
 *  4. `totalScore` = som van contributions.
 *  5. Bouw headline + tier + dataQuality + warnings.
 *
 * **Pure functie** — zelfde input → identieke output.
 */

import { ALL_EXTRACTORS } from "./extractors";
import type { SignalFusionInput } from "./input";
import type {
  ConfidenceTier,
  InvestmentConfidenceScore,
  SignalContribution,
  SignalDataQuality,
  SignalKey,
} from "./types";
import { DEFAULT_SIGNAL_WEIGHTS, SIGNAL_ORDER } from "./types";

const DATA_QUALITY_THRESHOLD_LOW = 0.4; // < 40% effective weight → "low" warning

export interface ComputeConfidenceScoreOptions {
  /** Override weights — alleen voor tests / experimenten. */
  weights?: Partial<Record<SignalKey, number>>;
}

export function computeConfidenceScore(
  input: SignalFusionInput,
  options: ComputeConfidenceScoreOptions = {},
): InvestmentConfidenceScore {
  const weights = mergeWeights(options.weights);
  const asOf = input.asOf ?? new Date().toISOString();

  // Run alle extractors in canonical volgorde.
  const contributions = ALL_EXTRACTORS.map(({ key, extract }) =>
    extract(input, weights[key]),
  );

  // Renormaliseer over actieve signalen.
  const active = contributions.filter(
    (c): c is SignalContribution & { score: number } =>
      c.score !== null && Number.isFinite(c.score),
  );
  const sumActiveWeight = active.reduce((s, c) => s + c.weight, 0);

  if (active.length === 0 || sumActiveWeight === 0) {
    return buildEmptyResult(input.instrument.ticker, asOf, contributions);
  }

  let totalScore = 0;
  for (const c of contributions) {
    if (c.score === null) {
      c.contribution = null;
      continue;
    }
    const renormalizedWeight = c.weight / sumActiveWeight;
    const contributionValue = c.score * renormalizedWeight;
    c.contribution = Math.round(contributionValue * 100) / 100;
    totalScore += contributionValue;
  }

  const total = Math.round(totalScore);
  const tier = tierFromScore(total);
  const dataQuality = deriveDataQuality(contributions, sumActiveWeight);
  const dataLimitations = collectLimitations(contributions);
  const warning = buildWarning(dataQuality, sumActiveWeight, dataLimitations);
  const headline = buildHeadline(contributions, total);

  // Sorteer contributions in canonical UI-volgorde.
  const ordered = orderContributions(contributions);

  return {
    ticker: input.instrument.ticker,
    asOf,
    totalScore: total,
    tier,
    headline,
    signals: ordered,
    effectiveWeight: Math.round(sumActiveWeight * 100) / 100,
    dataQuality,
    dataLimitations,
    warning,
  };
}

// ============================================================
//  Helpers
// ============================================================

function mergeWeights(
  overrides?: Partial<Record<SignalKey, number>>,
): Record<SignalKey, number> {
  if (!overrides) return DEFAULT_SIGNAL_WEIGHTS;
  return { ...DEFAULT_SIGNAL_WEIGHTS, ...overrides };
}

function tierFromScore(score: number): ConfidenceTier {
  if (score >= 80) return "STRONG";
  if (score >= 65) return "POSITIVE";
  if (score >= 45) return "NEUTRAL";
  if (score >= 30) return "WEAK";
  return "AVOID";
}

function deriveDataQuality(
  contributions: SignalContribution[],
  sumActiveWeight: number,
): SignalDataQuality {
  const high = contributions.filter((c) => c.dataQuality === "high").length;
  if (sumActiveWeight < DATA_QUALITY_THRESHOLD_LOW) return "low";
  if (high >= 5) return "high";
  if (high >= 3) return "medium";
  return "low";
}

function collectLimitations(contributions: SignalContribution[]): string[] {
  const out: string[] = [];
  const missing = contributions.filter((c) => c.dataQuality === "missing");
  if (missing.length > 0) {
    out.push(
      `${missing.length} signalen hebben geen data: ${missing.map((c) => c.label).join(", ")}.`,
    );
  }
  const lowQ = contributions.filter((c) => c.dataQuality === "low");
  if (lowQ.length > 0) {
    out.push(
      `${lowQ.length} signalen met beperkte zekerheid: ${lowQ.map((c) => c.label).join(", ")}.`,
    );
  }
  return out;
}

function buildWarning(
  dataQuality: SignalDataQuality,
  sumActiveWeight: number,
  limitations: string[],
): string | null {
  if (dataQuality === "high") return null;
  if (sumActiveWeight < DATA_QUALITY_THRESHOLD_LOW) {
    return `Lage data-dekking (${Math.round(sumActiveWeight * 100)}% van het gewicht aanwezig) — interpreteer de score met een ruime onzekerheidsmarge.`;
  }
  if (limitations.length === 0) return null;
  return `Sommige signalen ontbreken; let op bij interpretatie.`;
}

function buildHeadline(
  contributions: SignalContribution[],
  total: number,
): string {
  const active = contributions.filter(
    (c): c is SignalContribution & { score: number } =>
      c.score !== null && Number.isFinite(c.score),
  );
  if (active.length === 0) {
    return "Onvoldoende data voor een betrouwbare score.";
  }
  const sorted = [...active].sort((a, b) => b.score - a.score);
  const strongest = sorted[0]!;
  const weakest = sorted[sorted.length - 1]!;

  if (total >= 80) {
    return `Sterke score — ${strongest.label.toLowerCase()} draagt zwaarst bij.`;
  }
  if (total < 30) {
    return `Zwakke score — kritiek punt: ${weakest.label.toLowerCase()}.`;
  }
  if (weakest.score >= 60) {
    return `Solide profiel — ${strongest.label.toLowerCase()} sterkst.`;
  }
  return `${strongest.label} sterkst, ${weakest.label.toLowerCase()} drukt op de score.`;
}

function orderContributions(
  contributions: SignalContribution[],
): SignalContribution[] {
  const byKey = new Map(contributions.map((c) => [c.key, c]));
  return SIGNAL_ORDER.map((key) => byKey.get(key)).filter(
    (c): c is SignalContribution => c !== undefined,
  );
}

function buildEmptyResult(
  ticker: string,
  asOf: string,
  contributions: SignalContribution[],
): InvestmentConfidenceScore {
  for (const c of contributions) {
    c.contribution = null;
  }
  return {
    ticker,
    asOf,
    totalScore: 50,
    tier: "NEUTRAL",
    headline: "Onvoldoende data voor een betrouwbare score.",
    signals: orderContributions(contributions),
    effectiveWeight: 0,
    dataQuality: "low",
    dataLimitations: ["Geen enkel signaal leverde data."],
    warning:
      "Geen enkele signaal-bron leverde data. Voeg fundamentals + factor-engine input toe voor een betrouwbare score.",
  };
}
