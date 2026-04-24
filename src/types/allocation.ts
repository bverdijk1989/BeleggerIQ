import type { Currency, ISODateString } from "./common";
import type { FactorScore } from "./factor";
import type { MarketRegime, MarketRegimeScore } from "./regime";
import type { InvestmentObjective } from "./profile";

/**
 * Generieke labeled-numeric slice. Wordt hergebruikt door portfolio summary,
 * risk exposures en allocation plans om dubbele typen te voorkomen.
 */
export interface AllocationSlice {
  label: string;
  value: number;
  /** Aandeel binnen het geheel, 0..1. */
  weight: number;
}

export type AllocationAction = "buy" | "add" | "hold" | "trim" | "sell";

export type RebalanceFrequency =
  | "none"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual";

/**
 * Aanbeveling op positieniveau voor een maandelijkse of ad-hoc koop-/verkoopactie.
 * `currentWeight` en `targetWeight` zijn fracties (0..1).
 * `convictionScore` is 0..1, `suggestedAmount` is in de base currency van het plan.
 */
export interface AllocationRecommendation {
  ticker: string;
  name?: string;
  action: AllocationAction;
  currentWeight: number;
  targetWeight: number;
  deltaWeight: number;
  suggestedAmount: number;
  suggestedQuantity?: number;
  convictionScore: number;
  /** Ordering hint voor de UI wanneer meerdere recommendations naast elkaar staan. */
  priority?: number;
  rationale: string[];
  factorScore?: FactorScore;
  /** Trace-id van een DecisionTrace in de AI-laag voor explainability. */
  explainabilityTraceId?: string;
}

/**
 * Projectie van de portefeuille na uitvoering van het koopplan. Gebruikt
 * door UI en explain layer om impact uit te leggen zonder door te klikken.
 */
export interface PostBuySimulation {
  projectedTotalValue: number;
  projectedCashBalance: number;
  projectedPositionCount: number;
  projectedLargestPositionWeight: number;
  projectedForeignCurrencyExposure: number;
  projectedTopSector?: { label: string; weight: number };
}

/**
 * Volledig maandelijks of ad-hoc allocatieplan. Het plan is immutabel:
 * wijzigingen leiden tot een nieuw plan zodat history reconstrueerbaar blijft.
 */
export interface AllocationPlan {
  id: string;
  portfolioId: string;
  asOf: ISODateString;
  baseCurrency: Currency;
  /** Beschikbaar periodiek budget in base currency. */
  monthlyContribution: number;
  /** Overgebleven cash in portefeuille die bruikbaar is voor dit plan. */
  cashAvailable: number;
  regime?: MarketRegime;
  recommendations: AllocationRecommendation[];
  /** Korte human-readable samenvatting voor in de UI. */
  summary?: string;
  explainabilityTraceId?: string;

  // --- Monthly buy engine output ---
  /** Totaal deployable budget (contribution + beschikbare cash minus buffer). */
  budget?: number;
  /** Totaal werkelijk toegewezen bedrag aan recommendations. */
  deployedAmount?: number;
  /** Cash die bewust niet wordt ingezet (buffer + regime-holdback). */
  cashReserved?: number;
  /** Waarschuwingen of redenen om bewust cash aan te houden. */
  warnings?: string[];
  /** Projectie na uitvoering van de recommendations. */
  simulation?: PostBuySimulation;
  /** Stance-score waarop de engine zich baseerde. */
  regimeScore?: MarketRegimeScore;
  /** Investment objective dat de engine gebruikte. */
  objective?: InvestmentObjective;
  /** Of de core-ETF fallback is ingezet voor spreiding. */
  coreEtfUsed?: boolean;
}
