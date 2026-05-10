/**
 * Classifier — neemt 7 raw indicators, normaliseert, en classificeert
 * naar één van 5 macro-regimes.
 *
 * **Twee-stappen**:
 *  1. Normaliseer elke indicator naar een `MacroIndicator` met score 0..100
 *     + trend + rationale.
 *  2. Map naar regime via groei × inflatie quadrant + confidence-bevestiging
 *     uit de overige 5 indicators.
 *
 * Drempels zijn `const` in deze file (Simons-laag) — wijziging vereist
 * een PR met motivatie.
 */

import type { ISODateString } from "@/types/common";

import type { RawMacroIndicator } from "./providers/types";
import {
  MACRO_INDICATOR_LABELS,
  MACRO_REGIME_DESCRIPTIONS,
  type MacroIndicator,
  type MacroIndicatorKey,
  type MacroRegime,
  type MacroRegimeClassification,
  type MacroTrend,
} from "./types";

// ============================================================
//  Drempels (constants)
// ============================================================

/** Inflatie boven CPI-target (~2%) telt als rising-inflation-druk. */
const INFLATION_TARGET = 2.0;
const INFLATION_HIGH = 4.0;
/** Trend-rente: hoge 10y zorgt voor druk op risicobudget + waardering. */
const RATE_HIGH = 5.0;
const RATE_LOW = 1.5;
/** Liquidity (M2 YoY): negatieve groei = krapping. */
const LIQUIDITY_LOW = 0;
const LIQUIDITY_HIGH = 6;
/** Recession probability — onze recession_risk-indicator komt al als 0..100. */
const RECESSION_HIGH = 50;
/** Volatility (VIX-equivalent) bands. */
const VOL_LOW = 14;
const VOL_HIGH = 26;
/** Sentiment 0..100 (hoger = risk-on). */
const SENTIMENT_LOW = 35;
const SENTIMENT_HIGH = 65;
/** Growth bands (% YoY). */
const GROWTH_HIGH = 2.5;
const GROWTH_LOW = 1.0;

// ============================================================
//  Hoofd-API
// ============================================================

export interface ClassifyMacroRegimeInput {
  rawIndicators: RawMacroIndicator[];
  asOf: ISODateString;
}

export function classifyMacroRegime(
  input: ClassifyMacroRegimeInput,
): MacroRegimeClassification {
  const indicators = canonicalize(input.rawIndicators, input.asOf);
  const { regime, confidence, supporting, conflicting } = pickRegime(indicators);
  const narrative = buildNarrative(regime, indicators);

  return {
    asOf: input.asOf,
    regime,
    confidence,
    narrative,
    indicators,
    supportingIndicators: supporting,
    conflictingIndicators: conflicting,
  };
}

// ============================================================
//  Stap 1 — normalisatie
// ============================================================

const ALL_KEYS: MacroIndicatorKey[] = [
  "growth",
  "inflation",
  "rates",
  "liquidity",
  "recession_risk",
  "volatility",
  "sentiment",
];

function canonicalize(
  raws: RawMacroIndicator[],
  asOf: ISODateString,
): MacroIndicator[] {
  const byKey = new Map(raws.map((r) => [r.key, r]));
  return ALL_KEYS.map((key) => {
    const raw = byKey.get(key);
    if (!raw) return emptyIndicator(key, asOf);
    return normalizeIndicator(raw);
  });
}

function emptyIndicator(
  key: MacroIndicatorKey,
  asOf: ISODateString,
): MacroIndicator {
  return {
    key,
    label: MACRO_INDICATOR_LABELS[key],
    trend: "unknown",
    score: null,
    rawValue: null,
    rationale: "Geen data beschikbaar voor deze indicator.",
    confidence: 0,
    asOf,
    source: "missing",
  };
}

function normalizeIndicator(raw: RawMacroIndicator): MacroIndicator {
  switch (raw.key) {
    case "growth":
      return scoreGrowth(raw);
    case "inflation":
      return scoreInflation(raw);
    case "rates":
      return scoreRates(raw);
    case "liquidity":
      return scoreLiquidity(raw);
    case "recession_risk":
      return scoreRecessionRisk(raw);
    case "volatility":
      return scoreVolatility(raw);
    case "sentiment":
      return scoreSentiment(raw);
  }
}

function scoreGrowth(r: RawMacroIndicator): MacroIndicator {
  // Score 0..100: ≤0% → 10, 1% → 35, 2% → 55, 3% → 75, ≥4% → 95.
  const v = r.value;
  const score =
    v === null
      ? null
      : clamp(linear(v, 0, 4, 10, 95));
  const dirText =
    r.trend === "rising" ? "stijgend" : r.trend === "falling" ? "dalend" : "stabiel";
  const rationale =
    v === null
      ? "Geen groei-indicator beschikbaar."
      : `BBP-groei rond ${v.toFixed(1)}% YoY (${dirText}).`;
  return base(r, score, "% YoY", rationale);
}

function scoreInflation(r: RawMacroIndicator): MacroIndicator {
  // Score: lager = beter (richting target). 2% → 70, 0% → 90, 5% → 25, 7%+ → 10.
  const v = r.value;
  const score =
    v === null
      ? null
      : clamp(linear(v, 0, 7, 90, 10));
  const dirText =
    r.trend === "rising" ? "stijgend" : r.trend === "falling" ? "dalend" : "stabiel";
  const rationale =
    v === null
      ? "Geen inflatie-data beschikbaar."
      : `CPI ${v.toFixed(1)}% YoY (${dirText}); ${
          v > INFLATION_HIGH
            ? "fors boven target"
            : v > INFLATION_TARGET
              ? "boven 2%-target"
              : "onder of rond target"
        }.`;
  return base(r, score, "% YoY", rationale);
}

function scoreRates(r: RawMacroIndicator): MacroIndicator {
  // Hoge rente = risk-off (lagere score). 1.5% → 80, 4% → 50, 5%+ → 25.
  const v = r.value;
  const score =
    v === null
      ? null
      : clamp(linear(v, RATE_LOW, RATE_HIGH + 1, 80, 20));
  const rationale =
    v === null
      ? "Geen 10y-rente beschikbaar."
      : `10y-rente op ${v.toFixed(2)}% (${r.trend === "rising" ? "stijgend" : r.trend === "falling" ? "dalend" : "stabiel"}).`;
  return base(r, score, "%", rationale);
}

function scoreLiquidity(r: RawMacroIndicator): MacroIndicator {
  // M2 YoY %: < 0 = krap (score 20), 6%+ = ruim (score 80).
  const v = r.value;
  const score =
    v === null
      ? null
      : clamp(linear(v, LIQUIDITY_LOW - 2, LIQUIDITY_HIGH + 2, 15, 90));
  const rationale =
    v === null
      ? "Geen liquiditeit-data beschikbaar."
      : `M2-groei ${v.toFixed(1)}% YoY (${r.trend === "rising" ? "ruimer" : r.trend === "falling" ? "krapper" : "stabiel"}).`;
  return base(r, score, "% YoY", rationale);
}

function scoreRecessionRisk(r: RawMacroIndicator): MacroIndicator {
  // Recession-risk komt al als 0..100. Hoog = slecht voor markten →
  // score = 100 − rawValue (hoger = beter macro-klimaat).
  const v = r.value;
  const score = v === null ? null : clamp(100 - v);
  const rationale =
    v === null
      ? "Geen recessie-indicator beschikbaar."
      : `Recessie-kans rond ${Math.round(v)}% (${
          v >= RECESSION_HIGH ? "verhoogd" : v >= 30 ? "neutraal" : "laag"
        }).`;
  return base(r, score, "%", rationale);
}

function scoreVolatility(r: RawMacroIndicator): MacroIndicator {
  // VIX-stijl: lage vol = stabiel klimaat. <14 → 85, 22 → 50, 35+ → 15.
  const v = r.value;
  const score =
    v === null ? null : clamp(linear(v, VOL_LOW, 35, 85, 15));
  const rationale =
    v === null
      ? "Geen volatility-meting beschikbaar."
      : `VIX-equivalent ${v.toFixed(1)} (${
          v >= VOL_HIGH ? "verhoogd" : v <= VOL_LOW ? "rustig" : "neutraal"
        }, ${r.trend === "rising" ? "stijgend" : r.trend === "falling" ? "dalend" : "stabiel"}).`;
  return base(r, score, "", rationale);
}

function scoreSentiment(r: RawMacroIndicator): MacroIndicator {
  // Sentiment komt al als 0..100 risk-on score → direct mapping.
  const v = r.value;
  const score = v === null ? null : clamp(v);
  const rationale =
    v === null
      ? "Geen sentiment-data beschikbaar."
      : `Sentiment-score ${Math.round(v)}/100 (${
          v >= SENTIMENT_HIGH ? "risk-on" : v <= SENTIMENT_LOW ? "risk-off" : "gemengd"
        }).`;
  return base(r, score, "/100", rationale);
}

// ============================================================
//  Stap 2 — quadrant + confidence
// ============================================================

interface RegimePick {
  regime: MacroRegime;
  confidence: number;
  supporting: MacroIndicatorKey[];
  conflicting: MacroIndicatorKey[];
}

/**
 * Quadrant-keus is gebaseerd op groei en inflatie:
 *   growthRising × inflationFalling  → GOLDILOCKS
 *   growthRising × inflationRising   → REFLATION
 *   growthFalling × inflationRising  → STAGFLATION
 *   growthFalling × inflationFalling → DEFLATION
 *
 * Bij onbekende richtingen → TRANSITIONAL.
 *
 * Confidence wordt verhoogd door bevestigende indicators (rates,
 * liquidity, recession-risk, volatility, sentiment) en verlaagd door
 * tegenstrijdige.
 */
function pickRegime(indicators: MacroIndicator[]): RegimePick {
  const byKey = new Map(indicators.map((i) => [i.key, i]));
  const growth = byKey.get("growth");
  const inflation = byKey.get("inflation");

  if (
    !growth ||
    !inflation ||
    growth.trend === "unknown" ||
    inflation.trend === "unknown"
  ) {
    return {
      regime: "TRANSITIONAL",
      confidence: 0.2,
      supporting: [],
      conflicting: [],
    };
  }

  const growthDirection = trendToBinary(growth.trend);
  const inflationDirection = trendToBinary(inflation.trend);

  let regime: MacroRegime;
  if (growthDirection === "up" && inflationDirection === "down") regime = "GOLDILOCKS";
  else if (growthDirection === "up" && inflationDirection === "up") regime = "REFLATION";
  else if (growthDirection === "down" && inflationDirection === "up") regime = "STAGFLATION";
  else if (growthDirection === "down" && inflationDirection === "down") regime = "DEFLATION";
  else regime = "TRANSITIONAL";

  // Confidence-bevestiging op basis van de overige 5 indicators.
  const { supporting, conflicting, confidence } = scoreConfidence(regime, indicators);

  return { regime, confidence, supporting, conflicting };
}

function scoreConfidence(
  regime: MacroRegime,
  indicators: MacroIndicator[],
): { supporting: MacroIndicatorKey[]; conflicting: MacroIndicatorKey[]; confidence: number } {
  const supporting: MacroIndicatorKey[] = [];
  const conflicting: MacroIndicatorKey[] = [];

  for (const ind of indicators) {
    if (ind.key === "growth" || ind.key === "inflation") continue;
    if (ind.score === null) continue;
    const verdict = doesIndicatorSupport(regime, ind);
    if (verdict === "support") supporting.push(ind.key);
    else if (verdict === "conflict") conflicting.push(ind.key);
  }

  const total = supporting.length + conflicting.length;
  if (total === 0) return { supporting, conflicting, confidence: 0.4 };
  const ratio = supporting.length / total;
  // Map 0..1 → 0.3..0.95 (we worden nooit 100% zeker).
  const confidence = clamp01(0.3 + 0.65 * ratio);
  return { supporting, conflicting, confidence };
}

function doesIndicatorSupport(
  regime: MacroRegime,
  ind: MacroIndicator,
): "support" | "conflict" | "neutral" {
  // Hoge score = gunstig macro-klimaat (risk-on). Lage score = krap.
  const high = ind.score !== null && ind.score >= 60;
  const low = ind.score !== null && ind.score <= 40;
  switch (regime) {
    case "GOLDILOCKS":
      // Risk-on, ruime liquiditeit, lage vol, lage recessie-kans, hoge sentiment.
      if (high) return "support";
      if (low) return "conflict";
      return "neutral";
    case "REFLATION":
      // Cyclisch herstel: stijgende rates kunnen als bevestiging tellen
      // (oververhitting); we kijken naar trend in plaats van score voor rates.
      if (ind.key === "rates") {
        return ind.trend === "rising" ? "support" : ind.trend === "falling" ? "conflict" : "neutral";
      }
      if (ind.key === "sentiment" && high) return "support";
      if (ind.key === "liquidity" && high) return "support";
      if (ind.key === "volatility" && low) return "conflict";
      return "neutral";
    case "STAGFLATION":
      // Hoge vol, hoge recessiekans, krappe liquiditeit, lage sentiment passen.
      if (ind.key === "volatility" && low) return "support"; // low score = high vol
      if (ind.key === "recession_risk" && low) return "support";
      if (ind.key === "liquidity" && low) return "support";
      if (ind.key === "sentiment" && low) return "support";
      if (high) return "conflict";
      return "neutral";
    case "DEFLATION":
      // Lage rates + hoge vol + lage sentiment + hoge recessiekans.
      if (ind.key === "rates" && ind.trend === "falling") return "support";
      if (ind.key === "recession_risk" && low) return "support";
      if (ind.key === "sentiment" && low) return "support";
      return "neutral";
    case "TRANSITIONAL":
      return "neutral";
  }
}

// ============================================================
//  Narrative
// ============================================================

function buildNarrative(
  regime: MacroRegime,
  indicators: MacroIndicator[],
): string {
  const desc = MACRO_REGIME_DESCRIPTIONS[regime];
  const growth = indicators.find((i) => i.key === "growth");
  const inflation = indicators.find((i) => i.key === "inflation");
  if (!growth || !inflation || growth.score === null || inflation.score === null) {
    return desc;
  }
  const growthLabel =
    growth.trend === "rising" ? "stijgende groei" : growth.trend === "falling" ? "dalende groei" : "stabiele groei";
  const inflationLabel =
    inflation.trend === "rising"
      ? "hardnekkige inflatie"
      : inflation.trend === "falling"
        ? "afkoelende inflatie"
        : "stabiele inflatie";
  return `Het huidige regime lijkt op ${growthLabel} + ${inflationLabel}. ${desc}`;
}

// ============================================================
//  Helpers
// ============================================================

function base(
  raw: RawMacroIndicator,
  score: number | null,
  unit: string,
  rationale: string,
): MacroIndicator {
  return {
    key: raw.key,
    label: MACRO_INDICATOR_LABELS[raw.key],
    trend: raw.trend,
    score,
    rawValue: raw.value,
    rawUnit: unit,
    rationale,
    confidence: raw.confidence,
    asOf: raw.asOf,
    source: raw.source,
  };
}

function trendToBinary(trend: MacroTrend): "up" | "down" | "flat" {
  if (trend === "rising") return "up";
  if (trend === "falling") return "down";
  return "flat";
}

function linear(
  value: number,
  fromLow: number,
  fromHigh: number,
  toLow: number,
  toHigh: number,
): number {
  if (!Number.isFinite(value)) return (toLow + toHigh) / 2;
  if (value <= fromLow) return toLow;
  if (value >= fromHigh) return toHigh;
  const t = (value - fromLow) / (fromHigh - fromLow);
  return toLow + t * (toHigh - toLow);
}

function clamp(v: number): number {
  if (!Number.isFinite(v)) return 50;
  if (v < 0) return 0;
  if (v > 100) return 100;
  return Math.round(v);
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return Math.round(v * 100) / 100;
}
