import type { FundamentalsSnapshot } from "@/types/factor";

import {
  buildRiskFlag,
  deriveConfidenceTier,
  type MispricingDataQualityAssessment,
  type MispricingDataQualityRequirement,
  type MispricingSignal,
} from "./types";
import { clamp, computeExpiresAt, scaleStrength } from "./shared";

/**
 * Detector 1/4 — **valuation-gap**.
 *
 * Triggert wanneer de huidige waarderingsratio's van de ticker
 * significant onder een benchmark liggen (sector-mediaan en/of eigen
 * 5-jaar historische mediaan). Deze detector focust op **structurele**
 * waardeverschillen; daarom is de default `expectedHoldingPeriodDays`
 * 365 (lange convergentie-periode).
 *
 * Signalen zijn kwantitatief, niet narratief:
 *   - `peDiscount = 1 - currentPE / benchmarkPE` (hogere discount = sterker)
 *   - idem voor fcfYield-premium: `currentFcfYield / benchmarkFcfYield - 1`
 *
 * Alle thresholds zijn expliciet en als constanten bovenin gedefinieerd
 * zodat de rule reproduceerbaar blijft.
 */

// ============================================================
//  Drempels — expliciet en reproduceerbaar
// ============================================================

/** Minimale P/E-discount t.o.v. benchmark voordat er überhaupt strength is. */
const MIN_PE_DISCOUNT = 0.25; // 25% goedkoper dan benchmark
/** Maximale P/E-discount die 100-strength oplevert (clamp-grens). */
const MAX_PE_DISCOUNT = 0.6; // 60%+ goedkoper → full strength

/** Minimale FCF-yield voorsprong (bv. 1.2 = 20% hoger dan benchmark). */
const MIN_FCF_PREMIUM = 0.2;
const MAX_FCF_PREMIUM = 1.5;

/** Default holding-periode: lange mean-reversion. */
const DEFAULT_HOLDING_PERIOD_DAYS = 365;

const DATA_QUALITY_REQUIREMENT: MispricingDataQualityRequirement = {
  minHistoryDays: 0,
  requiresFundamentals: true,
  requiresFactorScore: false,
  requiresPeerBasket: false,
  minPeerCount: 0,
};

// ============================================================
//  Input + public fn
// ============================================================

export interface DetectValuationGapInput {
  ticker: string;
  fundamentals?: FundamentalsSnapshot | null;
  /** Benchmark P/E (sector-mediaan of universe-mediaan). */
  benchmarkPE?: number | null;
  /** Eigen 5-jaar mediaan P/E van dezelfde ticker. Optioneel. */
  historicalMedianPE?: number | null;
  /** Benchmark FCF-yield (hogere yield = betere koop). */
  benchmarkFcfYield?: number | null;
  /**
   * Quality-score (0..100) die de engine al heeft berekend. Indien
   * beschikbaar en hoog: minder kans op value trap → confidence bump.
   */
  qualityScore?: number | null;
  /** ISO-timestamp voor deterministische tests (default: `new Date()`). */
  now?: string;
  /** Signal-TTL in dagen (default 30). */
  ttlDays?: number;
}

/**
 * Retourneert een signaal of `null` wanneer de ticker niet genoeg
 * goedkoper is, of wanneer de benodigde data ontbreekt.
 */
export function detectValuationGap(
  input: DetectValuationGapInput,
): MispricingSignal | null {
  const detectedAt = input.now ?? new Date().toISOString();
  const ttlDays = input.ttlDays ?? 30;
  const fundamentals = input.fundamentals ?? null;

  // Data-quality gate — fundamentals zijn verplicht.
  const missing: string[] = [];
  if (!fundamentals) missing.push("fundamentals");
  const pe = toPositive(fundamentals?.pe);
  const fcfYield = toFinite(fundamentals?.fcfYield);
  const benchmarkPE = toPositive(input.benchmarkPE);
  const benchmarkFcf = toPositive(input.benchmarkFcfYield);

  if (pe === null && fcfYield === null) missing.push("pe-or-fcfYield");
  if (benchmarkPE === null && benchmarkFcf === null) {
    missing.push("benchmark-pe-or-fcfYield");
  }
  if (missing.length > 0) return null;

  // Bereken discount-metrics. Ten minste één moet triggeren.
  const peDiscount =
    pe !== null && benchmarkPE !== null && benchmarkPE > 0
      ? 1 - pe / benchmarkPE
      : null;
  const historicalDiscount =
    pe !== null &&
    input.historicalMedianPE !== null &&
    input.historicalMedianPE !== undefined &&
    input.historicalMedianPE > 0
      ? 1 - pe / input.historicalMedianPE
      : null;
  const fcfPremium =
    fcfYield !== null && benchmarkFcf !== null && benchmarkFcf > 0
      ? fcfYield / benchmarkFcf - 1
      : null;

  const peOk = peDiscount !== null && peDiscount >= MIN_PE_DISCOUNT;
  const histOk =
    historicalDiscount !== null && historicalDiscount >= MIN_PE_DISCOUNT;
  const fcfOk = fcfPremium !== null && fcfPremium >= MIN_FCF_PREMIUM;

  if (!peOk && !histOk && !fcfOk) return null;

  // Strength = max van de beschikbare drivers.
  const peStrength = peOk
    ? scaleStrength(peDiscount!, MIN_PE_DISCOUNT, MAX_PE_DISCOUNT)
    : 0;
  const histStrength = histOk
    ? scaleStrength(historicalDiscount!, MIN_PE_DISCOUNT, MAX_PE_DISCOUNT)
    : 0;
  const fcfStrength = fcfOk
    ? scaleStrength(fcfPremium!, MIN_FCF_PREMIUM, MAX_FCF_PREMIUM)
    : 0;
  const mispricingScore = clamp(
    Math.max(peStrength, histStrength, fcfStrength),
    0,
    100,
  );

  // Rationale-bullets per beschikbare driver.
  const rationale: string[] = [];
  if (peOk) {
    rationale.push(
      `P/E ${formatRatio(pe!)} ligt ${formatPct(peDiscount!)} onder benchmark (${formatRatio(benchmarkPE!)}).`,
    );
  }
  if (histOk) {
    rationale.push(
      `P/E ${formatRatio(pe!)} ligt ${formatPct(historicalDiscount!)} onder 5-jaar mediaan (${formatRatio(input.historicalMedianPE!)}).`,
    );
  }
  if (fcfOk) {
    rationale.push(
      `FCF-yield ${formatPctValue(fcfYield!)} is ${formatPct(fcfPremium!)} hoger dan benchmark (${formatPctValue(benchmarkFcf!)}).`,
    );
  }

  // Confidence: basis 0.5, +0.15 voor elk beschikbare driver (max 3),
  // +0.1 bij hoge quality-score (minder value-trap-risico). Clamp [0,1].
  const drivers = Number(peOk) + Number(histOk) + Number(fcfOk);
  let confidence = 0.35 + 0.15 * drivers;
  if ((input.qualityScore ?? 0) >= 70) confidence += 0.1;
  confidence = clamp(confidence, 0, 1);

  // Risk-flags.
  const riskFlags = [buildRiskFlag("value-trap")];
  if ((input.qualityScore ?? null) === null) {
    riskFlags.push(buildRiskFlag("earnings-deterioration-unknown"));
  }
  if (!fundamentals?.source || fundamentals.source === "unknown") {
    riskFlags.push(buildRiskFlag("single-source-fundamentals"));
  }

  const dataQuality: MispricingDataQualityAssessment = {
    required: DATA_QUALITY_REQUIREMENT,
    met: true,
    missing: [],
    score: clamp(0.5 + 0.15 * drivers, 0, 1),
  };

  return {
    type: "valuation-gap",
    ticker: input.ticker,
    mispricingScore,
    confidence,
    confidenceTier: deriveConfidenceTier(confidence),
    expectedHoldingPeriodDays: DEFAULT_HOLDING_PERIOD_DAYS,
    riskFlags,
    dataQuality,
    rationale,
    riskNote:
      "Lage waarderingsratio's kunnen een permanent lagere winstcapaciteit weerspiegelen (value trap). Controleer of de winst-/marge-trend niet structureel daalt voordat je op mean-reversion leunt.",
    detectedAt,
    expiresAt: computeExpiresAt(detectedAt, ttlDays),
  };
}

// ============================================================
//  Helpers
// ============================================================

function toPositive(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return value > 0 ? value : null;
}

function toFinite(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function formatRatio(value: number): string {
  return value.toFixed(1);
}

function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function formatPctValue(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}
