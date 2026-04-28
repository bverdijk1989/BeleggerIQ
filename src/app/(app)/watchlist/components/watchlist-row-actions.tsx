"use client";

import { BellRing, BellOff, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  clearPriceAlert,
  removeFromWatchlist,
  setPriceAlert,
} from "../actions";

/**
 * Per-rij actions:
 *   - Verwijder uit watchlist
 *   - Stel price-alert in (inline editor) of clear 'em
 *   - "+ Portfolio" — link naar /portfolio met query om de gebruiker
 *      naar de import-flow te leiden (geen directe write — dat zou een
 *      portefeuille-keuze vragen).
 */

interface Props {
  itemId: string;
  ticker: string;
  currentTarget: number | null;
  currentTargetHigh: number | null;
  currency: string | null;
}

export function WatchlistRowActions({
  itemId,
  ticker,
  currentTarget,
  currentTargetHigh,
  currency,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [low, setLow] = useState(
    currentTarget !== null ? String(currentTarget) : "",
  );
  const [high, setHigh] = useState(
    currentTargetHigh !== null ? String(currentTargetHigh) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRemove() {
    if (!confirm(`Verwijder ${ticker} uit je watchlist?`)) return;
    startTransition(async () => {
      const r = await removeFromWatchlist({ id: itemId });
      if (!r.ok) setError(r.message ?? "Onbekende fout.");
    });
  }

  function handleSaveAlert() {
    const lowNum = Number(low.replace(",", "."));
    const highNum = high.trim() ? Number(high.replace(",", ".")) : null;
    if (!Number.isFinite(lowNum) || lowNum <= 0) {
      setError("Voer een geldige onderprijs > 0 in.");
      return;
    }
    if (highNum !== null && (!Number.isFinite(highNum) || highNum <= lowNum)) {
      setError("Bovengrens moet groter zijn dan ondergrens.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await setPriceAlert({
        ticker,
        targetPrice: lowNum,
        targetPriceHigh: highNum,
      });
      if (!r.ok) setError(r.message ?? "Onbekende fout.");
      else setEditing(false);
    });
  }

  function handleClear() {
    setError(null);
    startTransition(async () => {
      const r = await clearPriceAlert({ ticker });
      if (!r.ok) setError(r.message ?? "Onbekende fout.");
      else {
        setLow("");
        setHigh("");
        setEditing(false);
      }
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5 text-xs">
        <div className="flex items-center gap-1.5">
          <input
            value={low}
            onChange={(e) => setLow(e.target.value)}
            placeholder="onder"
            inputMode="decimal"
            className="w-20 rounded-md border border-border/60 bg-surface px-2 py-1 text-right tabular-nums"
            disabled={isPending}
          />
          <span className="text-muted-foreground">–</span>
          <input
            value={high}
            onChange={(e) => setHigh(e.target.value)}
            placeholder="boven (opt)"
            inputMode="decimal"
            className="w-20 rounded-md border border-border/60 bg-surface px-2 py-1 text-right tabular-nums"
            disabled={isPending}
          />
          <span className="text-[10px] text-muted-foreground">
            {currency ?? ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" onClick={handleSaveAlert} disabled={isPending}>
            Opslaan
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(false)}
            disabled={isPending}
          >
            Annuleren
          </Button>
          {currentTarget !== null && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClear}
              disabled={isPending}
              title="Alert uit"
            >
              <BellOff className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {error && <p className="text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setEditing(true)}
        title={
          currentTarget !== null
            ? `Alert: ${currentTarget}${currentTargetHigh !== null ? `–${currentTargetHigh}` : ""}`
            : "Stel price-alert in"
        }
      >
        <BellRing
          className={cn(
            "h-3.5 w-3.5",
            currentTarget !== null && "text-primary",
          )}
        />
        <span className="hidden sm:inline">
          {currentTarget !== null ? "Wijzig alert" : "Set alert"}
        </span>
      </Button>
      <a
        href={`/portfolio?addTicker=${encodeURIComponent(ticker)}`}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-foreground hover:bg-surface-elevated"
        title="Voeg deze ticker toe aan een portefeuille"
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Portfolio</span>
      </a>
      <Button
        size="sm"
        variant="ghost"
        onClick={handleRemove}
        disabled={isPending}
        title="Verwijderen"
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      {error && (
        <span className="basis-full text-xs text-destructive">{error}</span>
      )}
    </div>
  );
}
