import {
  AlertOctagon,
  AlertTriangle,
  Database,
  Globe,
  Info,
  Layers,
  Activity,
  TrendingDown,
  ShieldAlert,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  DashboardRiskAction,
  DashboardRiskSeverity,
  DashboardRiskType,
} from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * RiskActionCard — pure presentatie van één `DashboardRiskAction`.
 *
 * UX-regels:
 *  - **Probleem first.** Title is feitelijk: "Rheinmetall weegt 17,5%".
 *  - **Impact-zin** ernaast.
 *  - **Concrete actie** als laatste regel, met sharesToSell + amountToSell
 *    + postActionWeight uit de rebalance-quantity-engine.
 *  - **Confidence-indicator** wanneer < 60% of `insufficientData=true`.
 *  - Severity-driven kleur + icoon (high/critical = destructive,
 *    elevated = amber, lager = neutraal).
 *  - Geen rekenwerk, geen AI-zinnen — alles komt uit de mapper.
 */

interface Props {
  action: DashboardRiskAction;
  /** Optionele rank-label, "1/3" enz. */
  rank?: { current: number; total: number };
}

const SEVERITY_STYLES: Record<
  DashboardRiskSeverity,
  {
    container: string;
    badge: string;
    accent: string;
  }
> = {
  critical: {
    container: "border-destructive/50 bg-destructive/5",
    badge: "bg-destructive/15 text-destructive",
    accent: "text-destructive",
  },
  high: {
    container: "border-destructive/40 bg-destructive/5",
    badge: "bg-destructive/15 text-destructive",
    accent: "text-destructive",
  },
  elevated: {
    container: "border-amber-500/40 bg-amber-500/5",
    badge: "bg-amber-500/15 text-amber-300",
    accent: "text-amber-200",
  },
  moderate: {
    container: "border-amber-500/30 bg-amber-500/[0.04]",
    badge: "bg-amber-500/10 text-amber-200",
    accent: "text-amber-200",
  },
  low: {
    container: "border-border/60 bg-surface/40",
    badge: "bg-muted/30 text-muted-foreground",
    accent: "text-muted-foreground",
  },
};

const TYPE_LABELS: Record<DashboardRiskType, string> = {
  POSITION_CONCENTRATION: "Positie-concentratie",
  POLICY_VIOLATION: "Policy-overschrijding",
  SECTOR_BIAS: "Sector-bias",
  CURRENCY_RISK: "Valuta-risico",
  TOP5_CONCENTRATION: "Top-5 concentratie",
  VOLATILITY: "Volatility",
  DRAWDOWN: "Drawdown",
  LOW_DATA_QUALITY: "Data-kwaliteit",
};

const TYPE_ICON: Record<DashboardRiskType, typeof ShieldAlert> = {
  POSITION_CONCENTRATION: AlertOctagon,
  POLICY_VIOLATION: ShieldAlert,
  SECTOR_BIAS: Layers,
  CURRENCY_RISK: Globe,
  TOP5_CONCENTRATION: Layers,
  VOLATILITY: Activity,
  DRAWDOWN: TrendingDown,
  LOW_DATA_QUALITY: Database,
};

const SOURCE_LABELS: Record<DashboardRiskAction["sourceEngine"], string> = {
  "risk-engine": "Risk",
  "rebalance-engine": "Rebalance",
  "policy-engine": "Policy",
  "data-quality": "Data-kwaliteit",
};

export function RiskActionCard({ action, rank }: Props) {
  const styles = SEVERITY_STYLES[action.severity];
  const Icon = TYPE_ICON[action.riskType];
  const lowConfidence = action.confidence < 0.6;
  const showConfidenceLine = lowConfidence || action.insufficientData;

  return (
    <Card className={cn("flex h-full flex-col border", styles.container)}>
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md",
                styles.badge,
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {TYPE_LABELS[action.riskType]}
              </p>
              <p className="mt-0.5 text-sm font-medium leading-snug text-foreground">
                {action.title}
              </p>
            </div>
          </div>
          {rank && (
            <span className="rounded-md border border-border/40 bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
              #{rank.current}/{rank.total}
            </span>
          )}
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {action.impact}
        </p>

        <div className="rounded-md border border-border/40 bg-surface-elevated/40 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Wat moet ik doen?
          </p>
          <p className="mt-1 text-xs leading-relaxed text-foreground">
            {action.recommendedAction}
          </p>

          {action.sharesToSell !== undefined &&
            action.sharesToSell > 0 &&
            !action.insufficientData && (
              <dl className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                <div className="rounded-sm bg-surface/60 p-1.5">
                  <dt className="text-muted-foreground">Stuks</dt>
                  <dd className="font-mono font-semibold tabular-nums text-foreground">
                    {action.sharesToSell}
                  </dd>
                </div>
                <div className="rounded-sm bg-surface/60 p-1.5">
                  <dt className="text-muted-foreground">Bedrag</dt>
                  <dd className="font-mono font-semibold tabular-nums text-foreground">
                    €{formatNumber(action.amountToSell ?? 0, 0)}
                  </dd>
                </div>
                <div className="rounded-sm bg-surface/60 p-1.5">
                  <dt className="text-muted-foreground">Nieuwe weging</dt>
                  <dd className="font-mono font-semibold tabular-nums text-foreground">
                    ~{(action.postActionWeight ?? 0).toFixed(1)}%
                  </dd>
                </div>
              </dl>
            )}
        </div>

        {showConfidenceLine && (
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {action.insufficientData ? (
              <>
                <AlertTriangle className="h-3 w-3 text-amber-300" />
                <span>Onvoldoende data — aantallen niet betrouwbaar te bepalen.</span>
              </>
            ) : (
              <>
                <Info className="h-3 w-3" />
                <span>
                  Confidence {(action.confidence * 100).toFixed(0)}% — verifieer in
                  /risico voordat je handelt.
                </span>
              </>
            )}
          </p>
        )}

        <TooltipProvider delayDuration={120} skipDelayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="mt-auto flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Info className="h-3 w-3" /> Bron: {SOURCE_LABELS[action.sourceEngine]}
                </span>
                <span className={cn("font-medium uppercase tracking-wider", styles.accent)}>
                  {action.severity}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              {action.explanation}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}

function formatNumber(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("nl-NL", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
}
