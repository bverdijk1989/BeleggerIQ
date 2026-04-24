import type { BacktestResult } from "@/types/backtest";

import { computeBenchmarkRegret } from "./benchmark-regret";
import { computeDcaSimulation } from "./dca-simulation";
import { computeDrawdownRecovery } from "./drawdown-recovery";
import { computeRegimeBreakdown } from "./regime-breakdown";
import { computeRollingReturns } from "./rolling-windows";
import { toIsoDateOnly } from "./shared";
import type { StrategyEvidenceReport } from "./types";
import { detectUnderperformancePeriods } from "./underperformance";
import { buildEvidenceVerdict } from "./verdict";

/**
 * `buildEvidenceReport` — pure orkestrator over alle evidence-analytics.
 *
 * Input: een bestaande `BacktestResult` + label-config. Output: een
 * bundel die de UI direct kan renderen. Geen I/O, geen Date.now()
 * zolang `config.now` is meegegeven.
 */

export interface BuildEvidenceReportInput {
  result: BacktestResult;
  strategyLabel: string;
  benchmarkLabel?: string | null;
  config?: {
    rollingWindowMonths?: number;
    underperformanceMinMonths?: number;
    underperformanceMinShortfall?: number;
    underperformanceLimit?: number;
    drawdownMinDepth?: number;
    dca?: {
      initialCapital?: number;
      monthlyContribution?: number;
    };
    now?: string;
  };
}

export function buildEvidenceReport(
  input: BuildEvidenceReportInput,
): StrategyEvidenceReport {
  const { result, strategyLabel } = input;
  const benchmarkLabel = input.benchmarkLabel ?? result.benchmark?.ticker ?? null;
  const config = input.config ?? {};
  const now = config.now ?? new Date().toISOString();
  const points = result.equityCurve;

  const rollingWindowMonths = config.rollingWindowMonths ?? 12;
  const rolling = computeRollingReturns({
    points,
    windowMonths: rollingWindowMonths,
  });
  const regimeBreakdown = computeRegimeBreakdown({ points });
  const underperformancePeriods = detectUnderperformancePeriods({
    points,
    minMonths: config.underperformanceMinMonths,
    minShortfall: config.underperformanceMinShortfall,
    limit: config.underperformanceLimit,
  });
  const drawdownRecovery = computeDrawdownRecovery({
    points,
    minDepth: config.drawdownMinDepth,
  });
  const regret = computeBenchmarkRegret({ points });

  const dcaConfig = config.dca ?? {};
  // Default DCA-parameters: zelfde initial capital als de backtest,
  // maandelijkse bijdrage = `config.monthlyContribution` uit backtest of 0.
  const dcaInitial = dcaConfig.initialCapital ?? result.config.initialCapital;
  const dcaContribution =
    dcaConfig.monthlyContribution ?? result.config.monthlyContribution ?? 0;
  const dca = computeDcaSimulation({
    points,
    initialCapital: dcaInitial,
    monthlyContribution: dcaContribution,
  });

  const monthsObserved = Math.max(0, points.length - 1);
  const periodStart =
    points.length > 0 ? toIsoDateOnly(points[0]!.date) : result.config.startDate;
  const periodEnd =
    points.length > 0
      ? toIsoDateOnly(points[points.length - 1]!.date)
      : result.config.endDate;

  const verdict = buildEvidenceVerdict({
    strategyLabel,
    benchmarkLabel,
    monthsObserved,
    strategyCagr: Number.isFinite(result.cagr) ? result.cagr : null,
    maxDrawdown: Number.isFinite(result.maxDrawdown) ? result.maxDrawdown : null,
    rolling12m: rolling,
    dca,
    regret,
    drawdownRecovery,
    underperformancePeriods,
  });

  return {
    generatedAt: now,
    strategyLabel,
    benchmarkLabel,
    periodStart,
    periodEnd,
    monthsObserved,
    regimeBreakdown,
    rollingTwelveMonth: rolling,
    worstTwelveMonth: rolling.worst,
    bestTwelveMonth: rolling.best,
    underperformancePeriods,
    dcaSimulation: dca,
    benchmarkRegret: regret,
    drawdownRecovery,
    verdict,
  };
}
