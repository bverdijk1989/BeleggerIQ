import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, Compass, TrendingDown, TrendingUp } from "lucide-react";

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
import {
  MACRO_REGIME_LABELS,
  type MacroRegime,
  type MacroRegimeReport,
} from "@/lib/analytics/macro-regime/types";
import { cn } from "@/lib/utils";

/**
 * MacroRegimeCard — dashboard-widget.
 *
 * Toont:
 *  - Huidig regime + confidence-pill
 *  - Eén-zin narrative
 *  - Portfolio-alignment-score (als view aanwezig is)
 *  - Top-impact-bucket
 *  - Link naar /macro voor volledige breakdown
 */

interface Props {
  report: MacroRegimeReport;
  detailHref?: Route;
}

const REGIME_TONE: Record<MacroRegime, CockpitTone> = {
  GOLDILOCKS: "good",
  REFLATION: "neutral",
  STAGFLATION: "warning",
  DEFLATION: "warning",
  TRANSITIONAL: "neutral",
};

export function MacroRegimeCard({
  report,
  detailHref = "/macro" as Route,
}: Props) {
  const { classification, portfolioImpact } = report;
  const tone = REGIME_TONE[classification.regime];
  const styles = TONE_STYLES[tone];

  return (
    <Card className={cn("border", styles.container)}>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Compass className={cn("h-4 w-4", styles.iconFg)} aria-hidden />
            Marktregime
          </CardTitle>
          <Badge variant="outline" className={cn("text-[10px]", styles.chip)}>
            {MACRO_REGIME_LABELS[classification.regime]} ·{" "}
            {Math.round(classification.confidence * 100)}%
          </Badge>
        </div>
        <CardDescription className="text-xs">
          {classification.narrative}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {portfolioImpact && (
          <div className="rounded-md border border-border/40 bg-muted/20 p-3 text-xs">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Impact op je portefeuille
            </p>
            <p className="mt-1 text-foreground">{portfolioImpact.summary}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Alignment-score: {portfolioImpact.alignmentScore}/100
            </p>
          </div>
        )}

        {portfolioImpact && portfolioImpact.topGaps.length > 0 && (
          <ul className="space-y-1">
            {portfolioImpact.topGaps.slice(0, 3).map((bucket) => {
              const Icon = bucket.gap > 0 ? TrendingUp : TrendingDown;
              return (
                <li
                  key={bucket.assetClass}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Icon className="h-3 w-3" aria-hidden /> {bucket.label}
                  </span>
                  <span
                    className={cn(
                      "font-mono tabular-nums",
                      bucket.direction === "tailwind"
                        ? "text-emerald-300"
                        : bucket.direction === "headwind"
                          ? "text-amber-300"
                          : "text-muted-foreground",
                    )}
                  >
                    {bucket.gap > 0 ? "+" : ""}
                    {(bucket.gap * 100).toFixed(1)}%
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[10px] text-muted-foreground">
            {classification.supportingIndicators.length} bevestigend ·{" "}
            {classification.conflictingIndicators.length} tegenstrijdig
          </p>
          <Link
            href={detailHref}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Indicators + assets
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
