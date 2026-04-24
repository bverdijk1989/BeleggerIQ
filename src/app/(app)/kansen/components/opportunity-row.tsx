import { AlertTriangle, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  SIGNAL_LABELS,
  SIGNAL_TONE,
  type OpportunityCandidate,
  type OpportunityConfidence,
  type OpportunitySignal,
  type OpportunitySource,
} from "@/lib/analytics/opportunity-radar";
import { cn, formatCurrency } from "@/lib/utils";

/**
 * OpportunityRow — per-kandidaat card op /kansen. Toont:
 *  - ticker, naam, bron-badge
 *  - composite score pill
 *  - samenvattende summary-zin
 *  - per-signaal sub-cards met rationale + risicoNote
 *  - warnings over data-kwaliteit
 *
 * Pure presentatie. Alle getallen zijn al door `scanOpportunities`
 * bepaald; deze component berekent niets inhoudelijks.
 */

interface Props {
  candidate: OpportunityCandidate;
  rank: number;
}

const SOURCE_LABEL: Record<OpportunitySource, string> = {
  portfolio: "Portefeuille",
  screener: "Screener",
  watchlist: "Watchlist",
};

const SOURCE_BADGE: Record<OpportunitySource, string> = {
  portfolio: "border-primary/30 bg-primary/10 text-primary",
  screener: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  watchlist: "border-violet-500/30 bg-violet-500/10 text-violet-200",
};

const CONFIDENCE_BADGE: Record<
  OpportunityConfidence,
  { label: string; className: string }
> = {
  HIGH: {
    label: "Hoge zekerheid",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  },
  MEDIUM: {
    label: "Matige zekerheid",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  },
  LOW: {
    label: "Lage zekerheid",
    className: "border-red-500/40 bg-red-500/10 text-red-200",
  },
};

export function OpportunityRow({ candidate, rank }: Props) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        {/* Kop */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-sm bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
              #{rank}
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {candidate.name}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {candidate.ticker}
                {candidate.isin ? ` · ${candidate.isin}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ScoreBlock score={candidate.score} />
            <Badge
              variant="outline"
              className={cn("border", SOURCE_BADGE[candidate.source])}
            >
              {SOURCE_LABEL[candidate.source]}
            </Badge>
            <span
              className={cn(
                "rounded-md border px-2 py-0.5 text-[10px] font-medium",
                CONFIDENCE_BADGE[candidate.confidence].className,
              )}
            >
              {CONFIDENCE_BADGE[candidate.confidence].label}
            </span>
          </div>
        </div>

        {/* Summary-zin */}
        <p className="text-sm text-foreground">{candidate.summary}</p>

        {/* Prijs */}
        {candidate.currentPrice !== null && candidate.currency ? (
          <p className="font-mono text-xs text-muted-foreground">
            Koers:{" "}
            {formatCurrency(candidate.currentPrice, candidate.currency, {
              maximumFractionDigits: 2,
            })}
          </p>
        ) : null}

        {/* Per-signaal details */}
        <ul className="space-y-3 border-t border-border/60 pt-4">
          {candidate.signals.map((signal, i) => (
            <SignalDetail key={`${signal.type}-${i}`} signal={signal} />
          ))}
        </ul>

        {/* Data-warnings */}
        {candidate.warnings.length > 0 && (
          <ul className="space-y-1 border-t border-border/60 pt-3">
            {candidate.warnings.map((w, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-amber-200"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Sub-components
// ============================================================

function ScoreBlock({ score }: { score: number }) {
  const tone =
    score >= 80
      ? "border-success/40 bg-success/10 text-success"
      : score >= 60
        ? "border-primary/40 bg-primary/10 text-primary"
        : "border-muted-foreground/40 bg-surface/60 text-muted-foreground";
  return (
    <div
      className={cn(
        "flex min-w-[4.5rem] flex-col items-center justify-center rounded-md border px-2 py-1",
        tone,
      )}
    >
      <span className="font-mono text-lg font-semibold tabular-nums leading-none">
        {Math.round(score)}
      </span>
      <span className="mt-0.5 text-[9px] uppercase tracking-[0.18em] opacity-80">
        score
      </span>
    </div>
  );
}

function SignalDetail({ signal }: { signal: OpportunitySignal }) {
  const tone = SIGNAL_TONE[signal.type];
  return (
    <li className="rounded-md border border-border/60 bg-surface/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
            tone === "positive"
              ? "border-success/30 bg-success/10 text-success"
              : tone === "warning"
                ? "border-warning/30 bg-warning/10 text-warning"
                : "border-primary/30 bg-primary/10 text-primary",
          )}
        >
          {SIGNAL_LABELS[signal.type]}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {Math.round(signal.strength)}/100 · {signal.confidence}
        </span>
      </div>
      {signal.rationale.length > 0 && (
        <ul className="mt-2 space-y-1">
          {signal.rationale.map((r, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-xs text-foreground"
            >
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 flex items-start gap-2 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          <span className="font-semibold text-foreground">Keerzijde:</span>{" "}
          {signal.riskNote}
        </span>
      </p>
    </li>
  );
}
