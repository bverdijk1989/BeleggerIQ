import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Compass,
  Info,
} from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  DashboardScenarioCard,
  DashboardScenarioTone,
} from "@/lib/analytics";
import { cn, formatCurrency } from "@/lib/utils";
import type { Currency } from "@/types/common";

/**
 * ScenarioImpactCard — pure presentational kaart per
 * `DashboardScenarioCard`.
 *
 * UX-regels:
 *  - **Cijfers eerst.** Impact in % en € is groot en kleurgecodeerd.
 *  - **Drivers** als compacte ticker-pills (max 3).
 *  - **Voorbereiding** als chip met Compass-icoon — geen "koop nu".
 *  - Bij `indicative=true`: amber-warning met tooltip uit dataWarnings.
 *  - Geen rekenwerk in deze component.
 */

interface Props {
  card: DashboardScenarioCard;
  baseCurrency: Currency;
}

const TONE_STYLES: Record<
  DashboardScenarioTone,
  { container: string; value: string; icon: typeof ArrowDownRight }
> = {
  negative: {
    container: "border-destructive/40 bg-destructive/5",
    value: "text-destructive",
    icon: ArrowDownRight,
  },
  neutral: {
    container: "border-border/60 bg-surface/40",
    value: "text-foreground",
    icon: ArrowRight,
  },
  positive: {
    container: "border-emerald-500/40 bg-emerald-500/5",
    value: "text-emerald-300",
    icon: ArrowUpRight,
  },
};

export function ScenarioImpactCard({ card, baseCurrency }: Props) {
  const tone = TONE_STYLES[card.tone];
  const Icon = tone.icon;
  const pct = card.estimatedImpactPercent * 100;
  const sign = pct > 0 ? "+" : "";

  return (
    <article
      className={cn(
        "flex h-full flex-col gap-2 rounded-md border p-3",
        tone.container,
      )}
      aria-label={`${card.scenarioName}: ${pct.toFixed(1)}%`}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Wat als…
          </p>
          <p className="text-sm font-medium leading-snug text-foreground">
            {card.scenarioName}
          </p>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span
            className={cn(
              "inline-flex items-center gap-1 font-mono text-base font-semibold tabular-nums",
              tone.value,
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {sign}
            {pct.toFixed(1)}%
          </span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {formatCurrency(card.estimatedImpactAmount, baseCurrency, {
              maximumFractionDigits: 0,
            })}
          </span>
        </div>
      </header>

      {card.mainDrivers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Drivers:
          </span>
          {card.mainDrivers.map((ticker) => (
            <span
              key={ticker}
              className="rounded-sm bg-surface-elevated/70 px-1.5 py-0.5 font-mono text-[10px] text-foreground"
            >
              {ticker}
            </span>
          ))}
        </div>
      )}

      <div className="rounded-md border border-border/40 bg-surface-elevated/40 p-2">
        <p className="flex items-start gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Compass className="h-3 w-3" aria-hidden />
          Voorbereiding
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-foreground">
          {card.suggestedPreparation}
        </p>
      </div>

      <TooltipProvider delayDuration={120} skipDelayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="mt-auto flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                {card.indicative ? (
                  <>
                    <AlertTriangle
                      className="h-3 w-3 text-amber-300"
                      aria-hidden
                    />
                    <span className="text-amber-200">Indicatief</span>
                  </>
                ) : (
                  <>
                    <Info className="h-3 w-3" aria-hidden />
                    <span>Indicatief</span>
                  </>
                )}
              </span>
              <span>Confidence {(card.confidence * 100).toFixed(0)}%</span>
            </p>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            <p>{card.description}</p>
            {card.dataWarnings.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {card.dataWarnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-muted-foreground">
              Schatting op basis van sector-shocks; geen exacte voorspelling.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </article>
  );
}
