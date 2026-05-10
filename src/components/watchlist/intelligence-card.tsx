import type { Route } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Eye,
  Minus,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import {
  TONE_STYLES,
  type CockpitTone,
} from "@/components/dashboard/decision-cockpit/tone";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  SignalDirection,
  WatchlistAlternative,
  WatchlistIntelligenceReport,
  WatchlistSignal,
} from "@/lib/watchlist-intelligence";
import { cn } from "@/lib/utils";

/**
 * IntelligenceCard — toont per watchlist-ticker een rijk overzicht met
 * 7 signaal-pills, alternatives, en de "waarom interessant"-zin.
 *
 * Pure presentational — alle logica zit in de engine.
 */

interface Props {
  ticker: string;
  name: string;
  /** Live prijs in lokale currency. */
  price: number | null;
  currency: string | null;
  /** Δ dag, fractie. */
  dayChange: number | null;
  intelligence: WatchlistIntelligenceReport;
  /** Optionele targetzone voor mini-context. */
  targetPrice?: number | null;
  targetPriceHigh?: number | null;
}

const TIER_TONE: Record<WatchlistIntelligenceReport["tier"], CockpitTone> = {
  STRONG_OPPORTUNITY: "good",
  POSITIVE: "good",
  NEUTRAL: "neutral",
  WAIT: "warning",
};

const TIER_LABEL: Record<WatchlistIntelligenceReport["tier"], string> = {
  STRONG_OPPORTUNITY: "Sterke kans",
  POSITIVE: "Positief",
  NEUTRAL: "Neutraal",
  WAIT: "Nog wachten",
};

const DIRECTION_TONE: Record<SignalDirection, string> = {
  positive: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  negative: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  neutral: "border-border/40 bg-muted/20 text-muted-foreground",
};

const DIRECTION_ICON: Record<SignalDirection, typeof TrendingUp> = {
  positive: TrendingUp,
  negative: TrendingDown,
  neutral: Minus,
};

export function IntelligenceCard({
  ticker,
  name,
  price,
  currency,
  dayChange,
  intelligence,
  targetPrice,
  targetPriceHigh,
}: Props) {
  const tone = TIER_TONE[intelligence.tier];
  const styles = TONE_STYLES[tone];
  const detailHref: Route = `/score/${encodeURIComponent(ticker)}` as Route;

  return (
    <Card className={cn("border", styles.container)}>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Eye className={cn("h-4 w-4 shrink-0", styles.iconFg)} aria-hidden />
              <span className="font-mono">{ticker}</span>
              <span className="truncate text-sm font-normal text-muted-foreground">
                {name}
              </span>
            </CardTitle>
            <CardDescription className="text-xs">
              {intelligence.headline}
            </CardDescription>
          </div>
          <Badge variant="outline" className={cn("shrink-0 text-[10px]", styles.chip)}>
            {TIER_LABEL[intelligence.tier]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Quote + target-zone */}
        {price !== null && (
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              Prijs:{" "}
              <span className="font-mono text-foreground">
                {price.toFixed(2)}
                {currency ? ` ${currency}` : ""}
              </span>
              {typeof dayChange === "number" && (
                <span
                  className={cn(
                    "ml-2 font-mono",
                    dayChange >= 0 ? "text-emerald-300" : "text-amber-300",
                  )}
                >
                  {dayChange >= 0 ? "+" : ""}
                  {(dayChange * 100).toFixed(1)}%
                </span>
              )}
            </span>
            {(targetPrice !== null && targetPrice !== undefined) && (
              <span className="text-muted-foreground">
                Target:{" "}
                <span className="font-mono text-foreground">
                  {targetPrice.toFixed(2)}
                  {targetPriceHigh ? `–${targetPriceHigh.toFixed(2)}` : ""}
                </span>
              </span>
            )}
          </div>
        )}

        {/* Signal-pills */}
        <div className="flex flex-wrap gap-1.5">
          {intelligence.signals.map((s) => (
            <SignalPill key={s.key} signal={s} />
          ))}
        </div>

        {/* Why interesting */}
        <p className="rounded-md border border-border/40 bg-muted/10 p-3 text-xs text-muted-foreground">
          {intelligence.whyInteresting}
        </p>

        {/* Alternatives */}
        {intelligence.alternatives.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <p className="flex items-center gap-1 font-semibold text-amber-200">
              <Sparkles className="h-3 w-3" aria-hidden />
              Alternatieven met sterker profiel
            </p>
            <ul className="mt-1.5 space-y-1">
              {intelligence.alternatives.map((alt) => (
                <AlternativeRow key={alt.ticker} alt={alt} />
              ))}
            </ul>
          </div>
        )}

        {/* Footer-link naar volledige confidence-page */}
        <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-muted-foreground">
          <span>Bronnen: {intelligence.sources.join(" · ")}</span>
          <Link
            href={detailHref}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            Volledige score
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function SignalPill({ signal }: { signal: WatchlistSignal }) {
  const Icon = DIRECTION_ICON[signal.direction];
  const tone = DIRECTION_TONE[signal.direction];
  return (
    <span
      title={signal.rationale}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
        signal.available ? tone : "border-border/40 bg-muted/10 text-muted-foreground opacity-60",
      )}
    >
      {signal.available ? (
        <Icon className="h-2.5 w-2.5" aria-hidden />
      ) : (
        <Minus className="h-2.5 w-2.5" aria-hidden />
      )}
      {signal.label}
      {signal.available && signal.metric !== null && signal.metric !== undefined && (
        <span className="ml-0.5 font-mono">
          {Math.abs(signal.metric) >= 100
            ? Math.round(signal.metric)
            : signal.metric.toFixed(0)}
        </span>
      )}
    </span>
  );
}

function AlternativeRow({ alt }: { alt: WatchlistAlternative }) {
  const detailHref: Route =
    `/score/${encodeURIComponent(alt.ticker)}` as Route;
  return (
    <li className="flex items-center justify-between gap-2 text-foreground">
      <Link
        href={detailHref}
        className="min-w-0 truncate font-medium hover:underline"
      >
        {alt.ticker}{" "}
        <span className="text-muted-foreground">· {alt.name}</span>
      </Link>
      <span className="shrink-0 text-[10px]">
        <Badge variant="outline" className="text-[9px]">
          {alt.source === "portfolio" ? "Portfolio" : "Watchlist"}
        </Badge>{" "}
        <span className="font-mono">
          {alt.compositeScore.toFixed(0)}/100
        </span>
      </span>
    </li>
  );
}
