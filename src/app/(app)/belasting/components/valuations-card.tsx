"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ValuationOutcome } from "@/lib/tax/year-boundary";
import { cn } from "@/lib/utils";

import { saveManualValuation, deleteManualValuation } from "../actions";

interface ValuationsCardProps {
  portfolioId: string;
  baseCurrency: string;
  outcomes: ValuationOutcome[];
}

export function ValuationsCard({
  portfolioId,
  baseCurrency,
  outcomes,
}: ValuationsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Peildatum-waarden (1 januari)</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          Voor box 3 telt je portefeuille-waarde op 1 januari 00:00.
          Wij pakken bij voorkeur een snapshot binnen ± 14 dagen; mist
          die, dan kun je de waarde handmatig invoeren.
        </p>
        <div className="overflow-hidden rounded-md border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Belastingjaar</th>
                <th className="px-3 py-2 text-left">Peildatum</th>
                <th className="px-3 py-2 text-left">Bron</th>
                <th className="px-3 py-2 text-right">
                  Waarde ({baseCurrency})
                </th>
                <th className="px-3 py-2 text-right">Actie</th>
              </tr>
            </thead>
            <tbody>
              {outcomes.map((o) => (
                <ValuationRow
                  key={o.peilYear}
                  outcome={o}
                  portfolioId={portfolioId}
                  baseCurrency={baseCurrency}
                />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ValuationRow({
  outcome,
  portfolioId,
  baseCurrency,
}: {
  outcome: ValuationOutcome;
  portfolioId: string;
  baseCurrency: string;
}) {
  const [editing, setEditing] = useState(outcome.source === "missing");
  const [draft, setDraft] = useState<string>(
    outcome.value !== null ? String(outcome.value.toFixed(2)) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const parsed = Number(draft.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Voer een geldig bedrag in (≥ 0).");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await saveManualValuation({
        portfolioId,
        peilYear: outcome.peilYear,
        totalValue: parsed,
        source: "manual-entry",
      });
      if (!r.ok) setError(r.message ?? "Onbekende fout.");
      else setEditing(false);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteManualValuation({
        portfolioId,
        peilYear: outcome.peilYear,
      });
    });
  }

  return (
    <tr className="border-t border-border/40">
      <td className="px-3 py-2 font-medium tabular-nums">{outcome.peilYear}</td>
      <td className="px-3 py-2 text-muted-foreground tabular-nums">
        {outcome.asOf ? outcome.asOf.slice(0, 10) : "—"}
      </td>
      <td className="px-3 py-2">
        <SourceBadge source={outcome.source} days={outcome.daysFromBoundary} />
      </td>
      <td className="px-3 py-2 text-right">
        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={isPending}
            className="w-32 rounded-md border border-border/60 bg-surface px-2 py-1 text-right text-sm tabular-nums"
            placeholder="0,00"
            inputMode="decimal"
          />
        ) : (
          <span
            className={cn(
              "tabular-nums",
              outcome.value === null && "text-muted-foreground",
            )}
          >
            {outcome.value !== null
              ? `${outcome.value.toLocaleString("nl-NL", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} ${baseCurrency}`
              : "Onbekend"}
          </span>
        )}
        {error && (
          <p className="mt-1 text-xs text-destructive">{error}</p>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {editing ? (
          <div className="inline-flex gap-1">
            <Button
              size="sm"
              variant="default"
              onClick={handleSave}
              disabled={isPending}
            >
              {isPending ? "…" : "Opslaan"}
            </Button>
            {outcome.source !== "missing" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
                disabled={isPending}
              >
                Annuleren
              </Button>
            )}
          </div>
        ) : (
          <div className="inline-flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              disabled={isPending}
            >
              Wijzigen
            </Button>
            {outcome.source === "manual" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDelete}
                disabled={isPending}
              >
                Wissen
              </Button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function SourceBadge({
  source,
  days,
}: {
  source: ValuationOutcome["source"];
  days: number | null;
}) {
  const label =
    source === "snapshot-exact"
      ? "Snapshot (exact)"
      : source === "snapshot-near"
      ? `Snapshot (≈${days} dgn)`
      : source === "manual"
      ? "Handmatig"
      : "Ontbreekt";
  const tone =
    source === "manual"
      ? "border-primary/40 bg-primary/10 text-primary"
      : source === "snapshot-exact"
      ? "border-success/40 bg-success/10 text-success"
      : source === "snapshot-near"
      ? "border-warning/40 bg-warning/10 text-warning"
      : "border-destructive/40 bg-destructive/10 text-destructive";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        tone,
      )}
    >
      {label}
    </span>
  );
}
