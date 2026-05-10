/**
 * Per-component scorers voor de Portfolio Health Score.
 *
 * Elke functie neemt een **strikt-gemodelleerde input** en levert een
 * `HealthComponent` met score + rationale + recommendations. Pure
 * functions; geen Prisma, geen netwerk, geen Date.now() (tenzij
 * expliciet meegegeven).
 *
 * Convention: bij ontbrekende data → status `no_data`, score 50 (neutraal),
 * confidence 0. Anders → score 0..100 + confidence ≥ 0.5.
 *
 * **Drempels** zijn afgeleid uit `risk-engine/thresholds.ts` waar
 * mogelijk om consistentie met de risk-flag-engine te behouden. Waar de
 * health-engine andere thresholds nodig heeft staan ze inline gemotiveerd.
 */

import type { RiskSeverity } from "@/types/risk";

import type {
  HealthComponent,
  HealthComponentKey,
  HealthComponentStatus,
  HealthRecommendation,
} from "./types";
import { HEALTH_COMPONENT_LABELS } from "./types";

// ============================================================
//  Shared utilities
// ============================================================

const NEUTRAL_SCORE = 50;
const MIN_CONFIDENCE_GOOD = 0.7;

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return NEUTRAL_SCORE;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Lineaire interpolatie tussen `[fromLow, fromHigh]` waarden naar
 * `[scoreAtLow, scoreAtHigh]`. Buiten de range geclampd.
 */
function linearScore(
  value: number,
  fromLow: number,
  fromHigh: number,
  scoreAtLow: number,
  scoreAtHigh: number,
): number {
  if (!Number.isFinite(value)) return NEUTRAL_SCORE;
  if (value <= fromLow) return scoreAtLow;
  if (value >= fromHigh) return scoreAtHigh;
  const t = (value - fromLow) / (fromHigh - fromLow);
  return clamp(scoreAtLow + t * (scoreAtHigh - scoreAtLow));
}

function statusFromScore(score: number, hasData: boolean): HealthComponentStatus {
  if (!hasData) return "no_data";
  if (score >= 80) return "strong";
  if (score >= 60) return "ok";
  if (score >= 35) return "weak";
  return "critical";
}

function noDataComponent(
  key: HealthComponentKey,
  weight: number,
  reason: string,
): HealthComponent {
  return {
    key,
    label: HEALTH_COMPONENT_LABELS[key],
    score: NEUTRAL_SCORE,
    weight,
    contribution: NEUTRAL_SCORE * weight,
    status: "no_data",
    rationale: reason,
    recommendations: [],
    metricValue: null,
    confidence: 0,
  };
}

function buildComponent(input: {
  key: HealthComponentKey;
  weight: number;
  score: number;
  hasData: boolean;
  rationale: string;
  recommendations: HealthRecommendation[];
  metricValue?: number | null;
  confidence: number;
}): HealthComponent {
  const { key, weight, score, hasData, rationale, recommendations, metricValue, confidence } =
    input;
  const final = clamp(score);
  return {
    key,
    label: HEALTH_COMPONENT_LABELS[key],
    score: Math.round(final),
    weight,
    contribution: Math.round(final * weight * 100) / 100,
    status: statusFromScore(final, hasData),
    rationale,
    recommendations,
    metricValue: metricValue ?? null,
    confidence: clamp(confidence * 100, 0, 100) / 100,
  };
}

// ============================================================
//  1. Diversification — # posities + HHI op weight
// ============================================================

export interface DiversificationInput {
  positionCount: number;
  /** Position-weight HHI 0..1 (hoger = meer concentratie). */
  hhi: number;
  /** Top-5 weight som 0..1. */
  top5Weight: number;
}

export function scoreDiversification(
  input: DiversificationInput,
  weight: number,
): HealthComponent {
  if (input.positionCount === 0) {
    return noDataComponent(
      "diversification",
      weight,
      "Nog geen posities om te beoordelen.",
    );
  }

  // Component-score: gewogen sub-score van 3 dingen.
  // - Positie-count: 0 → 0, 8 → 70, 15+ → 100 (diversificatie-floor; Markowitz)
  const countScore = linearScore(input.positionCount, 1, 15, 25, 100);
  // - HHI: 0.05 (zeer breed) → 100, 0.30 (zeer geconcentreerd) → 0
  const hhiScore = linearScore(input.hhi, 0.05, 0.30, 100, 0);
  // - Top-5: ≤ 30% → 100, ≥ 80% → 0
  const top5Score = linearScore(input.top5Weight, 0.30, 0.80, 100, 0);

  const score = countScore * 0.35 + hhiScore * 0.40 + top5Score * 0.25;

  const recommendations: HealthRecommendation[] = [];
  if (input.positionCount < 8) {
    recommendations.push({
      title: "Voeg posities toe",
      detail: `Je hebt ${input.positionCount} posities. ≥ 8 verlaagt single-name risico fors (Markowitz-diversificatie-curve).`,
      link: "/maandbeslissing",
      expectedImpact: 8,
    });
  }
  if (input.top5Weight > 0.6) {
    recommendations.push({
      title: "Spreid je top-5",
      detail: `Top-5 posities zijn ${Math.round(input.top5Weight * 100)}% van de portefeuille. Trim de zwaarste of bouw de buitenste 5 op.`,
      link: "/maandbeslissing",
      expectedImpact: 5,
    });
  }

  const rationale =
    score >= 70
      ? `Goede spreiding (${input.positionCount} posities, top-5 ${Math.round(input.top5Weight * 100)}%).`
      : `${input.positionCount} posities; top-5 is ${Math.round(input.top5Weight * 100)}% van het totaal.`;

  return buildComponent({
    key: "diversification",
    weight,
    score,
    hasData: true,
    rationale,
    recommendations,
    metricValue: input.hhi,
    confidence: input.positionCount >= 5 ? 1 : 0.6,
  });
}

// ============================================================
//  2. Sector concentration — HHI op sector-weights
// ============================================================

export interface SectorConcentrationInput {
  /** Sector-HHI 0..1, of null wanneer onvoldoende sector-data. */
  sectorHhi: number | null;
  /** Grootste sector-weight 0..1. */
  largestSectorWeight: number | null;
  /** Aantal holdings met geclassificeerde sector / totaal holdings. */
  sectorCoverage: number;
}

export function scoreSectorConcentration(
  input: SectorConcentrationInput,
  weight: number,
): HealthComponent {
  if (
    input.sectorHhi === null ||
    input.largestSectorWeight === null ||
    input.sectorCoverage < 0.5
  ) {
    return noDataComponent(
      "sector_concentration",
      weight,
      "Onvoldoende sector-data in posities (< 50% van holdings heeft sector-classificatie).",
    );
  }

  // HHI: 0.15 (well-spread) → 100, 0.50 (één sector domineert) → 0
  const hhiScore = linearScore(input.sectorHhi, 0.15, 0.50, 100, 0);
  // Largest: 25% → 100, 60% → 0
  const largestScore = linearScore(input.largestSectorWeight, 0.25, 0.60, 100, 0);

  const score = hhiScore * 0.5 + largestScore * 0.5;

  const recommendations: HealthRecommendation[] = [];
  if (input.largestSectorWeight > 0.4) {
    recommendations.push({
      title: "Diversifieer over sectoren",
      detail: `${Math.round(input.largestSectorWeight * 100)}% staat in één sector. Bouw exposure op in een complementaire sector om correlatie-risico te verlagen.`,
      link: "/maandbeslissing",
      expectedImpact: 6,
    });
  }

  const rationale =
    score >= 70
      ? `Sector-spreiding gezond (HHI ${input.sectorHhi.toFixed(2)}).`
      : `Sector-concentratie meetbaar — grootste sector ${Math.round(input.largestSectorWeight * 100)}%.`;

  return buildComponent({
    key: "sector_concentration",
    weight,
    score,
    hasData: true,
    rationale,
    recommendations,
    metricValue: input.sectorHhi,
    confidence: input.sectorCoverage,
  });
}

// ============================================================
//  3. Geographic concentration — HHI op region-weights
// ============================================================

export interface GeographicInput {
  /** Region-HHI 0..1. */
  regionHhi: number | null;
  /** Grootste regio-weight 0..1. */
  largestRegionWeight: number | null;
  /** Aandeel holdings met geclassificeerde regio. */
  regionCoverage: number;
}

export function scoreGeographicConcentration(
  input: GeographicInput,
  weight: number,
): HealthComponent {
  if (
    input.regionHhi === null ||
    input.largestRegionWeight === null ||
    input.regionCoverage < 0.5
  ) {
    return noDataComponent(
      "geographic_concentration",
      weight,
      "Onvoldoende regio-data in posities.",
    );
  }

  // 80% in één regio is gangbaar (US-bias bij index-trackers); we straffen
  // pas boven 90%. Onder 60% in één regio = sterk gespreid.
  const hhiScore = linearScore(input.regionHhi, 0.40, 0.85, 100, 0);
  const largestScore = linearScore(
    input.largestRegionWeight,
    0.60,
    0.95,
    100,
    20,
  );
  const score = hhiScore * 0.5 + largestScore * 0.5;

  const recommendations: HealthRecommendation[] = [];
  if (input.largestRegionWeight > 0.85) {
    recommendations.push({
      title: "Voeg ex-regio exposure toe",
      detail: `${Math.round(input.largestRegionWeight * 100)}% in één regio — overweeg een breed-internationale ETF (bv. emerging-markets) als counter-tilt.`,
      link: "/screener",
      expectedImpact: 3,
    });
  }

  const rationale =
    score >= 70
      ? `Regio-mix is gezond gespreid.`
      : `Concentratie in één regio: ${Math.round(input.largestRegionWeight * 100)}%.`;

  return buildComponent({
    key: "geographic_concentration",
    weight,
    score,
    hasData: true,
    rationale,
    recommendations,
    metricValue: input.regionHhi,
    confidence: input.regionCoverage,
  });
}

// ============================================================
//  4. Volatility — geannualiseerde portfolio-vol
// ============================================================

export interface VolatilityInput {
  /** Geannualiseerde volatility, fractie (0.18 = 18%). */
  annualizedVolatility: number | null;
  /** Aantal datapoints in de gebruikte koersreeks (voor confidence). */
  sampleSize: number;
}

export function scoreVolatility(
  input: VolatilityInput,
  weight: number,
): HealthComponent {
  if (input.annualizedVolatility === null || input.sampleSize < 30) {
    return noDataComponent(
      "volatility",
      weight,
      "Te weinig koershistorie (<30 datapoints) om volatility te schatten.",
    );
  }

  // 12% (very stable) → 100, 35% (very volatile) → 0
  const score = linearScore(input.annualizedVolatility, 0.12, 0.35, 100, 0);

  const recommendations: HealthRecommendation[] = [];
  if (input.annualizedVolatility > 0.30) {
    recommendations.push({
      title: "Verlaag volatiliteit-bron",
      detail:
        "Hoge volatility komt meestal uit single-name growth-aandelen. Trim de meest volatiele posities of voeg een lage-vol-ETF toe.",
      link: "/risico",
      expectedImpact: 5,
    });
  }

  const rationale =
    score >= 70
      ? `Stabiel volatility-profiel (${Math.round(input.annualizedVolatility * 100)}% jaarlijks).`
      : `Verhoogde volatility (${Math.round(input.annualizedVolatility * 100)}% jaarlijks).`;

  return buildComponent({
    key: "volatility",
    weight,
    score,
    hasData: true,
    rationale,
    recommendations,
    metricValue: input.annualizedVolatility,
    confidence: Math.min(1, input.sampleSize / 90),
  });
}

// ============================================================
//  5. Max drawdown — uit historische snapshots
// ============================================================

export interface DrawdownInput {
  /** Max drawdown over beschikbare historie, fractie 0..1 (positief getal = grootte van peak-to-trough verlies). */
  maxDrawdown: number | null;
  /** Aantal snapshots gebruikt. */
  sampleSize: number;
}

export function scoreMaxDrawdown(
  input: DrawdownInput,
  weight: number,
): HealthComponent {
  if (input.maxDrawdown === null || input.sampleSize < 20) {
    return noDataComponent(
      "max_drawdown",
      weight,
      "Te weinig snapshot-historie om drawdown betrouwbaar te meten.",
    );
  }

  // 5% drawdown → 100, 40% drawdown → 0. Geijkt op beleggers-realiteit:
  // -5% is normaal monthly noise, -40% is 2008/2020-niveau crisis.
  const score = linearScore(input.maxDrawdown, 0.05, 0.40, 100, 0);

  const recommendations: HealthRecommendation[] = [];
  if (input.maxDrawdown > 0.30) {
    recommendations.push({
      title: "Bouw verdedigingslaag",
      detail: `Historische drawdown van ${Math.round(input.maxDrawdown * 100)}% — overweeg defensieve toevoegingen (broad-market ETF, bond-allocatie of cash-buffer).`,
      link: "/risico",
      expectedImpact: 4,
    });
  }

  const rationale =
    score >= 70
      ? `Beheersbare drawdown-historie (-${Math.round(input.maxDrawdown * 100)}%).`
      : `Stevige peak-to-trough drawdown (-${Math.round(input.maxDrawdown * 100)}%).`;

  return buildComponent({
    key: "max_drawdown",
    weight,
    score,
    hasData: true,
    rationale,
    recommendations,
    metricValue: input.maxDrawdown,
    confidence: Math.min(1, input.sampleSize / 60),
  });
}

// ============================================================
//  6. Cash / risk buffer
// ============================================================

export interface CashBufferInput {
  /** Cash als fractie van totalValue. */
  cashShare: number;
  /** Door user gewenst minimum, default 0.05. */
  targetCashShare?: number;
  /** Of het regime DEFENSIVE is — dan straffen we lage cash zwaarder. */
  isDefensiveRegime?: boolean;
}

export function scoreCashBuffer(
  input: CashBufferInput,
  weight: number,
): HealthComponent {
  const target = input.targetCashShare ?? 0.05;

  // We willen NIET een zo hoog mogelijke cash. Te veel cash = drag.
  // Sweet-spot is rond target. Score:
  //  - 0% cash: 30 (te krap)
  //  - target × 0.5: 70
  //  - target × 1.0: 90
  //  - target × 2.0: 100 (sweet spot upper)
  //  - 30% cash: 50 (excessieve cash-drag)
  let score: number;
  if (input.cashShare < target * 0.5) {
    score = linearScore(input.cashShare, 0, target * 0.5, 30, 70);
  } else if (input.cashShare < target * 2) {
    score = linearScore(input.cashShare, target * 0.5, target * 2, 70, 100);
  } else {
    score = linearScore(input.cashShare, target * 2, 0.30, 100, 50);
  }

  // DEFENSIVE-regime: laag cash = extra straf (Druckenmiller-laag —
  // cash droog kruit voor koopjes).
  if (input.isDefensiveRegime && input.cashShare < target * 0.5) {
    score = Math.max(0, score - 20);
  }

  const recommendations: HealthRecommendation[] = [];
  if (input.cashShare < target * 0.5) {
    recommendations.push({
      title: "Bouw cash-buffer op",
      detail: `Cash is ${Math.round(input.cashShare * 100)}%. Een buffer van ${Math.round(target * 100)}% geeft ruimte voor opportuniteit-koopjes en rebalance-flexibiliteit.`,
      link: "/maandbeslissing",
      expectedImpact: 3,
    });
  } else if (input.cashShare > 0.30) {
    recommendations.push({
      title: "Zet cash aan het werk",
      detail: `${Math.round(input.cashShare * 100)}% cash is veel; cash-drag kost ~${(input.cashShare * 0.05 * 100).toFixed(1)}% per jaar in opportunity-cost.`,
      link: "/maandbeslissing",
      expectedImpact: 4,
    });
  }

  const rationale =
    score >= 80
      ? `Cash-buffer in lijn met target (${Math.round(input.cashShare * 100)}%).`
      : input.cashShare < target * 0.5
      ? `Cash-buffer (${Math.round(input.cashShare * 100)}%) onder target ${Math.round(target * 100)}%.`
      : `Cash-allocatie ${Math.round(input.cashShare * 100)}% — overweeg deployment.`;

  return buildComponent({
    key: "cash_buffer",
    weight,
    score,
    hasData: true,
    rationale,
    recommendations,
    metricValue: input.cashShare,
    confidence: 1,
  });
}

// ============================================================
//  7. Dividend quality
// ============================================================

export interface DividendQualityInput {
  /** Gewogen gemiddelde dividend-yield over income-producerende posities, fractie. */
  weightedYield: number | null;
  /** Aantal posities met dividend-data. */
  positionsWithDividends: number;
  /** Totaal aantal posities. */
  totalPositions: number;
  /** Investment-objective uit profile — beïnvloedt scoring. */
  isIncomeObjective: boolean;
}

export function scoreDividendQuality(
  input: DividendQualityInput,
  weight: number,
): HealthComponent {
  if (input.weightedYield === null || input.positionsWithDividends === 0) {
    // Voor INCOME-objective is dit echt no-data + waarschuwing.
    // Voor GROWTH/BALANCED is geen dividend zelfs gewenst — dan
    // markeren we 'em als ok (neutraal) i.p.v. no_data.
    if (input.isIncomeObjective) {
      return noDataComponent(
        "dividend_quality",
        weight,
        "Geen dividend-data — voor een income-portefeuille is dit een belangrijke metric.",
      );
    }
    // Growth-portfolio zonder dividenden = expected. Geef een vaste 75 score.
    return buildComponent({
      key: "dividend_quality",
      weight,
      score: 75,
      hasData: true,
      rationale:
        "Geen dividend-uitkeringen — past bij een growth-/accumulatie-strategie.",
      recommendations: [],
      metricValue: null,
      confidence: 0.7,
    });
  }

  // Score op yield: 1.5% → 60, 3.5% → 100 (sweet spot voor balanced),
  // > 7% = waarschuwing (yield-trap risk).
  let score: number;
  if (input.weightedYield <= 0.035) {
    score = linearScore(input.weightedYield, 0, 0.035, 50, 100);
  } else if (input.weightedYield <= 0.07) {
    score = linearScore(input.weightedYield, 0.035, 0.07, 100, 80);
  } else {
    score = linearScore(input.weightedYield, 0.07, 0.15, 80, 30);
  }

  const recommendations: HealthRecommendation[] = [];
  if (input.weightedYield > 0.07) {
    recommendations.push({
      title: "Onderzoek yield-trap-risico",
      detail: `Gewogen yield ${(input.weightedYield * 100).toFixed(1)}% is hoog — controleer of de dividenden gedekt worden door FCF + payout-ratio.`,
      link: "/portfolio",
      expectedImpact: 2,
    });
  }
  if (
    input.isIncomeObjective &&
    input.positionsWithDividends / input.totalPositions < 0.5
  ) {
    recommendations.push({
      title: "Voeg dividend-betalers toe",
      detail: `Maar ${input.positionsWithDividends} van ${input.totalPositions} posities betalen dividend; voor een income-doel is dat krap.`,
      link: "/screener",
      expectedImpact: 3,
    });
  }

  const rationale = `Gewogen dividend-yield ${(input.weightedYield * 100).toFixed(1)}% over ${input.positionsWithDividends} posities.`;

  return buildComponent({
    key: "dividend_quality",
    weight,
    score,
    hasData: true,
    rationale,
    recommendations,
    metricValue: input.weightedYield,
    confidence: input.positionsWithDividends / Math.max(1, input.totalPositions),
  });
}

// ============================================================
//  8. Fundamental quality — gewogen avg quality sub-score
// ============================================================

export interface FundamentalQualityInput {
  /** Gewogen gemiddelde quality-sub-score over factor-scored holdings, 0..100. */
  weightedQualityScore: number | null;
  /** Coverage 0..1 — fractie van portfolio-weight met quality-data. */
  coverage: number;
}

export function scoreFundamentalQuality(
  input: FundamentalQualityInput,
  weight: number,
): HealthComponent {
  if (input.weightedQualityScore === null || input.coverage < 0.4) {
    return noDataComponent(
      "fundamental_quality",
      weight,
      `Quality-data dekt maar ${Math.round(input.coverage * 100)}% van de portefeuille — onvoldoende voor betrouwbare meting.`,
    );
  }

  // Direct mapping: quality-sub-score is al 0..100.
  const score = input.weightedQualityScore;

  const recommendations: HealthRecommendation[] = [];
  if (score < 50) {
    recommendations.push({
      title: "Upgrade naar quality-namen",
      detail: `Gewogen quality is ${Math.round(score)}/100. Buffett-laag: high-ROIC + low-debt-companies hebben historisch betere risk-adjusted returns.`,
      link: "/screener",
      expectedImpact: 7,
    });
  }

  const rationale =
    score >= 70
      ? `Sterk fundamenteel kwaliteitsprofiel (gewogen ${Math.round(score)}/100).`
      : `Gemiddelde fundamentele kwaliteit (gewogen ${Math.round(score)}/100).`;

  return buildComponent({
    key: "fundamental_quality",
    weight,
    score,
    hasData: true,
    rationale,
    recommendations,
    metricValue: score,
    confidence: input.coverage,
  });
}

// ============================================================
//  9. Valuation risk — invert van value-sub-score
// ============================================================

export interface ValuationRiskInput {
  /** Gewogen gemiddelde value-sub-score 0..100. Hoger value = lager waarderingsrisico. */
  weightedValueScore: number | null;
  /** Coverage 0..1. */
  coverage: number;
}

export function scoreValuationRisk(
  input: ValuationRiskInput,
  weight: number,
): HealthComponent {
  if (input.weightedValueScore === null || input.coverage < 0.4) {
    return noDataComponent(
      "valuation_risk",
      weight,
      `Valuation-data dekt maar ${Math.round(input.coverage * 100)}% van de portefeuille.`,
    );
  }

  // Value sub-score is hoger = goedkoper. We willen 0..100 score waar
  // hoger = minder risico. Direct mapping past: hoge value-score → lage
  // valuation-risk → hoge health-score.
  const score = input.weightedValueScore;

  const recommendations: HealthRecommendation[] = [];
  if (score < 40) {
    recommendations.push({
      title: "Trim de duurste namen",
      detail: `Gewogen value is ${Math.round(score)}/100 — dat betekent dat je portefeuille relatief duur staat. Overweeg trim van de hoogste-multiple-namen of voeg value-tilt toe.`,
      link: "/maandbeslissing",
      expectedImpact: 4,
    });
  }

  const rationale =
    score >= 65
      ? `Waardering relatief aantrekkelijk (gewogen ${Math.round(score)}/100).`
      : score >= 40
      ? `Gemiddelde waardering (gewogen ${Math.round(score)}/100).`
      : `Hoog waarderingsrisico (gewogen ${Math.round(score)}/100).`;

  return buildComponent({
    key: "valuation_risk",
    weight,
    score,
    hasData: true,
    rationale,
    recommendations,
    metricValue: score,
    confidence: input.coverage,
  });
}

// ============================================================
//  10. Macro sensitivity — regime vs portfolio-tilt mismatch
// ============================================================

export interface MacroSensitivityInput {
  /** Regime stance van de markt ("RISK_ON" | "NEUTRAL" | "DEFENSIVE" | null). */
  regimeStance: "RISK_ON" | "NEUTRAL" | "DEFENSIVE" | null;
  /** Portfolio-tilt: gewogen avg `lowVol` sub-score (defensief = hoog). */
  weightedLowVolScore: number | null;
  /** Aandeel cyclische sectoren in portfolio 0..1. */
  cyclicalShare: number | null;
  /** Risk-summary van de risk-engine voor extra context. */
  riskSeverity: RiskSeverity | null;
}

export function scoreMacroSensitivity(
  input: MacroSensitivityInput,
  weight: number,
): HealthComponent {
  if (input.regimeStance === null && input.weightedLowVolScore === null) {
    return noDataComponent(
      "macro_sensitivity",
      weight,
      "Onvoldoende regime-data of factor-coverage voor macro-meting.",
    );
  }

  // Match-logic: hoe goed past de portefeuille bij het huidige regime?
  // - DEFENSIVE-regime + defensive tilt → match (high score)
  // - RISK_ON-regime + risk-on tilt → match
  // - DEFENSIVE-regime + cyclical tilt → mismatch (penalty)
  // - RISK_ON-regime + defensief tilt → mild mismatch (cash-drag in bull)
  let score = 50;

  if (input.regimeStance === "DEFENSIVE") {
    if (input.weightedLowVolScore !== null) {
      // Hoge lowVol = defensief = match
      score = linearScore(input.weightedLowVolScore, 30, 80, 30, 95);
    }
    if (
      input.cyclicalShare !== null &&
      input.cyclicalShare > 0.4 &&
      score < 70
    ) {
      score = Math.max(0, score - 15);
    }
  } else if (input.regimeStance === "RISK_ON") {
    if (input.weightedLowVolScore !== null) {
      // Lage lowVol = aggressief = match in RISK_ON
      score = linearScore(input.weightedLowVolScore, 30, 80, 90, 60);
    }
  } else {
    // NEUTRAL: een gebalanceerde tilt scoort het hoogst
    if (input.weightedLowVolScore !== null) {
      const distance = Math.abs(input.weightedLowVolScore - 55);
      score = linearScore(distance, 0, 30, 90, 50);
    }
  }

  // Risk-severity overlay: critical → score zwaar omlaag, ongeacht regime
  if (input.riskSeverity === "critical") score = Math.max(0, score - 20);
  else if (input.riskSeverity === "high") score = Math.max(0, score - 10);

  const recommendations: HealthRecommendation[] = [];
  if (
    input.regimeStance === "DEFENSIVE" &&
    input.cyclicalShare !== null &&
    input.cyclicalShare > 0.4
  ) {
    recommendations.push({
      title: "Tilt naar defensieve sectoren",
      detail: `${Math.round(input.cyclicalShare * 100)}% in cyclische sectoren tijdens een DEFENSIVE-regime. Overweeg shift naar utilities, consumer staples of healthcare.`,
      link: "/maandbeslissing",
      expectedImpact: 5,
    });
  }

  const stanceLabel = input.regimeStance ?? "NEUTRAL";
  const rationale =
    score >= 70
      ? `Portefeuille-tilt past bij het huidige ${stanceLabel}-regime.`
      : `Mismatch tussen portfolio-tilt en ${stanceLabel}-regime.`;

  return buildComponent({
    key: "macro_sensitivity",
    weight,
    score,
    hasData: input.regimeStance !== null,
    rationale,
    recommendations,
    metricValue: input.weightedLowVolScore,
    confidence: input.regimeStance !== null ? 0.7 : 0.4,
  });
}

