import {
  Compass,
  Eye,
  Plus,
  Sparkles,
  Timer,
  Info,
  AlertTriangle,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  OPPORTUNITY_TYPE_LABELS,
  type DashboardOpportunity,
  type DashboardSuggestedNextStep,
  type OpportunityRiskLevel,
} from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * OpportunityCard — pure presentatie van één `DashboardOpportunity`.
 *
 * UX-regels:
 *  - **Score + confidence** zijn primair zichtbaar (rechtsboven).
 *  - **suggestedNextStep** is een chip met een neutraal werkwoord
 *    ("onderzoeken" / "kleine bijkoop overwegen" / "wachten op target") —
 *    nooit "koop nu".
 *  - Bij `lowConfidence=true`: amber-warning met `lowConfidenceReason`.
 *  - Risk-level subtiel met een gekleurd dotje (geen koppen).
 *  - Geen rekenwerk in deze component.
 */

interface Props {
  opportunity: DashboardOpportunity;
  rank?: { current: number; total: number };
}

const NEXT_STEP_STYLES: Record<
  DashboardSuggestedNextStep,
  {
    container: string;
    icon: typeof Compass;
  }
> = {
  onderzoeken: {
    container: "border-primary/40 bg-primary/10 text-primary",
    icon: Compass,
  },
  "kleine bijkoop overwegen": {
    container: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    icon: Plus,
  },
  "wachten op target": {
    container: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    icon: Timer,
  },
};

const RISK_DOT: Record<OpportunityRiskLevel, string> = {
  LOW: "bg-emerald-500",
  MEDIUM: "bg-amber-500",
  HIGH: "bg-destructive",
};

const RISK_LABELS: Record<OpportunityRiskLevel, string> = {
  LOW: "Laag risico",
  MEDIUM: "Middel risico",
  HIGH: "Hoog risico",
};

const SOURCE_LABELS: Record<DashboardOpportunity["source"], string> = {
  portfolio: "Portefeuille",
  screener: "Screener",
  watchlist: "Watchlist",
};

export function OpportunityCard({ opportunity, rank }: Props) {
  const stepStyle = NEXT_STEP_STYLES[opportunity.suggestedNextStep];
  const StepIcon = stepStyle.icon;

  return (
    <Card className="flex h-full flex-col border border-border/50 bg-surface/40">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {OPPORTUNITY_TYPE_LABELS[opportunity.opportunityType]}
              </p>
              <p className="mt-0.5 truncate text-sm font-medium leading-snug text-foreground">
                {opportunity.name}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {opportunity.symbol}
                {opportunity.currentWeight !== null &&
                  ` · ${(opportunity.currentWeight * 100).toFixed(1)}% in port.`}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {rank && (
              <span className="rounded-md border border-border/40 bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                #{rank.current}/{rank.total}
              </span>
            )}
            <span className="font-mono text-base font-semibold tabular-nums text-foreground">
              {Math.round(opportunity.score)}
              <span className="text-[10px] text-muted-foreground">/100</span>
            </span>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {opportunity.reason}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold",
              stepStyle.container,
            )}
          >
            <StepIcon className="h-3 w-3" aria-hidden />
            {opportunity.suggestedNextStep}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-surface-elevated px-2 py-1 text-[10px] text-muted-foreground">
            <Eye className="h-3 w-3" aria-hidden />
            Confidence {(opportunity.confidence * 100).toFixed(0)}%
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-surface-elevated px-2 py-1 text-[10px] text-muted-foreground"
            aria-label={RISK_LABELS[opportunity.riskLevel]}
          >
            <span className={cn("h-2 w-2 rounded-full", RISK_DOT[opportunity.riskLevel])} />
            {RISK_LABELS[opportunity.riskLevel]}
          </span>
        </div>

        {opportunity.lowConfidence && opportunity.lowConfidenceReason && (
          <p className="flex items-start gap-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[10px] text-amber-200">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span>{opportunity.lowConfidenceReason}</span>
          </p>
        )}

        <TooltipProvider delayDuration={120} skipDelayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="mt-auto flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Info className="h-3 w-3" aria-hidden /> Bron:{" "}
                  {SOURCE_LABELS[opportunity.source]}
                </span>
                <span>Horizon {opportunity.expectedHorizon}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              <p>{opportunity.reason}</p>
              {opportunity.score !== opportunity.baselineScore && (
                <p className="mt-1 text-muted-foreground">
                  Radar-score: {Math.round(opportunity.baselineScore)}/100 (na rerank: {Math.round(opportunity.score)}).
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
