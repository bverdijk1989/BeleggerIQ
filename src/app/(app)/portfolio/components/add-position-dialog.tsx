"use client";

import { Plus, X } from "lucide-react";
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

import { addPositionAction, type AddPositionInput } from "../actions";

interface Props {
  portfolioId: string;
  portfolioName: string;
}

type ResultState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const ASSET_CLASSES: ReadonlyArray<{
  value: AddPositionInput["assetClass"];
  label: string;
}> = [
  { value: "EQUITY", label: "Aandeel" },
  { value: "ETF", label: "ETF" },
  { value: "BOND", label: "Obligatie" },
  { value: "REIT", label: "REIT (vastgoed)" },
  { value: "COMMODITY", label: "Commodity" },
  { value: "CRYPTO", label: "Crypto" },
  { value: "OTHER", label: "Overig" },
];

const COMMON_CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY"];

export function AddPositionDialog({ portfolioId, portfolioName }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ResultState>({ kind: "idle" });

  function reset() {
    setResult({ kind: "idle" });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult({ kind: "idle" });
    const formData = new FormData(event.currentTarget);
    const input: AddPositionInput = {
      portfolioId,
      ticker: String(formData.get("ticker") ?? ""),
      name: String(formData.get("name") ?? ""),
      quantity: Number(formData.get("quantity") ?? 0),
      avgCostPrice: Number(formData.get("avgCostPrice") ?? 0),
      currency: String(formData.get("currency") ?? "EUR"),
      assetClass: String(
        formData.get("assetClass") ?? "EQUITY",
      ) as AddPositionInput["assetClass"],
      sector: (formData.get("sector") as string) || null,
      region: (formData.get("region") as string) || null,
      isin: (formData.get("isin") as string) || null,
    };
    startTransition(async () => {
      const res = await addPositionAction(input);
      if (res.ok) {
        setResult({ kind: "success", message: res.message });
        // Reset form-velden behalve dat dialoog open blijft zodat user
        // meerdere posities achter elkaar kan toevoegen.
        event.currentTarget.reset();
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
        if (!next) reset();
      }}
    >
      <SheetTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          Positie toevoegen
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Positie toevoegen</SheetTitle>
          <SheetDescription>
            Aan {portfolioName}. Bestaande ticker wordt bijgewerkt.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="mt-4 space-y-3" noValidate>
          <Field label="Ticker *" required>
            <input
              name="ticker"
              required
              placeholder="ASML.AS"
              className={inputCls}
              maxLength={32}
              autoComplete="off"
              autoFocus
            />
          </Field>

          <Field label="Naam *" required>
            <input
              name="name"
              required
              placeholder="ASML Holding"
              className={inputCls}
              maxLength={120}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Aantal *" required>
              <input
                name="quantity"
                type="number"
                step="any"
                required
                min="0"
                placeholder="10"
                className={inputCls}
              />
            </Field>
            <Field label="Avg. kostprijs *" required>
              <input
                name="avgCostPrice"
                type="number"
                step="any"
                required
                min="0"
                placeholder="650.00"
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Valuta *" required>
              <select name="currency" required className={inputCls} defaultValue="EUR">
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Type *" required>
              <select name="assetClass" required className={inputCls} defaultValue="EQUITY">
                {ASSET_CLASSES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <details className="rounded-md border border-border/40 bg-surface/30">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
              Optionele velden (sector, regio, ISIN)
            </summary>
            <div className="space-y-3 px-3 pb-3 pt-1">
              <Field label="Sector">
                <input
                  name="sector"
                  placeholder="Technology"
                  className={inputCls}
                  maxLength={80}
                />
              </Field>
              <Field label="Regio">
                <input
                  name="region"
                  placeholder="Nederland"
                  className={inputCls}
                  maxLength={80}
                />
              </Field>
              <Field label="ISIN (12 chars)">
                <input
                  name="isin"
                  placeholder="NL0010273215"
                  className={inputCls}
                  maxLength={12}
                  pattern="^[A-Z]{2}[A-Z0-9]{9}[0-9]$"
                />
              </Field>
            </div>
          </details>

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
              {result.message} Voeg nog een toe of sluit dit paneel.
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
              {pending ? "Bezig…" : "Positie toevoegen"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

const inputCls =
  "block w-full rounded-md border border-border/60 bg-background px-3 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
        {required ? "" : ""}
      </span>
      {children}
    </label>
  );
}
