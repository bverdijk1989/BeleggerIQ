import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Info,
  ShieldAlert,
} from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { StatusMetric, StatusTier } from "@/lib/analytics";
import { cn } from "@/lib/utils";

import { TONE_STYLES, type CockpitTone } from "./tone";

/**
 * StatusMetricCard — pure presentatie van één `StatusMetric`.
 *
 * Geen rekenwerk. Compact, scanbaar, kleurgecodeerd op `status`-tier.
 * Confidence < 60% → subtiele indicator. Missing-data → grijze pill
 * met "nog niet beschikbaar" + reason in tooltip.
 */

interface Props {
  metric: StatusMetric;
}

const TIER_TO_TONE: Record<StatusTier, CockpitTone> = {
  GOOD: "good",
  NEUTRAL: "neutral",
  WARNING: "warning",
  CRITICAL: "critical",
};

const TIER_ICON: Record<StatusTier, typeof CheckCircle2> = {
  GOOD: CheckCircle2,
  NEUTRAL: CircleDot,
  WARNING: AlertTriangle,
  CRITICAL: ShieldAlert,
};

export function StatusMetricCard({ metric }: Props) {
  const tone = TIER_TO_TONE[metric.status];
  const styles = TONE_STYLES[tone];
  const Icon = TIER_ICON[metric.status];
  const lowConfidence = metric.confidence < 0.6;
  const isMissing = metric.missingDataReason !== undefined;

  return (
    <TooltipProvider delayDuration={120} skipDelayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex flex-col gap-1 rounded-md border p-3 transition-colors",
              styles.container,
            )}
            role="group"
            aria-label={`${metric.label}: ${metric.value}`}
          >
            <div className="flex items-center justify-between gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {metric.label}
              </p>
              <Icon
                className={cn("h-3.5 w-3.5", styles.iconFg)}
                aria-hidden
              />
            </div>

            <p
              className={cn(
                "font-mono text-base font-semibold tabular-nums",
                isMissing ? "text-muted-foreground" : styles.value,
              )}
            >
              {metric.value}
            </p>

            {metric.subValue && (
              <p className="text-[10px] text-muted-foreground">
                {metric.subValue}
              </p>
            )}

            {(lowConfidence || isMissing) && (
              <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Info className="h-2.5 w-2.5" />
                {isMissing
                  ? "nog niet beschikbaar"
                  : `confidence ${(metric.confidence * 100).toFixed(0)}%`}
              </p>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          <p className="font-medium">{metric.explanation}</p>
          {metric.missingDataReason && (
            <p className="mt-1 text-muted-foreground">
              Reden: {metric.missingDataReason}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
