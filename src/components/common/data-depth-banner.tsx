import {
  Database,
  DatabaseZap,
  FileQuestion,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  DIMENSION_LABELS,
  TIER_EXPLANATIONS,
  TIER_LABELS,
  type DataDepthDimension,
  type DataDepthTier,
  type PortfolioDataCoverage,
} from "@/lib/analytics/data-depth";
import { cn } from "@/lib/utils";

/**
 * Module 26 — Data-Depth banner.
 *
 * Toont op portfolio-page:
 *  - Eén top-level tier-badge ("Goed" / "Beperkt")
 *  - Per-dimensie gewogen-coverage (live-price / fundamentals / dividend /
 *    macro / history)
 *  - Plain-language uitleg + max-5 warnings bij gaps
 *
 * **Geen tech-jargon**: gebruikers zien geen "provider", "HTTP", "API".
 */

interface DataDepthBannerProps {
  coverage: PortfolioDataCoverage;
  className?: string;
}

export function DataDepthBanner({ coverage, className }: DataDepthBannerProps) {
  const tier = coverage.tier;
  const tone = toneFromTier(tier);
  const Icon =
    tone === "positive"
      ? DatabaseZap
      : tone === "warning"
        ? FileQuestion
        : Database;

  return (
    <Card className={cn("bg-surface/60", className)}>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Datadekking
            </p>
            <p className="text-sm text-muted-foreground">
              {coverage.summary}
            </p>
          </div>
          <DepthBadge tier={tier} score={coverage.weightedScore} Icon={Icon} />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {(Object.keys(DIMENSION_LABELS) as DataDepthDimension[]).map((dim) => (
            <DimensionCoverage
              key={dim}
              label={DIMENSION_LABELS[dim]}
              coverage={coverage.dimensions[dim].weightedCoverage}
              presentCount={coverage.dimensions[dim].presentCount}
              total={coverage.assetCount}
            />
          ))}
        </div>

        {coverage.warnings.length > 0 ? (
          <ul className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100">
            {coverage.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2">
                <TrendingDown className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-1 text-[11px] text-emerald-200">
            <TrendingUp className="h-3 w-3" aria-hidden />
            <span>Geen kritieke data-gaps gedetecteerd.</span>
          </p>
        )}

        <p className="border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
          {TIER_EXPLANATIONS[tier]}
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Helpers
// ============================================================

function DepthBadge({
  tier,
  score,
  Icon,
}: {
  tier: DataDepthTier;
  score: number;
  Icon: typeof Database;
}) {
  const tone = toneFromTier(tier);
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs",
        tone === "positive" &&
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
        tone === "neutral" &&
          "border-border/60 bg-surface/60 text-foreground",
        tone === "warning" &&
          "border-amber-500/40 bg-amber-500/10 text-amber-200",
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="font-semibold">{TIER_LABELS[tier]}</span>
      <span className="font-mono text-[10px] opacity-80">{score}/100</span>
    </div>
  );
}

function DimensionCoverage({
  label,
  coverage,
  presentCount,
  total,
}: {
  label: string;
  coverage: number;
  presentCount: number;
  total: number;
}) {
  const pct = Math.round(coverage * 100);
  const tone = pct >= 80 ? "positive" : pct >= 50 ? "neutral" : "warning";
  return (
    <div className="rounded-md border border-border/40 bg-background/40 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-mono text-sm",
          tone === "positive" && "text-emerald-200",
          tone === "neutral" && "text-foreground",
          tone === "warning" && "text-amber-200",
        )}
      >
        {pct}%
      </p>
      <p className="text-[10px] text-muted-foreground">
        {presentCount} / {total} posities
      </p>
    </div>
  );
}

function toneFromTier(tier: DataDepthTier): "positive" | "neutral" | "warning" {
  if (tier === "excellent" || tier === "good") return "positive";
  if (tier === "fair") return "neutral";
  return "warning";
}
