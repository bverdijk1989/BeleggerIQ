"use client";

import { BookOpen, PlusCircle, TrendingDown, TrendingUp } from "lucide-react";
import { useTransition } from "react";

import { ScorePill } from "@/components/common/score-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ScreenerCandidate } from "@/lib/analytics/screener";
import { formatNumber } from "@/lib/utils";

import { addToWatchlist } from "../actions";

interface ScreenerResultCardProps {
  candidate: ScreenerCandidate;
  rank: number;
  onExplain: (candidate: ScreenerCandidate) => void;
  onWatchlistResult?: (result: {
    ok: boolean;
    message: string;
    ticker: string;
  }) => void;
}

/**
 * Presentationele kaart voor één screener-resultaat. Scores, rank en
 * rationales komen al verrijkt uit `runScreen`; de kaart doet alleen
 * layout + watchlist-actie via server action.
 */
export function ScreenerResultCard({
  candidate,
  rank,
  onExplain,
  onWatchlistResult,
}: ScreenerResultCardProps) {
  const [isPending, startTransition] = useTransition();
  const score = candidate.factorScore.subScores;

  const handleWatchlist = () => {
    startTransition(async () => {
      const result = await addToWatchlist({
        ticker: candidate.ticker,
        name: candidate.name,
      });
      onWatchlistResult?.({
        ok: result.ok,
        message: result.message,
        ticker: candidate.ticker,
      });
    });
  };

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-sm bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] tabular-nums">
                #{rank}
              </span>
              <span className="truncate font-mono text-xs">
                {candidate.ticker}
              </span>
            </div>
            <h3 className="mt-1 truncate text-base font-semibold text-foreground">
              {candidate.name}
            </h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {candidate.sector} · {candidate.region} · {candidate.assetClass}
            </p>
          </div>
          <ScorePill
            score={candidate.factorScore.composite}
            label="Composite"
            className="h-10 min-w-[3.25rem] text-sm font-semibold"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <ScoreBlock label="Quality" score={score.quality} />
          <ScoreBlock label="Value" score={score.value} />
          <ScoreBlock label="Momentum" score={score.momentum} />
        </div>

        <div className="flex-1 space-y-2 text-xs">
          {candidate.strengths.length > 0 && (
            <div className="space-y-1">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-success">
                <TrendingUp className="h-3 w-3" /> Sterk
              </p>
              <ul className="space-y-0.5 text-muted-foreground">
                {candidate.strengths.map((strength) => (
                  <li key={strength}>• {strength}</li>
                ))}
              </ul>
            </div>
          )}
          {candidate.weaknesses.length > 0 && (
            <div className="space-y-1">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                <TrendingDown className="h-3 w-3" /> Zwak
              </p>
              <ul className="space-y-0.5 text-muted-foreground">
                {candidate.weaknesses.map((weakness) => (
                  <li key={weakness}>• {weakness}</li>
                ))}
              </ul>
            </div>
          )}
          {candidate.strengths.length === 0 &&
            candidate.weaknesses.length === 0 && (
              <p className="text-muted-foreground">
                Sub-scores liggen rond het gemiddelde — geen uitgesproken drivers.
              </p>
            )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3">
          {candidate.fundamentals?.marketCap ? (
            <span className="text-[11px] text-muted-foreground">
              Mkt-cap {formatNumber(candidate.fundamentals.marketCap / 1e9, 1)} mld {candidate.currency}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {candidate.currency}
            </span>
          )}
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onExplain(candidate)}
            >
              <BookOpen className="h-3.5 w-3.5" />
              Uitleg
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleWatchlist}
              disabled={isPending}
            >
              <PlusCircle className="h-3.5 w-3.5" />
              {isPending ? "Bezig…" : "Watchlist"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreBlock({
  label,
  score,
}: {
  label: string;
  score: number | null | undefined;
}) {
  return (
    <div className="flex flex-col items-start gap-1 rounded-md bg-surface-muted/50 p-2">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <ScorePill score={score} label={label} className="w-full" />
    </div>
  );
}
