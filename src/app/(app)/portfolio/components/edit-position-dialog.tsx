"use client";

import { Pencil, Trash2, X } from "lucide-react";
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

import {
  deletePositionAction,
  updatePositionAction,
  type UpdatePositionInput,
} from "../actions";

interface Props {
  holdingId: string;
  ticker: string;
  name: string;
  quantity: number;
  avgCostPrice: number;
  sector: string | null;
  region: string | null;
  isin: string | null;
  sourceCurrency: string;
}

type ResultState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function EditPositionDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [result, setResult] = useState<ResultState>({ kind: "idle" });

  // Form-state, geinitialiseerd uit props. Re-set bij heropenen.
  const [name, setName] = useState(props.name);
  const [quantity, setQuantity] = useState(props.quantity.toString());
  const [avgCostPrice, setAvgCostPrice] = useState(
    props.avgCostPrice.toString(),
  );
  const [sector, setSector] = useState(props.sector ?? "");
  const [region, setRegion] = useState(props.region ?? "");
  const [isin, setIsin] = useState(props.isin ?? "");

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Reset form bij heropenen — props kunnen inmiddels server-side ververst zijn
      setName(props.name);
      setQuantity(props.quantity.toString());
      setAvgCostPrice(props.avgCostPrice.toString());
      setSector(props.sector ?? "");
      setRegion(props.region ?? "");
      setIsin(props.isin ?? "");
      setConfirmDelete(false);
      setResult({ kind: "idle" });
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult({ kind: "idle" });
    const updates: UpdatePositionInput = { holdingId: props.holdingId };
    if (name !== props.name) updates.name = name;
    const qty = Number(quantity);
    if (qty !== props.quantity) updates.quantity = qty;
    const price = Number(avgCostPrice);
    if (price !== props.avgCostPrice) updates.avgCostPrice = price;
    const sec = sector || null;
    if (sec !== (props.sector ?? null)) updates.sector = sec;
    const reg = region || null;
    if (reg !== (props.region ?? null)) updates.region = reg;
    const isn = isin.toUpperCase() || null;
    if (isn !== (props.isin ?? null)) updates.isin = isn;

    if (Object.keys(updates).length === 1) {
      setResult({
        kind: "error",
        message: "Geen wijzigingen om op te slaan.",
      });
      return;
    }
    startTransition(async () => {
      const res = await updatePositionAction(updates);
      if (res.ok) {
        setResult({ kind: "success", message: res.message });
        setTimeout(() => setOpen(false), 1200);
      } else {
        setResult({ kind: "error", message: res.message });
      }
    });
  }

  function onDelete() {
    setResult({ kind: "idle" });
    startTransition(async () => {
      const res = await deletePositionAction({ holdingId: props.holdingId });
      if (res.ok) {
        setResult({ kind: "success", message: res.message });
        setTimeout(() => setOpen(false), 1000);
      } else {
        setResult({ kind: "error", message: res.message });
        setConfirmDelete(false);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`Bewerk ${props.ticker}`}
          title="Positie bewerken"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            Positie bewerken — <span className="font-mono">{props.ticker}</span>
          </SheetTitle>
          <SheetDescription>
            Valuta ({props.sourceCurrency}) en type kun je niet wijzigen.
            Verwijder en voeg opnieuw toe als die anders moeten.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="mt-4 space-y-3" noValidate>
          <Field label="Naam *">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              maxLength={120}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Aantal *">
              <input
                type="number"
                step="any"
                required
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label={`Avg. kostprijs (${props.sourceCurrency}) *`}>
              <input
                type="number"
                step="any"
                required
                min="0"
                value={avgCostPrice}
                onChange={(e) => setAvgCostPrice(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Sector">
            <input
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className={inputCls}
              maxLength={80}
              placeholder="Technology"
            />
          </Field>

          <Field label="Regio">
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className={inputCls}
              maxLength={80}
              placeholder="Nederland"
            />
          </Field>

          <Field label="ISIN (12 chars)">
            <input
              value={isin}
              onChange={(e) => setIsin(e.target.value)}
              className={inputCls}
              maxLength={12}
              placeholder="NL0010273215"
              pattern="^[A-Z]{2}[A-Z0-9]{9}[0-9]$"
            />
          </Field>

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
              Sluiten
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Bezig…" : "Opslaan"}
            </Button>
          </div>
        </form>

        {/* Delete-flow: aparte sectie met confirmation-step. */}
        <div className="mt-6 border-t border-destructive/30 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-destructive">
            Gevarenzone
          </p>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="mt-2 flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
              disabled={pending}
            >
              <Trash2 className="h-3 w-3" />
              Positie verwijderen
            </button>
          ) : (
            <div className="mt-2 space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-xs text-destructive">
                Weet je zeker dat je{" "}
                <span className="font-mono font-semibold">{props.ticker}</span>{" "}
                wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmDelete(false)}
                  disabled={pending}
                >
                  Annuleer
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={onDelete}
                  disabled={pending}
                >
                  {pending ? "Bezig…" : "Ja, verwijder"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const inputCls =
  "block w-full rounded-md border border-border/60 bg-background px-3 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
