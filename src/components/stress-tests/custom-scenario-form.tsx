"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { StressSeverity } from "@/lib/analytics/stress-tests";
import { cn } from "@/lib/utils";

/**
 * CustomScenarioForm — client-component voor user-eigen scenario.
 *
 * Posten via een client-side `onRun` callback (de page-level component
 * roept een server-action aan). Houdt het lokaal-state-only — geen DB-
 * persistence van custom scenarios in v1; ze worden ad-hoc gerund.
 */

export interface CustomScenarioFormValues {
  label: string;
  description: string;
  severity: StressSeverity;
  defaultShock: number; // fractie
  techShock: number;
  growthShock: number;
  energyShock: number;
  financialsShock: number;
  bondShock: number;
  currencyShock: number;
  cashShock: number;
}

interface Props {
  onRun: (values: CustomScenarioFormValues) => void;
  pending?: boolean;
}

const DEFAULTS: CustomScenarioFormValues = {
  label: "Mijn scenario",
  description: "Door mij gedefinieerd scenario",
  severity: "moderate",
  defaultShock: -0.10,
  techShock: -0.20,
  growthShock: -0.20,
  energyShock: 0,
  financialsShock: -0.05,
  bondShock: 0,
  currencyShock: 0,
  cashShock: 0,
};

export function CustomScenarioForm({ onRun, pending }: Props) {
  const [values, setValues] = useState<CustomScenarioFormValues>(DEFAULTS);

  function update<K extends keyof CustomScenarioFormValues>(
    key: K,
    value: CustomScenarioFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onRun(values);
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-lg border border-border/60 bg-surface/40 p-4"
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Field
          label="Label"
          value={values.label}
          onChange={(v) => update("label", v)}
        />
        <Field
          label="Beschrijving"
          value={values.description}
          onChange={(v) => update("description", v)}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Severity</Label>
        <div className="flex gap-2">
          {(["moderate", "severe", "extreme"] as StressSeverity[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => update("severity", s)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                values.severity === s
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border/40 text-muted-foreground hover:border-primary/30",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Sector-shocks (fractie, -0,95 t/m +1,00)
        </p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <NumberField
            label="Default (overige sectors)"
            value={values.defaultShock}
            onChange={(v) => update("defaultShock", v)}
          />
          <NumberField
            label="Tech"
            value={values.techShock}
            onChange={(v) => update("techShock", v)}
          />
          <NumberField
            label="Growth"
            value={values.growthShock}
            onChange={(v) => update("growthShock", v)}
          />
          <NumberField
            label="Energy"
            value={values.energyShock}
            onChange={(v) => update("energyShock", v)}
          />
          <NumberField
            label="Financials"
            value={values.financialsShock}
            onChange={(v) => update("financialsShock", v)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Andere assets
        </p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <NumberField
            label="Bonds"
            value={values.bondShock}
            onChange={(v) => update("bondShock", v)}
            hint="Negatief = obligaties dalen."
          />
          <NumberField
            label="Currency (niet-base)"
            value={values.currencyShock}
            onChange={(v) => update("currencyShock", v)}
            hint="Vanuit base-currency-perspectief."
          />
          <NumberField
            label="Cash"
            value={values.cashShock}
            onChange={(v) => update("cashShock", v)}
            hint="Bv. -0,03 voor inflatie-koopkracht-verlies."
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Bereken…" : "Run mijn scenario"}
        </Button>
      </div>
    </form>
  );
}

const inputClasses =
  "block w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/60";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClasses}
        maxLength={80}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <input
        type="number"
        value={value}
        step="0.01"
        min={-0.95}
        max={1.0}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        className={inputClasses}
      />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
