"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { STRATEGIES } from "@/lib/analytics/backtest";
import { cn } from "@/lib/utils";

import {
  filtersToSearchParams,
  SUPPORTED_BENCHMARKS,
  SUPPORTED_PERIODS,
  type BacktestFilters,
} from "../filters-serde";

interface FiltersFormProps {
  initial: BacktestFilters;
}

/**
 * URL-driven backtest config-form. Client-side state wordt naar de URL
 * geschreven zodat de server met dezelfde parameters opnieuw rendert.
 */
export function FiltersForm({ initial }: FiltersFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [strategy, setStrategy] = useState<string>(initial.strategy);
  const [benchmark, setBenchmark] = useState<string>(
    initial.benchmark ?? "none",
  );
  const [years, setYears] = useState<number>(initial.years);
  const [cost, setCost] = useState<string>(String(initial.commissionBps));

  const apply = () => {
    const commissionBps = Math.max(0, Math.round(Number(cost) || 0));
    const sp = filtersToSearchParams({
      strategy,
      benchmark: benchmark === "none" ? null : benchmark,
      years,
      commissionBps,
    });
    const query = sp.toString();
    startTransition(() => {
      router.push(query ? `/backtest?${query}` : "/backtest");
    });
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-primary">
            <SlidersHorizontal className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Backtest configuratie
            </p>
            <p className="text-sm text-foreground">
              Kies een strategie, benchmark en periode. Het universum is het
              standaard screener-universum.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <Field label="Strategie">
            <Select
              value={strategy}
              onChange={setStrategy}
              options={Object.values(STRATEGIES).map((s) => ({
                value: s.slug,
                label: s.label,
              }))}
            />
          </Field>
          <Field label="Benchmark">
            <Select
              value={benchmark}
              onChange={setBenchmark}
              options={[
                ...SUPPORTED_BENCHMARKS.map((b) => ({
                  value: b,
                  label: b,
                })),
                { value: "none", label: "Geen" },
              ]}
            />
          </Field>
          <Field label="Periode">
            <Select
              value={String(years)}
              onChange={(v) => setYears(Number(v))}
              options={SUPPORTED_PERIODS.map((p) => ({
                value: String(p),
                label: `${p} jaar`,
              }))}
            />
          </Field>
          <Field label="Kosten (bps)">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className={cn(
                "w-full rounded-md border border-border/60 bg-surface px-3 py-2 text-sm tabular-nums",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-4 text-xs text-muted-foreground">
          <p>
            Beschrijving:{" "}
            <span className="text-foreground">
              {STRATEGIES[strategy]?.description ?? "—"}
            </span>
          </p>
          <Button onClick={apply} disabled={isPending}>
            {isPending ? "Backtest loopt…" : "Backtest draaien"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full rounded-md border border-border/60 bg-surface px-3 py-2 text-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
