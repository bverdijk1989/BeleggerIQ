import type { Currency, ISODateString } from "@/types/common";
import type { FactorScore } from "@/types/factor";
import type { Holding } from "@/types/portfolio";
import type { MarketRegimeScore } from "@/types/regime";
import type { PortfolioRiskSummary, PositionRiskAnalysis } from "@/types/risk";
import type { PolicySettings } from "@/types/profile";
import type { RebalanceQuantityPlan } from "@/types/rebalance";

/**
 * Action & Rebalance Engine — types.
 *
 * De engine vertelt **expliciet** wat de gebruiker NU moet doen, op
 * basis van factor-score, risico-analyse, policy-regels en marktregime.
 * Volledig regel-gebaseerd; geen AI.
 */

export type ActionDecision =
  | "BUY"
  | "HOLD"
  | "TRIM"
  | "SELL"
  | "DO_NOTHING";

export type ActionUrgency = "LOW" | "MEDIUM" | "HIGH";

export interface PositionAction {
  symbol: string;
  name: string;
  action: ActionDecision;
  urgency: ActionUrgency;
  /** Aantal stuks om te kopen (≥ 0; 0 wanneer niet van toepassing). */
  sharesToBuy: number;
  /** Aantal stuks om te verkopen (≥ 0; 0 wanneer niet van toepassing). */
  sharesToSell: number;
  /** Indicatief bedrag in base currency (positief; richting volgt uit `action`). */
  amount: number;
  /** Eén of twee zinnen NL — uitleg waarom deze actie. */
  rationale: string;
  /** Verwachte impact op portfolio-risico (NL). */
  riskImpact: string;
  /** Source-engine attribution voor de UI. */
  sources: ActionSource[];
  /** Onderliggende quantity-plan (indien beschikbaar — zelfde object als rebalance). */
  quantityPlan?: RebalanceQuantityPlan;
  /** 0..1 — confidence in deze beslissing. */
  confidence: number;
}

export type ActionSource =
  | "factor-engine"
  | "risk-engine"
  | "rebalance-engine"
  | "policy-engine"
  | "market-regime";

export type GlobalAdvice =
  | "BUY_MORE"
  | "HOLD"
  | "DE_RISK"
  | "INSUFFICIENT_DATA";

export interface GlobalActionAdvice {
  overallAdvice: GlobalAdvice;
  reason: string;
  urgency: ActionUrgency;
  /** Counts per action type over alle posities. */
  distribution: Record<ActionDecision, number>;
}

export interface ActionPlan {
  generatedAt: ISODateString;
  baseCurrency: Currency;
  positions: PositionAction[];
  global: GlobalActionAdvice;
  /** Niet-positie-gebonden waarschuwingen. Bv. "Cash > 30%". */
  warnings: string[];
}

// ============================================================
//  Engine input
// ============================================================

export interface ActionPositionInput {
  holding: Holding;
  /** Huidige weging (fractie 0..1). */
  currentWeight: number;
  /** Markt-waarde in base currency. */
  marketValueBase: number;
  /** Laatst-bekende prijs (base currency). */
  unitPriceBase: number | null;
  factorScore?: FactorScore | null;
  /** Risk-engine analyse voor deze positie. */
  positionRisk?: PositionRiskAnalysis | null;
  /** Quantity-plan (uit rebalance-engine) wanneer aanwezig. */
  quantityPlan?: RebalanceQuantityPlan | null;
  /**
   * Type-bewuste positie-cap uit de policy-engine. BROAD_MARKET_ETF
   * krijgt 60% (Bogle/Buffett-laag), SINGLE_STOCK 10%. Wanneer afwezig
   * valt de classifier terug op `policy.maxPositionWeight`.
   */
  instrumentLimit?: { allowedMaxWeight: number; runMultiplier: number } | null;
}

export interface DecisionEngineInput {
  positions: ActionPositionInput[];
  /** Totale portefeuille-waarde inclusief cash. */
  totalValue: number;
  /** Cash-balans in base currency. */
  cashBalance: number;
  baseCurrency: Currency;
  /** Risk-engine summary van de portefeuille. */
  risk: PortfolioRiskSummary;
  /** Policy-settings van de gebruiker (object profile.policy). */
  policy?: PolicySettings | null;
  /** Marktregime — beïnvloedt urgency en BUY/HOLD-tilt. */
  regime?: MarketRegimeScore | null;
  /** Maandelijkse contributie (voor BUY-amount-default). */
  monthlyContribution?: number | null;
  /** Override `now` voor tests. */
  now?: string;
}
