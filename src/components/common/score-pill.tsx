"use client";

import type { ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Visueel pillshape voor een 0..100 factorscore. Kleurt op basis van
 * score-bucket. Optionele tooltip-inhoud (rationales) verschijnt bij hover.
 * Gedeelde component tussen portfolio cockpit en screener.
 */

export type ScoreTone = "positive" | "info" | "muted" | "warning" | "critical";

export function toneForScore(score: number | null | undefined): ScoreTone {
  if (score === null || score === undefined || !Number.isFinite(score)) {
    return "muted";
  }
  if (score >= 75) return "positive";
  if (score >= 55) return "info";
  if (score >= 40) return "muted";
  if (score >= 25) return "warning";
  return "critical";
}

const TONE_CLASS: Record<ScoreTone, string> = {
  positive: "bg-success/15 text-success border-success/30",
  info: "bg-primary/15 text-primary border-primary/30",
  muted: "bg-surface-elevated text-muted-foreground border-border/60",
  warning: "bg-warning/15 text-warning border-warning/30",
  critical: "bg-destructive/15 text-destructive border-destructive/30",
};

interface ScorePillProps {
  score: number | null | undefined;
  label?: string;
  tooltip?: ReactNode;
  className?: string;
}

export function ScorePill({
  score,
  label,
  tooltip,
  className,
}: ScorePillProps) {
  const tone = toneForScore(score);
  const display =
    score === null || score === undefined || !Number.isFinite(score)
      ? "—"
      : Math.round(score).toString();

  const pill = (
    <span
      className={cn(
        "inline-flex min-w-[2.75rem] items-center justify-center rounded-md border px-2 py-1 text-xs font-medium tabular-nums",
        TONE_CLASS[tone],
        className,
      )}
      aria-label={label ? `${label} score ${display}/100` : undefined}
    >
      {display}
    </span>
  );

  if (!tooltip) return pill;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{pill}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
