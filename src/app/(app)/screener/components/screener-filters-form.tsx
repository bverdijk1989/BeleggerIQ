"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  SUPPORTED_REGIONS,
  SUPPORTED_SECTORS,
} from "@/lib/data/screener-universe";
import { cn } from "@/lib/utils";
import type { ScreenerFilters } from "@/types/screener";

import { filtersToSearchParams } from "../filters-serde";

interface ScreenerFiltersFormProps {
  initial: ScreenerFilters;
}

interface FormState {
  regions: Set<string>;
  sectors: Set<string>;
  minQuality: number;
  minValue: number;
  minMomentum: number;
  minDividend: string; // fractie als tekst, bv "0.02"
  maxDebt: string;
  minMcap: string; // mln
  maxMcap: string; // mln
}

function initialFormState(filters: ScreenerFilters): FormState {
  return {
    regions: new Set(filters.regions ?? []),
    sectors: new Set(filters.sectors ?? []),
    minQuality: filters.factorMin?.quality ?? 0,
    minValue: filters.factorMin?.value ?? 0,
    minMomentum: filters.factorMin?.momentum ?? 0,
    minDividend:
      filters.minDividendYield !== undefined
        ? String(filters.minDividendYield)
        : "",
    maxDebt:
      filters.maxDebtToEquity !== undefined
        ? String(filters.maxDebtToEquity)
        : "",
    minMcap:
      filters.minMarketCap !== undefined
        ? String(Math.round(filters.minMarketCap / 1_000_000))
        : "",
    maxMcap:
      filters.maxMarketCap !== undefined
        ? String(Math.round(filters.maxMarketCap / 1_000_000))
        : "",
  };
}

function formToFilters(state: FormState): ScreenerFilters {
  const filters: ScreenerFilters = {};
  if (state.regions.size > 0) filters.regions = Array.from(state.regions);
  if (state.sectors.size > 0) filters.sectors = Array.from(state.sectors);

  const factorMin: Partial<NonNullable<ScreenerFilters["factorMin"]>> = {};
  if (state.minQuality > 0) factorMin.quality = state.minQuality;
  if (state.minValue > 0) factorMin.value = state.minValue;
  if (state.minMomentum > 0) factorMin.momentum = state.minMomentum;
  if (Object.keys(factorMin).length > 0) filters.factorMin = factorMin;

  const parseNumber = (raw: string): number | undefined => {
    const trimmed = raw.trim().replace(",", ".");
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : undefined;
  };

  const dividend = parseNumber(state.minDividend);
  if (dividend !== undefined && dividend > 0) filters.minDividendYield = dividend;

  const maxDebt = parseNumber(state.maxDebt);
  if (maxDebt !== undefined && maxDebt >= 0) filters.maxDebtToEquity = maxDebt;

  const minMcapM = parseNumber(state.minMcap);
  if (minMcapM !== undefined && minMcapM > 0)
    filters.minMarketCap = minMcapM * 1_000_000;

  const maxMcapM = parseNumber(state.maxMcap);
  if (maxMcapM !== undefined && maxMcapM > 0)
    filters.maxMarketCap = maxMcapM * 1_000_000;

  return filters;
}

export function ScreenerFiltersForm({ initial }: ScreenerFiltersFormProps) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(() =>
    initialFormState(initial),
  );
  const [isPending, startTransition] = useTransition();

  const toggleMember = (key: "regions" | "sectors", value: string) => {
    setState((prev) => {
      const next = new Set(prev[key]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, [key]: next };
    });
  };

  const apply = () => {
    const filters = formToFilters(state);
    const sp = filtersToSearchParams(filters);
    const query = sp.toString();
    startTransition(() => {
      router.push(query ? `/screener?${query}` : "/screener");
    });
  };

  const reset = () => {
    setState(initialFormState({}));
    startTransition(() => {
      router.push("/screener");
    });
  };

  const hasSomething = useMemo(
    () =>
      state.regions.size > 0 ||
      state.sectors.size > 0 ||
      state.minQuality > 0 ||
      state.minValue > 0 ||
      state.minMomentum > 0 ||
      state.minDividend !== "" ||
      state.maxDebt !== "" ||
      state.minMcap !== "" ||
      state.maxMcap !== "",
    [state],
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-primary">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold text-foreground">Filters</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={!hasSomething || isPending}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>

        <FilterGroup label="Regio">
          <div className="flex flex-wrap gap-1.5">
            {SUPPORTED_REGIONS.map((region) => (
              <PillToggle
                key={region}
                active={state.regions.has(region)}
                onClick={() => toggleMember("regions", region)}
              >
                {region}
              </PillToggle>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup label="Sector">
          <div className="flex flex-wrap gap-1.5">
            {SUPPORTED_SECTORS.map((sector) => (
              <PillToggle
                key={sector}
                active={state.sectors.has(sector)}
                onClick={() => toggleMember("sectors", sector)}
              >
                {sector}
              </PillToggle>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup label="Factor drempels">
          <ScoreSlider
            label="Quality"
            value={state.minQuality}
            onChange={(v) => setState((s) => ({ ...s, minQuality: v }))}
          />
          <ScoreSlider
            label="Value"
            value={state.minValue}
            onChange={(v) => setState((s) => ({ ...s, minValue: v }))}
          />
          <ScoreSlider
            label="Momentum"
            value={state.minMomentum}
            onChange={(v) => setState((s) => ({ ...s, minMomentum: v }))}
          />
        </FilterGroup>

        <FilterGroup label="Fundamentals">
          <NumberField
            label="Min dividendrendement"
            suffix="fractie (0.02 = 2%)"
            value={state.minDividend}
            onChange={(v) => setState((s) => ({ ...s, minDividend: v }))}
            step="0.005"
            min={0}
          />
          <NumberField
            label="Max debt/equity"
            suffix="bv. 2 = 200%"
            value={state.maxDebt}
            onChange={(v) => setState((s) => ({ ...s, maxDebt: v }))}
            step="0.1"
            min={0}
          />
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Min market cap (M)"
              suffix="in miljoenen"
              value={state.minMcap}
              onChange={(v) => setState((s) => ({ ...s, minMcap: v }))}
              step="100"
              min={0}
            />
            <NumberField
              label="Max market cap (M)"
              suffix="in miljoenen"
              value={state.maxMcap}
              onChange={(v) => setState((s) => ({ ...s, maxMcap: v }))}
              step="100"
              min={0}
            />
          </div>
        </FilterGroup>

        <Button onClick={apply} disabled={isPending}>
          {isPending ? "Filter toepassen…" : "Filter toepassen"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Subcomponents
// ============================================================

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function PillToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary/40 bg-primary/15 text-primary"
          : "border-border/60 bg-surface hover:bg-surface-elevated text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ScoreSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums">≥ {value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-elevated accent-primary"
      />
    </label>
  );
}

function NumberField({
  label,
  suffix,
  value,
  onChange,
  ...inputProps
}: {
  label: string;
  suffix?: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block space-y-1 text-sm">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">{label}</span>
        {suffix && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full rounded-md border border-border/60 bg-surface px-3 py-1.5 text-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        {...inputProps}
      />
    </label>
  );
}
