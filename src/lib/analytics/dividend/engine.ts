/**
 * Dividend Calendar & DRIP Simulator — engine (Module 22).
 *
 * Pure functies. Geen Date.now, geen randomness. Drempels staan
 * inline als `const`. Reproduceerbaar.
 *
 * **Heuristiek voor distributie-maanden** (zonder feed):
 *   - QUARTERLY: 3, 6, 9, 12 (US-conventie)
 *   - SEMIANNUAL: 5, 11 (EU-conventie: meirevenue + dec/nov-balans)
 *   - ANNUAL: 5 (mei — typisch NL/DE-AGM-seizoen)
 *   - MONTHLY: 1..12 (REITs/sommige hi-yield ETFs)
 */

import type { ISODateString } from "@/types/common";

import type {
  AnnualDividendProjection,
  DistributionFrequency,
  DividendCalendarRow,
  DividendDataQuality,
  DividendGrowthAnalysis,
  DividendReport,
  DripHorizonYears,
  DripScenario,
  DripScenarioResult,
  DripSimulation,
} from "./types";
import { DIVIDEND_DISCLAIMER } from "./types";

// ============================================================
//  Frequentie-heuristiek
// ============================================================

const FREQUENCY_MONTHS: Record<DistributionFrequency, number[]> = {
  MONTHLY: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  QUARTERLY: [3, 6, 9, 12],
  SEMIANNUAL: [5, 11],
  ANNUAL: [5],
  ZERO: [],
};

/**
 * Heuristische frequentie-classifier op basis van publieke conventies.
 *
 *  - REITs (ticker bevat "REIT" of asset-class) → MONTHLY of QUARTERLY
 *  - Tickers met ".AS" / ".PA" / ".DE" suffix (Euronext / Xetra) → SEMIANNUAL
 *  - Tickers zonder suffix (US-NYSE/NASDAQ default) → QUARTERLY
 *  - Geen dividend → ZERO
 */
export function classifyFrequency(input: {
  ticker: string;
  assetClass?: string | null;
  dividendYield: number | null;
}): DistributionFrequency {
  if (
    input.dividendYield === null ||
    !Number.isFinite(input.dividendYield) ||
    input.dividendYield <= 0
  ) {
    return "ZERO";
  }
  const t = input.ticker.toUpperCase();
  const ac = (input.assetClass ?? "").toUpperCase();
  if (ac === "REIT" || t.includes("REIT")) {
    return "QUARTERLY"; // bewust niet "MONTHLY" als default — te aggressief
  }
  if (
    t.endsWith(".AS") ||
    t.endsWith(".PA") ||
    t.endsWith(".DE") ||
    t.endsWith(".BR") ||
    t.endsWith(".LS")
  ) {
    return "SEMIANNUAL";
  }
  if (t.endsWith(".L")) {
    return "QUARTERLY"; // UK-aandelen typisch kwartaal
  }
  // Fallback: US-listed → QUARTERLY.
  return "QUARTERLY";
}

// ============================================================
//  Per-positie calendar-row
// ============================================================

export interface BuildCalendarRowInput {
  ticker: string;
  name: string;
  marketValue: number;
  dividendYield: number | null;
  assetClass?: string | null;
  /** Optioneel feed-veld. */
  nextExDividendDate?: ISODateString | null;
  nextPayDate?: ISODateString | null;
}

export function buildCalendarRow(
  input: BuildCalendarRowInput,
): DividendCalendarRow {
  const yield_ = input.dividendYield;
  if (yield_ === null || !Number.isFinite(yield_) || yield_ <= 0) {
    return {
      ticker: input.ticker,
      name: input.name,
      marketValue: input.marketValue,
      dividendYield: null,
      expectedAnnualGross: 0,
      frequency: "ZERO",
      monthlyEstimates: [],
      nextExDividendDate: input.nextExDividendDate ?? null,
      nextPayDate: input.nextPayDate ?? null,
      dataQuality: yield_ === null ? "missing" : "low",
    };
  }
  const frequency = classifyFrequency({
    ticker: input.ticker,
    assetClass: input.assetClass,
    dividendYield: yield_,
  });
  const months = FREQUENCY_MONTHS[frequency];
  const annualGross = input.marketValue * yield_;
  const perPayment = months.length > 0 ? annualGross / months.length : 0;
  const monthlyEstimates = months.map((m) => ({
    month: m,
    amount: perPayment,
  }));
  const dataQuality: DividendDataQuality =
    input.nextExDividendDate ? "actual" : "estimated";
  return {
    ticker: input.ticker,
    name: input.name,
    marketValue: input.marketValue,
    dividendYield: yield_,
    expectedAnnualGross: annualGross,
    frequency,
    monthlyEstimates,
    nextExDividendDate: input.nextExDividendDate ?? null,
    nextPayDate: input.nextPayDate ?? null,
    dataQuality,
  };
}

// ============================================================
//  Jaarlijkse projectie
// ============================================================

export function buildAnnualProjection(
  rows: ReadonlyArray<DividendCalendarRow>,
): AnnualDividendProjection {
  let annualGross = 0;
  let coveredValue = 0;
  let coveredCount = 0;
  let zeroCount = 0;
  let actualCount = 0;
  let estimatedCount = 0;
  for (const r of rows) {
    if (r.frequency === "ZERO" || r.dataQuality === "missing") {
      zeroCount += 1;
      continue;
    }
    annualGross += r.expectedAnnualGross;
    coveredValue += r.marketValue;
    coveredCount += 1;
    if (r.dataQuality === "actual") actualCount += 1;
    if (r.dataQuality === "estimated") estimatedCount += 1;
  }
  const weightedYield = coveredValue > 0 ? annualGross / coveredValue : 0;
  return {
    annualGross,
    weightedYield,
    coveredPositions: coveredCount,
    zeroPositions: zeroCount,
    actualCount,
    estimatedCount,
  };
}

// ============================================================
//  Dividendgroei-analyse
// ============================================================

export interface BuildGrowthAnalysisInput {
  rows: ReadonlyArray<{
    marketValue: number;
    dividendGrowth5y: number | null;
  }>;
}

export function buildGrowthAnalysis(
  input: BuildGrowthAnalysisInput,
): DividendGrowthAnalysis {
  let weightedSum = 0;
  let weightTotal = 0;
  let coveredCount = 0;
  for (const r of input.rows) {
    if (
      typeof r.dividendGrowth5y === "number" &&
      Number.isFinite(r.dividendGrowth5y)
    ) {
      weightedSum += r.dividendGrowth5y * r.marketValue;
      weightTotal += r.marketValue;
      coveredCount += 1;
    }
  }
  const weighted5yGrowth =
    weightTotal > 0 ? weightedSum / weightTotal : null;
  let summary: string;
  if (weighted5yGrowth === null) {
    summary = "Geen historische dividendgroei-data beschikbaar.";
  } else if (weighted5yGrowth > 0.05) {
    summary = `Sterke gewogen 5-jaars groei: ${(weighted5yGrowth * 100).toFixed(1)}%/jr.`;
  } else if (weighted5yGrowth > 0) {
    summary = `Bescheiden groei: ${(weighted5yGrowth * 100).toFixed(1)}%/jr — net boven inflatie-tempo.`;
  } else if (weighted5yGrowth > -0.02) {
    summary = `Stabiele dividenden zonder duidelijke groei.`;
  } else {
    summary = `Negatieve dividendgroei (${(weighted5yGrowth * 100).toFixed(1)}%/jr) — onderzoek of cuts duurzaam zijn.`;
  }
  return { weighted5yGrowth, coveredPositions: coveredCount, summary };
}

// ============================================================
//  DRIP simulator — pure compounding
// ============================================================

export interface SimulateDripInput {
  initialValue: number;
  /** Verwachte jaarlijkse dividend-bruto in base-currency. */
  annualDividendGross: number;
  /** Maandelijkse inleg uit profile (optioneel). */
  monthlyContribution: number;
  /** Annual return scenario (cap-gain + dividend reinvested if DRIP). */
  scenarios: Record<DripScenario, number>;
  horizonYears: DripHorizonYears;
}

export function simulateDrip(input: SimulateDripInput): DripSimulation {
  const horizonMonths = input.horizonYears * 12;
  const monthlyDividend = input.annualDividendGross / 12;

  const withDrip = simulateScenarios({
    ...input,
    horizonMonths,
    monthlyDividend,
    drip: true,
  });
  const withoutDrip = simulateScenarios({
    ...input,
    horizonMonths,
    monthlyDividend,
    drip: false,
  });

  return {
    horizonYears: input.horizonYears,
    withDrip,
    withoutDrip,
    assumptions: [
      `Verwachte jaarlijkse dividend-bruto: ${formatCurrency(input.annualDividendGross)}`,
      "Maandelijkse inleg is constant — geen indexatie",
      "Dividenden zijn nominaal (geen belasting-correctie)",
      "Sequence-of-returns wordt NIET gemodelleerd (linear compound)",
      "Dividend-bedrag groeit niet over de horizon (conservatief)",
      "DRIP-aan: dividend wordt 100% herbelegd in dezelfde portefeuille",
      "DRIP-uit: dividend valt buiten compound (verlaat de portefeuille als cash)",
    ],
  };
}

function simulateScenarios(args: {
  initialValue: number;
  scenarios: Record<DripScenario, number>;
  monthlyContribution: number;
  monthlyDividend: number;
  horizonMonths: number;
  drip: boolean;
}): Record<DripScenario, DripScenarioResult> {
  const result = {} as Record<DripScenario, DripScenarioResult>;
  for (const key of ["conservative", "neutral", "optimistic"] as const) {
    result[key] = simulateOne({
      initialValue: args.initialValue,
      annualReturn: args.scenarios[key],
      monthlyContribution: args.monthlyContribution,
      monthlyDividend: args.monthlyDividend,
      horizonMonths: args.horizonMonths,
      drip: args.drip,
    });
  }
  return result;
}

function simulateOne(args: {
  initialValue: number;
  annualReturn: number;
  monthlyContribution: number;
  monthlyDividend: number;
  horizonMonths: number;
  drip: boolean;
}): DripScenarioResult {
  const monthlyRate = Math.pow(1 + args.annualReturn, 1 / 12) - 1;
  let value = args.initialValue;
  let reinvestedDividend = 0;
  for (let i = 0; i < args.horizonMonths; i++) {
    // Cap-gain compound
    value *= 1 + monthlyRate;
    // Monthly contribution
    value += args.monthlyContribution;
    // Dividend
    if (args.drip) {
      value += args.monthlyDividend;
      reinvestedDividend += args.monthlyDividend;
    }
    // Zonder DRIP: dividend valt uit de pot — niet meegerekend in `value`.
  }
  return {
    annualReturn: args.annualReturn,
    finalValue: Math.max(0, value),
    reinvestedDividend: Math.max(0, reinvestedDividend),
  };
}

// ============================================================
//  Hoofd-orchestrator
// ============================================================

export interface BuildDividendReportInput {
  asOf: ISODateString;
  baseCurrency: string;
  totalPortfolioValue: number;
  rows: ReadonlyArray<DividendCalendarRow>;
  growthInputs: ReadonlyArray<{
    marketValue: number;
    dividendGrowth5y: number | null;
  }>;
  monthlyContribution: number;
  scenarios: Record<DripScenario, number>;
}

export function buildDividendReport(
  input: BuildDividendReportInput,
): DividendReport {
  const projection = buildAnnualProjection(input.rows);
  const growth = buildGrowthAnalysis({ rows: input.growthInputs });

  // Maand-totalen aggregeren.
  const monthlyTotalsMap = new Map<number, number>();
  for (const r of input.rows) {
    for (const m of r.monthlyEstimates) {
      monthlyTotalsMap.set(
        m.month,
        (monthlyTotalsMap.get(m.month) ?? 0) + m.amount,
      );
    }
  }
  const monthlyTotals = Array.from(monthlyTotalsMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([month, amount]) => ({ month, amount }));

  // 3 simulaties voor 5/10/20 jaar.
  const simulations: DripSimulation[] = [5, 10, 20].map((y) =>
    simulateDrip({
      initialValue: input.totalPortfolioValue,
      annualDividendGross: projection.annualGross,
      monthlyContribution: input.monthlyContribution,
      scenarios: input.scenarios,
      horizonYears: y as DripHorizonYears,
    }),
  );

  // Waarschuwingen op basis van data-kwaliteit.
  const warnings: string[] = [];
  if (
    projection.coveredPositions === 0 &&
    projection.zeroPositions > 0
  ) {
    warnings.push(
      "Geen van je posities heeft een gepubliceerde dividend-yield — projectie is leeg.",
    );
  }
  if (projection.estimatedCount > 0 && projection.actualCount === 0) {
    warnings.push(
      `Alle ${projection.estimatedCount} dividend-rijen zijn ESTIMATED (geen actuele ex-dividend-feed). Bedragen zijn indicatief.`,
    );
  }
  if (growth.weighted5yGrowth === null) {
    warnings.push(
      "Geen 5-jaars dividend-groei-data — groei-projectie wordt conservatief gemodelleerd (geen groei).",
    );
  }
  if (projection.weightedYield > 0.07) {
    warnings.push(
      `Gewogen yield ${(projection.weightedYield * 100).toFixed(1)}% — controleer of de payout-ratios duurzaam zijn (yield-trap-risico).`,
    );
  }

  return {
    generatedAt: input.asOf,
    baseCurrency: input.baseCurrency,
    totalPortfolioValue: input.totalPortfolioValue,
    rows: [...input.rows],
    monthlyTotals,
    projection,
    growth,
    simulations,
    disclaimer: DIVIDEND_DISCLAIMER,
    warnings,
  };
}

// ============================================================
//  Helpers
// ============================================================

function formatCurrency(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return `${amount.toFixed(0)}`;
}
