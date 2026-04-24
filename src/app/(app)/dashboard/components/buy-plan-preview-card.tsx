import Link from "next/link";
import { ArrowRight, CalendarClock, PiggyBank } from "lucide-react";

import { ScorePill } from "@/components/common/score-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { AllocationPlan } from "@/types/allocation";

interface BuyPlanPreviewCardProps {
  plan: AllocationPlan;
  limit?: number;
}

/**
 * Mini preview van /maandbeslissing op het dashboard. Toont totaal budget,
 * cash reserved en top-N recommendations. Bij leeg plan (bv. alles cash)
 * rendert het een neutrale staat met dezelfde CTA.
 */
export function BuyPlanPreviewCard({
  plan,
  limit = 3,
}: BuyPlanPreviewCardProps) {
  const top = plan.recommendations.slice(0, limit);
  const deployed = plan.deployedAmount ?? 0;
  const cashReserved = plan.cashReserved ?? 0;

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-primary">
              <CalendarClock className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Maandbeslissing
              </p>
              <p className="text-sm text-foreground">
                {plan.recommendations.length > 0
                  ? `${plan.recommendations.length} koopaanbeveling${plan.recommendations.length === 1 ? "" : "en"} voor ${formatCurrency(deployed, plan.baseCurrency)}.`
                  : "Deze cyclus wordt cash aangehouden."}
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href="/maandbeslissing">
              Open plan <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {top.length === 0 ? (
          <div className="flex items-center gap-3 rounded-md border border-border/60 bg-surface/60 p-3 text-sm">
            <PiggyBank className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="font-medium text-foreground">
                {formatCurrency(cashReserved, plan.baseCurrency)} blijft cash
              </p>
              <p className="text-xs text-muted-foreground">
                {plan.warnings?.[0] ??
                  "Geen kandidaten voldoen aan je profiel — wacht tot volgend cyclus."}
              </p>
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {top.map((rec, index) => (
              <li
                key={rec.ticker}
                className="flex items-start gap-3 rounded-md border border-border/60 bg-surface/60 p-3"
              >
                <span className="mt-0.5 rounded-sm bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                  #{index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {rec.name ?? rec.ticker}
                    </p>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        rec.action === "buy"
                          ? "bg-primary/15 text-primary border-primary/30"
                          : "bg-success/15 text-success border-success/30",
                      )}
                    >
                      {rec.action === "buy" ? "Nieuw" : "Bijkopen"}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {rec.ticker} · {formatPercent(rec.targetWeight)} target
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                    <span className="tabular-nums text-foreground">
                      {formatCurrency(rec.suggestedAmount, plan.baseCurrency)}
                    </span>
                    {rec.factorScore?.composite !== undefined && (
                      <ScorePill
                        score={rec.factorScore.composite}
                        label="Composite"
                      />
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
