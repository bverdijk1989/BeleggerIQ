import type {
  ConcentrationType,
  CyclicalityLevel,
} from "@/types/rebalance";

import { sectorCyclicality } from "./sector-cyclicality";
import type { RebalanceThresholds } from "./thresholds";

/**
 * Concentration classifier.
 *
 * Bepaalt of een positie — ongeacht gewicht — een HEALTHY, NEUTRAL of
 * FRAGILE concentratieprofiel heeft. Onder de motorkap bouwen we een
 * fragility-score (0..100). Sterke factor-signalen (quality, momentum,
 * composite) drukken de score omlaag, zwakke signalen en cyclische sectors
 * stuwen hem omhoog.
 *
 * Conventie:
 *   - fragilityScore ≥ 60 → FRAGILE
 *   - fragilityScore ≥ 35 → NEUTRAL
 *   - anders             → HEALTHY
 *
 * De classifier is puur en kan ook gebruikt worden buiten de rebalance
 * pipeline (bv. door de AI explain layer).
 */

export interface ClassifyConcentrationInput {
  positionWeight: number;
  /** 0..100, hoger = beter. */
  qualityScore?: number | null;
  /** 0..100, hoger = beter. */
  momentumScore?: number | null;
  /** 0..100, composite factor score. */
  compositeScore?: number | null;
  /** Geannualiseerde volatility, fractie. `null` → onbekend. */
  volatility?: number | null;
  /** Alternatief signaal als `volatility` ontbreekt: 0..100 lowVol score. */
  lowVolScore?: number | null;
  sector?: string | null;
  thresholds: RebalanceThresholds;
}

export interface ConcentrationClassification {
  concentrationType: ConcentrationType;
  fragilityScore: number;
  reasons: string[];
  cyclicality: CyclicalityLevel;
}

export function classifyConcentrationType(
  input: ClassifyConcentrationInput,
): ConcentrationClassification {
  const reasons: string[] = [];
  let fragility = 20; // Neutrale basis; 0 zou "100% veilig" suggereren.

  // --- Position weight-drivers ---
  const weightVsMax = input.positionWeight / input.thresholds.maxPositionWeight;
  if (weightVsMax >= 2) {
    fragility += 25;
    reasons.push(
      `Positie is ${Math.round(input.positionWeight * 100)}% — ruim dubbel de policy-cap van ${Math.round(input.thresholds.maxPositionWeight * 100)}%.`,
    );
  } else if (weightVsMax >= 1.5) {
    fragility += 15;
    reasons.push(
      `Positie is ${Math.round(input.positionWeight * 100)}% — 1,5× boven de policy-cap.`,
    );
  } else if (weightVsMax >= 1) {
    fragility += 8;
    reasons.push(
      `Positie is ${Math.round(input.positionWeight * 100)}% — net boven policy-cap.`,
    );
  }

  // --- Quality-driver (zwakke quality maakt zware positie riskanter) ---
  // Een score van exact 55 telt als "onder gemiddeld"; zonder deze grens
  // glijdt een positie met matig kwaliteitsprofiel ten onrechte naar HEALTHY.
  if (typeof input.qualityScore === "number") {
    if (input.qualityScore < 40) {
      fragility += 20;
      reasons.push(`Zwakke Quality (${Math.round(input.qualityScore)}/100).`);
    } else if (input.qualityScore < 60) {
      fragility += 10;
      reasons.push(`Quality onder gemiddeld (${Math.round(input.qualityScore)}/100).`);
    } else if (input.qualityScore >= 70) {
      fragility -= 15;
      reasons.push(`Sterke Quality (${Math.round(input.qualityScore)}/100) dempt risico.`);
    }
  }

  // --- Momentum-driver ---
  if (typeof input.momentumScore === "number") {
    if (input.momentumScore < 35) {
      fragility += 15;
      reasons.push(
        `Zwak momentum (${Math.round(input.momentumScore)}/100) — trend draait weg.`,
      );
    } else if (input.momentumScore < 50) {
      fragility += 8;
      reasons.push(`Momentum onder gemiddeld (${Math.round(input.momentumScore)}/100).`);
    } else if (input.momentumScore >= 65) {
      fragility -= 10;
      reasons.push(`Sterk momentum (${Math.round(input.momentumScore)}/100).`);
    }
  }

  // --- Composite offset: expliciete "winner" krijgt korting ---
  if (typeof input.compositeScore === "number") {
    if (input.compositeScore >= 75) {
      fragility -= 18;
      reasons.push(
        `Composite score ${Math.round(input.compositeScore)}/100 — duidelijke kwaliteitspositie.`,
      );
    } else if (input.compositeScore >= 65) {
      fragility -= 8;
    } else if (input.compositeScore <= 30) {
      fragility += 15;
      reasons.push(
        `Composite score ${Math.round(input.compositeScore)}/100 — zwak factorprofiel.`,
      );
    }
  }

  // --- Volatility-driver ---
  const volSignal = deriveVolatilityLevel(input);
  if (volSignal === "high") {
    fragility += 15;
    reasons.push("Hoge volatiliteit vergroot het concentratierisico.");
  } else if (volSignal === "low") {
    fragility -= 8;
    reasons.push("Lage volatiliteit houdt het risico beheersbaar.");
  }

  // --- Sector cyclicality ---
  const cyclicality = sectorCyclicality(input.sector ?? null);
  if (cyclicality === "high") {
    fragility += 10;
    reasons.push(`Cyclische sector (${input.sector}) vergroot downturn-risico.`);
  } else if (cyclicality === "low") {
    fragility -= 5;
  }

  const fragilityScore = clamp(Math.round(fragility), 0, 100);
  const concentrationType: ConcentrationType =
    fragilityScore >= 60
      ? "FRAGILE"
      : fragilityScore >= 35
        ? "NEUTRAL"
        : "HEALTHY";

  if (reasons.length === 0) {
    reasons.push("Signalen liggen rond het gemiddelde — geen duidelijke drivers.");
  }

  return {
    concentrationType,
    fragilityScore,
    reasons,
    cyclicality,
  };
}

// ============================================================
//  Internals
// ============================================================

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Leidt een volatility-niveau af uit de expliciete volatility (als fractie)
 * of — als die ontbreekt — uit de lowVol factor sub-score.
 */
function deriveVolatilityLevel(
  input: ClassifyConcentrationInput,
): "low" | "moderate" | "high" | "unknown" {
  if (
    typeof input.volatility === "number" &&
    Number.isFinite(input.volatility)
  ) {
    if (input.volatility >= 0.35) return "high";
    if (input.volatility >= 0.22) return "moderate";
    return "low";
  }
  if (
    typeof input.lowVolScore === "number" &&
    Number.isFinite(input.lowVolScore)
  ) {
    if (input.lowVolScore <= 30) return "high";
    if (input.lowVolScore <= 55) return "moderate";
    return "low";
  }
  return "unknown";
}
