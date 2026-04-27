import {
  ArrowDownRight,
  ArrowUpRight,
  Equal,
  Info,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type {
  ActionDecision,
  ActionPlan,
  ActionUrgency,
  GlobalAdvice,
  PositionAction,
} from "@/lib/analytics";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type { Currency } from "@/types/common";

import { ActionExplainerButton } from "./action-explainer-button";

/**
 * ActionEngineCard — pure presentatie van een `ActionPlan`.
 *
 * Toont:
 *   - Global advice ("Wat moet ik NU doen?") met urgency-tone
 *   - Top-3 acties (gesorteerd op urgency desc)
 *   - Per actie: badge + aantallen + bedrag + rationale + risk-impact
 *
 * UI bevat geen rekenwerk; alle getallen komen uit de engine.
 */

interface Props {
  plan: ActionPlan;
  /** Max aantal acties getoond (default 3 voor dashboard, hoger op detailpagina). */
  limit?: number;
}

const ACTION_BADGE: Record<ActionDecision, string> = {
  BUY: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  HOLD: "border-muted-foreground/40 bg-surface-elevated text-muted-foreground",
  TRIM: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  SELL: "border-red-500/40 bg-red-500/10 text-red-200",
  DO_NOTHING: "border-muted-foreground/30 bg-surface/40 text-muted-foreground",
};

const ACTION_LABEL: Record<ActionDecision, string> = {
  BUY: "Bijkopen",
  HOLD: "Aanhouden",
  TRIM: "Afbouwen",
  SELL: "Verkopen",
  DO_NOTHING: "Niets doen",
};

const URGENCY_BADGE: Record<ActionUrgency, string> = {
  HIGH: "border-red-500/40 bg-red-500/10 text-red-200",
  MEDIUM: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  LOW: "border-muted-foreground/30 bg-surface-elevated text-muted-foreground",
};

const GLOBAL_TONE: Record<
  GlobalAdvice,
  { label: string; className: string; icon: typeof TrendingUp }
> = {
  BUY_MORE: {
    label: "BUY MORE",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    icon: TrendingUp,
  },
  HOLD: {
    label: "HOLD",
    className: "border-muted-foreground/40 bg-surface-elevated text-muted-foreground",
    icon: Equal,
  },
  DE_RISK: {
    label: "DE-RISK",
    className: "border-red-500/40 bg-red-500/10 text-red-200",
    icon: ShieldAlert,
  },
  INSUFFICIENT_DATA: {
    label: "ONVOLDOENDE DATA",
    className: "border-muted-foreground/30 bg-surface/40 text-muted-foreground",
    icon: Info,
  },
};

export function ActionEngineCard({ plan, limit = 3 }: Props) {
  const top = plan.positions
    .filter((p) => p.action !== "DO_NOTHING" && p.action !== "HOLD")
    .slice(0, limit);
  const tone = GLOBAL_TONE[plan.global.overallAdvice];
  const Icon = tone.icon;

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md",
              tone.className,
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Wat moet ik NU doen?
            </p>
            <p className="text-sm text-foreground">
              <span className={cn("rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider", tone.className)}>
                {tone.label}
              </span>{" "}
              <span className="text-muted-foreground">{plan.global.reason}</span>
            </p>
          </div>
        </div>

        {/* Distributie-strip */}
        <DistributionStrip distribution={plan.global.distribution} />

        {/* Top acties */}
        {top.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 bg-surface/40 p-3 text-sm text-muted-foreground">
            Geen actie nodig; portefeuille zit in lijn met de regels.
          </p>
        ) : (
          <ul className="space-y-2">
            {top.map((action) => (
              <ActionRow
                key={action.symbol}
                action={action}
                baseCurrency={plan.baseCurrency}
              />
            ))}
          </ul>
        )}

        {plan.warnings.length > 0 && (
          <ul className="space-y-1 border-t border-border/60 pt-3">
            {plan.warnings.map((w, i) => (
              <li key={i} className="text-[11px] text-amber-200">
                · {w}
              </li>
            ))}
          </ul>
        )}

        <p className="flex items-start gap-2 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Aanbevelingen zijn rule-based en deterministic; geen AI. Controleer
            altijd risico, allocatie en kosten voordat je instapt.
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Distribution strip
// ============================================================

function DistributionStrip({
  distribution,
}: {
  distribution: Record<ActionDecision, number>;
}) {
  const total =
    distribution.BUY +
    distribution.HOLD +
    distribution.TRIM +
    distribution.SELL +
    distribution.DO_NOTHING;
  if (total === 0) return null;
  const entries: Array<[ActionDecision, number]> = [
    ["BUY", distribution.BUY],
    ["TRIM", distribution.TRIM],
    ["SELL", distribution.SELL],
    ["HOLD", distribution.HOLD],
    ["DO_NOTHING", distribution.DO_NOTHING],
  ];
  return (
    <dl className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {entries.map(([action, count]) =>
        count === 0 ? null : (
          <div
            key={action}
            className={cn(
              "rounded-md border px-2 py-1.5 text-center",
              ACTION_BADGE[action],
            )}
          >
            <dt className="text-[9px] font-semibold uppercase tracking-wider opacity-80">
              {ACTION_LABEL[action]}
            </dt>
            <dd className="mt-0.5 font-mono text-sm tabular-nums">{count}</dd>
          </div>
        ),
      )}
    </dl>
  );
}

// ============================================================
//  Per-actie rij
// ============================================================

function ActionRow({
  action,
  baseCurrency,
}: {
  action: PositionAction;
  baseCurrency: Currency;
}) {
  const Icon =
    action.action === "BUY"
      ? ArrowUpRight
      : action.action === "SELL" || action.action === "TRIM"
        ? ArrowDownRight
        : action.action === "HOLD"
          ? Equal
          : Target;

  return (
    <li className="rounded-md border border-border/60 bg-surface/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md",
              ACTION_BADGE[action.action],
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">{action.name}</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {action.symbol}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              ACTION_BADGE[action.action],
            )}
          >
            {ACTION_LABEL[action.action]}
          </span>
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 text-[10px] font-medium",
              URGENCY_BADGE[action.urgency],
            )}
          >
            {action.urgency}
          </span>
        </div>
      </div>

      {/* Aantallen */}
      <dl className="mt-2 grid grid-cols-3 gap-2">
        <Cell
          label="Aantal"
          value={
            action.sharesToBuy > 0
              ? `+${formatNumber(action.sharesToBuy, action.sharesToBuy % 1 === 0 ? 0 : 4)}`
              : action.sharesToSell > 0
                ? `−${formatNumber(action.sharesToSell, action.sharesToSell % 1 === 0 ? 0 : 4)}`
                : "—"
          }
        />
        <Cell
          label="Bedrag"
          value={
            action.amount > 0
              ? formatCurrency(action.amount, baseCurrency, {
                  maximumFractionDigits: 0,
                })
              : "—"
          }
        />
        <Cell
          label="Confidence"
          value={`${(action.confidence * 100).toFixed(0)}%`}
        />
      </dl>

      <p className="mt-2 text-xs text-foreground">{action.rationale}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">Risico-impact:</span>{" "}
        {action.riskImpact}
      </p>
      <div className="mt-2 flex justify-end">
        <ActionExplainerButton action={action} />
      </div>
    </li>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm bg-surface-elevated/40 px-2 py-1">
      <dt className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-xs tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}
