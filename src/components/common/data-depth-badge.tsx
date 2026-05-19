import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CircleMinus,
} from "lucide-react";

import {
  TIER_LABELS,
  type AssetDataDepth,
  type DataDepthTier,
} from "@/lib/analytics/data-depth";
import { cn } from "@/lib/utils";

/**
 * Module 26 — per-asset DataDepthBadge.
 *
 * Compact inline-badge — toont tier-label + score. Tooltip-ready via
 * `title`-attribute (plain-language uitleg).
 *
 * Gebruikt op portfolio-tabel naast ticker, of in dossier-headers.
 */

interface DataDepthBadgeProps {
  depth: AssetDataDepth;
  /** Compacte modus (alleen icoon + tier). Default toont ook score. */
  compact?: boolean;
  className?: string;
}

export function DataDepthBadge({
  depth,
  compact = false,
  className,
}: DataDepthBadgeProps) {
  const tone = toneFromTier(depth.tier);
  const Icon = iconFromTier(depth.tier);
  return (
    <span
      title={depth.explanation}
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium",
        tone === "positive" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
        tone === "neutral" &&
          "border-border/40 bg-background/40 text-muted-foreground",
        tone === "warning" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-200",
        tone === "critical" &&
          "border-rose-500/30 bg-rose-500/10 text-rose-200",
        className,
      )}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden />
      <span>{TIER_LABELS[depth.tier]}</span>
      {!compact && (
        <span className="font-mono opacity-70">· {depth.score}</span>
      )}
    </span>
  );
}

function toneFromTier(
  tier: DataDepthTier,
): "positive" | "neutral" | "warning" | "critical" {
  if (tier === "excellent") return "positive";
  if (tier === "good") return "positive";
  if (tier === "fair") return "neutral";
  if (tier === "limited") return "warning";
  return "critical";
}

function iconFromTier(tier: DataDepthTier) {
  if (tier === "excellent" || tier === "good") return CircleCheck;
  if (tier === "fair") return CircleHelp;
  if (tier === "limited") return CircleMinus;
  return CircleAlert;
}
