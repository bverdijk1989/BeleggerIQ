/**
 * Long-Term Wealth Dashboard — types (Module 21).
 *
 * Aggregator boven portfolio-view + financial goals + transactions.
 * Beantwoordt één vraag: ben ik op koers richting mijn financiële doelen?
 *
 * **Pure laag**: engine.ts is een pure functie die alle metadata krijgt
 * meegegeven. De loader.ts hydrateert via portfolio-view + goalRepository
 * + transactionRepository.
 *
 * **Indicatief**: projecties zijn een schatting; aannames staan expliciet
 * in `assumptions[]` zodat een gebruiker schijnzekerheid kan herkennen
 * (Module 11 + 17 patroon).
 */

import type { ISODateString } from "@/types/common";
import type {
  FinancialGoal,
  ScenarioKey,
} from "@/lib/analytics/goals";

// ============================================================
//  Sub-card-shapes
// ============================================================

/** "Ben ik op koers?"-eindstatus. */
export type WealthCourseStatus =
  | "on_track" // alle goals haalbaar
  | "mostly_on_track" // ≥80% van goals haalbaar
  | "at_risk" // 50-80% haalbaar
  | "off_track" // <50% haalbaar
  | "no_goals"; // geen doelen ingesteld

export interface WealthCourseSummary {
  status: WealthCourseStatus;
  /** 1-zin headline. */
  message: string;
  /** Aantal doelen totaal + haalbaar. */
  totalGoals: number;
  achievableGoals: number;
}

/** 10-jaars projectie op portfolio-niveau (zonder specifiek doel). */
export interface DecadeProjection {
  /** Aantal maanden modeled. */
  horizonMonths: number;
  /** Maandelijkse inleg gebruikt in de projectie. */
  monthlyContribution: number;
  /** Eindwaardes per scenario. */
  scenarios: Record<ScenarioKey, {
    annualReturn: number;
    finalValue: number;
    series: Array<{ yearOffset: number; value: number }>;
  }>;
  /** Aannames voor de UI-disclosure. */
  assumptions: string[];
}

/** Maandelijkse-discipline-check. */
export interface MonthlyDiscipline {
  /** Welke maand wordt gemeten (YYYY-MM). */
  month: string;
  /** Som van DEPOSIT-transactions in deze maand (base currency). */
  contributedThisMonth: number;
  /** Geplande/configureerde maandinleg. */
  plannedMonthly: number;
  /** Achterstand (negatief) of voorsprong (positief). */
  delta: number;
  /** Op koers? (delta ≥ -10% van planned). */
  onTrack: boolean;
}

/** Verwachte jaarlijkse dividend-stroom (indien data beschikbaar). */
export interface ExpectedDividendIncome {
  /** Totale verwachte dividend-uitkeringen per jaar in base currency. */
  annualGross: number;
  /** Aantal posities met dividend-data. */
  coveredPositions: number;
  /** Aantal posities zonder dividend-data (transparantie). */
  uncoveredPositions: number;
  /** Gemiddelde yield over portfolio. */
  weightedYield: number;
}

/** Drift: huidige allocation vs target allocation. */
export interface AllocationDriftRow {
  ticker: string;
  name: string;
  currentWeight: number;
  targetWeight: number;
  deltaWeight: number;
  /** Boolean — staat 'em in de top-3 grootste afwijkingen? */
  top3: boolean;
}

export interface AllocationDriftSummary {
  /** Top-3 afwijkingen gesorteerd op |delta|. */
  topRows: AllocationDriftRow[];
  /** Aantal posities met afwijking >2 procentpunt. */
  significantDrifts: number;
  /** Spreiding-metric: 0..100 (100 = perfect on-target). */
  alignmentScore: number;
}

// ============================================================
//  Hoofd-output
// ============================================================

export interface WealthDashboardReport {
  generatedAt: ISODateString;
  baseCurrency: string;
  /** Totale portfolio-waarde nu. */
  totalValue: number;
  course: WealthCourseSummary;
  projection: DecadeProjection;
  drift: AllocationDriftSummary;
  discipline: MonthlyDiscipline;
  dividendIncome: ExpectedDividendIncome | null;
  /** Lijst alle goals + projecties (cached uit goals-loader). */
  goals: Array<{
    goal: Pick<FinancialGoal, "id" | "name" | "type" | "targetAmount" | "targetDate">;
    feasibilityTier: string;
    progress: number;
  }>;
  /** Universele disclaimer-string. */
  disclaimer: string;
}

export const WEALTH_DISCLAIMER =
  "Projecties zijn indicatief en gebaseerd op huidige inleg + verwacht rendement per risicoprofiel. Echte uitkomsten worden bepaald door sequence-of-returns, inflatie, persoonlijke uitgaven en wereldgebeurtenissen. Geen koop/verkoop-advies; gebruik dit als referentie naast je eigen plan.";
