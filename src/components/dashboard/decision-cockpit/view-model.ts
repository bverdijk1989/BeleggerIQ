import type {
  ActionPlan,
  AttentionItem,
  BenchmarkReport,
  BusinessQualityResult,
  GlobalAdvice,
  MacroScenarioReport,
  OpportunityCandidate,
  PortfolioView,
  PositionAction,
  TaxReport,
} from "@/lib/analytics";
import type { AllocationPlan } from "@/types/allocation";
import type { Currency } from "@/types/common";
import type { MarketRegimeScore } from "@/types/regime";

/**
 * View-model voor de Decision Cockpit. Pure data-shape — alle
 * presentational components consumen exact één van deze sub-types.
 *
 * Geen businesslogica hier; deze module mapt al-bestaande analytics-
 * output (PortfolioView / ActionPlan / etc.) naar één compacte shape
 * zodat de UI niets hoeft te berekenen.
 */

export interface CockpitViewModel {
  baseCurrency: Currency;
  asOfLabel: string;
  primaryAction: PrimaryActionVM;
  risks: RiskListVM;
  opportunities: OpportunityListVM;
}

// ============================================================
//  Primary action — "Wat moet ik nu doen?"
// ============================================================

export interface PrimaryActionVM {
  globalAdvice: GlobalAdvice;
  reason: string;
  urgency: "LOW" | "MEDIUM" | "HIGH";
  /** Top-1 actie — komt uit ActionPlan.positions[0] na sortering. */
  topAction: PositionAction | null;
  /** Tellers per actie-type. */
  distribution: Record<string, number>;
}

// ============================================================
//  Risico's + kansen kolommen
// ============================================================

export interface RiskItemVM {
  label: string;
  detail: string;
  severity: "low" | "moderate" | "elevated" | "high" | "critical";
}

export interface RiskListVM {
  items: RiskItemVM[];
  total: number;
}

export interface OpportunityItemVM {
  symbol: string;
  name: string;
  score: number;
  source: OpportunityCandidate["source"];
  summary: string;
}

export interface OpportunityListVM {
  items: OpportunityItemVM[];
  total: number;
}

// ============================================================
//  Builder
// ============================================================

export interface BuildCockpitVmInput {
  view: PortfolioView;
  actionPlan: ActionPlan;
  attention: AttentionItem[];
  opportunities: OpportunityCandidate[];
  allocationPlan: AllocationPlan;
  monthlyContribution: number;
  benchmark: BenchmarkReport | null;
  businessRanked: BusinessQualityResult[];
  taxReport: TaxReport;
  scenarios: MacroScenarioReport;
  regime: MarketRegimeScore | null;
}

export function buildCockpitViewModel(
  input: BuildCockpitVmInput,
): CockpitViewModel {
  const baseCurrency = input.view.summary.baseCurrency;
  const asOfLabel = new Date(input.view.lastUpdated).toLocaleString("nl-NL");

  return {
    baseCurrency,
    asOfLabel,
    primaryAction: buildPrimaryAction(input.actionPlan),
    risks: buildRiskList(input.attention),
    opportunities: buildOpportunityList(input.opportunities),
  };
}

// ============================================================
//  Sub-builders (pure)
// ============================================================

function buildPrimaryAction(plan: ActionPlan): PrimaryActionVM {
  const top = plan.positions.find(
    (p) => p.action !== "DO_NOTHING" && p.action !== "HOLD",
  );
  return {
    globalAdvice: plan.global.overallAdvice,
    reason: plan.global.reason,
    urgency: plan.global.urgency,
    topAction: top ?? null,
    distribution: plan.global.distribution as Record<string, number>,
  };
}

function buildRiskList(attention: AttentionItem[]): RiskListVM {
  const items: RiskItemVM[] = attention.slice(0, 5).map((a) => ({
    label: a.label,
    detail: a.message,
    severity: mapSeverity(a.severity),
  }));
  return { items, total: attention.length };
}

function mapSeverity(value: string): RiskItemVM["severity"] {
  switch (value) {
    case "critical":
    case "high":
    case "elevated":
    case "moderate":
    case "low":
      return value;
    default:
      return "moderate";
  }
}

function buildOpportunityList(
  candidates: OpportunityCandidate[],
): OpportunityListVM {
  const items = candidates.slice(0, 5).map((c) => ({
    symbol: c.ticker,
    name: c.name,
    score: c.score,
    source: c.source,
    summary: c.summary,
  }));
  return { items, total: candidates.length };
}

