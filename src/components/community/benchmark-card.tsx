import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { BenchmarkComparison } from "@/lib/community/types";
import { cn } from "@/lib/utils";

interface Props {
  comparison: BenchmarkComparison;
}

/**
 * BenchmarkCard — één scope vs cohort. Toont:
 * - tone-banner + label
 * - 1-zin verdict (Lynch-laag spreektaal)
 * - percentile-bar (als beschikbaar)
 * - 1..3 detail-bullets
 * - sample-size + bron-label (transparantie / Simons-laag)
 */
export function BenchmarkCard({ comparison }: Props) {
  const toneStyles = TONE_STYLES[comparison.tone];
  const Icon = TONE_ICONS[comparison.tone];

  return (
    <article className="rounded-lg border border-border/60 bg-surface/40 p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span
            className={cn(
              "mt-0.5 flex h-7 w-7 items-center justify-center rounded-full",
              toneStyles.iconBg,
            )}
            aria-hidden
          >
            <Icon className={cn("h-4 w-4", toneStyles.iconText)} />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {comparison.label}
            </p>
            <p className="text-sm font-medium leading-snug text-foreground">
              {comparison.verdict}
            </p>
          </div>
        </div>
        <SourceBadge source={comparison.source} sampleSize={comparison.sampleSize} />
      </header>

      {comparison.percentile !== null && (
        <div className="mt-3">
          <PercentileBar percentile={comparison.percentile} tone={comparison.tone} />
        </div>
      )}

      {comparison.details.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          {comparison.details.map((d, i) => (
            <li key={i} className="leading-snug">
              {d}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function PercentileBar({
  percentile,
  tone,
}: {
  percentile: number;
  tone: BenchmarkComparison["tone"];
}) {
  const clamped = Math.max(0, Math.min(99, percentile));
  const barColor =
    tone === "attention"
      ? "bg-amber-500/70"
      : tone === "positive"
        ? "bg-emerald-500/70"
        : "bg-primary/70";
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <span>positie binnen cohort</span>
        <span className="font-mono text-xs text-foreground">P{clamped}</span>
      </div>
      <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border/40">
        <div
          className={cn("h-full rounded-full", barColor)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function SourceBadge({
  source,
  sampleSize,
}: {
  source: BenchmarkComparison["source"];
  sampleSize: number;
}) {
  if (source === "real") {
    return (
      <Badge variant="outline" className="shrink-0 text-[10px]">
        Cohort · n={sampleSize}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="shrink-0 border-amber-500/40 text-[10px] text-amber-300">
      Synthetische baseline
    </Badge>
  );
}

const TONE_STYLES: Record<
  BenchmarkComparison["tone"],
  { iconBg: string; iconText: string }
> = {
  positive: { iconBg: "bg-emerald-500/10", iconText: "text-emerald-300" },
  neutral: { iconBg: "bg-primary/10", iconText: "text-primary" },
  attention: { iconBg: "bg-amber-500/15", iconText: "text-amber-300" },
};

const TONE_ICONS: Record<
  BenchmarkComparison["tone"],
  React.ComponentType<{ className?: string }>
> = {
  positive: ArrowUpRight,
  neutral: Minus,
  attention: ArrowDownRight,
};
