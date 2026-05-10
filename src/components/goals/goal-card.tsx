import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, Calendar, Target, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  GOAL_TYPE_LABELS,
  type FinancialGoal,
  type GoalProjection,
} from "@/lib/analytics/goals/types";
import { cn } from "@/lib/utils";

import { FeasibilityBadge } from "./feasibility-badge";

/**
 * GoalCard — één doel met progress-bar, scenario-eindwaarden, en
 * feasibility-tier. Klik door naar `/doelen/[id]` voor detail.
 */

interface Props {
  goal: FinancialGoal;
  projection: GoalProjection;
}

export function GoalCard({ goal, projection }: Props) {
  const detailHref: Route = `/doelen/${goal.id}` as Route;
  const progressPct = Math.round(projection.progress * 100);
  const yearsLabel =
    projection.yearsToTarget < 1
      ? "minder dan 1 jaar"
      : `${projection.yearsToTarget.toFixed(1)} jaar`;

  return (
    <Card className="border border-border/60 bg-surface/40 transition-colors hover:border-primary/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {GOAL_TYPE_LABELS[goal.type]}
            </p>
            <CardTitle className="mt-0.5 text-base">{goal.name}</CardTitle>
          </div>
          <FeasibilityBadge tier={projection.feasibility.tier} />
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Voortgang */}
        <div>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              {formatCurrency(goal.currentAmount, goal.baseCurrency)} van{" "}
              {formatCurrency(goal.targetAmount, goal.baseCurrency)}
            </span>
            <span className="font-mono text-foreground">{progressPct}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.max(2, Math.min(100, progressPct))}%` }}
            />
          </div>
        </div>

        {/* Mini-meta-rij */}
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" aria-hidden /> {yearsLabel}
          </span>
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" aria-hidden />
            {formatCurrency(goal.monthlyContribution, goal.baseCurrency)}/mnd
          </span>
          <span className="flex items-center gap-1">
            <Target className="h-3 w-3" aria-hidden />
            verwacht {(goal.expectedAnnualReturn * 100).toFixed(1)}%
          </span>
          <span>
            <Badge variant="outline" className="text-[10px]">
              {goal.riskProfile}
            </Badge>
          </span>
        </div>

        {/* Scenario-eindwaarden */}
        <div className="rounded-md border border-border/40 bg-muted/10 p-2 text-[11px]">
          <div className="grid grid-cols-3 gap-1">
            <ScenarioPill
              label="Pessimistisch"
              value={projection.scenarios.pessimistic.finalValue}
              currency={goal.baseCurrency}
              meets={projection.scenarios.pessimistic.meetsTarget}
            />
            <ScenarioPill
              label="Verwacht"
              value={projection.scenarios.neutral.finalValue}
              currency={goal.baseCurrency}
              meets={projection.scenarios.neutral.meetsTarget}
              highlight
            />
            <ScenarioPill
              label="Optimistisch"
              value={projection.scenarios.optimistic.finalValue}
              currency={goal.baseCurrency}
              meets={projection.scenarios.optimistic.meetsTarget}
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {projection.feasibility.summary}
        </p>

        <div className="flex items-center justify-end pt-1">
          <Link
            href={detailHref}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Bekijk projectie
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function ScenarioPill({
  label,
  value,
  currency,
  meets,
  highlight = false,
}: {
  label: string;
  value: number;
  currency: string;
  meets: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded p-1 text-center",
        highlight && "bg-primary/10",
      )}
    >
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "font-mono text-[11px] font-semibold tabular-nums",
          meets ? "text-emerald-300" : "text-amber-300",
        )}
      >
        {formatCurrency(value, currency)}
      </p>
    </div>
  );
}

function formatCurrency(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}
