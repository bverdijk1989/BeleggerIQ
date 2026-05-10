import { AlertTriangle, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";

import {
  TONE_STYLES,
  type CockpitTone,
} from "@/components/dashboard/decision-cockpit/tone";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  StressPositionImpact,
  StressTestResult,
} from "@/lib/analytics/stress-tests";
import { cn } from "@/lib/utils";

/**
 * ScenarioCard — toont één stress-test-resultaat met:
 *  - portfolio-impact-cijfer + verdict
 *  - top-3 losers + top-3 winners
 *  - assumptions (Simons-laag — expliciet)
 *  - data-quality warnings
 */

interface Props {
  result: StressTestResult;
  baseCurrency: string;
}

function severityTone(impactPct: number): CockpitTone {
  if (impactPct >= 0) return "good";
  if (impactPct >= -0.05) return "neutral";
  if (impactPct >= -0.15) return "warning";
  return "critical";
}

function fmtPct(fraction: number): string {
  if (!Number.isFinite(fraction)) return "—";
  const sign = fraction >= 0 ? "+" : "";
  return `${sign}${(fraction * 100).toFixed(1)}%`;
}

function fmtCurrency(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

export function ScenarioCard({ result, baseCurrency }: Props) {
  const tone = severityTone(result.portfolioImpactPct);
  const styles = TONE_STYLES[tone];

  return (
    <Card className={cn("border", styles.container)}>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm">{result.label}</CardTitle>
            <CardDescription className="text-xs">
              {result.description}
            </CardDescription>
          </div>
          <Badge variant="outline" className={cn("text-[10px]", styles.chip)}>
            {result.severity}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Headline impact */}
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <p className={cn("font-mono text-2xl font-bold", styles.value)}>
              {fmtPct(result.portfolioImpactPct)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {fmtCurrency(result.portfolioImpactAmount, baseCurrency)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Defensieve sterkte
            </p>
            <div className="mt-1 flex items-center gap-1 justify-end">
              <ShieldCheck className="h-3 w-3 text-muted-foreground" aria-hidden />
              <span className="font-mono text-sm font-semibold text-foreground">
                {result.defensiveStrength}/100
              </span>
            </div>
          </div>
        </div>

        {/* Verdict */}
        <p className="rounded-md border border-border/40 bg-muted/10 p-2 text-xs text-foreground">
          {result.verdict}
        </p>

        {/* Top losers + winners */}
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <ImpactList
            title="Grootste verliezers"
            icon={TrendingDown}
            tone="warning"
            items={result.biggestLosers.filter((i) => i.contribution < 0)}
            baseCurrency={baseCurrency}
          />
          <ImpactList
            title="Beste posities"
            icon={TrendingUp}
            tone="good"
            items={result.biggestWinners.filter((i) => i.contribution >= 0)}
            baseCurrency={baseCurrency}
          />
        </div>

        {/* Assumptions */}
        <details className="rounded-md border border-border/40 bg-muted/5 p-2 text-xs">
          <summary className="cursor-pointer font-semibold text-foreground">
            Aannames van dit scenario
          </summary>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
            {result.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </details>

        {/* Warnings */}
        {result.warnings.length > 0 && (
          <div className="flex items-start gap-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[10px] text-amber-200">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <ul className="space-y-0.5">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ImpactList({
  title,
  icon: Icon,
  tone,
  items,
  baseCurrency,
}: {
  title: string;
  icon: typeof TrendingDown;
  tone: CockpitTone;
  items: StressPositionImpact[];
  baseCurrency: string;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className={cn("h-3 w-3", styles.iconFg)} aria-hidden />
        {title}
      </p>
      {items.length === 0 ? (
        <p className="mt-1 text-[10px] text-muted-foreground">Geen.</p>
      ) : (
        <ul className="mt-1 space-y-1 text-[11px]">
          {items.map((item) => (
            <li
              key={item.ticker}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate text-foreground">{item.ticker}</span>
              <span
                className={cn(
                  "font-mono",
                  tone === "good" ? "text-emerald-300" : "text-amber-300",
                )}
              >
                {fmtPct(item.contribution)}
                <span className="ml-1 text-[9px] text-muted-foreground">
                  ({fmtCurrency(item.marketValueBase * item.shock, baseCurrency)})
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
