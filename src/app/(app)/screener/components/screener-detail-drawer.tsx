"use client";

import { PlusCircle } from "lucide-react";
import { useTransition } from "react";

import { ScorePill } from "@/components/common/score-pill";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ScreenerCandidate } from "@/lib/analytics/screener";
import type { FundamentalsSnapshot } from "@/types/factor";
import { formatNumber } from "@/lib/utils";

import { addToWatchlist } from "../actions";

interface ScreenerDetailDrawerProps {
  candidate: ScreenerCandidate | null;
  onOpenChange: (open: boolean) => void;
  onWatchlistResult?: (result: {
    ok: boolean;
    message: string;
    ticker: string;
  }) => void;
}

/**
 * Detail drawer voor een screener-candidate. Toont volledige
 * factor-rationales plus de fundamentals snapshot. Alle data komt
 * door; geen extra server calls.
 */
export function ScreenerDetailDrawer({
  candidate,
  onOpenChange,
  onWatchlistResult,
}: ScreenerDetailDrawerProps) {
  const [isPending, startTransition] = useTransition();

  const handleWatchlist = () => {
    if (!candidate) return;
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
    <Sheet open={candidate !== null} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-6 overflow-y-auto sm:max-w-xl">
        {candidate && (
          <>
            <SheetHeader>
              <SheetDescription className="font-mono text-xs uppercase tracking-wider">
                {candidate.ticker} · {candidate.sector} · {candidate.region}
              </SheetDescription>
              <SheetTitle>{candidate.name}</SheetTitle>
            </SheetHeader>

            <div className="grid grid-cols-2 gap-2">
              <DetailScore
                label="Quality"
                score={candidate.factorScore.subScores.quality}
                rationales={candidate.factorScore.rationales?.quality ?? []}
              />
              <DetailScore
                label="Value"
                score={candidate.factorScore.subScores.value}
                rationales={candidate.factorScore.rationales?.value ?? []}
              />
              <DetailScore
                label="Momentum"
                score={candidate.factorScore.subScores.momentum}
                rationales={candidate.factorScore.rationales?.momentum ?? []}
              />
              <DetailScore
                label="Risk"
                score={candidate.factorScore.subScores.lowVol}
                rationales={candidate.factorScore.rationales?.lowVol ?? []}
              />
            </div>

            <div className="rounded-md border border-border/60 bg-surface p-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Totaalscore
                </p>
                <ScorePill
                  score={candidate.factorScore.composite}
                  label="Composite"
                  className="text-sm font-semibold"
                />
              </div>
              {candidate.factorScore.rationales?.composite && (
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {candidate.factorScore.rationales.composite.map(
                    (reason, i) => (
                      <li key={i}>• {reason}</li>
                    ),
                  )}
                </ul>
              )}
              {candidate.factorScore.confidence !== undefined && (
                <p className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Coverage {Math.round(candidate.factorScore.confidence * 100)}% ·
                  Model {candidate.factorScore.model ?? "—"}
                </p>
              )}
            </div>

            <FundamentalsBlock
              fundamentals={candidate.fundamentals}
              currency={candidate.currency}
            />

            <div className="mt-auto flex items-center justify-end gap-2 border-t border-border/60 pt-4">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Sluiten
              </Button>
              <Button onClick={handleWatchlist} disabled={isPending}>
                <PlusCircle className="h-4 w-4" />
                {isPending ? "Bezig…" : "Voeg toe aan watchlist"}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailScore({
  label,
  score,
  rationales,
}: {
  label: string;
  score: number | null | undefined;
  rationales: string[];
}) {
  return (
    <div className="rounded-md border border-border/60 bg-surface/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </span>
        <ScorePill score={score} label={label} />
      </div>
      {rationales.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          {rationales.slice(0, 3).map((reason, i) => (
            <li key={i}>• {reason}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Geen rationale.</p>
      )}
    </div>
  );
}

function FundamentalsBlock({
  fundamentals,
  currency,
}: {
  fundamentals: FundamentalsSnapshot | null;
  currency: string;
}) {
  if (!fundamentals) {
    return (
      <p className="text-xs text-muted-foreground">
        Geen fundamentals beschikbaar.
      </p>
    );
  }

  const rows: Array<[string, string]> = [];
  if (fundamentals.marketCap) {
    rows.push([
      "Market cap",
      `${formatNumber(fundamentals.marketCap / 1e9, 1)} mld ${currency}`,
    ]);
  }
  if (fundamentals.pe !== undefined)
    rows.push(["P/E", formatNumber(fundamentals.pe, 1)]);
  if (fundamentals.pb !== undefined)
    rows.push(["P/B", formatNumber(fundamentals.pb, 2)]);
  if (fundamentals.evEbitda !== undefined)
    rows.push(["EV/EBITDA", formatNumber(fundamentals.evEbitda, 1)]);
  if (fundamentals.fcfYield !== undefined)
    rows.push([
      "FCF yield",
      `${(fundamentals.fcfYield * 100).toFixed(1)}%`,
    ]);
  if (fundamentals.dividendYield !== undefined)
    rows.push([
      "Dividendrendement",
      `${(fundamentals.dividendYield * 100).toFixed(2)}%`,
    ]);
  if (fundamentals.roic !== undefined)
    rows.push(["ROIC", `${(fundamentals.roic * 100).toFixed(1)}%`]);
  if (fundamentals.roe !== undefined)
    rows.push(["ROE", `${(fundamentals.roe * 100).toFixed(1)}%`]);
  if (fundamentals.debtToEquity !== undefined)
    rows.push(["Debt/Equity", formatNumber(fundamentals.debtToEquity, 2)]);
  if (fundamentals.operatingMargin !== undefined)
    rows.push([
      "Operationele marge",
      `${(fundamentals.operatingMargin * 100).toFixed(1)}%`,
    ]);

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Fundamentals leeg — provider kon geen ratio&apos;s leveren.
      </p>
    );
  }

  return (
    <div className="rounded-md border border-border/60 bg-surface p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Fundamentals snapshot
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
