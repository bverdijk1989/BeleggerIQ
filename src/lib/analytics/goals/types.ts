/**
 * Financial Goals — types.
 *
 * **Filosofie**: een doel is meer dan een eindbedrag. Het is een
 * combinatie van bedrag × horizon × maandelijkse inleg × risicoprofiel.
 * De engine vertaalt die input deterministisch naar 3 scenario's
 * (pessimistic / neutral / optimistic) en een haalbaarheids-tier.
 *
 * Topbelegger-laag:
 *  - Buffett: lange-termijn-horizon — projectie toont compound growth.
 *  - Dalio: scenario-bandbreedte maakt risico expliciet.
 *  - Lynch: per scenario simpele NL-zin ("haalbaar bij 6% rendement").
 *  - Wood: focus op de eindstaat (motivatie), niet op de dagschommelingen.
 */

import type { ISODateString, Currency } from "@/types/common";
import type { RiskTolerance } from "@/types/profile";

/** 8 doel-types — 7 presets + CUSTOM. */
export type GoalType =
  | "RETIREMENT"
  | "FIRE"
  | "DIVIDEND_INCOME"
  | "WEALTH_GROWTH"
  | "HOME_PURCHASE"
  | "EDUCATION"
  | "EMERGENCY_FUND"
  | "CUSTOM";

export type FeasibilityTier =
  | "ON_TRACK"
  | "ACHIEVABLE"
  | "AT_RISK"
  | "UNLIKELY";

export type ScenarioKey = "pessimistic" | "neutral" | "optimistic";

export interface FinancialGoal {
  id: string;
  userId: string;
  type: GoalType;
  name: string;
  targetAmount: number;
  targetDate: ISODateString;
  monthlyContribution: number;
  currentAmount: number;
  /** Fractie — 0.06 = 6%/jaar. */
  expectedAnnualReturn: number;
  riskProfile: RiskTolerance;
  baseCurrency: Currency;
  description: string | null;
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Eén-jaars-stap in de projectie-tijdreeks. */
export interface ProjectionPoint {
  /** Aantal jaren vanaf vandaag (0 = startwaarde). */
  yearOffset: number;
  /** Datum (ISO) — voor charts. */
  date: ISODateString;
  /** Waarde aan eind van dat jaar. */
  value: number;
}

export interface ScenarioProjection {
  key: ScenarioKey;
  /** Gebruikte annual return voor dit scenario. */
  annualReturn: number;
  /** Eindwaarde aan target-datum. */
  finalValue: number;
  /** Tijdreeks (jaar-stappen). */
  series: ProjectionPoint[];
  /** Verschil met `targetAmount` — positief = surplus, negatief = tekort. */
  surplus: number;
  /** Of dit scenario het doel haalt. */
  meetsTarget: boolean;
}

export interface FeasibilityAssessment {
  tier: FeasibilityTier;
  /** Eén-zin uitleg in NL. */
  summary: string;
  /** Welk maandbedrag zou nodig zijn om in `neutral` precies het doel te halen. */
  requiredMonthlyContribution: number | null;
  /** Verschil met huidige `monthlyContribution`. Positief = bijstellen. */
  contributionGap: number | null;
  /** Welk rendement zou nodig zijn met huidige inleg. */
  requiredAnnualReturn: number | null;
}

export interface GoalProjection {
  goalId: string;
  computedAt: ISODateString;
  /** Aantal jaren tussen vandaag en target-datum. */
  yearsToTarget: number;
  /** Voortgang als fractie 0..1 (currentAmount / targetAmount). */
  progress: number;
  scenarios: Record<ScenarioKey, ScenarioProjection>;
  feasibility: FeasibilityAssessment;
}

/** Default-rendement per risk-profile (jaar-fractie). Bron: long-run
 *  Wereldindex-returns gecorrigeerd voor inflatie + asset-mix per profile. */
export const DEFAULT_EXPECTED_RETURN: Record<RiskTolerance, number> = {
  CONSERVATIVE: 0.04,
  BALANCED: 0.06,
  GROWTH: 0.075,
  AGGRESSIVE: 0.09,
};

/** Spread die scenario-bandbreedte produceert (in jaarrendement-punten). */
export const SCENARIO_SPREAD: Record<RiskTolerance, number> = {
  CONSERVATIVE: 0.02, // ±2pt
  BALANCED: 0.03,
  GROWTH: 0.035,
  AGGRESSIVE: 0.045,
};

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  RETIREMENT: "Pensioen",
  FIRE: "FIRE — financieel onafhankelijk",
  DIVIDEND_INCOME: "Dividendinkomen",
  WEALTH_GROWTH: "Vermogensgroei",
  HOME_PURCHASE: "Huis kopen",
  EDUCATION: "Studie kinderen",
  EMERGENCY_FUND: "Financiële buffer",
  CUSTOM: "Eigen doel",
};

export const GOAL_TYPE_DESCRIPTIONS: Record<GoalType, string> = {
  RETIREMENT: "Stoppen met werken op de gewenste leeftijd, vol of gedeeltelijk.",
  FIRE: "Financial Independence, Retire Early — eerder dan AOW-leeftijd.",
  DIVIDEND_INCOME: "Maandelijks passief inkomen uit dividendbetalende posities.",
  WEALTH_GROWTH: "Algemene vermogensopbouw zonder specifieke datum.",
  HOME_PURCHASE: "Eigen woning of tweede huis aanschaffen.",
  EDUCATION: "Studie of toekomst van je kinderen.",
  EMERGENCY_FUND: "Reserve voor onverwachte uitgaven, gescheiden van portefeuille.",
  CUSTOM: "Een doel dat niet in de lijst staat.",
};
