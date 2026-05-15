"use client";

import { Wallet, X } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { updateCashBalanceAction } from "../actions";

interface Props {
  portfolioId: string;
  baseCurrency: string;
  /** Huidige cash-balans (in baseCurrency) — voorvullen in form. */
  currentCash: number;
}

type ResultState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function CashBalanceDialog({ portfolioId, baseCurrency, currentCash }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentCash.toString());
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ResultState>({ kind: "idle" });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult({ kind: "idle" });
    const cashBalance = Number(value);
    if (!Number.isFinite(cashBalance) || cashBalance < 0) {
      setResult({ kind: "error", message: "Vul een geldig bedrag in (≥ 0)." });
      return;
    }
    startTransition(async () => {
      const res = await updateCashBalanceAction({ portfolioId, cashBalance });
      if (res.ok) {
        setResult({ kind: "success", message: res.message });
        setTimeout(() => setOpen(false), 1200);
      } else {
        setResult({ kind: "error", message: res.message });
      }
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          // Reset bij opening — currentCash kan inmiddels verouderd zijn
          // wanneer user dialog tweede keer opent na succesvolle update.
          setValue(currentCash.toString());
          setResult({ kind: "idle" });
        }
      }}
    >
      <SheetTrigger asChild>
        <Button size="sm" variant="outline">
          <Wallet className="mr-1.5 h-4 w-4" />
          Cash bijwerken
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Cash-balans bijwerken</SheetTitle>
          <SheetDescription>
            Totaal bedrag aan cash in {baseCurrency} dat in deze portefeuille
            beschikbaar is. Wordt meegerekend in totaal-waarde, allocaties en
            macro-fit.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="mt-4 space-y-3" noValidate>
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Cash-bedrag ({baseCurrency})
            </span>
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-surface/40 px-3 py-2 transition-colors focus-within:border-primary/60">
              <Wallet
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0.00"
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                autoFocus
              />
            </div>
          </label>

          <p className="text-[10px] text-muted-foreground">
            Huidig: <span className="font-mono">{currentCash.toFixed(2)} {baseCurrency}</span>.
            Verlagen kan om cash-deployment te modelleren; verhogen om een storting te registreren.
          </p>

          {result.kind === "error" && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"
            >
              {result.message}
            </p>
          )}
          {result.kind === "success" && (
            <p className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2 text-xs text-emerald-300">
              {result.message}
            </p>
          )}

          <div className="flex justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              <X className="mr-1 h-3 w-3" />
              Annuleren
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Bezig…" : "Opslaan"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
