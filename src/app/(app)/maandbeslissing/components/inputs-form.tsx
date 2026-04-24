"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sliders } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DefensivenessLevel } from "@/types/screener";

import {
  maandbeslissingConfigToSearchParams,
  type MaandbeslissingConfig,
} from "../build-plan-input";

interface InputsFormProps {
  initial: MaandbeslissingConfig;
  defaultBudget: number;
  baseCurrency: string;
}

const BIAS_OPTIONS: Array<{
  value: DefensivenessLevel;
  label: string;
  description: string;
}> = [
  {
    value: "offensive",
    label: "Offensief",
    description: "Volledige inzet, volg marktregime.",
  },
  {
    value: "balanced",
    label: "Balans",
    description: "Standaard — geen bias.",
  },
  {
    value: "defensive",
    label: "Defensief",
    description: "15% minder inzetten, meer cash.",
  },
];

/**
 * URL-driven input form voor /maandbeslissing. Schrijft budget, bias en
 * core-ETF toggle naar searchParams zodat de server opnieuw rendert met
 * een vers plan.
 */
export function InputsForm({
  initial,
  defaultBudget,
  baseCurrency,
}: InputsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [budget, setBudget] = useState<string>(
    String(initial.budget ?? defaultBudget),
  );
  const [bias, setBias] = useState<DefensivenessLevel>(initial.bias);
  const [coreEtfEnabled, setCoreEtfEnabled] = useState<boolean>(
    initial.coreEtfEnabled,
  );

  const apply = () => {
    const parsed = Number(budget.trim().replace(",", "."));
    const sp = maandbeslissingConfigToSearchParams({
      budget: Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined,
      bias,
      coreEtfEnabled,
    });
    const query = sp.toString();
    startTransition(() => {
      router.push(query ? `/maandbeslissing?${query}` : "/maandbeslissing");
    });
  };

  const reset = () => {
    setBudget(String(defaultBudget));
    setBias("balanced");
    setCoreEtfEnabled(true);
    startTransition(() => router.push("/maandbeslissing"));
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-primary">
            <Sliders className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Input voor het plan
            </p>
            <p className="text-sm text-foreground">
              Pas budget, voorkeur en core-ETF aan en genereer een vers plan.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
          <BudgetInput
            value={budget}
            onChange={setBudget}
            baseCurrency={baseCurrency}
          />
          <BiasToggle value={bias} onChange={setBias} />
          <CoreEtfToggle
            value={coreEtfEnabled}
            onChange={setCoreEtfEnabled}
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-4">
          <Button variant="ghost" onClick={reset} disabled={isPending} size="sm">
            Reset
          </Button>
          <Button onClick={apply} disabled={isPending}>
            {isPending ? "Plan genereren…" : "Plan genereren"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Subcomponents
// ============================================================

function BudgetInput({
  value,
  onChange,
  baseCurrency,
}: {
  value: string;
  onChange: (value: string) => void;
  baseCurrency: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Maandbudget
      </span>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={25}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full rounded-md border border-border/60 bg-surface px-3 py-2 pr-12 text-sm tabular-nums",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
          {baseCurrency}
        </span>
      </div>
    </label>
  );
}

function BiasToggle({
  value,
  onChange,
}: {
  value: DefensivenessLevel;
  onChange: (value: DefensivenessLevel) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Voorkeur
      </span>
      <div className="grid grid-cols-3 gap-1 rounded-md border border-border/60 bg-surface p-1">
        {BIAS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={cn(
              "rounded-sm px-2 py-1.5 text-xs font-medium transition-colors",
              value === option.value
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
            title={option.description}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CoreEtfToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer flex-col items-start gap-1.5 text-sm sm:min-w-[12rem]">
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Core ETF fallback
      </span>
      <span
        className={cn(
          "flex w-full items-center justify-between rounded-md border px-3 py-2 text-xs transition-colors",
          value
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border/60 bg-surface text-muted-foreground",
        )}
      >
        <span>{value ? "Aan — breed spreiden via IWDA" : "Uit — alleen bestaande posities"}</span>
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <span
          className={cn(
            "ml-2 inline-flex h-5 w-9 items-center rounded-full border transition-colors",
            value ? "border-primary/40 bg-primary/30" : "border-border/60 bg-surface-elevated",
          )}
        >
          <span
            className={cn(
              "block h-4 w-4 rounded-full bg-foreground transition-transform",
              value ? "translate-x-4" : "translate-x-0.5",
            )}
          />
        </span>
      </span>
    </label>
  );
}
