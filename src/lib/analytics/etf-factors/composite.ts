import {
  MAX_CONFIDENCE_LOW_COVERAGE,
  MIN_COVERAGE_FOR_COMPOSITE,
  MIN_PILLARS_FOR_COMPOSITE,
} from "../factors/composite";
import { clamp } from "../factors/shared";
import type {
  EtfFactorBreakdown,
  FactorRationales,
  FactorScore,
  FactorSubScores,
  FactorWeights,
} from "@/types/factor";
import type { InvestmentObjective } from "@/types/profile";

import { scoreEtfCost } from "./cost";
import { scoreEtfFit } from "./fit";
import type { EtfMetadata } from "./metadata";
import { scoreEtfScale } from "./scale";
import { scoreEtfTrackRecord } from "./track-record";

/**
 * ETF Factor-engine — orchestrator.
 *
 * Vier pillars:
 *  1. **Cost**       — TER + spread (lager = beter).
 *  2. **Scale**      — AUM (groter = liquider, geen sluitingsrisico).
 *  3. **Track-record** — leeftijd + tracking-error.
 *  4. **Fit**        — distributie-policy + sector-spreiding + replicatie.
 *
 * Output is een **`FactorScore`-object met `kind: "ETF"`** zodat
 * downstream code (action-engine, business-quality, UI) geen aparte
 * shape hoeft te kennen. Sub-scores worden gemapt op de bestaande
 * `FactorSubScores`-keys voor backwards-compat:
 *
 *  - `quality`  ← cost (lage kosten = "kwaliteit" voor een ETF)
 *  - `value`    ← scale (groot fonds = beter te handelen)
 *  - `momentum` ← track-record (lange historie + lage tracking-error)
 *  - `lowVol`   ← fit (passend bij doel + breed gespreid + fysiek)
 *
 * `etfBreakdown` bevat de letterlijke vier ETF-pillars zodat de UI
 * kan kiezen tussen stock-labels en ETF-labels (context-aware legend).
 *
 * Min-coverage-floor (MIN_COVERAGE_FOR_COMPOSITE = 0.5,
 * MIN_PILLARS_FOR_COMPOSITE = 2) wordt gerespecteerd: bij minder dan
 * 2 reliable pillars wordt composite naar 50 geforceerd en confidence
 * geclamped op MAX_CONFIDENCE_LOW_COVERAGE — voorkomt fake precision
 * bij dunne fund-metadata.
 */

export const DEFAULT_ETF_WEIGHTS: FactorWeights = {
  // Mapping naar bestaande FactorSubScores-keys.
  quality: 0.35, // cost
  value: 0.20, // scale
  momentum: 0.20, // track-record
  lowVol: 0.25, // fit
};

export interface EtfFactorScoringInput {
  ticker: string;
  asOf?: string;
  metadata: EtfMetadata | null;
  objective?: InvestmentObjective | null;
  /** Override `now` voor deterministische tests. */
  now?: Date;
}

export function scoreEtfFactors(
  input: EtfFactorScoringInput,
  weights: FactorWeights = DEFAULT_ETF_WEIGHTS,
): FactorScore {
  const cost = scoreEtfCost(input.metadata);
  const scale = scoreEtfScale(input.metadata);
  const trackRecord = scoreEtfTrackRecord(input.metadata, { now: input.now });
  const fit = scoreEtfFit(input.metadata, input.objective ?? null);

  const breakdown: EtfFactorBreakdown = {
    cost: cost.score,
    scale: scale.score,
    trackRecord: trackRecord.score,
    fit: fit.score,
  };

  // Map ETF-pillars op bestaande FactorSubScores-keys voor downstream
  // compatibility (action-engine, business-quality, UI).
  const subScores: FactorSubScores = {
    quality: breakdown.cost,
    value: breakdown.scale,
    momentum: breakdown.trackRecord,
    lowVol: breakdown.fit,
  };

  const reliable = {
    quality: cost.coverage >= MIN_COVERAGE_FOR_COMPOSITE,
    value: scale.coverage >= MIN_COVERAGE_FOR_COMPOSITE,
    momentum: trackRecord.coverage >= MIN_COVERAGE_FOR_COMPOSITE,
    lowVol: fit.coverage >= MIN_COVERAGE_FOR_COMPOSITE,
  };
  const reliableCount = Object.values(reliable).filter(Boolean).length;

  const composite =
    reliableCount >= MIN_PILLARS_FOR_COMPOSITE
      ? computeEtfComposite(subScores, weights, reliable)
      : 50;

  const rationales: FactorRationales = {
    quality: cost.rationales,
    value: scale.rationales,
    momentum: trackRecord.rationales,
    lowVol: fit.rationales,
    composite: buildEtfCompositeRationale(breakdown, composite, reliableCount),
  };

  const coverageSignals = [cost, scale, trackRecord, fit];
  const rawConfidence =
    coverageSignals.reduce((sum, s) => sum + s.coverage, 0) /
    coverageSignals.length;
  const confidence =
    reliableCount >= MIN_PILLARS_FOR_COMPOSITE
      ? clamp(rawConfidence, 0, 1)
      : Math.min(MAX_CONFIDENCE_LOW_COVERAGE, clamp(rawConfidence, 0, 1));

  return {
    ticker: input.ticker,
    asOf: input.asOf ?? (input.now ?? new Date()).toISOString(),
    subScores,
    composite,
    confidence,
    model: "beleggeriq.etf.v1",
    weights,
    rationales,
    kind: "ETF",
    etfBreakdown: breakdown,
  };
}

// ============================================================
//  Composite (pure)
// ============================================================

type CorePillar = "quality" | "value" | "momentum" | "lowVol";
type Reliable = Record<CorePillar, boolean>;

function computeEtfComposite(
  sub: FactorSubScores,
  weights: FactorWeights,
  reliable: Reliable,
): number {
  const entries: Array<[CorePillar, number, number]> = [
    ["quality", sub.quality, weights.quality],
    ["value", sub.value, weights.value],
    ["momentum", sub.momentum, weights.momentum],
    ["lowVol", sub.lowVol, weights.lowVol],
  ];
  const filtered = entries.filter(([key]) => reliable[key]);
  const totalWeight = filtered.reduce((sum, [, , w]) => sum + w, 0);
  if (totalWeight === 0) return 50;
  const weighted =
    filtered.reduce((sum, [, score, weight]) => sum + score * weight, 0) /
    totalWeight;
  return Math.round(clamp(weighted, 0, 100));
}

function buildEtfCompositeRationale(
  breakdown: EtfFactorBreakdown,
  composite: number,
  reliableCount: number,
): string[] {
  const grade =
    composite >= 75
      ? "sterk"
      : composite >= 60
        ? "bovengemiddeld"
        : composite >= 40
          ? "gemiddeld"
          : composite >= 25
            ? "zwak"
            : "zeer zwak";

  const out: string[] = [
    `ETF composite ${composite}/100 — ${grade} profiel.`,
  ];

  if (reliableCount < MIN_PILLARS_FOR_COMPOSITE) {
    out.push(
      `Onvoldoende fund-metadata (${reliableCount}/4 pillars met voldoende coverage) — composite gehouden op neutraal en confidence beperkt.`,
    );
    return out;
  }

  // Sorteer pillars op afwijking vs neutraal voor de top-driver.
  const ranked: Array<[string, number]> = [
    ["Kosten", breakdown.cost],
    ["Schaal", breakdown.scale],
    ["Track-record", breakdown.trackRecord],
    ["Pasvorm", breakdown.fit],
  ];
  ranked.sort((a, b) => Math.abs(b[1] - 50) - Math.abs(a[1] - 50));

  const topPositive = ranked.find(([, score]) => score >= 60);
  const topNegative = ranked.find(([, score]) => score <= 40);
  if (topPositive) {
    out.push(`${topPositive[0]} trekt de score omhoog (${topPositive[1]}/100).`);
  }
  if (topNegative) {
    out.push(`${topNegative[0]} drukt de score (${topNegative[1]}/100).`);
  }
  return out;
}
