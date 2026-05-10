import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, Plus, Target } from "lucide-react";

import {
  TONE_STYLES,
  type CockpitTone,
} from "@/components/dashboard/decision-cockpit/tone";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  GOAL_TYPE_LABELS,
  type FinancialGoal,
  type GoalProjection,
} from "@/lib/analytics/goals/types";
import { cn } from "@/lib/utils";

import { FEASIBILITY_LABELS, FeasibilityBadge } from "./feasibility-badge";

/**
 * GoalsSummaryCard — compacte dashboard-widget.
 *
 * Toont de eerstvolgende ~3 doelen met hun progress + feasibility-tier.
 * Bij 0 doelen: motiverende empty-state met CTA naar /doelen/nieuw.
 *
 * UX-idee: gebruiker ziet niet alleen aandelen, maar wat de portefeuille
 * voor zijn leven betekent — dat is de Wood/Lynch-laag.
 */

interface Props {
  combined: Array<{ goal: FinancialGoal; projection: GoalProjection }>;
  detailHref?: Route;
  newHref?: Route;
}

const WORST_TIER_TONE: Record<string, CockpitTone> = {
  ON_TRACK: "good",
  ACHIEVABLE: "good",
  AT_RISK: "warning",
  UNLIKELY: "critical",
};

export function GoalsSummaryCard({
  combined,
  detailHref = "/doelen" as Route,
  newHref = "/doelen/nieuw" as Route,
}: Props) {
  if (combined.length === 0) {
    const styles = TONE_STYLES.neutral;
    return (
      <Card className={cn("border", styles.container)}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Target className={cn("h-4 w-4", styles.iconFg)} aria-hidden />
            Financiële doelen
          </CardTitle>
          <CardDescription className="text-xs">
            Geef je portefeuille richting — pensioen, FIRE, huis, of een eigen
            doel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href={newHref}
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
          >
            <Plus className="h-3 w-3" aria-hidden /> Stel je eerste doel in
          </Link>
        </CardContent>
      </Card>
    );
  }

  const top = [...combined].slice(0, 3);
  const worstTier = pickWorstTier(combined);
  const tone = WORST_TIER_TONE[worstTier] ?? "neutral";
  const styles = TONE_STYLES[tone];

  return (
    <Card className={cn("border", styles.container)}>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Target className={cn("h-4 w-4", styles.iconFg)} aria-hidden />
            Financiële doelen
          </CardTitle>
          <Badge variant="outline" className={cn("text-[10px]", styles.chip)}>
            {combined.length} actief
          </Badge>
        </div>
        <CardDescription className="text-xs">
          {worstTier === "ON_TRACK" || worstTier === "ACHIEVABLE"
            ? "Doelen liggen op koers — blijf consistent met je inleg."
            : worstTier === "AT_RISK"
              ? "Eén of meer doelen staan onder druk — overweeg bijsturen."
              : "Eén of meer doelen zijn op de huidige inleg onwaarschijnlijk."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {top.map(({ goal, projection }) => (
            <li
              key={goal.id}
              className="rounded-md border border-border/40 bg-background/30 p-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-foreground">
                  {goal.name}
                </p>
                <FeasibilityBadge tier={projection.feasibility.tier} />
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {GOAL_TYPE_LABELS[goal.type]} · doel{" "}
                {formatCurrency(goal.targetAmount, goal.baseCurrency)} ·{" "}
                {projection.yearsToTarget.toFixed(1)} jr
              </p>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted/30">
                <div
                  className="h-full bg-primary"
                  style={{
                    width: `${Math.max(2, Math.min(100, Math.round(projection.progress * 100)))}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[10px] text-muted-foreground">
            Slechtste tier: {FEASIBILITY_LABELS[worstTier as keyof typeof FEASIBILITY_LABELS]}
          </p>
          <Link
            href={detailHref}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Alle doelen
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function pickWorstTier(
  combined: Array<{ goal: FinancialGoal; projection: GoalProjection }>,
): string {
  const tiers = combined.map((c) => c.projection.feasibility.tier);
  if (tiers.includes("UNLIKELY")) return "UNLIKELY";
  if (tiers.includes("AT_RISK")) return "AT_RISK";
  if (tiers.includes("ACHIEVABLE")) return "ACHIEVABLE";
  return "ON_TRACK";
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
