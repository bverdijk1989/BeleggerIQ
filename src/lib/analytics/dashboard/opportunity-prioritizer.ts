import type { FactorScore } from "@/types/factor";
import type { MarketRegimeScore, MarketRegimeStance } from "@/types/regime";

import {
  buildRationale,
  CONFIDENCE_TIER_TO_NUMBER,
  deriveConfidence,
  deriveRiskLevel,
  filterPublicSignals,
  mapSignalType,
  OPPORTUNITY_HORIZON,
  pickPrimarySignal,
  type OpportunityRiskLevel,
  type OpportunityType,
} from "../opportunity";
import type {
  OpportunityCandidate,
  OpportunitySignal,
  OpportunitySource,
} from "../opportunity-radar";

/**
 * Opportunity prioritizer — pure aggregator boven de Opportunity Radar.
 *
 * Doel: lever de top 3 dashboard-opportunities, met een concreet
 * "next step" advies dat niet "koop nu" zegt maar één van:
 *   - "onderzoeken"
 *   - "kleine bijkoop overwegen"
 *   - "wachten op target"
 *
 * Reproduceerbaar: identieke input → identieke output. Geen AI. Geen
 * externe state.
 *
 * Strategie:
 *   1. Filter elke `OpportunityCandidate` op publieke signalen (5
 *      signaaltypes) — dezelfde regel als de adapter in `opportunity/`.
 *   2. Bouw een `DashboardOpportunity` per kandidaat met
 *      score / confidence / riskLevel / suggestedNextStep / reason.
 *   3. **Re-rank** de Opportunity Radar-output light-touch:
 *        - portfolio-positie onderwogen + UNDERWEIGHT_HIGH_CONVICTION
 *          krijgt een kleine boost (kandidaten waar de gebruiker al
 *          conviction heeft maar nog onder-allocated is).
 *        - regime-mismatch (RISK_ON kandidaat tijdens DEFENSIVE regime)
 *          krijgt een kleine penalty.
 *      Re-ranking is **score-additive**, niet vervangend — Opportunity
 *      Radar blijft canonieke ranking-bron.
 *   4. Sorteer op (re-ranked score) desc → confidence desc → symbol asc.
 *   5. Beperk tot `maxOpportunities` (default 3).
 *
 * `suggestedNextStep` regels (eerste match wint):
 *   - source = "watchlist" of confidence < 0.5  → "wachten op target"
 *     (we wachten letterlijk op een trigger of betere data)
 *   - source = "screener" en niet in portfolio   → "onderzoeken"
 *     (nog onbekend; eerst due-diligence)
 *   - bestaande positie + UNDERWEIGHT_HIGH_CONVICTION  → "kleine bijkoop overwegen"
 *   - confidence ≥ 0.7 en niet onderwogen          → "onderzoeken"
 *   - default                                     → "onderzoeken"
 */

// ============================================================
//  Types
// ============================================================

export type DashboardSuggestedNextStep =
  | "onderzoeken"
  | "kleine bijkoop overwegen"
  | "wachten op target";

export interface DashboardOpportunity {
  /** Stabiel id — `${opportunityType}:${symbol}`. */
  id: string;
  symbol: string;
  name: string;
  opportunityType: OpportunityType;
  /** 0..100 — reranked score (radar-score + portfolio/regime adjustments). */
  score: number;
  /** 0..100 — originele Opportunity Radar score zonder rerank. */
  baselineScore: number;
  /** 0..1. */
  confidence: number;
  /** Eén-zin uitleg waarom (rationale uit primair signaal). */
  reason: string;
  /** NL action: "onderzoeken" / "kleine bijkoop overwegen" / "wachten op target". */
  suggestedNextStep: DashboardSuggestedNextStep;
  riskLevel: OpportunityRiskLevel;
  /** Verwachte holding-horizon (constant per opportunity-type). */
  expectedHorizon: string;
  source: OpportunitySource;
  /** True wanneer confidence < 0.5 of er ten minste één duidelijke
   *  data-warning op de candidate staat — UI moet dit benadrukken. */
  lowConfidence: boolean;
  /** Korte uitleg waarom confidence laag is — alleen wanneer lowConfidence=true. */
  lowConfidenceReason?: string;
  /** Huidige portfolio-weight (0..1) van het symbool, of null wanneer
   *  niet in portfolio. UI gebruikt dit voor "al X% in portefeuille". */
  currentWeight: number | null;
}

export interface PrioritizeOpportunitiesInput {
  candidates: OpportunityCandidate[];
  /** Optionele regime-score voor regime-aware reranking. */
  regime?: MarketRegimeScore | null;
  /** Map ticker → currentWeight (fractie 0..1) — voor onderwogen-detectie. */
  portfolioWeights?: Map<string, number>;
  /** Map ticker → factor-score — gebruikt voor verklaring + low-confidence-check. */
  factorScores?: Map<string, FactorScore>;
  /** Default 3. */
  maxOpportunities?: number;
}

// ============================================================
//  Drempels (expliciet)
// ============================================================

const LOW_CONFIDENCE_CUTOFF = 0.5;
const HIGH_CONFIDENCE_CUTOFF = 0.7;

/** Boost voor onderwogen high-conviction (score-additive, capped op 100). */
const UNDERWEIGHT_BOOST = 5;

/** Penalty wanneer kandidaat-type haaks staat op regime. */
const REGIME_MISMATCH_PENALTY = 5;

/** Threshold voor "onderwogen" t.o.v. ideaal (UNDERWEIGHT_HIGH_CONVICTION
 *  triggert al binnen de radar; we hanteren hier een soft-cutoff voor de
 *  rerank: < 5% in de portefeuille of geen positie). */
const UNDERWEIGHT_THRESHOLD = 0.05;

// ============================================================
//  Builder
// ============================================================

export function prioritizeOpportunities(
  input: PrioritizeOpportunitiesInput,
): DashboardOpportunity[] {
  const max = input.maxOpportunities ?? 3;
  const portfolioWeights = input.portfolioWeights ?? new Map();
  const factorScores = input.factorScores ?? new Map();

  const out: DashboardOpportunity[] = [];
  for (const candidate of input.candidates) {
    const opp = mapCandidate({
      candidate,
      regime: input.regime ?? null,
      portfolioWeights,
      factorScores,
    });
    if (opp) out.push(opp);
  }

  out.sort(compareOpportunities);
  return out.slice(0, max);
}

// ============================================================
//  Sub-builders (pure)
// ============================================================

interface MapContext {
  candidate: OpportunityCandidate;
  regime: MarketRegimeScore | null;
  portfolioWeights: Map<string, number>;
  factorScores: Map<string, FactorScore>;
}

function mapCandidate(ctx: MapContext): DashboardOpportunity | null {
  const publicSignals = filterPublicSignals(ctx.candidate.signals);
  if (publicSignals.length === 0) return null;

  const primary = pickPrimarySignal(publicSignals);
  if (!primary) return null;

  const opportunityType = mapSignalType(primary.type);
  if (!opportunityType) return null;

  const confidence = deriveConfidence(publicSignals);
  const riskLevel = deriveRiskLevel(opportunityType, confidence);

  const symbol = ctx.candidate.ticker;
  const currentWeightRaw = ctx.portfolioWeights.get(symbol);
  const currentWeight =
    typeof currentWeightRaw === "number" && Number.isFinite(currentWeightRaw)
      ? currentWeightRaw
      : null;

  const reranked = rerankScore({
    baseline: ctx.candidate.score,
    opportunityType,
    currentWeight,
    regime: ctx.regime,
  });

  const lowConfidence =
    confidence < LOW_CONFIDENCE_CUTOFF ||
    (ctx.candidate.warnings && ctx.candidate.warnings.length > 0);

  const lowConfidenceReason = lowConfidence
    ? buildLowConfidenceReason({
        confidence,
        warnings: ctx.candidate.warnings,
        publicSignals,
        factorScore: ctx.factorScores.get(symbol),
      })
    : undefined;

  const suggestedNextStep = deriveSuggestedNextStep({
    confidence,
    source: ctx.candidate.source,
    opportunityType,
    currentWeight,
  });

  return {
    id: `${opportunityType}:${symbol}`,
    symbol,
    name: ctx.candidate.name,
    opportunityType,
    score: reranked,
    baselineScore: ctx.candidate.score,
    confidence,
    reason: buildRationale(primary),
    suggestedNextStep,
    riskLevel,
    expectedHorizon: OPPORTUNITY_HORIZON[opportunityType],
    source: ctx.candidate.source,
    lowConfidence: Boolean(lowConfidence),
    lowConfidenceReason,
    currentWeight,
  };
}

interface RerankContext {
  baseline: number;
  opportunityType: OpportunityType;
  currentWeight: number | null;
  regime: MarketRegimeScore | null;
}

/**
 * Score-additive rerank. Light-touch — Opportunity Radar blijft canoniek;
 * we duwen alleen een paar punten op portfolio-context en regime-fit.
 */
function rerankScore(ctx: RerankContext): number {
  let score = ctx.baseline;

  // 1. Onderwogen high-conviction: extra duwtje als gebruiker dit
  // bedrijf al kent (positie aanwezig) maar nog ondergewogen is, of
  // helemaal geen positie heeft terwijl de radar 'm wel oplicht.
  const isUnderweight =
    ctx.currentWeight === null || ctx.currentWeight < UNDERWEIGHT_THRESHOLD;
  if (
    ctx.opportunityType === "UNDERWEIGHT_HIGH_CONVICTION" &&
    isUnderweight
  ) {
    score += UNDERWEIGHT_BOOST;
  }

  // 2. Regime-mismatch penalty:
  //    DEFENSIVE regime + MOMENTUM_REVERSAL → penalty (offensief in defensief regime).
  //    RISK_ON regime + (geen mismatch types).
  if (ctx.regime) {
    if (
      ctx.regime.stance === "DEFENSIVE" &&
      ctx.opportunityType === "MOMENTUM_REVERSAL"
    ) {
      score -= REGIME_MISMATCH_PENALTY;
    }
  }

  // Cap op [0, 100] voor UI-veiligheid.
  if (score < 0) score = 0;
  if (score > 100) score = 100;
  return Number(score.toFixed(2));
}

interface SuggestedNextStepContext {
  confidence: number;
  source: OpportunitySource;
  opportunityType: OpportunityType;
  currentWeight: number | null;
}

function deriveSuggestedNextStep(
  ctx: SuggestedNextStepContext,
): DashboardSuggestedNextStep {
  // 1. Watchlist-bron of lage confidence → wachten op target.
  if (ctx.source === "watchlist" || ctx.confidence < LOW_CONFIDENCE_CUTOFF) {
    return "wachten op target";
  }

  // 2. Bestaande positie + UNDERWEIGHT_HIGH_CONVICTION → kleine bijkoop overwegen.
  const isInPortfolio =
    ctx.currentWeight !== null && ctx.currentWeight > 0;
  if (
    isInPortfolio &&
    ctx.opportunityType === "UNDERWEIGHT_HIGH_CONVICTION"
  ) {
    return "kleine bijkoop overwegen";
  }

  // 3. Hoge confidence + bestaande positie + ETF rebalance → kleine bijkoop overwegen.
  if (
    isInPortfolio &&
    ctx.opportunityType === "ETF_REBALANCE_OPPORTUNITY" &&
    ctx.confidence >= HIGH_CONFIDENCE_CUTOFF
  ) {
    return "kleine bijkoop overwegen";
  }

  // 4. Default — onbekend of niet onderwogen → eerst onderzoeken.
  return "onderzoeken";
}

interface LowConfidenceReasonContext {
  confidence: number;
  warnings: string[] | undefined;
  publicSignals: OpportunitySignal[];
  factorScore: FactorScore | undefined;
}

function buildLowConfidenceReason(
  ctx: LowConfidenceReasonContext,
): string {
  const reasons: string[] = [];
  if (ctx.confidence < LOW_CONFIDENCE_CUTOFF) {
    const tier = formatConfidenceTier(ctx.confidence);
    reasons.push(`Confidence-tier ${tier} — Opportunity Radar ziet één zwak signaal.`);
  }
  if (ctx.warnings && ctx.warnings.length > 0) {
    reasons.push(`Datawaarschuwing: ${ctx.warnings[0]}`);
  }
  if (!ctx.factorScore) {
    reasons.push("Geen factor-score beschikbaar — fundamentele check ontbreekt.");
  }
  if (reasons.length === 0) {
    return "Beperkte data — verifieer eerst voordat je handelt.";
  }
  return reasons.join(" ");
}

function formatConfidenceTier(confidence: number): "HIGH" | "MEDIUM" | "LOW" {
  if (confidence >= CONFIDENCE_TIER_TO_NUMBER.HIGH - 0.05) return "HIGH";
  if (confidence >= CONFIDENCE_TIER_TO_NUMBER.MEDIUM - 0.05) return "MEDIUM";
  return "LOW";
}

// ============================================================
//  Sortering
// ============================================================

function compareOpportunities(
  a: DashboardOpportunity,
  b: DashboardOpportunity,
): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  return a.symbol.localeCompare(b.symbol);
}

// ============================================================
//  Helpers — regime is alleen gebruikt voor narrative; intentionally
//  niet weer geëxporteerd.
// ============================================================

export const __INTERNAL = {
  LOW_CONFIDENCE_CUTOFF,
  HIGH_CONFIDENCE_CUTOFF,
  UNDERWEIGHT_THRESHOLD,
  UNDERWEIGHT_BOOST,
  REGIME_MISMATCH_PENALTY,
};

// re-export for downstream filter usage if needed
export type { MarketRegimeStance };
