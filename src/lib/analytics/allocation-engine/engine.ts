import type {
  AllocationPlan,
  AllocationRecommendation,
} from "@/types/allocation";
import type { Currency, ISODateString } from "@/types/common";
import type { FactorWeights } from "@/types/factor";
import type {
  InvestmentObjective,
  PolicySettings,
} from "@/types/profile";
import type { MarketRegimeScore } from "@/types/regime";

import { aggregateAllocation } from "../valuation";
import type { HoldingValuation } from "../valuation";

import {
  DEFAULT_CORE_ETF,
  determineBuyCandidates,
  type BuyCandidate,
  type CoreEtfConfig,
} from "./candidates";
import { objectiveTilt, regimeAdjustment } from "./context";
import {
  scoreAllocationPriority,
  type PriorityResult,
} from "./priority";
import { simulatePostBuyPortfolio } from "./simulate";
import {
  DEFAULT_ALLOCATION_THRESHOLDS,
  thresholdsFromPolicy,
  type AllocationThresholds,
} from "./thresholds";

/**
 * Monthly buy engine orchestrator.
 *
 * Pipeline:
 *  1. Resolve thresholds + regime + objective context.
 *  2. Bepaal deployable budget (contribution + cash boven buffer) en
 *     pas regime-multiplier toe.
 *  3. Filter bestaande holdings + eventueel core-ETF fallback → candidates.
 *  4. Score priority per candidate, filter blocked.
 *  5. Selecteer top-N (3..5) niet-geblokkeerd.
 *  6. Verdeel budget proportioneel op priority + respecteer
 *     per-candidate headroom en min-order.
 *  7. Simuleer post-buy portefeuille en bouw warnings.
 *  8. Retourneer `AllocationPlan` met rationales per recommendation.
 */

export interface GenerateAllocationPlanInput {
  portfolioId: string;
  baseCurrency: Currency;
  valuations: HoldingValuation[];
  totalValue: number;
  cashBalance: number;
  monthlyContribution: number;
  policy?: PolicySettings | null;
  objective?: InvestmentObjective | null;
  regime?: MarketRegimeScore | null;
  factorWeights?: FactorWeights;
  coreEtf?: CoreEtfConfig | null;
  thresholds?: AllocationThresholds;
  asOf?: ISODateString;
}

export function generateAllocationPlan(
  input: GenerateAllocationPlanInput,
): AllocationPlan {
  const asOf = input.asOf ?? new Date().toISOString();
  const thresholds =
    input.thresholds ??
    thresholdsFromPolicy(input.policy ?? null, DEFAULT_ALLOCATION_THRESHOLDS);
  const regime = regimeAdjustment(input.regime ?? null);
  const tilt = objectiveTilt(input.objective ?? null);
  const coreEtfConfig =
    input.coreEtf === null
      ? null
      : input.coreEtf ?? DEFAULT_CORE_ETF;

  const warnings: string[] = [...regime.warnings];

  // -------- Budget --------
  const cashBuffer = Math.max(0, input.totalValue * thresholds.cashBufferPct);
  const usableCash = Math.max(0, input.cashBalance - cashBuffer);
  const rawBudget = Math.max(0, input.monthlyContribution) + usableCash;
  let budget =
    rawBudget * regime.budgetMultiplier * thresholds.riskOnBudgetMultiplier;
  if (regime.budgetMultiplier < 1) {
    warnings.push(
      `Budget verlaagd met ${Math.round((1 - regime.budgetMultiplier) * 100)}% door defensieve marktstand.`,
    );
  }
  budget = Math.max(0, budget);
  const defensiveHoldback = input.regime && input.regime.stance === "DEFENSIVE"
    ? budget * thresholds.defensiveBudgetHoldback
    : 0;
  budget = Math.max(0, budget - defensiveHoldback);

  const totalCashReserved = cashBuffer + defensiveHoldback;

  // -------- Candidates --------
  const sectorWeights = buildSectorWeights(
    input.valuations,
    input.totalValue,
  );
  const { candidates } = determineBuyCandidates({
    valuations: input.valuations,
    totalValue: input.totalValue,
    thresholds,
    policy: input.policy ?? null,
    objectiveTilt: tilt,
    coreEtf: coreEtfConfig,
    sectorWeights,
  });

  if (candidates.length === 0) {
    warnings.push(
      "Geen holdings voldoen aan de minimum criteria — cash aanhouden tot er signaal is.",
    );
    return buildPlan({
      input,
      asOf,
      budget,
      deployedAmount: 0,
      cashReserved: totalCashReserved,
      recommendations: [],
      warnings,
      coreEtfUsed: false,
      thresholds,
      tiltedObjective: input.objective ?? null,
    });
  }

  // -------- Score + sort --------
  type Scored = { candidate: BuyCandidate; score: PriorityResult };
  const scored: Scored[] = candidates.map((c) => ({
    candidate: c,
    score: scoreAllocationPriority(c, {
      thresholds,
      regime,
      objective: tilt,
    }),
  }));

  const eligible = scored
    .filter((s) => !s.score.blocked && s.candidate.headroomWeight > 0)
    .sort((a, b) => b.score.priority - a.score.priority);

  if (eligible.length === 0) {
    warnings.push(
      "Alle candidates zijn geblokkeerd door policy of profiel — geen koopactie dit cyclus.",
    );
    return buildPlan({
      input,
      asOf,
      budget,
      deployedAmount: 0,
      cashReserved: totalCashReserved,
      recommendations: [],
      warnings,
      coreEtfUsed: false,
      thresholds,
      tiltedObjective: input.objective ?? null,
    });
  }

  // -------- Budget distributie --------
  const top = eligible.slice(0, thresholds.maxRecommendations);
  const recommendations = distributeBudget(
    top,
    budget,
    input.totalValue,
    thresholds,
  );

  // Hold-cash check: onder minOrderAmount? → alles cash.
  if (budget < thresholds.minOrderAmount) {
    warnings.push(
      `Budget (${budget.toFixed(0)} ${input.baseCurrency}) ligt onder minimum order-waarde. Wacht tot volgende maand.`,
    );
  } else if (recommendations.length < thresholds.minRecommendations) {
    warnings.push(
      `Slechts ${recommendations.length} candidates halen de minimum order — kleinere spreiding dan gewenst.`,
    );
  }

  const deployedAmount = recommendations.reduce(
    (sum, r) => sum + r.suggestedAmount,
    0,
  );
  const unspent = Math.max(0, budget - deployedAmount);
  const cashReserved = totalCashReserved + unspent;

  const coreEtfUsed = recommendations.some((r) =>
    top.some((t) => t.candidate.ticker === r.ticker && t.candidate.isCoreEtf),
  );

  return buildPlan({
    input,
    asOf,
    budget,
    deployedAmount,
    cashReserved,
    recommendations,
    warnings,
    coreEtfUsed,
    thresholds,
    tiltedObjective: input.objective ?? null,
    newPositionHints: buildHints(top.map((t) => t.candidate)),
  });
}

// ============================================================
//  Budget distributie
// ============================================================

function distributeBudget(
  top: Array<{ candidate: BuyCandidate; score: PriorityResult }>,
  budget: number,
  totalValue: number,
  thresholds: AllocationThresholds,
): AllocationRecommendation[] {
  if (budget <= 0 || top.length === 0) return [];

  const priorities = top.map((t) => Math.max(1, t.score.priority));
  const sumPriority = priorities.reduce((s, v) => s + v, 0);
  const weights = priorities.map((p) => p / sumPriority);

  // Eerste pass: amount = weight * budget, cap op headroom * totalValue.
  const raw = top.map((entry, i) => {
    const target = budget * weights[i]!;
    const cap = entry.candidate.headroomWeight * totalValue;
    const capped = Math.min(target, cap);
    return { entry, amount: capped, cap, capped: target > cap };
  });

  const residual = budget - raw.reduce((sum, r) => sum + r.amount, 0);

  // Tweede pass: verdeel residual over niet-gecapte items, gewogen.
  if (residual > 0.01) {
    const open = raw.filter((r) => !r.capped);
    const openPrioritySum = open.reduce(
      (s, r) => s + Math.max(1, r.entry.score.priority),
      0,
    );
    if (openPrioritySum > 0) {
      for (const row of open) {
        const addShare = Math.max(1, row.entry.score.priority) / openPrioritySum;
        const addAmount = residual * addShare;
        const newAmount = Math.min(row.amount + addAmount, row.cap);
        row.amount = newAmount;
      }
    }
  }

  // Filter min-order en bouw AllocationRecommendation.
  const output: AllocationRecommendation[] = [];
  for (const row of raw) {
    const amount = Math.floor(row.amount); // hele euro's
    if (amount < thresholds.minOrderAmount) continue;
    const candidate = row.entry.candidate;

    const additionalWeight = totalValue > 0 ? amount / totalValue : 0;
    const targetWeight = candidate.currentWeight + additionalWeight;
    const deltaWeight = additionalWeight;
    const suggestedQuantity =
      candidate.unitPriceBase && candidate.unitPriceBase > 0
        ? Number((amount / candidate.unitPriceBase).toFixed(4))
        : undefined;

    output.push({
      ticker: candidate.ticker,
      name: candidate.name,
      action: candidate.isExisting ? "add" : "buy",
      currentWeight: candidate.currentWeight,
      targetWeight,
      deltaWeight,
      suggestedAmount: amount,
      suggestedQuantity,
      convictionScore: clamp01(row.entry.score.priority / 100),
      priority: row.entry.score.priority,
      rationale: row.entry.score.rationales,
      factorScore: candidate.factorScore ?? undefined,
    });
  }

  // Sorteer op priority desc voor UI-consumption.
  return output.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

// ============================================================
//  Helpers
// ============================================================

function buildSectorWeights(
  valuations: HoldingValuation[],
  totalValue: number,
): Map<string, number> {
  const map = new Map<string, number>();
  if (totalValue <= 0) return map;
  const slices = aggregateAllocation(
    valuations,
    (v) => v.holding.sector ?? null,
    totalValue,
  );
  for (const slice of slices) map.set(slice.label, slice.weight);
  return map;
}

function buildHints(
  candidates: BuyCandidate[],
): Map<string, { sector?: string | null; currency: Currency }> {
  const map = new Map<string, { sector?: string | null; currency: Currency }>();
  for (const c of candidates) {
    map.set(c.ticker, { sector: c.sector ?? null, currency: c.currency });
  }
  return map;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

interface BuildPlanParams {
  input: GenerateAllocationPlanInput;
  asOf: ISODateString;
  budget: number;
  deployedAmount: number;
  cashReserved: number;
  recommendations: AllocationRecommendation[];
  warnings: string[];
  coreEtfUsed: boolean;
  thresholds: AllocationThresholds;
  tiltedObjective: InvestmentObjective | null;
  newPositionHints?: Map<string, { sector?: string | null; currency: Currency }>;
}

function buildPlan(params: BuildPlanParams): AllocationPlan {
  const simulation = simulatePostBuyPortfolio({
    valuations: params.input.valuations,
    totalValue: params.input.totalValue,
    baseCurrency: params.input.baseCurrency,
    cashBalance: params.input.cashBalance,
    recommendations: params.recommendations,
    newPositionHints: params.newPositionHints,
  });

  const summary =
    params.recommendations.length === 0
      ? "Geen koopactie dit cyclus — budget wordt als cash aangehouden."
      : `${params.recommendations.length} koopaanbeveling${
          params.recommendations.length === 1 ? "" : "en"
        } voor ${Math.round(params.deployedAmount)} ${params.input.baseCurrency}.`;

  return {
    id: `plan-${params.input.portfolioId}-${params.asOf}`,
    portfolioId: params.input.portfolioId,
    asOf: params.asOf,
    baseCurrency: params.input.baseCurrency,
    monthlyContribution: params.input.monthlyContribution,
    cashAvailable: params.input.cashBalance,
    recommendations: params.recommendations,
    summary,
    budget: params.budget,
    deployedAmount: params.deployedAmount,
    cashReserved: params.cashReserved,
    warnings: params.warnings,
    simulation,
    regimeScore: params.input.regime ?? undefined,
    objective: params.tiltedObjective ?? undefined,
    coreEtfUsed: params.coreEtfUsed,
  };
}
