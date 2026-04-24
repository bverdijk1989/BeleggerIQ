import type { Currency, ISODateString } from "@/types/common";
import type { PolicySettings } from "@/types/profile";
import type {
  RebalanceAction,
  RebalanceFactorSnapshot,
  RebalancePlan,
  RebalanceRecommendation,
} from "@/types/rebalance";

import { computeRebalanceQuantity } from "../rebalance/rebalance-quantity";
import type { HoldingValuation } from "../valuation";

import {
  classifyConcentrationType,
  type ConcentrationClassification,
} from "./concentration-classifier";
import {
  DEFAULT_REBALANCE_THRESHOLDS,
  thresholdsFromPolicy,
  type RebalanceThresholds,
} from "./thresholds";

/**
 * Rebalance engine orchestrator.
 *
 * Voor elke holding:
 *  1. Classificeer concentratie-type op basis van factor signalen.
 *  2. Leid actie af volgens de "let winners run" regels:
 *     - HEALTHY + zwaar over cap → hooguit TRIM_LIGHT richting 1.5× cap.
 *     - NEUTRAL + over cap → TRIM_LIGHT richting cap.
 *     - FRAGILE + ver over cap → TRIM_HEAVY richting 0.75× cap.
 *     - FRAGILE + kleine positie maar zeer fragiel → RECONSIDER.
 *  3. Bereken target weight, delta amount en indicatief aantal stuks.
 *  4. Verzamel reasons voor UI en AI-explain layer.
 */

export interface BuildRebalancePlanInput {
  portfolioId: string;
  baseCurrency: Currency;
  valuations: HoldingValuation[];
  totalValue: number;
  asOf?: ISODateString;
  /** PolicySettings om thresholds op af te stemmen. */
  policy?: PolicySettings | null;
  /** Directe override; heeft voorrang op policy. */
  thresholds?: RebalanceThresholds;
}

export function buildRebalancePlan(
  input: BuildRebalancePlanInput,
): RebalancePlan {
  const asOf = input.asOf ?? new Date().toISOString();
  const thresholds =
    input.thresholds ??
    thresholdsFromPolicy(input.policy ?? null, DEFAULT_REBALANCE_THRESHOLDS);

  const recommendations = input.valuations.map((valuation) =>
    recommendFor(valuation, input.totalValue, thresholds),
  );

  const summary: Record<RebalanceAction, number> = {
    NO_ACTION: 0,
    TRIM_LIGHT: 0,
    TRIM_HEAVY: 0,
    RECONSIDER: 0,
  };
  let totalTurnover = 0;
  for (const rec of recommendations) {
    summary[rec.action] += 1;
    totalTurnover += Math.abs(rec.deltaAmount);
  }

  // Sorteer: significante acties eerst (TRIM_HEAVY > RECONSIDER > TRIM_LIGHT > NO_ACTION),
  // daarbinnen op fragility en positie-gewicht. Zo blijft NO_ACTION onderaan.
  recommendations.sort((a, b) => {
    const order = actionOrder(b.action) - actionOrder(a.action);
    if (order !== 0) return order;
    const frag = b.fragilityScore - a.fragilityScore;
    if (frag !== 0) return frag;
    return b.currentWeight - a.currentWeight;
  });

  return {
    portfolioId: input.portfolioId,
    asOf,
    baseCurrency: input.baseCurrency,
    totalValue: input.totalValue,
    recommendations,
    totalTurnover,
    summary,
  };
}

// ============================================================
//  Per-holding decision
// ============================================================

function recommendFor(
  valuation: HoldingValuation,
  totalValue: number,
  thresholds: RebalanceThresholds,
): RebalanceRecommendation {
  const currentWeight =
    totalValue > 0 ? valuation.marketValueBase / totalValue : 0;

  const factor = valuation.holding.factorScore;
  const quality = factor?.subScores.quality ?? null;
  const value = factor?.subScores.value ?? null;
  const momentum = factor?.subScores.momentum ?? null;
  const composite = factor?.composite ?? null;
  const lowVol = factor?.subScores.lowVol ?? null;

  const classification = classifyConcentrationType({
    positionWeight: currentWeight,
    qualityScore: quality,
    momentumScore: momentum,
    compositeScore: composite,
    volatility: valuation.holding.volatility ?? null,
    lowVolScore: lowVol,
    sector: valuation.holding.sector,
    thresholds,
  });

  const { action, targetWeight, actionReasons } = deriveAction({
    currentWeight,
    classification,
    thresholds,
  });

  const reasons = [...actionReasons, ...classification.reasons];

  const deltaWeight = targetWeight - currentWeight;
  const deltaAmount = deltaWeight * totalValue;

  const unitPriceBase =
    valuation.holding.quantity > 0
      ? valuation.marketValueBase / valuation.holding.quantity
      : undefined;
  const deltaShares =
    unitPriceBase !== undefined && unitPriceBase > 0
      ? deltaAmount / unitPriceBase
      : undefined;

  const factorSnapshot: RebalanceFactorSnapshot = {
    quality,
    value,
    momentum,
    composite,
    volatility: valuation.holding.volatility ?? null,
    sector: valuation.holding.sector ?? null,
    sectorCyclicality: classification.cyclicality,
  };

  const confidence = computeConfidence(factor?.confidence ?? null, classification);

  // Concrete afbouw-quantity: stuks + bedrag + NL action label + post-sell
  // weight. De quantity-engine leunt op `unitPriceBase` wanneer beschikbaar;
  // zonder koersdata levert 'ie een plan met sharesToSell=0 + warning.
  const quantityPlan = computeRebalanceQuantity({
    symbol: valuation.holding.ticker,
    action,
    currentValue: valuation.marketValueBase,
    currentPrice: unitPriceBase ?? null,
    totalPortfolioValue: totalValue,
    targetWeight,
    classifierConfidence: factor?.confidence ?? null,
  });

  return {
    ticker: valuation.holding.ticker,
    name: valuation.holding.name,
    action,
    concentrationType: classification.concentrationType,
    fragilityScore: classification.fragilityScore,
    currentWeight,
    targetWeight,
    deltaWeight,
    deltaAmount,
    deltaShares,
    reasons,
    confidence,
    factorSnapshot,
    quantityPlan,
  };
}

// ============================================================
//  Action rules
// ============================================================

interface DeriveActionInput {
  currentWeight: number;
  classification: ConcentrationClassification;
  thresholds: RebalanceThresholds;
}

interface DeriveActionResult {
  action: RebalanceAction;
  targetWeight: number;
  actionReasons: string[];
}

function deriveAction({
  currentWeight,
  classification,
  thresholds,
}: DeriveActionInput): DeriveActionResult {
  const { maxPositionWeight, healthyRunMultiplier, fragileHeavyMultiplier, fragileReconsiderScore } =
    thresholds;
  const { concentrationType, fragilityScore } = classification;

  switch (concentrationType) {
    case "FRAGILE": {
      // Precedence: rightsize *eerst*, overweeg heroverweging pas wanneer er
      // geen duidelijke trim-actie is. Anders zou een 20%-positie met
      // fragilityScore 100 als RECONSIDER→0 gesold worden i.p.v. stevig
      // afbouwen naar 7,5%.
      if (currentWeight > maxPositionWeight * fragileHeavyMultiplier) {
        return {
          action: "TRIM_HEAVY",
          targetWeight: maxPositionWeight * 0.75,
          actionReasons: [
            `Fragiele concentratie boven ${Math.round(fragileHeavyMultiplier * 100)}% van de cap — stevig afbouwen naar ~${Math.round(maxPositionWeight * 75)}% van target.`,
          ],
        };
      }
      if (currentWeight > maxPositionWeight) {
        return {
          action: "TRIM_LIGHT",
          targetWeight: maxPositionWeight * 0.9,
          actionReasons: [
            "Fragiele concentratie net boven cap — voorzichtig terug naar policy-niveau.",
          ],
        };
      }
      // Geen trim-actie beschikbaar (positie is klein): kijk of het profiel
      // zo zwak is dat RECONSIDER beter past.
      if (fragilityScore >= fragileReconsiderScore) {
        return {
          action: "RECONSIDER",
          targetWeight: 0,
          actionReasons: [
            `Fragility-score ${fragilityScore} — positie past niet bij je profiel, heroverweeg de thesis.`,
          ],
        };
      }
      if (fragilityScore >= 65) {
        return {
          action: "RECONSIDER",
          targetWeight: 0,
          actionReasons: [
            "Positie is klein maar fragiel — heroverweeg of hij past in het profiel.",
          ],
        };
      }
      return {
        action: "NO_ACTION",
        targetWeight: currentWeight,
        actionReasons: [
          "Fragiel profiel maar binnen gewicht — monitor en wacht op duidelijker signalen.",
        ],
      };
    }

    case "NEUTRAL": {
      if (currentWeight > maxPositionWeight) {
        return {
          action: "TRIM_LIGHT",
          targetWeight: maxPositionWeight,
          actionReasons: [
            `Neutraal profiel boven policy-cap (${Math.round(maxPositionWeight * 100)}%) — terug naar cap.`,
          ],
        };
      }
      return {
        action: "NO_ACTION",
        targetWeight: currentWeight,
        actionReasons: [
          "Neutraal profiel en gewicht binnen cap — geen herallocatie nodig.",
        ],
      };
    }

    case "HEALTHY":
    default: {
      // Let winners run: pas afbouwen boven healthyRunMultiplier × cap.
      if (currentWeight > maxPositionWeight * healthyRunMultiplier) {
        return {
          action: "TRIM_LIGHT",
          targetWeight: maxPositionWeight * healthyRunMultiplier * 0.85,
          actionReasons: [
            `Sterke winner, maar boven ${Math.round(healthyRunMultiplier * maxPositionWeight * 100)}% — kleine trim voor houdbaarheid.`,
          ],
        };
      }
      if (currentWeight > maxPositionWeight) {
        return {
          action: "NO_ACTION",
          targetWeight: currentWeight,
          actionReasons: [
            "Sterke positie boven cap — laat de winner doorlopen (geen blinde verkoop).",
          ],
        };
      }
      return {
        action: "NO_ACTION",
        targetWeight: currentWeight,
        actionReasons: [
          "Gezond profiel, gewicht binnen policy — niets doen.",
        ],
      };
    }
  }
}

function actionOrder(action: RebalanceAction): number {
  switch (action) {
    case "TRIM_HEAVY":
      return 4;
    case "RECONSIDER":
      return 3;
    case "TRIM_LIGHT":
      return 2;
    case "NO_ACTION":
    default:
      return 1;
  }
}

/**
 * Confidence van de aanbeveling. Kort: méér factor-coverage + duidelijker
 * profiel → hoger. Bewust niet >0.9 zodat UI altijd een menselijke check
 * aanmoedigt.
 */
function computeConfidence(
  factorCoverage: number | null,
  classification: ConcentrationClassification,
): number {
  const coverage =
    factorCoverage === null || !Number.isFinite(factorCoverage)
      ? 0.4
      : factorCoverage;
  const extremity = Math.min(
    1,
    Math.abs(classification.fragilityScore - 50) / 50,
  );
  const raw = 0.5 * coverage + 0.4 * extremity + 0.1;
  return Math.max(0, Math.min(0.9, raw));
}
