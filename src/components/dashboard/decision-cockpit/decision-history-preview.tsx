"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Check,
  Clock,
  History,
  Info,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  DecisionHistorySummary,
  DecisionRecord,
  DecisionStatus,
} from "@/lib/analytics/decision-history";
import { cn } from "@/lib/utils";
import type { Currency } from "@/types/common";

/**
 * DecisionHistoryPreview — kleine preview onderaan de cockpit.
 *
 * Toont de top-3 meest recente advies-records uit `summarizeDecisionHistory`
 * en laat de gebruiker per record markeren als "Gedaan" of "Genegeerd"
 * via een PATCH /api/decisions/[id]/status. Pure presentatie + één
 * fetch-call per actie; alle ranking en samenvatting komt uit de
 * server-side aggregator.
 *
 * **Geen broker-call.** "Gedaan" is een self-report — wij verifiëren
 * niet dat er daadwerkelijk een order is uitgevoerd.
 */

interface Props {
  summary: DecisionHistorySummary;
  baseCurrency: Currency;
}

const STATUS_LABEL: Record<DecisionStatus, string> = {
  SUGGESTED: "Open",
  MARKED_DONE: "Gedaan",
  IGNORED: "Genegeerd",
  EXPIRED: "Verlopen",
};

const STATUS_STYLE: Record<DecisionStatus, string> = {
  SUGGESTED: "bg-primary/15 text-primary",
  MARKED_DONE: "bg-emerald-500/15 text-emerald-200",
  IGNORED: "bg-muted/30 text-muted-foreground",
  EXPIRED: "bg-amber-500/15 text-amber-200",
};

export function DecisionHistoryPreview({ summary, baseCurrency }: Props) {
  const [items, setItems] = useState<DecisionRecord[]>(summary.recent);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const headline = useMemo(() => {
    if (items.length === 0) return summary.headline;
    return summary.headline;
  }, [items.length, summary.headline]);

  const updateStatus = (id: string, status: "MARKED_DONE" | "IGNORED") => {
    setBusyId(id);
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/decisions/${id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error ?? "Kon status niet bijwerken.");
        }
        const updated = (await response.json()) as DecisionRecord;
        setItems((prev) =>
          prev.map((r) => (r.id === updated.id ? updated : r)),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Onbekende fout.");
      } finally {
        setBusyId(null);
      }
    });
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <header className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
              <History className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Adviesgeschiedenis
              </p>
              <p className="text-sm text-foreground">{headline}</p>
            </div>
          </div>
          <BucketPills counts={summary.bucketCounts} />
        </header>

        {items.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 bg-surface/40 p-3 text-sm text-muted-foreground">
            Nog geen adviezen vastgelegd. Zodra de cockpit acties voorstelt,
            verschijnen ze hier en kun je ze markeren als gedaan of
            genegeerd.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-2 rounded-md border border-border/40 bg-surface/40 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-md border border-border/30 px-2 py-0.5 text-[10px] font-semibold",
                        STATUS_STYLE[r.status],
                      )}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {formatDate(r.suggestedAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-snug text-foreground">
                    {r.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {summarizeAmount(r, baseCurrency)} · confidence{" "}
                    {(r.confidence * 100).toFixed(0)}%
                  </p>
                </div>
                {r.status === "SUGGESTED" && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => updateStatus(r.id, "MARKED_DONE")}
                      disabled={busyId === r.id || pending}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
                      Gedaan
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => updateStatus(r.id, "IGNORED")}
                      disabled={busyId === r.id || pending}
                    >
                      <X className="mr-1 h-3.5 w-3.5" aria-hidden />
                      Negeer
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p className="flex items-center gap-1 text-[11px] text-destructive">
            <Info className="h-3 w-3" aria-hidden />
            {error}
          </p>
        )}

        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" aria-hidden />
          Geen broker-koppeling — &ldquo;Gedaan&rdquo; is een eigen
          notitie voor evaluatie.
        </p>
      </CardContent>
    </Card>
  );
}

function BucketPills({
  counts,
}: {
  counts: Record<DecisionStatus, number>;
}) {
  const visible: Array<[DecisionStatus, number]> = (
    [
      ["SUGGESTED", counts.SUGGESTED],
      ["MARKED_DONE", counts.MARKED_DONE],
      ["IGNORED", counts.IGNORED],
      ["EXPIRED", counts.EXPIRED],
    ] satisfies Array<[DecisionStatus, number]>
  ).filter(([, n]) => n > 0);
  if (visible.length === 0) return null;

  return (
    <TooltipProvider delayDuration={120} skipDelayDuration={0}>
      <div className="flex flex-wrap items-center gap-1">
        {visible.map(([status, n]) => (
          <Tooltip key={status}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "rounded-md border border-border/30 px-1.5 py-0.5 text-[10px] font-semibold",
                  STATUS_STYLE[status],
                )}
              >
                {STATUS_LABEL[status]} {n}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {n} {STATUS_LABEL[status].toLowerCase()}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

// ============================================================
//  Helpers
// ============================================================

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("nl-NL", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function summarizeAmount(
  record: DecisionRecord,
  baseCurrency: Currency,
): string {
  const parts: string[] = [];
  if (record.symbol) parts.push(record.symbol);
  if (record.shares !== null && record.shares > 0) {
    parts.push(`${record.shares} stuk${record.shares === 1 ? "" : "s"}`);
  }
  if (record.amount !== null && record.amount > 0) {
    parts.push(formatCurrency(record.amount, baseCurrency));
  }
  if (parts.length === 0) parts.push(record.actionType.replace("_", " "));
  return parts.join(" · ");
}

function formatCurrency(value: number, currency: Currency): string {
  try {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toFixed(0)} ${currency}`;
  }
}
