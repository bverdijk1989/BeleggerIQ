"use client";

import {
  Activity,
  Briefcase,
  CalendarClock,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { ChatContext } from "@/types/chat";

interface ContextChipsProps {
  context: ChatContext;
}

/**
 * Rij van compacte chips bovenaan /chat: portfolio, regime, health,
 * risk en maandplan. Puur presentationeel — de chat-route ververst
 * context bij elk antwoord zodat deze chips mee-leven.
 */
export function ContextChips({ context }: ContextChipsProps) {
  const regimeLabel = context.regime
    ? stanceLabel(context.regime.stance)
    : "—";
  const regimeTone = context.regime
    ? stanceTone(context.regime.stance)
    : "muted";

  const riskTone =
    context.risk.severity === "high" || context.risk.severity === "critical"
      ? "destructive"
      : context.risk.severity === "moderate" || context.risk.severity === "elevated"
        ? "warning"
        : "muted";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip
        icon={Briefcase}
        label={formatCurrency(
          context.portfolio.totalValue,
          context.portfolio.baseCurrency,
        )}
        sub={`${context.portfolio.positionCount} posities`}
        tone="primary"
      />
      <Chip
        icon={Activity}
        label={`Regime ${regimeLabel}`}
        sub={context.regime ? `${context.regime.score}/100` : "geen data"}
        tone={regimeTone}
      />
      <Chip
        icon={context.risk.severity === "low" ? ShieldCheck : ShieldAlert}
        label={`Risico ${context.risk.severity}`}
        sub={
          context.risk.riskScore !== undefined
            ? `${context.risk.riskScore}/100`
            : "—"
        }
        tone={riskTone}
      />
      <Chip
        icon={ShieldCheck}
        label={`Health ${context.health.grade}`}
        sub={`${context.health.score}/100`}
        tone={
          context.health.grade === "A" || context.health.grade === "B"
            ? "success"
            : context.health.grade === "F"
              ? "destructive"
              : "muted"
        }
      />
      <Chip
        icon={CalendarClock}
        label={`Maandplan ${context.plan.recommendations}×`}
        sub={formatCurrency(
          context.plan.deployed,
          context.portfolio.baseCurrency,
        )}
        tone="primary"
      />
      {context.portfolio.largestPosition && (
        <Chip
          icon={Briefcase}
          label={`Top: ${context.portfolio.largestPosition.name}`}
          sub={formatPercent(context.portfolio.largestPosition.weight)}
          tone="muted"
        />
      )}
    </div>
  );
}

type ChipTone = "primary" | "success" | "warning" | "destructive" | "muted";

const TONE_CLASS: Record<ChipTone, string> = {
  primary: "border-primary/30 bg-primary/10 text-primary",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  muted:
    "border-border/60 bg-surface text-muted-foreground",
};

function Chip({
  icon: Icon,
  label,
  sub,
  tone,
}: {
  icon: typeof Briefcase;
  label: string;
  sub: string;
  tone: ChipTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs",
        TONE_CLASS[tone],
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground">· {sub}</span>
    </span>
  );
}

function stanceLabel(stance: string): string {
  switch (stance) {
    case "RISK_ON":
      return "risk-on";
    case "DEFENSIVE":
      return "defensief";
    case "NEUTRAL":
    default:
      return "neutraal";
  }
}

function stanceTone(stance: string): ChipTone {
  switch (stance) {
    case "RISK_ON":
      return "success";
    case "DEFENSIVE":
      return "destructive";
    case "NEUTRAL":
    default:
      return "primary";
  }
}
