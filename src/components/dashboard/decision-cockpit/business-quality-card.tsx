import {
  AlertTriangle,
  Building2,
  Crown,
  Info,
  Recycle,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  BusinessQualityNL,
  DashboardBusinessQualityItem,
} from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * BusinessQualityCard — pure presentational kaart per item.
 *
 * Toont ticker + naam, sector, score (XX/100), label-chip in NL, weight
 * in portefeuille, top-rationale uit de business-quality engine en een
 * confidence-indicator wanneer < 60%.
 *
 * Geen rekenwerk; alle waarden komen uit `summarizeBusinessQuality`.
 */

interface Props {
  item: DashboardBusinessQualityItem;
  /** Optioneel rank-label, "1/3" enz. */
  rank?: { current: number; total: number };
}

const LABEL_STYLES: Record<
  BusinessQualityNL,
  { container: string; icon: typeof Sparkles }
> = {
  "Sterk bedrijf": {
    container: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    icon: Sparkles,
  },
  Langetermijnhouder: {
    container: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
    icon: Crown,
  },
  Cyclisch: {
    container: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    icon: Recycle,
  },
  Speculatief: {
    container: "border-destructive/40 bg-destructive/10 text-destructive",
    icon: ShieldAlert,
  },
};

export function BusinessQualityCard({ item, rank }: Props) {
  const labelStyle = LABEL_STYLES[item.labelNL];
  const LabelIcon = labelStyle.icon;
  const lowConfidence = item.confidence < 0.6;

  return (
    <article
      className="flex h-full flex-col gap-2 rounded-md border border-border/50 bg-surface/40 p-3"
      aria-label={`${item.ticker}: ${item.labelNL}`}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Building2 className="h-3.5 w-3.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-snug text-foreground">
              {item.name}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {item.ticker}
              {item.sector && ` · ${item.sector}`}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {rank && (
            <span className="rounded-md border border-border/40 bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
              #{rank.current}/{rank.total}
            </span>
          )}
          <span className="font-mono text-base font-semibold tabular-nums text-foreground">
            {item.score}
            <span className="text-[10px] text-muted-foreground">/100</span>
          </span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold",
            labelStyle.container,
          )}
        >
          <LabelIcon className="h-3 w-3" aria-hidden />
          {item.labelNL}
        </span>
        <span className="rounded-md border border-border/50 bg-surface-elevated px-2 py-0.5 text-[10px] text-muted-foreground">
          {(item.weight * 100).toFixed(1)}% in port.
        </span>
        {lowConfidence && (
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-0.5 text-[10px] text-amber-200">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            Confidence {(item.confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {item.topRationale}
      </p>

      {item.warnings.length > 0 && (
        <TooltipProvider delayDuration={120} skipDelayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="flex items-center gap-1 text-[10px] text-amber-200">
                <Info className="h-3 w-3" aria-hidden />
                {item.warnings.length} datawaarschuwing
                {item.warnings.length === 1 ? "" : "en"}
              </p>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              <ul className="space-y-1">
                {item.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </article>
  );
}
