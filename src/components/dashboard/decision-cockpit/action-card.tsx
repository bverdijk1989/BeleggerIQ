import {
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Moon,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type {
  DashboardAction,
  DashboardActionType,
  DashboardActionUrgency,
} from "@/lib/analytics";
import { cn, formatCurrency } from "@/lib/utils";
import type { Currency } from "@/types/common";

/**
 * ActionCard — pure presentatie van één `DashboardAction`.
 *
 * Geen rekenwerk. Toont titel + beschrijving + urgency-badge + label
 * per type ("Risico verlagen" / "Kans benutten" / "Cash aanhouden" /
 * "Niets doen") + confidence wanneer < 0.6.
 */

interface Props {
  action: DashboardAction;
  baseCurrency: Currency;
  /** Bv. "1 / 3" — caller mag dit zelf samenstellen. */
  rankLabel?: string;
}

const TYPE_META: Record<
  DashboardActionType,
  {
    label: string;
    icon: typeof Sparkles;
    classes: string;
    iconClasses: string;
  }
> = {
  RISK_REDUCTION: {
    label: "Risico verlagen",
    icon: ShieldAlert,
    classes: "border-destructive/40 bg-destructive/5",
    iconClasses: "bg-destructive/15 text-destructive",
  },
  BUY_OPPORTUNITY: {
    label: "Kans benutten",
    icon: Sparkles,
    classes: "border-primary/40 bg-primary/5",
    iconClasses: "bg-primary/15 text-primary",
  },
  HOLD_CASH: {
    label: "Cash aanhouden",
    icon: Banknote,
    classes: "border-amber-500/40 bg-amber-500/5",
    iconClasses: "bg-amber-500/15 text-amber-200",
  },
  DO_NOTHING: {
    label: "Niets doen",
    icon: CheckCircle2,
    classes: "border-border/60 bg-surface/40",
    iconClasses: "bg-surface-elevated text-muted-foreground",
  },
};

/**
 * Urgentie wordt zachter ingekleurd dan voorheen — Kahneman-laag:
 * een felle rode HIGH-pill bij elk type-actie creëert action-bias en
 * urgency-pressure. Voor RISK_REDUCTION blijft rood (kapitaalbehoud);
 * andere types krijgen amber bij HIGH zodat BUY nooit een rode "koop
 * nu"-noot heeft.
 */
const URGENCY_BADGE: Record<DashboardActionUrgency, string> = {
  HIGH: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  MEDIUM: "border-amber-500/30 bg-amber-500/5 text-amber-200",
  LOW: "border-muted-foreground/30 bg-surface-elevated text-muted-foreground",
};

/**
 * Risk-only HIGH-styling: alleen bij `RISK_REDUCTION` mag de pill
 * rood worden. Voorkomt rode FOMO-pillen op BUY-acties.
 */
const URGENCY_BADGE_RISK_HIGH =
  "border-destructive/40 bg-destructive/10 text-destructive";

/**
 * NL-labels voor urgency. "HIGH/MEDIUM/LOW" all-caps voelt clinical
 * en agressief; gewone NL-woorden zijn rustiger en minder pressure-
 * driven.
 */
const URGENCY_LABEL: Record<DashboardActionUrgency, string> = {
  HIGH: "Belangrijk",
  MEDIUM: "Aandacht",
  LOW: "Nuttig om te weten",
};

export function ActionCard({ action, baseCurrency, rankLabel }: Props) {
  const meta = TYPE_META[action.type];
  const Icon = meta.icon;
  const showConfidence = action.confidence < 0.6;
  const direction =
    action.type === "RISK_REDUCTION"
      ? ArrowDownRight
      : action.type === "BUY_OPPORTUNITY"
        ? ArrowUpRight
        : null;
  const Direction = direction;

  return (
    <Card className={cn("flex h-full flex-col border", meta.classes)}>
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md",
              meta.iconClasses,
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                  meta.iconClasses,
                )}
              >
                {meta.label}
              </span>
              <span
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[10px] font-medium tracking-wider",
                  action.urgency === "HIGH" && action.type === "RISK_REDUCTION"
                    ? URGENCY_BADGE_RISK_HIGH
                    : URGENCY_BADGE[action.urgency],
                )}
              >
                {URGENCY_LABEL[action.urgency]}
              </span>
              {rankLabel && (
                <span className="rounded-sm bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {rankLabel}
                </span>
              )}
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              {Direction && (
                <Direction className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              {action.title}
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{action.description}</p>

        {(action.amount !== undefined || action.shares !== undefined) && (
          <dl className="grid grid-cols-3 gap-2 border-t border-border/40 pt-2">
            {action.shares !== undefined && (
              <Cell label="Aantal" value={formatShares(action.shares)} />
            )}
            {action.amount !== undefined && (
              <Cell
                label="Bedrag"
                value={formatCurrency(action.amount, baseCurrency, {
                  maximumFractionDigits: 0,
                })}
              />
            )}
            <Cell
              label="Bron"
              value={shortenSource(action.sourceEngine)}
              mono={false}
            />
          </dl>
        )}

        {showConfidence && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-200">
            Confidence {(action.confidence * 100).toFixed(0)}% — data is
            beperkt; dubbel-check voor je actie onderneemt.
          </p>
        )}

        {action.urgency === "HIGH" && action.type === "RISK_REDUCTION" && (
          <p className="flex items-start gap-1.5 rounded-md border border-border/40 bg-surface-elevated/40 px-2 py-1 text-[11px] text-muted-foreground">
            <Moon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span>
              Slaap er een nacht over voordat je een grote verkoop
              uitvoert. De engine signaleert het probleem; jij houdt de
              eindbeslissing.
            </span>
          </p>
        )}

        {/* Paired-BUY sectie (Fix B) — alleen bij RISK_REDUCTION met
            een gekoppelde redeploy-suggestie. Visueel onderdeel van
            dezelfde kaart zodat SELL + redeploy als één beslissing
            scant (Druckenmiller/Kahneman-laag). */}
        {action.type === "RISK_REDUCTION" && action.pairedBuy && (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2">
            <div className="flex items-center gap-1.5">
              <ArrowRightLeft className="h-3 w-3 text-primary" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                Herinvesteer · {Math.round(action.pairedBuy.redeployFraction * 100)}%
              </p>
            </div>
            <p className="mt-1 text-xs font-semibold text-foreground">
              Koop {action.pairedBuy.name ?? action.pairedBuy.symbol} voor ~
              {formatCurrency(action.pairedBuy.amount, baseCurrency, {
                maximumFractionDigits: 0,
              })}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {action.pairedBuy.rationale}
            </p>
          </div>
        )}

        {/* Trigger-sources (Fix C) — klein, secundair, monospace.
            Geeft de gebruiker zicht op WELKE engines het signaal afgaven. */}
        {action.triggerSources && action.triggerSources.length > 0 && (
          <p className="font-mono text-[10px] text-muted-foreground">
            bron: {action.triggerSources.join(" · ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Helpers (presentation only)
// ============================================================

function Cell({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-sm bg-surface-elevated/40 px-2 py-1">
      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-xs text-foreground",
          mono ? "font-mono tabular-nums" : "",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function formatShares(shares: number): string {
  if (Number.isInteger(shares)) return shares.toString();
  return shares.toFixed(2);
}

function shortenSource(src: DashboardAction["sourceEngine"]): string {
  switch (src) {
    case "action-engine":
      return "Action engine";
    case "rebalance-engine":
      return "Rebalance";
    case "allocation-engine":
      return "Allocatie";
    case "market-regime":
      return "Regime";
    case "risk-engine":
      return "Risk";
    default:
      return src;
  }
}
