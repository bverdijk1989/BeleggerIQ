import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, Sparkles, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  DataQualityTier,
  HealthGrade,
  PortfolioHealthScore,
} from "@/lib/analytics/health-score";
import { cn } from "@/lib/utils";

import { TONE_STYLES, type CockpitTone } from "./tone";

const DATA_QUALITY_LABEL: Record<DataQualityTier, string> = {
  high: "Data hoog",
  medium: "Data middel",
  low: "Data laag",
  insufficient: "Data onvoldoende",
};

const DATA_QUALITY_TONE: Record<DataQualityTier, CockpitTone> = {
  high: "good",
  medium: "neutral",
  low: "warning",
  insufficient: "critical",
};

/**
 * HealthScoreCard — compacte 10-component portfolio health score op het
 * dashboard. Doel: gebruiker ziet **binnen 5 seconden**:
 *   1. de score + grade (groot, kleurgecodeerd)
 *   2. een 1-zin headline (waarom)
 *   3. de top-1 verbetering (wat te doen)
 *
 * Voor diepere uitleg → klik door naar /portfolio-health (detail-pagina).
 */

interface Props {
  score: PortfolioHealthScore;
  /** Padpath naar de detail-pagina; default `/portfolio-health`. */
  detailHref?: Route;
}

const GRADE_TONE: Record<HealthGrade, CockpitTone> = {
  A: "good",
  B: "good",
  C: "neutral",
  D: "warning",
  F: "critical",
};

export function HealthScoreCard({
  score,
  detailHref = "/portfolio-health" as Route,
}: Props) {
  const tone = GRADE_TONE[score.grade];
  const styles = TONE_STYLES[tone];
  const topRec = score.topRecommendations[0] ?? null;

  // Module 1: data-zekerheid prominent als badge naast de score.
  const dq = score.dataQuality;
  const dqTone = TONE_STYLES[DATA_QUALITY_TONE[dq.tier]];

  return (
    <Card className={cn("border", styles.container)}>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className={cn("h-4 w-4", styles.iconFg)} aria-hidden />
            Portfolio Health
          </CardTitle>
          <Badge variant="outline" className={cn("font-mono", styles.chip)}>
            Grade {score.grade}
          </Badge>
        </div>
        <CardDescription className="text-xs">{score.headline}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span
              className={cn("font-mono text-3xl font-bold tabular-nums", styles.value)}
            >
              {Math.round(score.totalScore)}
            </span>
            <span className="text-xs text-muted-foreground">/ 100</span>
          </div>
          <Badge
            variant="outline"
            className={cn("text-[10px]", dqTone.chip)}
            title={dq.warning ?? "Datakwaliteit is goed"}
          >
            {DATA_QUALITY_LABEL[dq.tier]} · {dq.score}
          </Badge>
        </div>

        {topRec && (
          <div className="rounded-md border border-border/40 bg-muted/20 p-3 text-xs">
            <p className="flex items-center gap-1 font-medium text-foreground">
              <TrendingUp className="h-3 w-3 text-primary" aria-hidden />
              Volgende stap
            </p>
            <p className="mt-1 text-foreground">{topRec.title}</p>
            <p className="mt-0.5 text-muted-foreground">{topRec.detail}</p>
            {typeof topRec.expectedImpact === "number" && topRec.expectedImpact > 0 && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                Verwachte score-impact: +{topRec.expectedImpact} punten
              </p>
            )}
          </div>
        )}

        {dq.warning && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[10px] text-amber-200">
            {dq.warning}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[10px] text-muted-foreground">
            {dq.activeComponents}/{dq.totalComponents} components met data ·
            conf {Math.round(dq.meanConfidence * 100)}%
          </p>
          <Link
            href={detailHref}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Volledige breakdown
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
