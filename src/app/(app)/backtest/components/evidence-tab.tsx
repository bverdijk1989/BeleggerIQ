import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  ChartLine,
  Info,
  PiggyBank,
  Scale,
  TrendingDown,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Section } from "@/components/common/section";
import type {
  DcaContributionSimulation,
  DrawdownRecoveryEntry,
  DrawdownRecoverySummary,
  EvidenceVerdict,
  RegimeBreakdownRow,
  RollingWindowEntry,
  RollingWindowSummary,
  StrategyEvidenceReport,
  UnderperformancePeriod,
} from "@/lib/analytics/backtest/evidence";
import type { BenchmarkRegretScore } from "@/lib/analytics/backtest/evidence";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type { Currency } from "@/types/common";
import type { MarketRegimeState } from "@/types/regime";

/**
 * EvidenceTab — pure presentatie van `StrategyEvidenceReport`.
 *
 * Geen rekenwerk. Alle cijfers, percentages en datums komen rechtstreeks
 * uit de evidence-engine. Sectie-volgorde:
 *   1. Verdict (kernconclusie + beperkingen)
 *   2. Worst/best 12m + rolling returns
 *   3. Regime-breakdown
 *   4. Underperformance-periodes
 *   5. Drawdown recovery
 *   6. Benchmark regret-score
 *   7. DCA contribution simulation
 */

interface Props {
  report: StrategyEvidenceReport;
  baseCurrency: Currency;
}

const REGIME_LABEL: Record<MarketRegimeState, string> = {
  expansion: "Expansie",
  recovery: "Herstel",
  slowdown: "Vertraging",
  recession: "Recessie",
  unknown: "Onbekend",
};

const REGIME_TONE: Record<MarketRegimeState, string> = {
  expansion: "bg-emerald-500/10 text-emerald-200 border-emerald-500/30",
  recovery: "bg-sky-500/10 text-sky-200 border-sky-500/30",
  slowdown: "bg-amber-500/10 text-amber-200 border-amber-500/30",
  recession: "bg-red-500/10 text-red-200 border-red-500/30",
  unknown: "bg-surface-elevated text-muted-foreground border-border/60",
};

export function EvidenceTab({ report, baseCurrency }: Props) {
  return (
    <div className="space-y-6">
      <VerdictCard verdict={report.verdict} period={periodLabel(report)} />

      <Section
        title="Worst & best 12 maanden"
        description="Rolling 12m-vensters tonen waar een strategie kwetsbaar is voor instap-timing."
      >
        <WorstBestRow
          worst={report.worstTwelveMonth}
          best={report.bestTwelveMonth}
        />
      </Section>

      <Section
        title="Rolling 12m returns"
        description="Verdeling van alle 12m-vensters in het sample."
      >
        <RollingDistribution summary={report.rollingTwelveMonth} />
      </Section>

      {report.regimeBreakdown.length > 0 && (
        <Section
          title="Regime breakdown"
          description="Annualised return per marktregime — toont waar de strategie gedijt of kraakt."
        >
          <RegimeBreakdownTable rows={report.regimeBreakdown} />
        </Section>
      )}

      {report.underperformancePeriods.length > 0 && (
        <Section
          title="Underperformance-periodes"
          description="Aaneengesloten periodes waarin de strategie achterliep op de benchmark."
        >
          <UnderperformanceList
            periods={report.underperformancePeriods}
            benchmarkLabel={report.benchmarkLabel}
          />
        </Section>
      )}

      <Section
        title="Drawdown recovery"
        description="Hoe diep zakte de strategie en hoe lang duurde herstel?"
      >
        <DrawdownRecoveryCard summary={report.drawdownRecovery} />
      </Section>

      {report.benchmarkRegret && (
        <Section
          title="Benchmark regret-score"
          description="Hoe vaak en hoeveel deed de strategie het slechter dan de benchmark?"
        >
          <BenchmarkRegretCard
            regret={report.benchmarkRegret}
            benchmarkLabel={report.benchmarkLabel}
          />
        </Section>
      )}

      <Section
        title="Maandelijkse inleg-simulatie"
        description="DCA-pad met maandelijkse contributie — wat houd je over t.o.v. wat je inlegde."
      >
        <DcaCard
          dca={report.dcaSimulation}
          baseCurrency={baseCurrency}
          benchmarkLabel={report.benchmarkLabel}
        />
      </Section>
    </div>
  );
}

// ============================================================
//  Verdict
// ============================================================

function VerdictCard({
  verdict,
  period,
}: {
  verdict: EvidenceVerdict;
  period: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-primary">
            <ChartLine className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Kernconclusie
            </p>
            <p className="text-sm text-foreground">{verdict.headline}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Periode {period} · vertrouwen{" "}
              {(verdict.confidence * 100).toFixed(0)}%
            </p>
          </div>
        </div>

        {verdict.highlights.length > 0 && (
          <ul className="space-y-1 border-t border-border/60 pt-3">
            {verdict.highlights.map((h, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-foreground"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        )}

        {verdict.limitations.length > 0 && (
          <div className="border-t border-border/60 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Beperkingen
            </p>
            <ul className="mt-2 space-y-1">
              {verdict.limitations.map((l, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs text-amber-200"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Worst & best 12 maanden
// ============================================================

function WorstBestRow({
  worst,
  best,
}: {
  worst: RollingWindowEntry | null;
  best: RollingWindowEntry | null;
}) {
  if (!worst || !best) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Onvoldoende observaties voor 12m-vensters (minstens 12 maanden vereist).
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ExtremeWindowCard
        title="Slechtste 12m-venster"
        icon={<ArrowDownRight className="h-4 w-4" />}
        entry={worst}
        tone="bad"
      />
      <ExtremeWindowCard
        title="Beste 12m-venster"
        icon={<ArrowUpRight className="h-4 w-4" />}
        entry={best}
        tone="good"
      />
    </div>
  );
}

function ExtremeWindowCard({
  title,
  icon,
  entry,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  entry: RollingWindowEntry;
  tone: "good" | "bad";
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md",
              tone === "good"
                ? "bg-success/15 text-success"
                : "bg-destructive/15 text-destructive",
            )}
          >
            {icon}
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {title}
            </p>
            <p className="text-sm text-foreground">
              {entry.startDate} → {entry.endDate}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-3 border-t border-border/60 pt-3">
          <Metric
            label="Strategie"
            value={formatPct(entry.strategyReturn)}
            tone={tone}
          />
          <Metric
            label="Benchmark"
            value={
              entry.benchmarkReturn !== null
                ? formatPct(entry.benchmarkReturn)
                : "—"
            }
          />
          <Metric
            label="Excess"
            value={
              entry.excessReturn !== null
                ? formatPct(entry.excessReturn)
                : "—"
            }
          />
        </dl>
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Rolling distribution
// ============================================================

function RollingDistribution({ summary }: { summary: RollingWindowSummary }) {
  if (summary.count === 0) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Geen rolling-vensters beschikbaar.
        </CardContent>
      </Card>
    );
  }

  const sorted = [...summary.entries].sort(
    (a, b) => a.strategyReturn - b.strategyReturn,
  );
  const median = sorted[Math.floor(sorted.length / 2)]?.strategyReturn ?? 0;
  const positive = summary.count - summary.negativeCount;

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Vensters" value={summary.count.toString()} />
          <Metric label="Mediaan" value={formatPct(median)} />
          <Metric
            label="Negatieve vensters"
            value={`${summary.negativeCount} / ${summary.count}`}
            helper={formatPct(summary.negativeShare)}
          />
          <Metric label="Positieve vensters" value={positive.toString()} />
        </dl>
        <p className="text-xs text-muted-foreground">
          Het sample telt {summary.count} overlappende {summary.windowMonths}-
          maands vensters. Negatieve mediaan = strategie heeft moeite met
          12m-windows; positieve mediaan = consistente winstgevendheid.
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Regime-breakdown
// ============================================================

function RegimeBreakdownTable({ rows }: { rows: RegimeBreakdownRow[] }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.regime}
              className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border/60 bg-surface/60 p-3"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
                    REGIME_TONE[r.regime],
                  )}
                >
                  {REGIME_LABEL[r.regime]}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {r.monthsObserved}m
                </span>
              </div>
              <dl className="grid grid-cols-3 gap-3 text-right">
                <Metric label="Strategie" value={formatPct(r.strategyAnnualised)} />
                <Metric
                  label="Benchmark"
                  value={
                    r.benchmarkAnnualised !== null
                      ? formatPct(r.benchmarkAnnualised)
                      : "—"
                  }
                />
                <Metric
                  label="Excess"
                  value={
                    r.excessReturn !== null ? formatPct(r.excessReturn) : "—"
                  }
                  tone={r.excessReturn !== null && r.excessReturn < 0 ? "bad" : undefined}
                />
              </dl>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Underperformance lijst
// ============================================================

function UnderperformanceList({
  periods,
  benchmarkLabel,
}: {
  periods: UnderperformancePeriod[];
  benchmarkLabel: string | null;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Top {periods.length} periodes waarin de strategie achterliep op{" "}
          {benchmarkLabel ?? "de benchmark"}, gesorteerd op grootte van de
          achterstand.
        </p>
        <ul className="space-y-2">
          {periods.map((p, i) => (
            <li
              key={`${p.startDate}-${i}`}
              className="rounded-md border border-border/60 bg-surface/60 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  {p.startDate} → {p.endDate}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {p.months} maanden
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-3">
                <Metric label="Strategie" value={formatPct(p.strategyReturn)} />
                <Metric label="Benchmark" value={formatPct(p.benchmarkReturn)} />
                <Metric
                  label="Excess"
                  value={formatPct(p.excessReturn)}
                  tone="bad"
                />
              </dl>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Drawdown recovery
// ============================================================

function DrawdownRecoveryCard({ summary }: { summary: DrawdownRecoverySummary }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric
            label="Aantal drawdowns"
            value={summary.entries.length.toString()}
          />
          <Metric
            label="Langste recovery"
            value={
              summary.longestRecoveryMonths !== null
                ? `${summary.longestRecoveryMonths}m`
                : "—"
            }
          />
          <Metric
            label="Gemiddelde recovery"
            value={
              summary.averageRecoveryMonths !== null
                ? `${summary.averageRecoveryMonths}m`
                : "—"
            }
          />
        </dl>
        {summary.inProgress && (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
            <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Er staat momenteel een drawdown open die nog niet hersteld is.
          </p>
        )}
        {summary.entries.length > 0 ? (
          <ul className="space-y-2">
            {summary.entries.slice(0, 6).map((e, i) => (
              <DrawdownEntry key={i} entry={e} />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            Geen drawdowns gedetecteerd boven de 5%-drempel.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function DrawdownEntry({ entry }: { entry: DrawdownRecoveryEntry }) {
  return (
    <li className="rounded-md border border-border/60 bg-surface/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          {entry.peakDate} → {entry.troughDate}
          {entry.recoveryDate ? ` → ${entry.recoveryDate}` : ""}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-destructive">
          {formatPct(entry.depth)}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {entry.monthsToTrough}m tot bodem ·{" "}
        {entry.monthsToRecovery !== null
          ? `${entry.monthsToRecovery}m tot herstel`
          : "nog niet hersteld"}
      </p>
    </li>
  );
}

// ============================================================
//  Benchmark regret
// ============================================================

function BenchmarkRegretCard({
  regret,
  benchmarkLabel,
}: {
  regret: BenchmarkRegretScore;
  benchmarkLabel: string | null;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-12 w-14 items-center justify-center rounded-md border font-mono text-lg font-semibold tabular-nums",
              regret.score >= 60
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : regret.score >= 30
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : "border-success/40 bg-success/10 text-success",
            )}
          >
            {regret.score}
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              Regret-score t.o.v. {benchmarkLabel ?? "benchmark"}
            </p>
            <p className="text-xs text-muted-foreground">
              0 = altijd in lijn / beter; 100 = grote, frequente achterstanden.
            </p>
          </div>
          <Scale className="h-5 w-5 text-muted-foreground" />
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            label="Maanden achter"
            value={`${regret.monthsUnderperforming} / ${regret.monthsObserved}`}
            helper={formatPct(regret.underperformanceShare)}
          />
          <Metric
            label="Gem. shortfall/m"
            value={formatPct(regret.averageMonthlyShortfall)}
          />
          <Metric
            label="Diepste achterstand"
            value={formatPct(regret.maxCumulativeShortfall)}
            tone="bad"
          />
        </dl>
      </CardContent>
    </Card>
  );
}

// ============================================================
//  DCA simulation
// ============================================================

function DcaCard({
  dca,
  baseCurrency,
  benchmarkLabel,
}: {
  dca: DcaContributionSimulation;
  baseCurrency: Currency;
  benchmarkLabel: string | null;
}) {
  if (dca.months === 0) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Onvoldoende data voor DCA-simulatie.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-primary">
            <PiggyBank className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm text-foreground">
              {formatCurrency(dca.initialCapital, baseCurrency, {
                maximumFractionDigits: 0,
              })}{" "}
              initieel +{" "}
              {formatCurrency(dca.monthlyContribution, baseCurrency, {
                maximumFractionDigits: 0,
              })}{" "}
              per maand over {dca.months} maanden
            </p>
            <p className="text-[11px] text-muted-foreground">
              Maandelijkse inleg krijgt dezelfde returns als de strategie. Money-
              weighted return = IRR die over alle cashflows uitkomt.
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            label="Totaal ingelegd"
            value={formatCurrency(dca.totalContributed, baseCurrency, {
              maximumFractionDigits: 0,
            })}
          />
          <Metric
            label="Eindwaarde strategie"
            value={formatCurrency(dca.finalValue, baseCurrency, {
              maximumFractionDigits: 0,
            })}
            helper={`+${formatNumber(dca.profit, 0)} winst`}
            tone={dca.profit >= 0 ? "good" : "bad"}
          />
          <Metric
            label="Money-weighted return"
            value={formatPct(dca.moneyWeightedReturn)}
            tone={dca.moneyWeightedReturn >= 0 ? "good" : "bad"}
          />
          <Metric
            label={`MWR ${benchmarkLabel ?? "benchmark"}`}
            value={
              dca.benchmarkMoneyWeightedReturn !== null
                ? formatPct(dca.benchmarkMoneyWeightedReturn)
                : "—"
            }
          />
        </dl>
        {dca.benchmarkFinalValue !== null && (
          <p className="border-t border-border/60 pt-2 text-xs text-muted-foreground">
            <CalendarClock className="mr-1 inline h-3 w-3" />
            Hetzelfde DCA-pad op {benchmarkLabel ?? "de benchmark"} eindigde op{" "}
            {formatCurrency(dca.benchmarkFinalValue, baseCurrency, {
              maximumFractionDigits: 0,
            })}{" "}
            (winst{" "}
            {formatCurrency(dca.benchmarkProfit ?? 0, baseCurrency, {
              maximumFractionDigits: 0,
            })}
            ).
          </p>
        )}
        <p className="flex items-start gap-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          DCA-simulatie laat de impact van *blijven inleggen* zien — niet
          rendement op een eenmalig kapitaal. Verschilt van CAGR.
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Helpers
// ============================================================

function Metric({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-md border border-border/60 bg-surface/40 p-2">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 font-mono text-sm tabular-nums",
          tone === "good"
            ? "text-success"
            : tone === "bad"
              ? "text-destructive"
              : "text-foreground",
        )}
      >
        {value}
      </dd>
      {helper && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{helper}</p>
      )}
    </div>
  );
}

function formatPct(fraction: number): string {
  if (!Number.isFinite(fraction)) return "—";
  const sign = fraction > 0 ? "+" : "";
  return `${sign}${(fraction * 100).toFixed(2)}%`;
}

function periodLabel(report: StrategyEvidenceReport): string {
  return `${report.periodStart} → ${report.periodEnd}`;
}
