import { ArrowDownRight, ArrowUpRight, ChartLine, Minus } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type {
  AttributionBucket,
  BenchmarkReport,
} from "@/lib/analytics/benchmark";
import { cn } from "@/lib/utils";

/**
 * BenchmarkCard — pure presentatie van een `BenchmarkReport`.
 *
 * Toont:
 *  - kernconclusie ("Presteer ik beter dan de markt?")
 *  - alpha-badge + numerieke metrics (portfolio / benchmark / TE / IR)
 *  - inline SVG-chart (portfolio vs benchmark, beide genormaliseerd op 100)
 *  - top-N sector + factor + stock attributie-buckets
 *
 * Geen rekenwerk — UI kiest alleen labels en kleurklassen.
 */

interface Props {
  report: BenchmarkReport;
}

export function BenchmarkCard({ report }: Props) {
  const { performance, attribution, verdict } = report;
  const tone =
    performance.alpha > 0.005
      ? "good"
      : performance.alpha < -0.005
        ? "bad"
        : "neutral";
  const headline =
    tone === "good"
      ? "Ja, je portefeuille presteert beter dan de markt."
      : tone === "bad"
        ? "Nee, je portefeuille blijft achter op de markt."
        : "Je portefeuille beweegt in lijn met de markt.";

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <Header tone={tone} headline={headline} />

        <KeyMetrics report={report} />

        {performance.portfolioSeries.length > 1 && (
          <Chart report={report} />
        )}

        <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
          {verdict}
        </p>

        {(attribution.sectors.length > 0 ||
          attribution.factors.length > 0 ||
          attribution.stocks.length > 0) && (
          <div className="space-y-3 border-t border-border/60 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Attribution
            </p>
            <BucketStrip title="Sectoren" buckets={attribution.sectors.slice(0, 4)} />
            <BucketStrip title="Factoren" buckets={attribution.factors.slice(0, 4)} />
            <BucketStrip title="Top-stocks" buckets={attribution.stocks.slice(0, 4)} />
            {Math.abs(attribution.residualAlpha) > 0.001 && (
              <p className="text-[10px] text-muted-foreground">
                Niet-toegewezen residual: {fmtPct(attribution.residualAlpha)}.
              </p>
            )}
          </div>
        )}

        {performance.warnings.length > 0 && (
          <ul className="space-y-1 border-t border-border/60 pt-3">
            {performance.warnings.map((w, i) => (
              <li key={i} className="text-[11px] text-amber-200">
                · {w}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Header
// ============================================================

function Header({
  tone,
  headline,
}: {
  tone: "good" | "bad" | "neutral";
  headline: string;
}) {
  const Icon = tone === "good" ? ArrowUpRight : tone === "bad" ? ArrowDownRight : Minus;
  const toneClass =
    tone === "good"
      ? "bg-success/15 text-success"
      : tone === "bad"
        ? "bg-destructive/15 text-destructive"
        : "bg-surface-elevated text-muted-foreground";
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md",
          toneClass,
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Presteer ik beter dan de markt?
        </p>
        <p className="text-sm text-foreground">{headline}</p>
      </div>
      <ChartLine className="h-4 w-4 self-start text-muted-foreground" />
    </div>
  );
}

// ============================================================
//  Key metrics
// ============================================================

function KeyMetrics({ report }: { report: BenchmarkReport }) {
  const p = report.performance;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Metric label="Portfolio" value={fmtPct(p.portfolioReturn)} tone={p.portfolioReturn >= 0 ? "good" : "bad"} />
      <Metric label={p.benchmark.label} value={fmtPct(p.benchmarkReturn)} />
      <Metric
        label="Alpha"
        value={fmtPct(p.alpha)}
        tone={p.alpha > 0 ? "good" : p.alpha < 0 ? "bad" : "neutral"}
      />
      <Metric
        label="Tracking error"
        value={fmtPct(p.trackingError)}
        helper={p.informationRatio !== null ? `IR ${p.informationRatio.toFixed(2)}` : undefined}
      />
    </dl>
  );
}

function Metric({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: "good" | "bad" | "neutral";
}) {
  return (
    <div className="rounded-md border border-border/60 bg-surface/40 p-2">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 font-mono text-sm tabular-nums",
          tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </dd>
      {helper && <p className="mt-0.5 text-[10px] text-muted-foreground">{helper}</p>}
    </div>
  );
}

// ============================================================
//  Inline chart (no client deps — pure SVG)
// ============================================================

function Chart({ report }: { report: BenchmarkReport }) {
  const portfolio = report.performance.portfolioSeries;
  const benchmark = report.performance.benchmarkSeries;
  if (portfolio.length < 2 || benchmark.length < 2) return null;

  const allValues = [
    ...portfolio.map((p) => p.index),
    ...benchmark.map((p) => p.index),
  ];
  const minY = Math.min(...allValues);
  const maxY = Math.max(...allValues);
  const range = Math.max(1e-6, maxY - minY);
  const W = 600;
  const H = 140;
  const padX = 4;
  const padY = 6;

  const x = (i: number, n: number) =>
    padX + (i / Math.max(1, n - 1)) * (W - padX * 2);
  const y = (v: number) =>
    padY + (1 - (v - minY) / range) * (H - padY * 2);

  const portfolioPath = portfolio
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i, portfolio.length).toFixed(1)} ${y(p.index).toFixed(1)}`)
    .join(" ");
  const benchmarkPath = benchmark
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i, benchmark.length).toFixed(1)} ${y(p.index).toFixed(1)}`)
    .join(" ");

  return (
    <div className="rounded-md border border-border/60 bg-surface/40 p-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-32 w-full"
        role="img"
        aria-label="Portfolio vs benchmark performance"
      >
        {/* Baseline op 100 */}
        <line
          x1={padX}
          x2={W - padX}
          y1={y(100)}
          y2={y(100)}
          className="stroke-border/60"
          strokeDasharray="2 3"
          strokeWidth="1"
        />
        <path d={benchmarkPath} className="stroke-muted-foreground/70" fill="none" strokeWidth="1.5" />
        <path d={portfolioPath} className="stroke-primary" fill="none" strokeWidth="2" />
      </svg>
      <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 bg-primary" /> Portfolio
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 bg-muted-foreground/60" />
          {report.performance.benchmark.label}
        </span>
        <span className="ml-auto font-mono">
          {report.performance.periodStart} → {report.performance.periodEnd}
        </span>
      </div>
    </div>
  );
}

// ============================================================
//  Attribution buckets
// ============================================================

function BucketStrip({
  title,
  buckets,
}: {
  title: string;
  buckets: AttributionBucket[];
}) {
  if (buckets.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </p>
      <ul className="mt-1 space-y-1">
        {buckets.map((b) => (
          <li
            key={b.key}
            className="flex items-center justify-between gap-2 rounded-sm bg-surface-elevated/40 px-2 py-1 text-xs"
          >
            <span className="truncate text-foreground">{b.label}</span>
            <span
              className={cn(
                "shrink-0 font-mono tabular-nums",
                b.contribution > 0
                  ? "text-success"
                  : b.contribution < 0
                    ? "text-destructive"
                    : "text-muted-foreground",
              )}
            >
              {fmtPct(b.contribution)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================
//  Helpers
// ============================================================

function fmtPct(fraction: number): string {
  if (!Number.isFinite(fraction)) return "—";
  const sign = fraction > 0 ? "+" : "";
  return `${sign}${(fraction * 100).toFixed(2)}%`;
}
