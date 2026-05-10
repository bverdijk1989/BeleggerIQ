import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

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
  ConfidenceTier,
  InvestmentConfidenceScore,
} from "@/lib/analytics/signal-fusion/types";
import { cn } from "@/lib/utils";

interface SummaryRow {
  ticker: string;
  name: string;
  score: InvestmentConfidenceScore;
}

interface Props {
  rows: SummaryRow[];
  detailHref?: Route;
  /** Hoeveel rijen tonen — default 3. */
  limit?: number;
}

const TIER_COLOR: Record<ConfidenceTier, string> = {
  STRONG: "text-emerald-300",
  POSITIVE: "text-emerald-300",
  NEUTRAL: "text-foreground",
  WEAK: "text-amber-300",
  AVOID: "text-destructive",
};

const TIER_TONE: Record<ConfidenceTier, CockpitTone> = {
  STRONG: "good",
  POSITIVE: "good",
  NEUTRAL: "neutral",
  WEAK: "warning",
  AVOID: "critical",
};

/**
 * ConfidenceSummaryCard — dashboard-widget die de top-3 posities (op
 * confidence-score) toont. Linkt naar `/score` voor de volledige lijst
 * en `/score/[ticker]` voor de breakdown.
 */
export function ConfidenceSummaryCard({
  rows,
  detailHref = "/score" as Route,
  limit = 3,
}: Props) {
  if (rows.length === 0) {
    const styles = TONE_STYLES.neutral;
    return (
      <Card className={cn("border", styles.container)}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className={cn("h-4 w-4", styles.iconFg)} aria-hidden />
            Investment Confidence
          </CardTitle>
          <CardDescription className="text-xs">
            Score per positie over 10 transparante signaalbronnen.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Voeg holdings toe om confidence-scores te zien.
        </CardContent>
      </Card>
    );
  }

  const sorted = [...rows].sort(
    (a, b) => b.score.totalScore - a.score.totalScore,
  );
  const top = sorted.slice(0, limit);
  const avgScore =
    Math.round(
      sorted.reduce((s, r) => s + r.score.totalScore, 0) / sorted.length,
    ) || 0;
  const dominantTier =
    avgScore >= 80
      ? "STRONG"
      : avgScore >= 65
        ? "POSITIVE"
        : avgScore >= 45
          ? "NEUTRAL"
          : avgScore >= 30
            ? "WEAK"
            : "AVOID";
  const tone = TIER_TONE[dominantTier];
  const styles = TONE_STYLES[tone];

  return (
    <Card className={cn("border", styles.container)}>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className={cn("h-4 w-4", styles.iconFg)} aria-hidden />
            Investment Confidence
          </CardTitle>
          <Badge variant="outline" className={cn("text-[10px]", styles.chip)}>
            Gemiddeld {avgScore}/100
          </Badge>
        </div>
        <CardDescription className="text-xs">
          Top {top.length} van {sorted.length} posities op signaal-fusion-score.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {top.map(({ ticker, name, score }) => {
            const detail: Route =
              `/score/${encodeURIComponent(ticker)}` as Route;
            return (
              <li
                key={ticker}
                className="rounded-md border border-border/40 bg-background/30 p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={detail}
                    className="min-w-0 hover:underline"
                  >
                    <p className="truncate text-xs font-medium text-foreground">
                      {ticker} · {name}
                    </p>
                  </Link>
                  <span
                    className={cn(
                      "font-mono text-sm font-bold tabular-nums",
                      TIER_COLOR[score.tier],
                    )}
                  >
                    {score.totalScore}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {score.headline}
                </p>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted/30">
                  <div
                    className={cn(
                      "h-full",
                      score.totalScore >= 65
                        ? "bg-emerald-400"
                        : score.totalScore <= 35
                          ? "bg-amber-400"
                          : "bg-blue-400",
                    )}
                    style={{
                      width: `${Math.max(2, Math.min(100, score.totalScore))}%`,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-end pt-1">
          <Link
            href={detailHref}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Alle posities scoren
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
