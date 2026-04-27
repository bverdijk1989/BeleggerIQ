import {
  DECISION_THRESHOLDS,
  classifyAction,
  resolveCap,
} from "./action-classifier";
import { resolveActionQuantity } from "./rebalance-quantity";
import type {
  ActionDecision,
  ActionPlan,
  ActionUrgency,
  DecisionEngineInput,
  GlobalActionAdvice,
  GlobalAdvice,
  PositionAction,
} from "./types";

/**
 * Action & Rebalance Engine — orkestrator.
 *
 * Pure functie. Doorloopt elke positie, bepaalt actie + urgency +
 * quantity + rationale, en aggregeert tot een global advice.
 *
 * Reproduceerbaarheid: identieke input → identiek output. `now` is
 * configureerbaar voor tests.
 *
 * Niet-AI: alle beslissingen lopen via `classifyAction` (rule-based)
 * en `resolveActionQuantity` (rule-based aantallen). De engine kent
 * geen externe data-fetches.
 */

export function runDecisionEngine(input: DecisionEngineInput): ActionPlan {
  const generatedAt = input.now ?? new Date().toISOString();
  const warnings: string[] = [];

  const cap = resolveCap(input.policy);

  // Default-target = uniform 1/n binnen het belegde deel — zelfde
  // baseline die opportunity-radar / hunting-list ook hanteren wanneer
  // er geen expliciete policy-targets zijn.
  const investedPositions = input.positions.length;
  const defaultTarget =
    investedPositions > 0 ? 1 / investedPositions : 0;

  // Gebruik dezelfde cash-share-regel als rebalance-quantity: max 50%
  // van cash per positie (zie `resolveBuyQuantity`); de classifier
  // werkt al met `cashAvailable` boolean-check, maar we passeren het
  // volledige cashBalance door zodat quantity 'm zelf inkadert.
  const cashAvailable = Math.max(0, input.cashBalance);

  // Risico-flag-mapping per ticker.
  const riskFlagByTicker = new Map(
    input.risk.positions.map((p) => [p.ticker, p]),
  );

  const positions: PositionAction[] = input.positions.map((entry) => {
    const factor = entry.factorScore ?? null;
    const composite =
      factor && Number.isFinite(factor.composite) ? factor.composite : null;
    const factorConfidence = factor?.confidence ?? null;
    const qualitySub = factor?.subScores?.quality ?? null;
    const positionRisk =
      entry.positionRisk ?? riskFlagByTicker.get(entry.holding.ticker) ?? null;

    // Rebalance-engine drives — wanneer een quantityPlan een actionLabel
    // heeft, propageren we dat als "force" naar de classifier.
    const planLabel = entry.quantityPlan?.actionLabel;
    const rebalanceForcesTrim =
      planLabel === "licht afbouwen" || planLabel === "stevig afbouwen";
    const rebalanceForcesReconsider = planLabel === "heroverwegen";

    const classification = classifyAction({
      ticker: entry.holding.ticker,
      composite,
      factorConfidence,
      qualitySubScore: qualitySub,
      currentWeight: entry.currentWeight,
      targetWeight: defaultTarget,
      policy: input.policy ?? null,
      positionRisk,
      rebalanceForcesTrim,
      rebalanceForcesReconsider,
      cashAvailable,
      marketValueBase: entry.marketValueBase,
      regime: input.regime ?? null,
    });

    const quantity = resolveActionQuantity({
      action: classification.action,
      unitPriceBase: entry.unitPriceBase,
      marketValueBase: entry.marketValueBase,
      cashAvailable,
      monthlyContribution: input.monthlyContribution ?? null,
      targetWeight:
        classification.action === "BUY"
          ? defaultTarget
          : entry.quantityPlan?.targetWeight !== undefined
            ? entry.quantityPlan.targetWeight / 100
            : defaultTarget,
      totalValue: input.totalValue,
      existingPlan: entry.quantityPlan,
    });

    // Bouw rationale + risk-impact strings. Eerste rationale-bullet =
    // hoofdreden, rest = ondersteunend. We beperken op 2 zinnen om
    // compact te blijven.
    const rationale = classification.rationaleParts.slice(0, 2).join(" ");
    const finalConfidence = adjustConfidence(
      classification.confidence,
      quantity.insufficientData,
    );

    return {
      symbol: entry.holding.ticker,
      name: entry.holding.name,
      action: classification.action,
      urgency: classification.urgency,
      sharesToBuy: quantity.sharesToBuy,
      sharesToSell: quantity.sharesToSell,
      amount: quantity.amount,
      rationale,
      riskImpact: classification.riskImpact,
      sources: classification.sources,
      quantityPlan: entry.quantityPlan ?? undefined,
      confidence: finalConfidence,
    };
  });

  // Sorteer: SELL/TRIM met HIGH urgency eerst, dan BUY-kandidaten,
  // daarna HOLD/DO_NOTHING.
  positions.sort(comparePriority);

  const distribution = countActions(positions);

  // Cash-warnings.
  if (input.totalValue > 0 && cashAvailable / input.totalValue > 0.3) {
    warnings.push(
      `Cash-balans is ${pct(cashAvailable / input.totalValue)} van portefeuille — overweeg gefaseerd te beleggen.`,
    );
  }
  if (cap < 0.05) {
    warnings.push(
      `Policy-cap per positie ligt op ${pct(cap)} — uitzonderlijk laag, controleer beleidsinstellingen.`,
    );
  }

  const global = buildGlobalAdvice({
    positions,
    distribution,
    risk: input.risk,
    regime: input.regime,
    cashShare:
      input.totalValue > 0 ? cashAvailable / input.totalValue : 0,
  });

  return {
    generatedAt,
    baseCurrency: input.baseCurrency,
    positions,
    global,
    warnings,
  };
}

// ============================================================
//  Global advice — pure aggregatie
// ============================================================

interface GlobalAdviceInput {
  positions: PositionAction[];
  distribution: Record<ActionDecision, number>;
  risk: DecisionEngineInput["risk"];
  regime: DecisionEngineInput["regime"];
  cashShare: number;
}

function buildGlobalAdvice(input: GlobalAdviceInput): GlobalActionAdvice {
  const { distribution, positions, risk, regime, cashShare } = input;
  const total = positions.length;

  if (total === 0) {
    return {
      overallAdvice: "INSUFFICIENT_DATA",
      reason: "Geen posities om te evalueren.",
      urgency: "LOW",
      distribution,
    };
  }

  // De-risk wint bij hoge SELL-count of kritisch risico.
  const sellShare = (distribution.SELL + distribution.TRIM) / total;
  const severeRisk =
    risk.overallSeverity === "high" || risk.overallSeverity === "critical";

  if (severeRisk || sellShare >= 0.4) {
    const reasons: string[] = [];
    if (severeRisk) reasons.push("portfolio-risico hoog");
    if (sellShare >= 0.4) {
      reasons.push(`${distribution.SELL + distribution.TRIM} van ${total} posities krijgen TRIM/SELL`);
    }
    if (regime?.stance === "DEFENSIVE") {
      reasons.push("marktregime defensief");
    }
    return {
      overallAdvice: "DE_RISK",
      reason: `Afbouwen prioriteit: ${reasons.join(" + ")}.`,
      urgency: severeRisk ? "HIGH" : "MEDIUM",
      distribution,
    };
  }

  // BUY_MORE wanneer voldoende cash + voldoende BUY-signalen + niet defensief.
  if (
    distribution.BUY >= 1 &&
    cashShare >= 0.05 &&
    regime?.stance !== "DEFENSIVE"
  ) {
    return {
      overallAdvice: "BUY_MORE",
      reason: `${distribution.BUY} BUY-kandidaten met cash op ${pct(cashShare)} — ruimte om bij te kopen.`,
      urgency:
        distribution.BUY >= 3 || cashShare >= 0.15 ? "MEDIUM" : "LOW",
      distribution,
    };
  }

  // Default: HOLD.
  return {
    overallAdvice: "HOLD",
    reason: "Geen sterke trigger om iets aan te passen.",
    urgency: "LOW",
    distribution,
  };
}

// ============================================================
//  Sort-helpers
// ============================================================

const ACTION_PRIORITY: Record<ActionDecision, number> = {
  SELL: 5,
  TRIM: 4,
  BUY: 3,
  HOLD: 2,
  DO_NOTHING: 1,
};
const URGENCY_PRIORITY: Record<ActionUrgency, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

function comparePriority(a: PositionAction, b: PositionAction): number {
  const u = URGENCY_PRIORITY[b.urgency] - URGENCY_PRIORITY[a.urgency];
  if (u !== 0) return u;
  const p = ACTION_PRIORITY[b.action] - ACTION_PRIORITY[a.action];
  if (p !== 0) return p;
  return a.symbol.localeCompare(b.symbol);
}

function countActions(
  positions: PositionAction[],
): Record<ActionDecision, number> {
  const out: Record<ActionDecision, number> = {
    BUY: 0,
    HOLD: 0,
    TRIM: 0,
    SELL: 0,
    DO_NOTHING: 0,
  };
  for (const p of positions) out[p.action] += 1;
  return out;
}

// ============================================================
//  Misc helpers
// ============================================================

function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function adjustConfidence(
  base: number,
  insufficient: boolean,
): number {
  if (insufficient) return Math.min(base, 0.4);
  return base;
}

// Re-export thresholds zodat tests én UI dezelfde waarden gebruiken.
export { DECISION_THRESHOLDS };
