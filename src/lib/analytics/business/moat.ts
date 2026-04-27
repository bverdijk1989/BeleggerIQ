import type { FundamentalsSnapshot } from "@/types/factor";

import type { BusinessSubScore } from "./types";

/**
 * Moat-score (0..100) — heuristische proxy voor concurrentievoordeel.
 *
 * Drie pillars (zonder externe data zoals brand-rankings of switching-
 * cost-modellen — pure financials):
 *   1. **Gross margin** — hoge marge wijst op pricing-power /
 *      productdifferentiatie. ≥ 50% = top kwartiel; ≤ 20% = commodity.
 *   2. **ROIC** — hoge return on invested capital is het beste
 *      reproduceerbare moat-bewijs. ≥ 20% = top; ≤ 8% = zwak.
 *   3. **Operating margin** — vangt schaalvoordeel + cost-leadership.
 *      ≥ 25% = sterk; ≤ 5% = dun.
 *
 * Composite = gewogen gemiddelde (40% gross margin, 40% ROIC, 20%
 * operating margin). Drempels staan expliciet als constants. Pure.
 */

const WEIGHTS = { grossMargin: 0.4, roic: 0.4, operatingMargin: 0.2 } as const;

const THRESHOLDS = {
  grossMargin: { min: 0.2, max: 0.5 },
  roic: { min: 0.08, max: 0.2 },
  operatingMargin: { min: 0.05, max: 0.25 },
} as const;

export function scoreMoat(
  fundamentals: FundamentalsSnapshot | null,
): BusinessSubScore {
  if (!fundamentals) {
    return {
      score: 50,
      rationale: ["Geen fundamentals beschikbaar — neutrale moat-inschatting."],
      coverage: 0,
    };
  }

  const components: Array<{
    label: string;
    weight: number;
    score: number;
    raw: number | null;
    text: string | null;
  }> = [
    component("Gross margin", WEIGHTS.grossMargin, fundamentals.grossMargin, THRESHOLDS.grossMargin, fmtPct),
    component("ROIC", WEIGHTS.roic, fundamentals.roic, THRESHOLDS.roic, fmtPct),
    component(
      "Operating margin",
      WEIGHTS.operatingMargin,
      fundamentals.operatingMargin,
      THRESHOLDS.operatingMargin,
      fmtPct,
    ),
  ];

  return aggregate(components);
}

// ============================================================
//  Shared helpers — used by all subscore engines
// ============================================================

interface Component {
  label: string;
  weight: number;
  score: number;
  raw: number | null;
  text: string | null;
}

function component(
  label: string,
  weight: number,
  value: number | null | undefined,
  thresholds: { min: number; max: number },
  fmt: (v: number) => string,
): Component {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { label, weight, score: 50, raw: null, text: null };
  }
  const score = scaleStrength(value, thresholds.min, thresholds.max);
  return {
    label,
    weight,
    score,
    raw: value,
    text: `${label} ${fmt(value)}.`,
  };
}

export function aggregate(components: Component[]): BusinessSubScore {
  const present = components.filter((c) => c.raw !== null);
  const totalWeight = present.reduce((s, c) => s + c.weight, 0);
  if (totalWeight <= 0) {
    return {
      score: 50,
      rationale: ["Onvoldoende fundamentele data — neutrale score (50)."],
      coverage: 0,
    };
  }
  const weighted = present.reduce((s, c) => s + c.score * c.weight, 0);
  const score = Math.round(weighted / totalWeight);
  const rationale = present
    .filter((c): c is Component & { text: string } => c.text !== null)
    .map((c) => c.text);
  return {
    score,
    rationale,
    coverage: totalWeight, // weights summen tot 1, dus coverage = totalWeight
  };
}

export function scaleStrength(
  value: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value)) return 50;
  if (max === min) return value >= max ? 100 : 0;
  const pct = ((value - min) / (max - min)) * 100;
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return Math.round(pct);
}

function fmtPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

// Re-export voor andere submodules.
export { fmtPct };
export type { Component };
