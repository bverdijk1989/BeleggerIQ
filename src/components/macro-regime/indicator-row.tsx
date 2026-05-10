import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CircleDashed,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type {
  MacroIndicator,
  MacroTrend,
} from "@/lib/analytics/macro-regime/types";
import { cn } from "@/lib/utils";

const TREND_ICON: Record<MacroTrend, typeof ArrowUp> = {
  rising: ArrowUp,
  falling: ArrowDown,
  stable: ArrowRight,
  unknown: CircleDashed,
};

const TREND_LABEL: Record<MacroTrend, string> = {
  rising: "Stijgend",
  falling: "Dalend",
  stable: "Stabiel",
  unknown: "Onbekend",
};

interface Props {
  indicator: MacroIndicator;
}

export function IndicatorRow({ indicator }: Props) {
  const Icon = TREND_ICON[indicator.trend];
  const isMissing = indicator.score === null;

  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border/40 bg-surface/40 p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-foreground">
            {indicator.label}
          </h4>
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Icon className="h-2.5 w-2.5" aria-hidden /> {TREND_LABEL[indicator.trend]}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{indicator.rationale}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Bron: {indicator.source} · confidence{" "}
          {Math.round(indicator.confidence * 100)}%
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={cn(
            "font-mono text-lg font-bold tabular-nums",
            isMissing ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {isMissing ? "—" : `${indicator.score}`}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {indicator.rawValue !== null
            ? `${formatRaw(indicator.rawValue)} ${indicator.rawUnit ?? ""}`
            : "geen data"}
        </p>
      </div>
    </div>
  );
}

function formatRaw(v: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}
