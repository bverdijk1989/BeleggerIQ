"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ACTION_DESCRIPTIONS,
  ACTION_LABELS,
  type HoldingAction,
} from "@/lib/analytics/holding-action";
import { cn } from "@/lib/utils";

/**
 * Gekleurde badge voor de aanbevolen actie op een positie. De
 * rationale-prop overruled de default-beschrijving zodat per-holding
 * reden getoond kan worden.
 */

const ACTION_TONE: Record<HoldingAction, string> = {
  BUY_CANDIDATE:
    "bg-success/15 text-success border-success/30",
  HOLD: "bg-surface-elevated text-muted-foreground border-border/60",
  WATCH: "bg-primary/15 text-primary border-primary/30",
  TRIM: "bg-warning/15 text-warning border-warning/30",
  AVOID: "bg-destructive/15 text-destructive border-destructive/30",
};

interface ActionBadgeProps {
  action: HoldingAction;
  rationale?: string;
  className?: string;
}

export function ActionBadge({
  action,
  rationale,
  className,
}: ActionBadgeProps) {
  const badge = (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        ACTION_TONE[action],
        className,
      )}
    >
      {ACTION_LABELS[action]}
    </span>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="font-medium text-foreground">{ACTION_LABELS[action]}</p>
        <p className="mt-1 text-muted-foreground">{ACTION_DESCRIPTIONS[action]}</p>
        {rationale && (
          <p className="mt-2 border-t border-border/40 pt-2 text-foreground">
            {rationale}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
