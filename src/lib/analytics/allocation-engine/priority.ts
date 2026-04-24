import type { FactorSubScores } from "@/types/factor";

import type { BuyCandidate } from "./candidates";
import type { ObjectiveTilt, RegimeAdjustment } from "./context";
import type { AllocationThresholds } from "./thresholds";

/**
 * Priority-scoring voor buy-candidates. Pure functie die factor kwaliteit,
 * onderweging vs target, regime-fit, objective-fit en concentratie-penalty
 * combineert tot één score 0..100.
 *
 * Design principle: transparant. Elke component is apart terug te vinden
 * zodat UI en explain-layer de beslissing kunnen reconstrueren.
 */

export interface PriorityContext {
  thresholds: AllocationThresholds;
  regime: RegimeAdjustment;
  objective: ObjectiveTilt;
}

export interface PriorityBreakdown {
  factor: number;
  underweight: number;
  regime: number;
  objective: number;
  concentration: number;
}

export interface PriorityResult {
  priority: number;
  breakdown: PriorityBreakdown;
  rationales: string[];
  blocked?: boolean;
  blockReason?: string;
}

const COMPONENT_WEIGHTS = {
  factor: 0.4,
  underweight: 0.2,
  regime: 0.2,
  objective: 0.1,
  concentration: 0.1,
} as const;

export function scoreAllocationPriority(
  candidate: BuyCandidate,
  context: PriorityContext,
): PriorityResult {
  // Hard-block eerst; daarna pas scoren.
  const block = checkHardBlock(candidate, context.objective);
  if (block) {
    return {
      priority: 0,
      breakdown: { factor: 0, underweight: 0, regime: 0, objective: 0, concentration: 0 },
      rationales: [block],
      blocked: true,
      blockReason: block,
    };
  }

  const sub = candidate.factorScore?.subScores ?? null;
  const composite = candidate.factorScore?.composite ?? 50;

  const factor = scoreFactorComponent(sub, composite);
  const underweight = scoreUnderweightComponent(candidate, context.thresholds);
  const regime = scoreRegimeComponent(sub, context.regime, candidate);
  const objective = scoreObjectiveComponent(sub, context.objective);
  const concentration = scoreConcentrationPenalty(candidate);

  const priority = clamp(
    0,
    100,
    Math.round(
      factor * COMPONENT_WEIGHTS.factor +
        underweight * COMPONENT_WEIGHTS.underweight +
        regime * COMPONENT_WEIGHTS.regime +
        objective * COMPONENT_WEIGHTS.objective +
        concentration * COMPONENT_WEIGHTS.concentration,
    ),
  );

  return {
    priority,
    breakdown: { factor, underweight, regime, objective, concentration },
    rationales: buildRationales({ candidate, sub, composite, context }),
  };
}

// ============================================================
//  Component scorers (elk 0..100)
// ============================================================

function scoreFactorComponent(
  sub: FactorSubScores | null,
  composite: number,
): number {
  if (!sub) return composite;
  // 70% composite, 30% quality/momentum balans zodat "1 sterk signaal" niet domineert.
  const avg = (sub.quality + sub.momentum + sub.lowVol + sub.value) / 4;
  return clamp(0, 100, Math.round(composite * 0.7 + avg * 0.3));
}

function scoreUnderweightComponent(
  candidate: BuyCandidate,
  thresholds: AllocationThresholds,
): number {
  const room = candidate.headroomWeight;
  if (room <= 0) return 0;
  // Lineair 0 → cap. Onderweight candidates krijgen volle 100.
  const ratio = Math.min(1, room / thresholds.maxPositionWeight);
  return Math.round(ratio * 100);
}

function scoreRegimeComponent(
  sub: FactorSubScores | null,
  regime: RegimeAdjustment,
  candidate: BuyCandidate,
): number {
  const base = 50;
  if (!sub) {
    // Core-ETF in defensief regime wint sowieso; andere onbekende candidates krijgen 50.
    if (candidate.isCoreEtf && regime.preferCoreEtf) return 80;
    return base;
  }
  const momentumAdj = regime.momentumBias * sub.momentum;
  const qualityAdj = regime.qualityBias * sub.quality;
  const lowVolAdj = regime.lowVolBias * sub.lowVol;
  const signal = base + (momentumAdj + qualityAdj + lowVolAdj) / 3;
  const coreBoost = regime.preferCoreEtf && candidate.isCoreEtf ? 15 : 0;
  return clamp(0, 100, Math.round(signal + coreBoost));
}

function scoreObjectiveComponent(
  sub: FactorSubScores | null,
  objective: ObjectiveTilt,
): number {
  if (!sub) return 50;
  const weights = objective.factorWeights;
  let total = 0;
  let weightSum = 0;
  const all: Array<[keyof FactorSubScores, number | undefined]> = [
    ["quality", sub.quality],
    ["value", sub.value],
    ["momentum", sub.momentum],
    ["lowVol", sub.lowVol],
    ["dividend", sub.dividend],
    ["growth", sub.growth],
  ];
  for (const [key, value] of all) {
    const w = weights[key];
    if (w === undefined || value === undefined) continue;
    total += value * w;
    weightSum += w;
  }
  if (weightSum === 0) return 50;
  return clamp(0, 100, Math.round(total / weightSum));
}

function scoreConcentrationPenalty(candidate: BuyCandidate): number {
  // Veel headroom → weinig concentratie → hoge bonus (goed).
  // Weinig headroom → veel concentratie → lage bonus.
  return Math.round(Math.min(1, candidate.headroomWeight / 0.05) * 100);
}

// ============================================================
//  Hard blocks
// ============================================================

function checkHardBlock(
  candidate: BuyCandidate,
  objective: ObjectiveTilt,
): string | null {
  if (candidate.headroomWeight <= 0.001) {
    return "Positie op cap — bijkoop niet zinvol.";
  }
  const sub = candidate.factorScore?.subScores;
  if (!sub) return null;

  for (const [key, min] of Object.entries(objective.minRequirements)) {
    if (min === undefined) continue;
    const value = sub[key as keyof FactorSubScores];
    if (value === undefined) continue;
    if (value < min) {
      return `Profiel vraagt min ${min}/100 op ${key}; huidige score ${Math.round(value)}.`;
    }
  }
  return null;
}

// ============================================================
//  Rationale builder
// ============================================================

function buildRationales({
  candidate,
  sub,
  composite,
  context,
}: {
  candidate: BuyCandidate;
  sub: FactorSubScores | null;
  composite: number;
  context: PriorityContext;
}): string[] {
  const lines: string[] = [];

  if (candidate.isCoreEtf) {
    lines.push(
      "Brede spreiding via core ETF — stabiele ruggengraat van het koopplan.",
    );
  }

  if (sub) {
    const top = pickTopSub(sub);
    if (top) {
      lines.push(
        `Sterkste signaal: ${top.label} (${Math.round(top.value)}/100).`,
      );
    }
  }
  if (composite >= 70) {
    lines.push(`Composite score ${Math.round(composite)}/100 — overtuigend factorprofiel.`);
  } else if (composite <= 45) {
    lines.push(
      `Composite score ${Math.round(composite)}/100 — matig, maar genoeg headroom om bij te kopen.`,
    );
  }

  const underweight = candidate.headroomWeight;
  if (underweight > 0.04) {
    lines.push(
      `Positie heeft ${Math.round(underweight * 100)}% ruimte tot de policy-cap.`,
    );
  } else if (underweight < 0.02) {
    lines.push(
      `Nog maar ${Math.round(underweight * 100)}% ruimte tot cap — klein bedrag volstaat.`,
    );
  }

  const warnings = context.regime.warnings;
  if (warnings.length > 0 && candidate.isCoreEtf) {
    lines.push(warnings[0]!);
  }

  return lines;
}

function pickTopSub(
  sub: FactorSubScores,
): { label: string; value: number } | null {
  const entries: Array<{ label: string; value: number }> = [
    { label: "Quality", value: sub.quality },
    { label: "Value", value: sub.value },
    { label: "Momentum", value: sub.momentum },
    { label: "Low-vol", value: sub.lowVol },
  ];
  let best = entries[0];
  if (!best) return null;
  for (const entry of entries) {
    if (entry.value > best.value) best = entry;
  }
  return best.value >= 60 ? best : null;
}

// ============================================================
//  Internals
// ============================================================

function clamp(min: number, max: number, value: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
