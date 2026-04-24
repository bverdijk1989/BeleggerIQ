import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  SIGNAL_LABELS,
  type OpportunityCandidate,
  type OpportunityConfidence,
  type OpportunitySource,
} from "@/lib/analytics/opportunity-radar";
import { cn } from "@/lib/utils";

/**
 * TopKansenCard — compacte dashboard-widget voor de Opportunity Radar.
 *
 * Toont top-3 kandidaten met score, bron, top-signaal en summary. Voor
 * volledige details (rationale, keerzijde, andere signalen) linkt de
 * kaart naar /kansen.
 *
 * Pure presentatie. De backing scan gebeurt server-side op de dashboard-
 * pagina; deze widget rendert alleen wat hij binnenkrijgt.
 */

interface Props {
  candidates: OpportunityCandidate[];
  limit?: number;
}

const SOURCE_LABEL: Record<OpportunitySource, string> = {
  portfolio: "Portefeuille",
  screener: "Screener",
  watchlist: "Watchlist",
};

const SOURCE_TONE: Record<OpportunitySource, string> = {
  portfolio: "bg-primary/10 text-primary",
  screener: "bg-sky-500/10 text-sky-200",
  watchlist: "bg-violet-500/10 text-violet-200",
};

const CONFIDENCE_TONE: Record<OpportunityConfidence, string> = {
  HIGH: "bg-emerald-500/15 text-emerald-200",
  MEDIUM: "bg-amber-500/15 text-amber-200",
  LOW: "bg-red-500/15 text-red-200",
};

export function TopKansenCard({ candidates, limit = 3 }: Props) {
  const top = candidates.slice(0, limit);

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Top kansen
              </p>
              <p className="text-sm text-foreground">
                Systematische signalen uit portefeuille, screener en watchlist.
              </p>
            </div>
          </div>
          <Button size="sm" variant="ghost" asChild>
            <Link href="/kansen">
              Radar <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {top.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Geen actieve signalen boven de drempel — check later opnieuw.
          </p>
        ) : (
          <ul className="space-y-2">
            {top.map((candidate, i) => (
              <TopKansenRow
                key={`${candidate.source}-${candidate.ticker}`}
                candidate={candidate}
                rank={i + 1}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TopKansenRow({
  candidate,
  rank,
}: {
  candidate: OpportunityCandidate;
  rank: number;
}) {
  const top = candidate.signals[0];
  return (
    <li className="flex items-start gap-3 rounded-md border border-border/60 bg-surface/60 p-3">
      <span className="mt-0.5 rounded-sm bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
        #{rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {candidate.name}
          </p>
          <span
            className={cn(
              "shrink-0 rounded-md px-2 py-0.5 font-mono text-xs font-semibold tabular-nums",
              candidate.score >= 80
                ? "bg-success/15 text-success"
                : candidate.score >= 60
                  ? "bg-primary/15 text-primary"
                  : "bg-surface-elevated text-muted-foreground",
            )}
          >
            {Math.round(candidate.score)}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] text-muted-foreground">
            {candidate.ticker}
          </span>
          <span
            className={cn(
              "rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
              SOURCE_TONE[candidate.source],
            )}
          >
            {SOURCE_LABEL[candidate.source]}
          </span>
          <span
            className={cn(
              "rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
              CONFIDENCE_TONE[candidate.confidence],
            )}
          >
            {candidate.confidence}
          </span>
        </div>
        {top && (
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {SIGNAL_LABELS[top.type]}
            </span>
            {candidate.signals.length > 1
              ? ` · +${candidate.signals.length - 1} ander${candidate.signals.length - 1 === 1 ? "" : "e"}`
              : ""}
          </p>
        )}
      </div>
    </li>
  );
}
