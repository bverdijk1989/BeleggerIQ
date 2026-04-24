import { Info, PiggyBank } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { AllocationPlan } from "@/types/allocation";

interface WarningsBannerProps {
  plan: AllocationPlan;
}

/**
 * Compacte banner die plan-warnings toont en — als er niets te kopen valt —
 * een expliciete cash-hold uitleg geeft. Bewust niet-alarmistisch.
 */
export function WarningsBanner({ plan }: WarningsBannerProps) {
  const warnings = plan.warnings ?? [];
  const noRecommendations = plan.recommendations.length === 0;
  const cashReserved = plan.cashReserved ?? 0;

  if (!noRecommendations && warnings.length === 0) return null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-muted-foreground">
            {noRecommendations ? (
              <PiggyBank className="h-4 w-4" />
            ) : (
              <Info className="h-4 w-4" />
            )}
          </span>
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {noRecommendations ? "Cash aanhouden" : "Goed om te weten"}
            </p>
            <p className="text-sm text-foreground">
              {noRecommendations
                ? `Deze maand wordt ${formatCurrency(cashReserved, plan.baseCurrency)} bewust als cash aangehouden.`
                : "Een paar kanttekeningen bij dit plan."}
            </p>
          </div>
        </div>

        {warnings.length > 0 && (
          <ul className="space-y-1 pl-11 text-xs text-muted-foreground">
            {warnings.map((message, i) => (
              <li key={i}>• {message}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
