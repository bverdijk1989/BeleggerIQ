/**
 * Projection-calculator voor financiële doelen.
 *
 * Pure functies. Gegeven (P, M, r, Y) berekent:
 *   FV = P × (1+r_m)^n + M × ((1+r_m)^n − 1) / r_m
 *
 * waarbij:
 *   P   = startwaarde (currentAmount)
 *   M   = maandelijkse inleg (monthlyContribution)
 *   r   = jaarrendement (fractie)
 *   r_m = (1+r)^(1/12) − 1 (maandelijks samengesteld)
 *   n   = horizon × 12 maanden
 *
 * **Aannames + limieten**:
 *  - Inleg gebeurt aan eind van iedere maand (ordinary annuity).
 *  - Rendement is constant over de horizon — geen volatiliteit, geen
 *    sequence-of-returns-risico. Voor dat realisme zou Monte Carlo nodig
 *    zijn; M18 dekt die laag voor de portefeuille zelf.
 *  - Rendement is reëel of nominaal afhankelijk van wat de gebruiker
 *    invoert; UI-tekst noemt "verwacht jaarrendement" zonder inflatie-
 *    aanname te claimen.
 */

import type { ISODateString } from "@/types/common";

import type { ProjectionPoint } from "./types";

export interface ProjectFutureValueInput {
  /** Startwaarde (huidige saldo richting dit doel). */
  initialAmount: number;
  /** Maandelijkse inleg. */
  monthlyContribution: number;
  /** Jaarrendement fractie. */
  annualReturn: number;
  /** Horizon in maanden. */
  months: number;
}

export interface ProjectFutureValueResult {
  finalValue: number;
  /** Som van alle inleg + start (zonder rendement). */
  totalInvested: number;
  /** Bijdrage van rendement (finalValue - totalInvested). */
  growthComponent: number;
}

export function projectFutureValue(
  input: ProjectFutureValueInput,
): ProjectFutureValueResult {
  const { initialAmount, monthlyContribution, annualReturn, months } = input;
  if (!Number.isFinite(months) || months <= 0) {
    return {
      finalValue: clampNonNeg(initialAmount),
      totalInvested: clampNonNeg(initialAmount),
      growthComponent: 0,
    };
  }

  const monthlyRate = annualToMonthly(annualReturn);
  const initial = clampNonNeg(initialAmount);
  const contribution = clampNonNeg(monthlyContribution);

  const initialFv = initial * Math.pow(1 + monthlyRate, months);

  // Annuity-FV met edge case voor r=0 (lineair).
  let contributionsFv: number;
  if (Math.abs(monthlyRate) < 1e-9) {
    contributionsFv = contribution * months;
  } else {
    contributionsFv =
      contribution * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
  }

  const finalValue = initialFv + contributionsFv;
  const totalInvested = initial + contribution * months;
  return {
    finalValue,
    totalInvested,
    growthComponent: finalValue - totalInvested,
  };
}

export interface BuildProjectionSeriesInput extends ProjectFutureValueInput {
  /** ISO-startdatum voor de tijdreeks. */
  startDate: Date;
}

/**
 * Bouw een jaar-stap tijdreeks van projectie-waarden, t/m de horizon.
 * Eerste punt heeft `yearOffset=0` met de startwaarde.
 */
export function buildProjectionSeries(
  input: BuildProjectionSeriesInput,
): ProjectionPoint[] {
  const { initialAmount, monthlyContribution, annualReturn, months, startDate } =
    input;
  const totalYears = Math.max(1, Math.ceil(months / 12));
  const points: ProjectionPoint[] = [];

  // Punt op t=0
  points.push({
    yearOffset: 0,
    date: startDate.toISOString().slice(0, 10) as ISODateString,
    value: clampNonNeg(initialAmount),
  });

  for (let y = 1; y <= totalYears; y++) {
    const monthsForStep = Math.min(months, y * 12);
    const fv = projectFutureValue({
      initialAmount,
      monthlyContribution,
      annualReturn,
      months: monthsForStep,
    });
    const date = new Date(startDate);
    date.setUTCFullYear(date.getUTCFullYear() + y);
    points.push({
      yearOffset: y,
      date: date.toISOString().slice(0, 10) as ISODateString,
      value: fv.finalValue,
    });
  }

  return points;
}

/**
 * Inverse: gegeven `targetAmount`, `initialAmount`, `annualReturn`,
 * `months`, vind de maandelijkse inleg die exact het doel haalt.
 *
 * Formule (gewone annuity):
 *   T = P × (1+r_m)^n + M × ((1+r_m)^n − 1) / r_m
 *   ⇒ M = (T − P × (1+r_m)^n) × r_m / ((1+r_m)^n − 1)
 *
 * Edge cases:
 *  - r_m == 0 → M = (T − P) / n
 *  - T ≤ P × (1+r_m)^n al bereikt zonder bijstorting → M = 0
 */
export function solveRequiredMonthlyContribution(input: {
  targetAmount: number;
  initialAmount: number;
  annualReturn: number;
  months: number;
}): number {
  const { targetAmount, initialAmount, annualReturn, months } = input;
  if (!Number.isFinite(months) || months <= 0) return 0;
  const monthlyRate = annualToMonthly(annualReturn);
  const initialFv = initialAmount * Math.pow(1 + monthlyRate, months);
  const remaining = targetAmount - initialFv;
  if (remaining <= 0) return 0;
  if (Math.abs(monthlyRate) < 1e-9) {
    return remaining / months;
  }
  const factor = (Math.pow(1 + monthlyRate, months) - 1) / monthlyRate;
  return remaining / factor;
}

/**
 * Inverse: gegeven `targetAmount`, `initialAmount`, `monthlyContribution`,
 * `months`, vind het jaarrendement dat het doel exact haalt.
 *
 * Geen gesloten formule — gebruik bisection over [0, 0.20].
 * 200 iteraties is overkill; we stoppen bij 1e-5 nauwkeurigheid.
 */
export function solveRequiredAnnualReturn(input: {
  targetAmount: number;
  initialAmount: number;
  monthlyContribution: number;
  months: number;
}): number | null {
  const { targetAmount, initialAmount, monthlyContribution, months } = input;
  if (months <= 0) return null;

  // Eenvoudige feasibility-check: bij r=0 (alleen inleg + start) genoeg?
  const fvAtZero = projectFutureValue({
    initialAmount,
    monthlyContribution,
    annualReturn: 0,
    months,
  }).finalValue;
  if (fvAtZero >= targetAmount) {
    return 0;
  }

  // Bisection in [0, 0.30].
  let lo = 0;
  let hi = 0.30;
  let iter = 0;
  const fAt = (r: number) =>
    projectFutureValue({
      initialAmount,
      monthlyContribution,
      annualReturn: r,
      months,
    }).finalValue - targetAmount;

  // Als zelfs 30%/jaar het niet haalt → unfeasible.
  if (fAt(hi) < 0) return null;

  while (hi - lo > 1e-5 && iter < 80) {
    const mid = (lo + hi) / 2;
    if (fAt(mid) < 0) {
      lo = mid;
    } else {
      hi = mid;
    }
    iter += 1;
  }
  return (lo + hi) / 2;
}

// ============================================================
//  Helpers
// ============================================================

export function annualToMonthly(annual: number): number {
  if (!Number.isFinite(annual)) return 0;
  return Math.pow(1 + annual, 1 / 12) - 1;
}

export function yearsBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return ms / (365.25 * 24 * 60 * 60 * 1000);
}

export function monthsBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.round(ms / ((365.25 / 12) * 24 * 60 * 60 * 1000));
}

function clampNonNeg(v: number): number {
  if (!Number.isFinite(v) || v < 0) return 0;
  return v;
}
