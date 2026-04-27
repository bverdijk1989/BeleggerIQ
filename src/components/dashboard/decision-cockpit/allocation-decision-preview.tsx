import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Info,
  Layers,
  PieChart,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  ActionImpactSimulation,
  AllocationDistribution,
  ConcentrationSnapshot,
  CurrencyExposureSnapshot,
  ImpactDelta,
} from "@/lib/analytics";
import { cn, formatCurrency } from "@/lib/utils";
import type { Currency } from "@/types/common";

import {
  BeforeAfterToggle,
  type BeforeAfterMode,
} from "./before-after-toggle";

/**
 * AllocationDecisionPreview — "wat gebeurt er als ik dit advies volg?".
 *
 * Toont een toggle (Nu ↔ Na advies) met:
 *   - Belangrijkste verbeteringen (impactSummary, top-3)
 *   - Compacte allocatie-verdeling (top-5 buckets per asset-class)
 *   - Top-5 concentratie + grootste positie
 *   - Risico-score en valuta-exposure
 *
 * Pure presentatie. Alle waardes komen uit `simulateActionImpact`.
 * Toont een amber-warning bij `confidence < 0.5` of `dataWarnings`.
 */

interface Props {
  simulation: ActionImpactSimulation;
  baseCurrency: Currency;
}

export function AllocationDecisionPreview({
  simulation,
  baseCurrency,
}: Props) {
  const lowConfidence = simulation.confidence < 0.5;
  const hasWarnings = simulation.dataWarnings.length > 0;

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <header className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
              <PieChart className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Wat gebeurt er als ik dit advies volg?
              </p>
              <p className="text-sm text-foreground">
                {simulation.appliedActionCount} van{" "}
                {simulation.totalActionCount} acties gesimuleerd. Indicatief —
                geen orders.
              </p>
            </div>
          </div>
        </header>

        <ImpactSummary impacts={simulation.impactSummary} />

        <BeforeAfterToggle
          render={(mode) => (
            <SnapshotView
              mode={mode}
              simulation={simulation}
              baseCurrency={baseCurrency}
            />
          )}
        />

        {(lowConfidence || hasWarnings) && (
          <ConfidenceWarning
            confidence={simulation.confidence}
            warnings={simulation.dataWarnings}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Impact summary — top-3 deltas
// ============================================================

function ImpactSummary({ impacts }: { impacts: ImpactDelta[] }) {
  if (impacts.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {impacts.map((impact, i) => (
        <li
          key={`${impact.headline}-${i}`}
          className="flex items-start gap-2 rounded-md border border-border/40 bg-surface-elevated/40 p-2 text-xs"
        >
          <DirectionIcon direction={impact.direction} />
          <span className="flex-1 leading-snug text-foreground">
            {impact.headline}
          </span>
          <span
            className={cn(
              "font-mono font-semibold tabular-nums",
              impact.direction === "improve" && "text-emerald-300",
              impact.direction === "worsen" && "text-destructive",
              impact.direction === "neutral" && "text-muted-foreground",
            )}
          >
            {impact.delta}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DirectionIcon({
  direction,
}: {
  direction: ImpactDelta["direction"];
}) {
  switch (direction) {
    case "improve":
      return <ArrowDownRight className="h-3.5 w-3.5 text-emerald-300" aria-hidden />;
    case "worsen":
      return <ArrowUpRight className="h-3.5 w-3.5 text-destructive" aria-hidden />;
    case "neutral":
    default:
      return <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />;
  }
}

// ============================================================
//  Snapshot view — compact verdeling + concentratie + fx
// ============================================================

interface SnapshotViewProps {
  mode: BeforeAfterMode;
  simulation: ActionImpactSimulation;
  baseCurrency: Currency;
}

function SnapshotView({ mode, simulation, baseCurrency }: SnapshotViewProps) {
  const allocation =
    mode === "current"
      ? simulation.currentAllocation
      : simulation.simulatedAllocation;
  const concentration =
    mode === "current"
      ? simulation.currentTop5Concentration
      : simulation.simulatedTop5Concentration;
  const currency =
    mode === "current"
      ? simulation.currentCurrencyExposure
      : simulation.simulatedCurrencyExposure;
  const riskScore =
    mode === "current"
      ? simulation.currentRiskScore
      : simulation.simulatedRiskScore;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <AllocationBars
        title="Asset-class verdeling"
        allocation={allocation}
        baseCurrency={baseCurrency}
      />
      <div className="flex flex-col gap-3">
        <ConcentrationBlock concentration={concentration} />
        <CurrencyBlock exposure={currency} baseCurrency={baseCurrency} />
        <RiskScoreBlock score={riskScore} />
      </div>
    </div>
  );
}

function AllocationBars({
  title,
  allocation,
  baseCurrency,
}: {
  title: string;
  allocation: AllocationDistribution;
  baseCurrency: Currency;
}) {
  const top = allocation.byAssetClass.slice(0, 5);
  return (
    <div className="rounded-md border border-border/40 bg-surface/40 p-3">
      <header className="flex items-center justify-between gap-2 pb-2">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Layers className="h-3 w-3" aria-hidden /> {title}
        </p>
        <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {formatCurrency(allocation.totalValue, baseCurrency, {
            maximumFractionDigits: 0,
          })}
        </p>
      </header>

      {top.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Geen verdeling beschikbaar.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {top.map((slice) => (
            <li key={slice.label} className="space-y-0.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-foreground">{slice.label}</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {(slice.weight * 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-elevated">
                <div
                  className="h-full rounded-full bg-primary/60"
                  style={{
                    width: `${Math.min(100, Math.max(0, slice.weight * 100))}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConcentrationBlock({
  concentration,
}: {
  concentration: ConcentrationSnapshot;
}) {
  return (
    <div className="rounded-md border border-border/40 bg-surface/40 p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Sparkles className="h-3 w-3" aria-hidden /> Top-5 concentratie
      </p>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <Stat label="Top 5" value={`${(concentration.top5Weight * 100).toFixed(1)}%`} />
        <Stat
          label="Grootste"
          value={`${(concentration.largestPositionWeight * 100).toFixed(1)}%`}
        />
        <Stat
          label="Spreiding"
          value={concentration.hhi.toFixed(2)}
          hint="Spreidings-index: 0 = perfect verdeeld, 1 = alles in één positie."
        />
      </dl>
    </div>
  );
}

function CurrencyBlock({
  exposure,
  baseCurrency,
}: {
  exposure: CurrencyExposureSnapshot;
  baseCurrency: Currency;
}) {
  return (
    <div className="rounded-md border border-border/40 bg-surface/40 p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <PieChart className="h-3 w-3" aria-hidden /> Valuta-exposure
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        <Stat
          label={baseCurrency}
          value={`${(exposure.baseCurrencyWeight * 100).toFixed(1)}%`}
        />
        <Stat
          label="Vreemd"
          value={`${(exposure.foreignCurrencyWeight * 100).toFixed(1)}%`}
        />
      </dl>
      {exposure.topForeign.length > 0 && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Top vreemd:{" "}
          {exposure.topForeign
            .map((s) => `${s.label} ${(s.weight * 100).toFixed(1)}%`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

function RiskScoreBlock({ score }: { score: number }) {
  const tone =
    score >= 67
      ? { label: "Hoog", icon: TrendingUp, className: "text-destructive" }
      : score >= 34
        ? {
            label: "Gemiddeld",
            icon: ArrowRight,
            className: "text-amber-300",
          }
        : { label: "Laag", icon: TrendingDown, className: "text-emerald-300" };
  const ToneIcon = tone.icon;
  return (
    <div className="rounded-md border border-border/40 bg-surface/40 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Risico-score
      </p>
      <div className="mt-1 flex items-center gap-2">
        <ToneIcon className={cn("h-3.5 w-3.5", tone.className)} aria-hidden />
        <span className="font-mono text-base font-semibold tabular-nums text-foreground">
          {score.toFixed(1)}
          <span className="text-[10px] text-muted-foreground">/100</span>
        </span>
        <span className={cn("text-[10px] font-medium uppercase", tone.className)}>
          {tone.label}
        </span>
      </div>
    </div>
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
  if (!hint) {
    return (
      <div className="rounded-sm bg-surface-elevated/60 p-1.5">
        <dt className="text-[10px] text-muted-foreground">{label}</dt>
        <dd className="font-mono text-xs font-semibold tabular-nums text-foreground">
          {value}
        </dd>
      </div>
    );
  }
  return (
    <TooltipProvider delayDuration={120} skipDelayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-help rounded-sm bg-surface-elevated/60 p-1.5">
            <dt className="text-[10px] text-muted-foreground">{label}</dt>
            <dd className="font-mono text-xs font-semibold tabular-nums text-foreground">
              {value}
            </dd>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {hint}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ConfidenceWarning({
  confidence,
  warnings,
}: {
  confidence: number;
  warnings: string[];
}) {
  const firstWarning = warnings[0];
  return (
    <TooltipProvider delayDuration={120} skipDelayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <p className="flex items-start gap-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[10px] text-amber-200">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span>
              Simulatie indicatief — confidence{" "}
              {(confidence * 100).toFixed(0)}%
              {warnings.length > 0 && ` · ${warnings.length} datawaarschuwing${warnings.length === 1 ? "" : "en"}`}
              .
            </span>
          </p>
        </TooltipTrigger>
        {firstWarning && (
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            {firstWarning}
            {warnings.length > 1 && (
              <span className="block text-muted-foreground">
                en {warnings.length - 1} andere…
              </span>
            )}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
