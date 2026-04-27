import type { Currency } from "./common";
import type { RebalanceFrequency } from "./allocation";
import type { AssetClass } from "./portfolio";

export type InvestorType =
  | "LONG_TERM"
  | "INCOME"
  | "GROWTH"
  | "DIVIDEND"
  | "FACTOR"
  | "BALANCED";

/**
 * User-facing beleggingsdoel. Los van `InvestorType` zodat product en
 * scoring-engine onafhankelijk kunnen evolueren.
 */
export type InvestmentObjective =
  | "GROWTH"
  | "INCOME"
  | "BALANCED"
  | "CAPITAL_PRESERVATION"
  | "RETIREMENT"
  | "FIRE"
  | "CUSTOM";

export type RiskTolerance =
  | "CONSERVATIVE"
  | "BALANCED"
  | "GROWTH"
  | "AGGRESSIVE";

export type EsgStance = "never" | "avoid" | "neutral" | "prefer" | "only";

/**
 * Client-side tilts bovenop het beleggingsprofiel. Worden door de
 * allocation-engine meegewogen. Alle scalaire waarden liggen in -1..1.
 */
export interface InvestorPreferences {
  regionTilts: Record<string, number>;
  sectorTilts: Record<string, number>;
  /** Hogere waarde = meer dividend-emphasis. */
  dividendPreference: number;
  /** Hogere waarde = meer momentum-emphasis. */
  momentumPreference: number;
}

export type ProfileCompletenessField =
  | "objective"
  | "riskTolerance"
  | "horizon"
  | "monthlyContribution"
  | "goals"
  | "policy";

export interface ProfileCompleteness {
  /** Volledig ingevuld profiel (alle `required` velden). */
  isComplete: boolean;
  /** Score 0..1, gewogen per veld. */
  score: number;
  missing: ProfileCompletenessField[];
}

export interface InvestorGoal {
  id: string;
  label: string;
  targetAmount?: number;
  targetDate?: string;
}

/**
 * Harde constraints en voorkeuren die elk analytics- of allocation-resultaat
 * moet respecteren. Alles is optioneel zodat een nieuw profiel progressief
 * ingevuld kan worden.
 */
export interface PolicySettings {
  /** Max gewicht per enkele positie, fractie (bv. 0.08 = 8%). */
  maxPositionWeight?: number;
  minPositionWeight?: number;
  maxSectorWeight?: number;
  maxRegionWeight?: number;
  maxPositions?: number;
  minPositions?: number;

  allowedAssetClasses?: AssetClass[];
  excludedTickers?: string[];
  excludedSectors?: string[];
  excludedRegions?: string[];

  esgStance?: EsgStance;
  requireDividend?: boolean;

  /** Ondergrens op de composite factor score, -1..1. */
  minFactorComposite?: number;

  rebalance?: RebalanceFrequency;
  /** Cash buffer als fractie van portefeuille-waarde. */
  cashBufferPct?: number;
  /** Jaarlijkse belastingdrag in basispunten. */
  taxDragBps?: number;
  /** Transactiekosten in basispunten per trade. */
  commissionBps?: number;
}

export interface UserProfile {
  id: string;
  userId: string;
  investorType: InvestorType;
  objective: InvestmentObjective;
  riskTolerance: RiskTolerance;
  investmentHorizonYrs: number;
  monthlyContribution?: number | null;
  baseCurrency: Currency;
  taxResidency: string;
  /** Heeft de gebruiker een fiscaal partner? Default false. Beïnvloedt
   *  de box 3-vrijstelling én drempelschulden in de Tax Engine. */
  hasFiscalPartner?: boolean;
  /** Spaargeld in EUR (peildatum 1 jan). Optioneel — input voor box 3. */
  cashWealthEur?: number;
  /** Schulden in EUR (peildatum 1 jan). Optioneel — input voor box 3. */
  debtWealthEur?: number;
  goals: InvestorGoal[];
  /** Ruwe product-preferences-blob (UI toggles, ESG-flags etc). */
  preferences: Record<string, unknown>;
  /** Harde beleggingsconstraints en voorkeuren. */
  policy?: PolicySettings;
}
