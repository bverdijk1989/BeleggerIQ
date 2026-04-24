"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ScreenerCandidate } from "@/lib/analytics/screener";
import { cn } from "@/lib/utils";

import { ScreenerDetailDrawer } from "./screener-detail-drawer";
import { ScreenerResultCard } from "./screener-result-card";

interface ScreenerResultsProps {
  candidates: ScreenerCandidate[];
}

interface WatchlistToast {
  id: number;
  ok: boolean;
  message: string;
}

/**
 * Client-side wrapper die selectie-state + watchlist feedback beheert.
 * De onderliggende kaarten en drawer blijven dom — deze component
 * koppelt ze aan één gedeelde staat.
 */
export function ScreenerResults({ candidates }: ScreenerResultsProps) {
  const [selected, setSelected] = useState<ScreenerCandidate | null>(null);
  const [toast, setToast] = useState<WatchlistToast | null>(null);

  // Auto-dismiss de toast na 4s zodat hij niet opstapelt.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleWatchlistResult = (result: {
    ok: boolean;
    message: string;
  }) => {
    setToast({ id: Date.now(), ok: result.ok, message: result.message });
  };

  return (
    <TooltipProvider delayDuration={120}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {candidates.map((candidate, i) => (
          <ScreenerResultCard
            key={candidate.ticker}
            rank={i + 1}
            candidate={candidate}
            onExplain={(c) => setSelected(c)}
            onWatchlistResult={handleWatchlistResult}
          />
        ))}
      </div>

      <ScreenerDetailDrawer
        candidate={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        onWatchlistResult={handleWatchlistResult}
      />

      {toast && (
        <div
          className={cn(
            "fixed bottom-6 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-center gap-3 rounded-md border px-4 py-2 text-sm shadow-premium",
            toast.ok
              ? "border-success/40 bg-success/10 text-success"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
          role="status"
          aria-live="polite"
        >
          {toast.ok ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </TooltipProvider>
  );
}
