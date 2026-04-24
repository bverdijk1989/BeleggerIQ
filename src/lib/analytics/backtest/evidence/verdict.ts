import { clamp } from "./shared";
import type {
  BenchmarkRegretScore,
  DcaContributionSimulation,
  DrawdownRecoverySummary,
  EvidenceVerdict,
  RollingWindowSummary,
  UnderperformancePeriod,
} from "./types";

/**
 * Plain-language verdict builder.
 *
 * **Geen LLM**. Alle zinnen komen uit vaste templates over gemeten
 * cijfers. Dit houdt de output reproduceerbaar en voorkomt dat AI
 * rendements- of risico-claims verzint die niet in de backtest staan.
 *
 * De verdict-bundle bestaat uit:
 *   - `headline`: 1 zin met de CAGR + belangrijkste tekortkoming.
 *   - `highlights[]`: 3–5 bullets met concrete cijfers.
 *   - `limitations[]`: expliciete sample-size/data-warnings.
 *   - `confidence` (0..1): hoe robuust de evidence is (sample size,
 *     benchmark dekking).
 */

export interface BuildVerdictInput {
  strategyLabel: string;
  benchmarkLabel: string | null;
  monthsObserved: number;
  strategyCagr: number | null;
  maxDrawdown: number | null;
  rolling12m: RollingWindowSummary;
  dca: DcaContributionSimulation;
  regret: BenchmarkRegretScore | null;
  drawdownRecovery: DrawdownRecoverySummary;
  underperformancePeriods: UnderperformancePeriod[];
}

export function buildEvidenceVerdict(input: BuildVerdictInput): EvidenceVerdict {
  const {
    strategyLabel,
    benchmarkLabel,
    monthsObserved,
    strategyCagr,
    maxDrawdown,
    rolling12m,
    dca,
    regret,
    drawdownRecovery,
    underperformancePeriods,
  } = input;

  const years = monthsObserved / 12;
  const limitations: string[] = [];

  if (monthsObserved < 36) {
    limitations.push(
      `Sample omvat slechts ${monthsObserved} maanden (≈ ${years.toFixed(1)} jaar) — statistische conclusies zijn zwak onderbouwd.`,
    );
  }
  if (monthsObserved < 120) {
    limitations.push(
      "Minder dan 10 jaar historie: resultaten hebben nog niet een volledige marktcyclus doorlopen.",
    );
  }
  if (benchmarkLabel === null) {
    limitations.push(
      "Geen benchmark beschikbaar — regret-score en underperformance-periodes kunnen niet berekend worden.",
    );
  }
  if (rolling12m.count === 0) {
    limitations.push(
      "Onvoldoende observaties voor rolling 12m-returns (minstens 12 maanden data vereist).",
    );
  }
  if (dca.months === 0) {
    limitations.push("DCA-simulatie kon niet worden uitgevoerd.");
  }

  const highlights: string[] = [];

  if (strategyCagr !== null && Number.isFinite(strategyCagr)) {
    highlights.push(
      `CAGR ${formatPct(strategyCagr)} over ${years.toFixed(1)} jaar (${monthsObserved} maanden).`,
    );
  }
  if (rolling12m.worst) {
    highlights.push(
      `Slechtste 12m-venster: ${formatPct(rolling12m.worst.strategyReturn)} (eindigend ${rolling12m.worst.endDate}).`,
    );
  }
  if (rolling12m.best) {
    highlights.push(
      `Beste 12m-venster: ${formatPct(rolling12m.best.strategyReturn)} (eindigend ${rolling12m.best.endDate}).`,
    );
  }
  if (rolling12m.count > 0) {
    highlights.push(
      `${rolling12m.negativeCount}/${rolling12m.count} 12m-vensters waren negatief (${formatPct(rolling12m.negativeShare)}).`,
    );
  }
  if (maxDrawdown !== null && maxDrawdown < 0) {
    const rec = drawdownRecovery.longestRecoveryMonths;
    const recText = rec === null ? "nog niet hersteld" : `hersteld in ${rec} maanden`;
    highlights.push(
      `Max drawdown ${formatPct(maxDrawdown)} — ${recText}.`,
    );
  }
  if (regret) {
    highlights.push(
      `Benchmark-regret ${regret.score}/100: ${regret.monthsUnderperforming}/${regret.monthsObserved} maanden achter (${formatPct(regret.underperformanceShare)}).`,
    );
  }
  if (dca.months > 0 && dca.monthlyContribution > 0) {
    highlights.push(
      `DCA (€${dca.monthlyContribution.toFixed(0)}/m over ${dca.months} maanden): money-weighted return ${formatPct(dca.moneyWeightedReturn)}.`,
    );
  }

  // Headline samenstelling.
  const headline = buildHeadline({
    strategyLabel,
    benchmarkLabel,
    strategyCagr,
    regret,
    rolling12m,
    underperformancePeriods,
  });

  // Confidence: lager bij kleine sample of missende benchmark.
  let confidence = 0.5;
  if (monthsObserved >= 60) confidence += 0.15;
  if (monthsObserved >= 120) confidence += 0.15;
  if (regret !== null) confidence += 0.1;
  if (rolling12m.count >= 24) confidence += 0.1;
  confidence = clamp(confidence, 0, 1);

  return {
    headline,
    limitations,
    highlights,
    confidence,
  };
}

function buildHeadline(params: {
  strategyLabel: string;
  benchmarkLabel: string | null;
  strategyCagr: number | null;
  regret: BenchmarkRegretScore | null;
  rolling12m: RollingWindowSummary;
  underperformancePeriods: UnderperformancePeriod[];
}): string {
  const {
    strategyLabel,
    benchmarkLabel,
    strategyCagr,
    regret,
    rolling12m,
    underperformancePeriods,
  } = params;

  if (strategyCagr === null || !Number.isFinite(strategyCagr)) {
    return `${strategyLabel}: onvoldoende data voor een kernconclusie.`;
  }

  const cagrText = formatPct(strategyCagr);
  const benchPart =
    benchmarkLabel !== null && regret !== null
      ? regret.score >= 60
        ? ` maar bleef ${regret.monthsUnderperforming} van de ${regret.monthsObserved} maanden achter op ${benchmarkLabel}`
        : regret.score >= 30
          ? ` met beperkte achterstand op ${benchmarkLabel} in ${regret.monthsUnderperforming} maanden`
          : ` en presteerde doorgaans in lijn met of beter dan ${benchmarkLabel}`
      : "";

  const downsidePart = rolling12m.worst
    ? rolling12m.worst.strategyReturn <= -0.15
      ? `, met een slechtste 12m-venster van ${formatPct(rolling12m.worst.strategyReturn)}`
      : ""
    : "";

  const underperfPart =
    underperformancePeriods.length > 0
      ? `. Langste achterstand duurde ${Math.max(
          ...underperformancePeriods.map((p) => p.months),
        )} maanden`
      : "";

  return `${strategyLabel} leverde ${cagrText} CAGR${benchPart}${downsidePart}${underperfPart}.`;
}

function formatPct(fraction: number): string {
  if (!Number.isFinite(fraction)) return "—";
  const sign = fraction >= 0 ? "+" : "";
  return `${sign}${(fraction * 100).toFixed(1)}%`;
}
