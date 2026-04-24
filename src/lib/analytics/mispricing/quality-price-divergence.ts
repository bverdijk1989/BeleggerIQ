import type { FactorScore } from "@/types/factor";
import type { HistoricalPoint } from "@/types/market";

import {
  buildRiskFlag,
  deriveConfidenceTier,
  type MispricingDataQualityAssessment,
  type MispricingDataQualityRequirement,
  type MispricingSignal,
} from "./types";
import {
  clamp,
  computeExpiresAt,
  scaleStrength,
  trailingReturn,
} from "./shared";

/**
 * Detector 3/4 — **quality-price-divergence**.
 *
 * Triggert wanneer de **quality-score hoog** is én **tegelijk** de koers
 * over 12m significant is gedaald. Het vermoeden: de markt prijst
 * slechte verwachtingen in zonder dat de kern-kwaliteit (marges, ROIC,
 * balance-sheet) is verzwakt.
 *
 * Verschilt van `opportunity-radar`/`quality-pullback`:
 *  - Radar-versie triggert óók op 3m-pullbacks en lagere quality-drempel;
 *    is een kortere-termijn tactische hit.
 *  - Deze detector eist 12m-drawdown **en** een hogere quality-drempel →
 *    bedoeld als structurele mispricing-candidate met langere holding.
 *
 * Holding-periode: 270 dagen (conservatief tussen peer-dislocatie en
 * valuation-gap).
 */

// ============================================================
//  Drempels
// ============================================================

/** Quality-score drempel. */
const MIN_QUALITY_SCORE = 70;
const SAFE_QUALITY_SCORE = 80;

/** 12-maands return moet minstens zo negatief zijn. */
const MIN_DRAWDOWN_12M = -0.1; // -10%
const MAX_DRAWDOWN_12M = -0.35; // -35% → full strength

const TRAILING_DAYS = 252;

const DEFAULT_HOLDING_PERIOD_DAYS = 270;

const DATA_QUALITY_REQUIREMENT: MispricingDataQualityRequirement = {
  minHistoryDays: TRAILING_DAYS + 10,
  requiresFundamentals: false,
  requiresFactorScore: true,
  requiresPeerBasket: false,
  minPeerCount: 0,
};

// ============================================================
//  Input + public fn
// ============================================================

export interface DetectQualityPriceDivergenceInput {
  ticker: string;
  factorScore?: FactorScore | null;
  priceHistory: HistoricalPoint[];
  /**
   * Optionele historische factor-score (bv. 1 jaar geleden) — wanneer
   * we zien dat de quality-score stabiel hoog bleef, stijgt de
   * confidence. Indien niet meegegeven: flag "quality-degradation-unknown".
   */
  priorFactorScore?: FactorScore | null;
  now?: string;
  ttlDays?: number;
}

export function detectQualityPriceDivergence(
  input: DetectQualityPriceDivergenceInput,
): MispricingSignal | null {
  const detectedAt = input.now ?? new Date().toISOString();
  const ttlDays = input.ttlDays ?? 30;

  const missing: string[] = [];
  if (!input.factorScore) missing.push("factorScore");
  if (input.priceHistory.length < TRAILING_DAYS + 1) missing.push("history");
  if (missing.length > 0) return null;

  const quality = input.factorScore!.subScores.quality;
  if (!Number.isFinite(quality) || quality < MIN_QUALITY_SCORE) return null;

  const return12m = trailingReturn(input.priceHistory, TRAILING_DAYS);
  if (return12m === null || return12m > MIN_DRAWDOWN_12M) return null;

  // Strength: combineer quality-bonus met drawdown-diepte. Drawdown
  // is dominant; quality geeft een multiplicatieve boost.
  const drawdownStrength = scaleStrength(
    -return12m,
    -MIN_DRAWDOWN_12M,
    -MAX_DRAWDOWN_12M,
  );
  const qualityBoost = clamp(
    1 + (quality - MIN_QUALITY_SCORE) / 100, // 1.00..1.30
    1,
    1.3,
  );
  const mispricingScore = clamp(
    Math.round(drawdownStrength * qualityBoost),
    0,
    100,
  );

  const rationale: string[] = [
    `Quality-score ${Math.round(quality)}/100 — behoort tot top-kwartiel.`,
    `12m-return ${formatPct(return12m)} duidt op forse koersdaling.`,
  ];

  const riskFlags = [];
  if (quality < SAFE_QUALITY_SCORE) {
    riskFlags.push(buildRiskFlag("value-trap"));
  }
  const prior = input.priorFactorScore ?? null;
  if (!prior) {
    riskFlags.push(buildRiskFlag("quality-degradation-unknown"));
  } else {
    const priorQuality = prior.subScores.quality;
    if (Number.isFinite(priorQuality) && priorQuality - quality >= 10) {
      // Quality is meetbaar gedaald → dit is geen divergentie maar een
      // echte kwaliteitsverslechtering. Detector triggert dan niet.
      return null;
    }
    rationale.push(
      `Historische quality-score (${Math.round(priorQuality)}) bevestigt stabiliteit.`,
    );
  }

  // Confidence: basis 0.5, +0.15 bij quality ≥ 80, +0.15 bij stabiele
  // historische score, -0.1 bij onbekende historie.
  let confidence = 0.5;
  if (quality >= SAFE_QUALITY_SCORE) confidence += 0.15;
  if (prior) confidence += 0.15;
  else confidence -= 0.1;
  // Factor-score eigen confidence (indien aanwezig, 0..1).
  if (typeof input.factorScore!.confidence === "number") {
    confidence = (confidence + input.factorScore!.confidence) / 2;
  }
  confidence = clamp(confidence, 0, 1);

  const dataQuality: MispricingDataQualityAssessment = {
    required: DATA_QUALITY_REQUIREMENT,
    met: true,
    missing: [],
    score: clamp(
      0.5 +
        (quality >= SAFE_QUALITY_SCORE ? 0.2 : 0.1) +
        (prior ? 0.2 : 0),
      0,
      1,
    ),
  };

  return {
    type: "quality-price-divergence",
    ticker: input.ticker,
    mispricingScore,
    confidence,
    confidenceTier: deriveConfidenceTier(confidence),
    expectedHoldingPeriodDays: DEFAULT_HOLDING_PERIOD_DAYS,
    riskFlags,
    dataQuality,
    rationale,
    riskNote:
      "Een hoge quality-score op basis van gepubliceerde cijfers kijkt achteruit. Mogelijk heeft de markt informatie ingeprijsd die nog niet in de financials zichtbaar is (concurrentie, regulering, producttransitie).",
    detectedAt,
    expiresAt: computeExpiresAt(detectedAt, ttlDays),
  };
}

function formatPct(fraction: number): string {
  const sign = fraction >= 0 ? "+" : "";
  return `${sign}${(fraction * 100).toFixed(1)}%`;
}
