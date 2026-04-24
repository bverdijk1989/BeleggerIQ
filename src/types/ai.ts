import type { AllocationPlan } from "./allocation";
import type { FactorScore } from "./factor";
import type { MarketRegimeScore } from "./regime";
import type { ConcentrationType } from "./rebalance";
import type { PortfolioRiskSummary } from "./risk";

/**
 * Types voor de AI explain layer. Elke `ExplainContext` is een
 * discriminated-union lid dat exact de engine-outputs bevat die de
 * explainer mag lezen. De explainer MAG niets produceren wat niet in
 * de context staat.
 */

export type ExplainUseCase =
  | "holding_score"
  | "fragile_concentration"
  | "buy_plan"
  | "market_regime"
  | "portfolio_risks";

export type ExplainConfidence = "low" | "medium" | "high";

export interface HoldingScoreContext {
  useCase: "holding_score";
  ticker: string;
  name: string;
  sector?: string | null;
  factorScore: FactorScore;
}

export interface FragileConcentrationContext {
  useCase: "fragile_concentration";
  ticker: string;
  name: string;
  positionWeight: number;
  concentrationType: ConcentrationType;
  fragilityScore: number;
  reasons: string[];
  maxPositionWeight: number;
}

export interface BuyPlanContext {
  useCase: "buy_plan";
  plan: AllocationPlan;
  regime?: MarketRegimeScore | null;
}

export interface MarketRegimeContext {
  useCase: "market_regime";
  regime: MarketRegimeScore;
}

export interface PortfolioRisksContext {
  useCase: "portfolio_risks";
  risk: PortfolioRiskSummary;
  baseCurrency: string;
}

export type ExplainContext =
  | HoldingScoreContext
  | FragileConcentrationContext
  | BuyPlanContext
  | MarketRegimeContext
  | PortfolioRisksContext;

/**
 * Uniforme response-shape. `headline` is een korte titel; `narrative`
 * is 2-4 zinnen; `bullets` zijn optionele detail-regels;
 * `usedContextKeys` maakt expliciet welke engine-output-velden zijn
 * gelezen (audit/transparency).
 */
export interface ExplainResponse {
  useCase: ExplainUseCase;
  headline: string;
  narrative: string;
  bullets: string[];
  confidence: ExplainConfidence;
  usedContextKeys: string[];
  disclaimer?: string;
}
