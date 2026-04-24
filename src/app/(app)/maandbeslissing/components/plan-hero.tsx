import { CalendarClock, PiggyBank, Target } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";
import type { AllocationPlan } from "@/types/allocation";
import type { MarketRegimeScore, MarketRegimeStance } from "@/types/regime";

interface PlanHeroProps {
  plan: AllocationPlan;
  regime: MarketRegimeScore | null;
}

const STANCE_LABEL: Record<MarketRegimeStance, string> = {
  RISK_ON: "Risk-on",
  NEUTRAL: "Neutraal",
  DEFENSIVE: "Defensief",
};

const STANCE_TONE: Record<MarketRegimeStance, string> = {
  RISK_ON: "bg-success/15 text-success border-success/30",
  NEUTRAL: "bg-primary/15 text-primary border-primary/30",
  DEFENSIVE: "bg-destructive/15 text-destructive border-destructive/30",
};

/**
 * Hero card bovenaan /maandbeslissing. Focus op "wat kan ik deze maand doen"
 * — budget, deployed amount, aantal aanbevelingen en regime-stance.
 */
export function PlanHero({ plan, regime }: PlanHeroProps) {
  const recommendations = plan.recommendations.length;
  const budget = plan.budget ?? plan.monthlyContribution;
  const deployed = plan.deployedAmount ?? 0;
  const cashReserved = plan.cashReserved ?? 0;
  const updatedAt = new Date(plan.asOf).toLocaleString("nl-NL");

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface-elevated text-primary">
            <CalendarClock className="h-6 w-6" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Maandbeslissing
            </p>
            <p className="text-2xl font-semibold tracking-tight text-foreground">
              {recommendations} koopaanbeveling
              {recommendations === 1 ? "" : "en"} voor{" "}
              {formatCurrency(deployed, plan.baseCurrency)}
            </p>
            <p className="text-xs text-muted-foreground">
              Bijgewerkt {updatedAt}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:max-w-xl">
          <HeroStat
            icon={Target}
            label="Budget"
            value={formatCurrency(budget, plan.baseCurrency)}
            helper={`Plafond voor deze ronde`}
          />
          <HeroStat
            icon={PiggyBank}
            label="Cash achtergehouden"
            value={formatCurrency(cashReserved, plan.baseCurrency)}
            helper="Buffer + bewuste holdback"
          />
          {regime ? (
            <StanceBadge regime={regime} />
          ) : (
            <HeroStat
              icon={Target}
              label="Marktregime"
              value="—"
              helper="Onbekend"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function HeroStat({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-surface p-3">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        <span>{label}</span>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="text-sm font-semibold tabular-nums text-foreground">
        {value}
      </div>
      {helper && <p className="text-[11px] text-muted-foreground">{helper}</p>}
    </div>
  );
}

function StanceBadge({ regime }: { regime: MarketRegimeScore }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-surface p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Marktregime
      </p>
      <span
        className={cn(
          "inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
          STANCE_TONE[regime.stance],
        )}
      >
        {STANCE_LABEL[regime.stance]} · {regime.score}/100
      </span>
      <p className="text-[11px] text-muted-foreground">
        Stuurt budget en factor-bias.
      </p>
    </div>
  );
}
