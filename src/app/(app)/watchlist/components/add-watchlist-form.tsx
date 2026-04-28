"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { addToWatchlist } from "../actions";

/**
 * Inline-form om een ticker aan de watchlist toe te voegen.
 *
 * Naast de screener-flow (die `addToWatchlist` direct aanroept) is
 * dit een handmatige snelle weg — handig voor onderzoek-dossiers van
 * buitenaf.
 */
export function AddWatchlistForm() {
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const r = await addToWatchlist({
        ticker,
        name: name || undefined,
      });
      if (!r.ok) {
        setError(r.message ?? "Onbekende fout.");
      } else {
        setSuccess(r.message ?? null);
        if (r.created) {
          setTicker("");
          setName("");
        }
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-2 rounded-md border border-border/60 bg-surface/60 p-3"
    >
      <div className="min-w-0 flex-1">
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Ticker
        </label>
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="bv. ASML.AS"
          className="mt-1 w-full rounded-md border border-border/60 bg-surface px-2 py-1.5 text-sm uppercase tabular-nums"
          disabled={isPending}
          required
          maxLength={16}
        />
      </div>
      <div className="min-w-0 flex-1">
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Naam (optioneel)
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ASML Holding"
          className="mt-1 w-full rounded-md border border-border/60 bg-surface px-2 py-1.5 text-sm"
          disabled={isPending}
          maxLength={120}
        />
      </div>
      <Button type="submit" size="sm" disabled={isPending || !ticker.trim()}>
        <Plus className="h-4 w-4" />
        {isPending ? "Toevoegen…" : "Toevoegen"}
      </Button>
      {error && (
        <p className="basis-full text-xs text-destructive">{error}</p>
      )}
      {success && !error && (
        <p className="basis-full text-xs text-success">{success}</p>
      )}
    </form>
  );
}
