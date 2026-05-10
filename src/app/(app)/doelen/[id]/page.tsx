import { notFound } from "next/navigation";
import { Calendar, ShieldAlert, Target, TrendingUp } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { FeasibilityBadge } from "@/components/goals/feasibility-badge";
import { GoalForm } from "@/components/goals/goal-form";
import { ProjectionChart } from "@/components/goals/projection-chart";
import { Badge } from "@/components/ui/badge";
import {
  computeGoalProjection,
  GOAL_TYPE_LABELS,
} from "@/lib/analytics/goals";
import { resolveUserFromServer } from "@/lib/auth";
import { goalRepository, portfolioRepository } from "@/lib/data";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function GoalDetailPage({ params }: Props) {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Doelen"
          title="Doel"
          description="Authenticatie vereist."
        />
        <EmptyState
          icon={ShieldAlert}
          title="Niet ingelogd"
          description={auth.error}
        />
      </>
    );
  }

  const { id } = await params;
  const ctx = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);
  if (!ctx?.userId) {
    return (
      <>
        <PageHeader
          eyebrow="Doelen"
          title="Doel"
          description="Geen user-context."
        />
        <EmptyState
          icon={ShieldAlert}
          title="Geen account"
          description="Log opnieuw in om je doelen te zien."
        />
      </>
    );
  }

  const goal = await goalRepository.getByIdForUser(ctx.userId, id);
  if (!goal || !goal.isActive) {
    notFound();
  }

  const projection = computeGoalProjection({ goal, asOf: new Date() });
  const targetDate = new Date(goal.targetDate);

  return (
    <>
      <PageHeader
        eyebrow={GOAL_TYPE_LABELS[goal.type]}
        title={goal.name}
        description={goal.description ?? "Detail van je financiële doel."}
        actions={<FeasibilityBadge tier={projection.feasibility.tier} />}
      />

      <Section
        title="Voortgang"
        description="Waar sta je nu, en wat is de horizon?"
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Stat
            label="Doelbedrag"
            value={formatCurrency(goal.targetAmount, goal.baseCurrency)}
            icon={Target}
          />
          <Stat
            label="Streefdatum"
            value={targetDate.toLocaleDateString("nl-NL", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
            icon={Calendar}
            sub={`${projection.yearsToTarget.toFixed(1)} jaar`}
          />
          <Stat
            label="Voortgang"
            value={`${Math.round(projection.progress * 100)}%`}
            icon={TrendingUp}
            sub={`${formatCurrency(goal.currentAmount, goal.baseCurrency)} opgebouwd`}
          />
        </div>
      </Section>

      <Section
        title="Projectie & scenarios"
        description={projection.feasibility.summary}
      >
        <div className="rounded-lg border border-border/60 bg-surface/40 p-4 text-foreground">
          <ProjectionChart
            projection={projection}
            targetAmount={goal.targetAmount}
            currency={goal.baseCurrency}
          />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <ScenarioBox
            label="Pessimistisch"
            scenario={projection.scenarios.pessimistic}
            target={goal.targetAmount}
            currency={goal.baseCurrency}
          />
          <ScenarioBox
            label="Verwacht"
            scenario={projection.scenarios.neutral}
            target={goal.targetAmount}
            currency={goal.baseCurrency}
            highlight
          />
          <ScenarioBox
            label="Optimistisch"
            scenario={projection.scenarios.optimistic}
            target={goal.targetAmount}
            currency={goal.baseCurrency}
          />
        </div>
      </Section>

      <Section
        title="Bijstuur-suggesties"
        description="Wat is er nodig om dit doel comfortabel haalbaar te maken?"
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-md border border-border/60 bg-surface/40 p-4 text-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Benodigde maandinleg
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-foreground">
              {projection.feasibility.requiredMonthlyContribution !== null
                ? formatCurrency(
                    projection.feasibility.requiredMonthlyContribution,
                    goal.baseCurrency,
                  )
                : "—"}
            </p>
            {projection.feasibility.contributionGap !== null &&
              projection.feasibility.contributionGap > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Dat is{" "}
                  {formatCurrency(
                    projection.feasibility.contributionGap,
                    goal.baseCurrency,
                  )}{" "}
                  meer dan je huidige inleg van{" "}
                  {formatCurrency(goal.monthlyContribution, goal.baseCurrency)}/mnd.
                </p>
              )}
          </div>

          <div className="rounded-md border border-border/60 bg-surface/40 p-4 text-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Benodigd jaarrendement
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-foreground">
              {projection.feasibility.requiredAnnualReturn !== null
                ? `${(projection.feasibility.requiredAnnualReturn * 100).toFixed(1)}%`
                : "Onhaalbaar"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Bij je huidige inleg van{" "}
              {formatCurrency(goal.monthlyContribution, goal.baseCurrency)}/mnd.
              Verwacht: {(goal.expectedAnnualReturn * 100).toFixed(1)}%/jr (
              {goal.riskProfile}).
            </p>
          </div>
        </div>
      </Section>

      <Section
        title="Wijzigen of verwijderen"
        description="Pas het doel aan, of verwijder 'em wanneer je wilt."
      >
        <GoalForm mode="edit" initial={goal} defaultBaseCurrency={goal.baseCurrency} />
      </Section>
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Target;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-surface/40 p-4">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <Icon className="h-3 w-3" aria-hidden /> {label}
      </p>
      <p className="mt-1 font-mono text-xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ScenarioBox({
  label,
  scenario,
  target,
  currency,
  highlight = false,
}: {
  label: string;
  scenario: import("@/lib/analytics/goals").ScenarioProjection;
  target: number;
  currency: string;
  highlight?: boolean;
}) {
  const meets = scenario.meetsTarget;
  return (
    <div
      className={`rounded-md border p-4 ${
        highlight
          ? "border-primary/40 bg-primary/5"
          : "border-border/60 bg-surface/40"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label} ({(scenario.annualReturn * 100).toFixed(1)}%/jr)
        </p>
        <Badge
          variant="outline"
          className={`text-[10px] ${
            meets
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/40 bg-amber-500/10 text-amber-300"
          }`}
        >
          {meets ? "Doel gehaald" : "Tekort"}
        </Badge>
      </div>
      <p className="mt-1 font-mono text-xl font-bold text-foreground">
        {formatCurrency(scenario.finalValue, currency)}
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {scenario.surplus >= 0
          ? `+${formatCurrency(scenario.surplus, currency)} surplus`
          : `${formatCurrency(scenario.surplus, currency)} t.o.v. doel ${formatCurrency(target, currency)}`}
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
