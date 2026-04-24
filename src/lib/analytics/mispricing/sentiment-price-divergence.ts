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
  realizedVolOverWindow,
  scaleStrength,
  trailingReturn,
} from "./shared";

/**
 * Detector 4/4 — **sentiment-price-divergence**.
 *
 * Doel: detecteer situaties waar het **sentiment-proxy** en de **prijs**
 * uit de pas lopen. Er zijn twee routes:
 *
 *  1. **Expliciet sentiment-pad.** Caller levert `sentimentScore`
 *     (0..1, hoger = positiever). Als het sentiment hoog is maar de
 *     20d-return negatief → divergentie.
 *  2. **Volatility-proxy pad.** Wanneer geen sentiment-feed: we
 *     vergelijken 20d realized vol met 200d realized vol. Bij een
 *     scherpe vol-spike (≥ 1.5×) gecombineerd met een stabiel
 *     lowVol-factor-profiel (score ≥ 65) → sentiment-gedreven
 *     dislocatie. Deze variant krijgt een "sentiment-proxy-only" flag.
 *
 * Holding-periode: 90 dagen (sentiment-cycli zijn korter dan
 * waarderings-cycli).
 */

// ============================================================
//  Drempels
// ============================================================

/** Drempel voor "positief sentiment". */
const MIN_POSITIVE_SENTIMENT = 0.7;

/** Minimum negatieve 20d-return bij sentiment-pad. */
const MIN_NEG_RETURN_20D = -0.05;
/** 100-strength grens. */
const MAX_NEG_RETURN_20D = -0.2;

/** Volatility-ratio drempel (20d / 200d). */
const MIN_VOL_RATIO = 1.5;
const MAX_VOL_RATIO = 3;

/** LowVol-score drempel voor de proxy-route. */
const MIN_LOWVOL_SCORE = 65;

const SHORT_WINDOW = 20;
const LONG_WINDOW = 200;

const DEFAULT_HOLDING_PERIOD_DAYS = 90;

const DATA_QUALITY_REQUIREMENT: MispricingDataQualityRequirement = {
  minHistoryDays: LONG_WINDOW + SHORT_WINDOW + 5,
  requiresFundamentals: false,
  requiresFactorScore: false,
  requiresPeerBasket: false,
  minPeerCount: 0,
};

// ============================================================
//  Input + public fn
// ============================================================

export interface DetectSentimentPriceDivergenceInput {
  ticker: string;
  priceHistory: HistoricalPoint[];
  /** 0..1 sentimentscore uit een externe feed (hoger = positiever). */
  sentimentScore?: number | null;
  /** Factor-score — alleen lowVol wordt gebruikt in de proxy-route. */
  factorScore?: FactorScore | null;
  now?: string;
  ttlDays?: number;
}

export function detectSentimentPriceDivergence(
  input: DetectSentimentPriceDivergenceInput,
): MispricingSignal | null {
  const detectedAt = input.now ?? new Date().toISOString();
  const ttlDays = input.ttlDays ?? 30;

  if (input.priceHistory.length < LONG_WINDOW + SHORT_WINDOW + 1) {
    return null;
  }

  // --- Route 1: expliciete sentiment-score ---
  const sent = toUnit(input.sentimentScore);
  const return20d = trailingReturn(input.priceHistory, SHORT_WINDOW);
  if (return20d === null) return null;

  if (sent !== null && sent >= MIN_POSITIVE_SENTIMENT && return20d <= MIN_NEG_RETURN_20D) {
    return buildSentimentRouteSignal({
      ticker: input.ticker,
      sentimentScore: sent,
      return20d,
      detectedAt,
      ttlDays,
    });
  }

  // --- Route 2: volatility-proxy ---
  const lowVol = input.factorScore?.subScores.lowVol ?? null;
  if (lowVol === null || !Number.isFinite(lowVol) || lowVol < MIN_LOWVOL_SCORE) {
    return null;
  }

  const shortVol = realizedVolOverWindow(input.priceHistory, SHORT_WINDOW);
  const longVol = realizedVolOverWindow(input.priceHistory, LONG_WINDOW);
  if (shortVol === null || longVol === null || longVol <= 0) return null;

  const ratio = shortVol / longVol;
  if (ratio < MIN_VOL_RATIO) return null;

  return buildProxyRouteSignal({
    ticker: input.ticker,
    lowVolScore: lowVol,
    shortVol,
    longVol,
    ratio,
    return20d,
    detectedAt,
    ttlDays,
  });
}

// ============================================================
//  Route 1 — expliciet sentiment
// ============================================================

function buildSentimentRouteSignal(params: {
  ticker: string;
  sentimentScore: number;
  return20d: number;
  detectedAt: string;
  ttlDays: number;
}): MispricingSignal {
  const { ticker, sentimentScore, return20d, detectedAt, ttlDays } = params;
  const priceStrength = scaleStrength(
    -return20d,
    -MIN_NEG_RETURN_20D,
    -MAX_NEG_RETURN_20D,
  );
  const sentimentBoost = clamp(
    1 + (sentimentScore - MIN_POSITIVE_SENTIMENT) / 2,
    1,
    1.2,
  );
  const mispricingScore = clamp(
    Math.round(priceStrength * sentimentBoost),
    0,
    100,
  );

  const confidence = clamp(0.55 + 0.2 * (sentimentScore - MIN_POSITIVE_SENTIMENT) / 0.3, 0, 1);

  const dataQuality: MispricingDataQualityAssessment = {
    required: DATA_QUALITY_REQUIREMENT,
    met: true,
    missing: [],
    score: clamp(0.55 + 0.2 * (sentimentScore - MIN_POSITIVE_SENTIMENT), 0, 1),
  };

  return {
    type: "sentiment-price-divergence",
    ticker,
    mispricingScore,
    confidence,
    confidenceTier: deriveConfidenceTier(confidence),
    expectedHoldingPeriodDays: DEFAULT_HOLDING_PERIOD_DAYS,
    riskFlags: [buildRiskFlag("momentum-reversal-fragile")],
    dataQuality,
    rationale: [
      `Sentiment-score ${sentimentScore.toFixed(2)} (≥ ${MIN_POSITIVE_SENTIMENT}) wijst op positieve nieuws-/analystenflow.`,
      `Koers over 20 dagen ${formatPct(return20d)} (${MIN_NEG_RETURN_20D}+ drempel onderschreden).`,
    ],
    riskNote:
      "Sentimentscores kunnen snel omslaan en weerspiegelen niet altijd fundamenten. Een positieve score tegelijk met dalende koers kán ook betekenen dat analisten achterlopen op marktrealiteit.",
    detectedAt,
    expiresAt: computeExpiresAt(detectedAt, ttlDays),
  };
}

// ============================================================
//  Route 2 — volatility-proxy
// ============================================================

function buildProxyRouteSignal(params: {
  ticker: string;
  lowVolScore: number;
  shortVol: number;
  longVol: number;
  ratio: number;
  return20d: number;
  detectedAt: string;
  ttlDays: number;
}): MispricingSignal {
  const {
    ticker,
    lowVolScore,
    shortVol,
    longVol,
    ratio,
    return20d,
    detectedAt,
    ttlDays,
  } = params;
  const ratioStrength = scaleStrength(ratio, MIN_VOL_RATIO, MAX_VOL_RATIO);

  // Negatieve 20d-return geeft een bonus (omgekeerd: positieve
  // vol-spike zonder koersdaling is minder interessant).
  const negReturnBonus =
    return20d < 0 ? Math.min(25, Math.round(-return20d * 100)) : 0;

  const mispricingScore = clamp(
    ratioStrength + negReturnBonus,
    0,
    100,
  );

  // Confidence is lager want we leunen op een proxy.
  const confidence = clamp(0.35 + 0.1 * (lowVolScore - MIN_LOWVOL_SCORE) / 35, 0, 0.6);

  const dataQuality: MispricingDataQualityAssessment = {
    required: DATA_QUALITY_REQUIREMENT,
    met: true,
    missing: [],
    score: 0.45,
  };

  return {
    type: "sentiment-price-divergence",
    ticker,
    mispricingScore,
    confidence,
    confidenceTier: deriveConfidenceTier(confidence),
    expectedHoldingPeriodDays: DEFAULT_HOLDING_PERIOD_DAYS,
    riskFlags: [
      buildRiskFlag("sentiment-proxy-only"),
      buildRiskFlag("momentum-reversal-fragile"),
      buildRiskFlag("small-sample-volatility"),
    ],
    dataQuality,
    rationale: [
      `LowVol-score ${Math.round(lowVolScore)}/100 duidt op historisch stabiel koersprofiel.`,
      `20d realized vol ${(shortVol * 100).toFixed(0)}% is ${ratio.toFixed(2)}× hoger dan 200d vol ${(longVol * 100).toFixed(0)}%.`,
      return20d < 0
        ? `20d-return ${formatPct(return20d)} suggereert paniek-verkoop i.p.v. structurele trend.`
        : "20d-return is niet duidelijk negatief; de vol-spike kan ook aan positief nieuws liggen.",
    ],
    riskNote:
      "Dit is een volatility-proxy, geen echt sentiment-signaal. Een vol-spike zonder duidelijke trigger kan net zo goed aankomende slechte cijfers voorspellen. Zonder news-/flow-feed blijft deze signalering suggestief.",
    detectedAt,
    expiresAt: computeExpiresAt(detectedAt, ttlDays),
  };
}

// ============================================================
//  Helpers
// ============================================================

function toUnit(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  if (value < 0 || value > 1) return null;
  return value;
}

function formatPct(fraction: number): string {
  const sign = fraction >= 0 ? "+" : "";
  return `${sign}${(fraction * 100).toFixed(1)}%`;
}
