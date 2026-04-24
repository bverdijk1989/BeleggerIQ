import { PlusCircle, ShoppingBag, Sparkles } from "lucide-react";

import { ScorePill } from "@/components/common/score-pill";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";
import type { AllocationRecommendation } from "@/types/allocation";
import type { Currency } from "@/types/common";

interface RecommendationsGridProps {
  recommendations: AllocationRecommendation[];
  baseCurrency: Currency;
  coreEtfUsed?: boolean;
}

/**
 * Grid van 1–5 recommendation cards. Elke card is presentationeel: rank,
 * actie-badge, bedrag, target weight, sterkste rationale en composite pill.
 */
export function RecommendationsGrid({
  recommendations,
  baseCurrency,
  coreEtfUsed,
}: RecommendationsGridProps) {
  if (recommendations.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {recommendations.map((rec, index) => (
        <RecommendationCard
          key={rec.ticker}
          rec={rec}
          rank={index + 1}
          baseCurrency={baseCurrency}
          highlightCore={coreEtfUsed && rec.ticker === "IWDA"}
        />
      ))}
    </div>
  );
}

interface RecommendationCardProps {
  rec: AllocationRecommendation;
  rank: number;
  baseCurrency: Currency;
  highlightCore?: boolean;
}

function RecommendationCard({
  rec,
  rank,
  baseCurrency,
  highlightCore,
}: RecommendationCardProps) {
  const composite = rec.factorScore?.composite ?? null;
  const isBuy = rec.action === "buy";
  const ActionIcon = isBuy ? ShoppingBag : PlusCircle;
  const actionLabel = isBuy ? "Nieuwe positie" : "Bijkopen";
  const actionClass = isBuy
    ? "bg-primary/15 text-primary border-primary/30"
    : "bg-success/15 text-success border-success/30";

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-sm bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] tabular-nums">
                #{rank}
              </span>
              <span className="font-mono">{rec.ticker}</span>
              {highlightCore && (
                <span className="inline-flex items-center gap-1 rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                  <Sparkles className="h-3 w-3" /> Core
                </span>
              )}
            </div>
            <h3 className="mt-1 truncate text-base font-semibold text-foreground">
              {rec.name ?? rec.ticker}
            </h3>
            <span
              className={cn(
                "mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                actionClass,
              )}
            >
              <ActionIcon className="h-3 w-3" />
              {actionLabel}
            </span>
          </div>
          {composite !== null && (
            <ScorePill
              score={composite}
              label="Composite"
              className="text-sm font-semibold"
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-md border border-border/60 bg-surface/60 p-3">
          <Stat
            label="Bedrag"
            value={formatCurrency(rec.suggestedAmount, baseCurrency)}
            hint={
              rec.suggestedQuantity !== undefined
                ? `~${formatNumber(rec.suggestedQuantity, 4)} stuks`
                : undefined
            }
          />
          <Stat
            label="Target weight"
            value={formatPercent(rec.targetWeight)}
            hint={`nu ${formatPercent(rec.currentWeight)}`}
          />
        </div>

        <div className="flex-1 space-y-2 text-xs">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Waarom deze keuze
          </p>
          <ul className="space-y-1 text-foreground">
            {rec.rationale.slice(0, 3).map((line, i) => (
              <li key={i} className="text-muted-foreground">
                • {line}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
          <span>
            Conviction {Math.round(rec.convictionScore * 100)}/100
          </span>
          {rec.priority !== undefined && (
            <span className="tabular-nums">Priority {rec.priority}/100</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
