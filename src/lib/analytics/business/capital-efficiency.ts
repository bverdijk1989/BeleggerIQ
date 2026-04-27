import type { FundamentalsSnapshot } from "@/types/factor";

import { aggregate, fmtPct, scaleStrength, type Component } from "./moat";
import type { BusinessSubScore } from "./types";

/**
 * Capital efficiency (0..100) — hoe goed zet het bedrijf kapitaal in?
 *
 * Pillars:
 *   1. **ROIC** (return on invested capital) — hoogste signaal voor
 *      capital efficiency. ≥ 15% top kwartiel; ≤ 5% zwak.
 *   2. **ROE** (return on equity) — extra signaal, kan vertekend zijn
 *      door leverage. ≥ 20% top; ≤ 8% zwak.
 *   3. **Debt/Equity** — *omgekeerd*: hoger = lagere score. ≤ 0.3 = top;
 *      ≥ 1.5 = stretched.
 *   4. **Interest coverage** — winst voor rente / rentelasten. ≥ 10×
 *      = solide; ≤ 2× = krap.
 *
 * Iedere pillar wordt onafhankelijk gescaled; debt/equity gebruikt
 * `scaleInverse` (lager = hogere score).
 */

const WEIGHTS = {
  roic: 0.35,
  roe: 0.2,
  debtToEquity: 0.25,
  interestCoverage: 0.2,
} as const;

const THRESHOLDS = {
  roic: { min: 0.05, max: 0.15 },
  roe: { min: 0.08, max: 0.2 },
  /** Inverse: hogere debt/equity = lagere score. */
  debtToEquity: { good: 0.3, bad: 1.5 },
  interestCoverage: { min: 2, max: 10 },
} as const;

export function scoreCapitalEfficiency(
  fundamentals: FundamentalsSnapshot | null,
): BusinessSubScore {
  if (!fundamentals) {
    return {
      score: 50,
      rationale: [
        "Geen fundamentals — neutrale capital-efficiency (50).",
      ],
      coverage: 0,
    };
  }

  const components: Component[] = [
    direct("ROIC", WEIGHTS.roic, fundamentals.roic, THRESHOLDS.roic, fmtPct),
    direct("ROE", WEIGHTS.roe, fundamentals.roe, THRESHOLDS.roe, fmtPct),
    inverse(
      "Debt/Equity",
      WEIGHTS.debtToEquity,
      fundamentals.debtToEquity,
      THRESHOLDS.debtToEquity,
    ),
    direct(
      "Interest coverage",
      WEIGHTS.interestCoverage,
      fundamentals.interestCoverage,
      THRESHOLDS.interestCoverage,
      (v) => `${v.toFixed(1)}×`,
    ),
  ];

  return aggregate(components);
}

// ============================================================
//  Pillar-helpers
// ============================================================

function direct(
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

/**
 * Inverse-scale: lager = beter. We mappen `[good, bad]` → `[100, 0]`.
 */
function inverse(
  label: string,
  weight: number,
  value: number | null | undefined,
  thresholds: { good: number; bad: number },
): Component {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { label, weight, score: 50, raw: null, text: null };
  }
  const range = thresholds.bad - thresholds.good;
  let score: number;
  if (range <= 0) {
    score = value <= thresholds.good ? 100 : 0;
  } else {
    const pct = ((value - thresholds.good) / range) * 100;
    if (pct <= 0) score = 100;
    else if (pct >= 100) score = 0;
    else score = Math.round(100 - pct);
  }
  return {
    label,
    weight,
    score,
    raw: value,
    text: `${label} ${value.toFixed(2)}.`,
  };
}
