import type {
  MarketRegimeScore,
  MarketRegimeStance,
  RegimeSubScore,
} from "@/types/regime";

import { scoreAllDrivers, type RegimeScoreInput } from "./scoring";

/**
 * Regime-engine. Combineert de driver-sub-scores tot één 0..100 cijfer
 * + stance + narrative + confidence. Blijft werken met partiële data:
 * ontbrekende drivers worden overgeslagen en het gewicht wordt
 * herverdeeld over de actieve drivers.
 */

export interface ComputeRegimeScoreOptions {
  asOf?: string;
  source?: string;
}

export function computeRegimeScore(
  input: RegimeScoreInput,
  options: ComputeRegimeScoreOptions = {},
): MarketRegimeScore {
  const asOf = options.asOf ?? new Date().toISOString();
  const subDrivers = scoreAllDrivers(input);
  const active = subDrivers.filter(
    (d): d is RegimeSubScore & { score: number } =>
      d.score !== null && Number.isFinite(d.score),
  );

  if (active.length === 0) {
    return {
      asOf,
      score: 50,
      stance: "NEUTRAL",
      confidence: 0,
      narrative:
        "Geen marktdata beschikbaar voor een regime-score — stance op neutraal gezet.",
      subDrivers,
      source: options.source,
    };
  }

  const totalActiveWeight = active.reduce((sum, d) => sum + d.weight, 0);
  const totalWeight = subDrivers.reduce((sum, d) => sum + d.weight, 0);

  const weighted =
    active.reduce((sum, d) => sum + d.score * d.weight, 0) / totalActiveWeight;
  const score = clampScore(weighted);
  const stance = stanceFromScore(score);
  const confidence =
    totalWeight === 0 ? 0 : clamp01(totalActiveWeight / totalWeight);

  return {
    asOf,
    score,
    stance,
    confidence,
    narrative: buildNarrative({ stance, score, subDrivers: active }),
    subDrivers,
    source: options.source,
  };
}

export function stanceFromScore(score: number): MarketRegimeStance {
  if (!Number.isFinite(score)) return "NEUTRAL";
  if (score >= 65) return "RISK_ON";
  if (score <= 35) return "DEFENSIVE";
  return "NEUTRAL";
}

// ============================================================
//  Internals
// ============================================================

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 50;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

/**
 * Bouwt een korte Dutch narrative op basis van de meest uitgesproken
 * drivers. Toon blijft feitelijk — geen alarmerende taal.
 */
function buildNarrative({
  stance,
  score,
  subDrivers,
}: {
  stance: MarketRegimeStance;
  score: number;
  subDrivers: Array<RegimeSubScore & { score: number }>;
}): string {
  const stanceHeadline = stance === "RISK_ON"
    ? "Risk-on klimaat"
    : stance === "DEFENSIVE"
      ? "Defensief klimaat"
      : "Neutraal klimaat";

  const ranked = subDrivers
    .slice()
    .sort(
      (a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50),
    );

  const supportive = ranked.find((d) => d.score >= 60);
  const drag = ranked.find((d) => d.score <= 40);

  const parts: string[] = [`${stanceHeadline} (score ${score}/100).`];
  if (supportive?.rationale) {
    parts.push(`Ondersteunend: ${supportive.rationale}`);
  }
  if (drag?.rationale && drag.key !== supportive?.key) {
    parts.push(`Tegenwind: ${drag.rationale}`);
  }
  return parts.join(" ");
}
