import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type MetricTrend = "up" | "down" | "flat";

interface MetricCardProps {
  label: string;
  value: string;
  helper?: string;
  trend?: MetricTrend;
  trendLabel?: string;
  icon?: LucideIcon;
  className?: string;
}

const TREND_STYLES: Record<MetricTrend, string> = {
  up: "text-success",
  down: "text-destructive",
  flat: "text-muted-foreground",
};

export function MetricCard({
  label,
  value,
  helper,
  trend,
  trendLabel,
  icon: Icon,
  className,
}: MetricCardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          {Icon && (
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated/80 text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
          {(trendLabel || helper) && (
            <div className="flex items-center gap-2 text-xs">
              {trend && trendLabel && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 font-medium",
                    TREND_STYLES[trend],
                  )}
                >
                  {trend === "up" && <ArrowUpRight className="h-3 w-3" />}
                  {trend === "down" && <ArrowDownRight className="h-3 w-3" />}
                  {trendLabel}
                </span>
              )}
              {helper && (
                <span className="text-muted-foreground">{helper}</span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
