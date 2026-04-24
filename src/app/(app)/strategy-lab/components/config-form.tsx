"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckCircle2, FlaskConical, Save, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StrategyPresetRow } from "@/lib/data/strategy-preset-repository";

import { savePreset, type SavePresetActionInput } from "../actions";

interface ConfigFormProps {
  /** Indien aanwezig: we bewerken een bestaande preset. */
  current: StrategyPresetRow | null;
  /** Default startwaarden voor nieuwe presets. */
  defaults: SavePresetActionInput;
}

type Toast = { ok: boolean; message: string; id: number };

/**
 * Hoofdformulier van Strategy Lab. URL-hash `?preset=<slug>` wordt door de
 * page resolved; deze component krijgt de geresolveerde preset + defaults.
 *
 * State is volledig lokaal. "Opslaan" triggert een server action die de
 * preset upsert. "Backtest" navigeert naar /backtest met de slug.
 */
export function ConfigForm({ current, defaults }: ConfigFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<Toast | null>(null);

  const initial = useMemo<SavePresetActionInput>(() => {
    if (!current) return defaults;
    return {
      slug: current.slug,
      name: current.name,
      description: current.description,
      rebalance: mapRebalanceFromDb(current.rebalance),
      maxPositions: current.maxPositions,
      maxPositionWeight: current.maxPositionWeight,
      factorWeights: current.factorWeights,
      toggles: {
        requireDividend: current.extras.requireDividend,
        defensiveOverlay: current.extras.defensiveOverlay,
        useMomentum: current.extras.useMomentum,
      },
      limits: {
        maxSectorWeight: current.extras.maxSectorWeight,
      },
    };
  }, [current, defaults]);

  const [form, setForm] = useState<SavePresetActionInput>(initial);
  useEffect(() => {
    setForm(initial);
  }, [initial]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const update = <K extends keyof SavePresetActionInput>(
    key: K,
    value: SavePresetActionInput[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const weightSum =
    form.factorWeights.quality +
    form.factorWeights.value +
    form.factorWeights.momentum +
    form.factorWeights.lowVol;

  const isNew = !form.slug;

  const handleSave = (asNew: boolean) => {
    startTransition(async () => {
      const payload: SavePresetActionInput = asNew
        ? { ...form, slug: undefined }
        : form;
      const result = await savePreset(payload);
      setToast({
        ok: result.ok,
        message: result.message,
        id: Date.now(),
      });
      if (result.ok && result.preset) {
        router.push(`/strategy-lab?preset=${result.preset.slug}`);
      }
    });
  };

  const handleBacktest = () => {
    const slug = form.slug ?? current?.slug;
    if (!slug) {
      setToast({
        ok: false,
        message: "Sla de preset eerst op voordat je hem backtest.",
        id: Date.now(),
      });
      return;
    }
    router.push(`/backtest?strategy=${encodeURIComponent(slug)}`);
  };

  return (
    <Card>
      <CardContent className="space-y-6 p-5">
        <Header
          name={form.name}
          description={form.description ?? ""}
          isNew={isNew}
          onChangeName={(v) => update("name", v)}
          onChangeDescription={(v) => update("description", v)}
        />

        <WeightsSection
          weights={form.factorWeights}
          sum={weightSum}
          onChange={(next) => update("factorWeights", next)}
        />

        <TogglesSection
          toggles={form.toggles}
          onChange={(next) => update("toggles", next)}
        />

        <LimitsSection
          maxPositions={form.maxPositions ?? null}
          maxPositionWeight={form.maxPositionWeight ?? null}
          maxSectorWeight={form.limits.maxSectorWeight ?? null}
          rebalance={form.rebalance ?? "monthly"}
          onMaxPositions={(v) => update("maxPositions", v)}
          onMaxPositionWeight={(v) => update("maxPositionWeight", v)}
          onMaxSectorWeight={(v) =>
            update("limits", { maxSectorWeight: v })
          }
          onRebalance={(v) => update("rebalance", v)}
        />

        {toast && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
              toast.ok
                ? "border-success/40 bg-success/10 text-success"
                : "border-destructive/40 bg-destructive/10 text-destructive",
            )}
            role="status"
            aria-live="polite"
          >
            {toast.ok ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <span>{toast.message}</span>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {isNew
              ? "Nieuwe preset — wordt zichtbaar in Backtest zodra je opslaat."
              : `Bestaande preset · slug ${form.slug}`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/strategy-lab">Annuleren</Link>
            </Button>
            {!isNew && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSave(true)}
                disabled={isPending}
              >
                <Save className="h-3.5 w-3.5" />
                Opslaan als nieuw
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleBacktest}
              disabled={isPending}
            >
              <FlaskConical className="h-3.5 w-3.5" />
              Backtest
            </Button>
            <Button
              size="sm"
              onClick={() => handleSave(false)}
              disabled={isPending}
            >
              <Save className="h-3.5 w-3.5" />
              {isPending
                ? "Opslaan…"
                : isNew
                  ? "Preset opslaan"
                  : "Wijzigingen opslaan"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Subsections
// ============================================================

function Header({
  name,
  description,
  isNew,
  onChangeName,
  onChangeDescription,
}: {
  name: string;
  description: string;
  isNew: boolean;
  onChangeName: (v: string) => void;
  onChangeDescription: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {isNew ? "Nieuwe preset" : "Preset bewerken"}
        </p>
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => onChangeName(e.target.value)}
        placeholder="Preset naam"
        className={cn(
          "w-full rounded-md border border-border/60 bg-surface px-3 py-2 text-base font-semibold text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      />
      <textarea
        value={description}
        onChange={(e) => onChangeDescription(e.target.value)}
        placeholder="Korte beschrijving van de strategie"
        rows={2}
        className={cn(
          "w-full resize-none rounded-md border border-border/60 bg-surface px-3 py-2 text-sm text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      />
    </div>
  );
}

function WeightsSection({
  weights,
  sum,
  onChange,
}: {
  weights: SavePresetActionInput["factorWeights"];
  sum: number;
  onChange: (value: SavePresetActionInput["factorWeights"]) => void;
}) {
  const set = (key: keyof typeof weights) => (value: number) => {
    onChange({ ...weights, [key]: value });
  };
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Factor gewichten
        </p>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Som {sum.toFixed(2)} (hoeft niet 1.00 te zijn)
        </p>
      </div>
      <WeightSlider
        label="Quality"
        value={weights.quality}
        onChange={set("quality")}
      />
      <WeightSlider
        label="Value"
        value={weights.value}
        onChange={set("value")}
      />
      <WeightSlider
        label="Momentum"
        value={weights.momentum}
        onChange={set("momentum")}
      />
      <WeightSlider
        label="Risk penalty (lowVol)"
        value={weights.lowVol}
        onChange={set("lowVol")}
      />
    </section>
  );
}

function WeightSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-elevated accent-primary"
      />
    </label>
  );
}

function TogglesSection({
  toggles,
  onChange,
}: {
  toggles: SavePresetActionInput["toggles"];
  onChange: (value: SavePresetActionInput["toggles"]) => void;
}) {
  const set = (key: keyof typeof toggles) => (value: boolean) => {
    onChange({ ...toggles, [key]: value });
  };
  return (
    <section className="space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Overlays
      </p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Toggle
          label="Dividend vereist"
          description="Filter candidates zonder dividend-signaal."
          value={toggles.requireDividend}
          onChange={set("requireDividend")}
        />
        <Toggle
          label="Defensive overlay"
          description="20% cash buffer + tilt naar kwaliteit."
          value={toggles.defensiveOverlay}
          onChange={set("defensiveOverlay")}
        />
        <Toggle
          label="Dynamisch momentum"
          description="12m-prijsreeks i.p.v. statische score."
          value={toggles.useMomentum}
          onChange={set("useMomentum")}
        />
      </div>
    </section>
  );
}

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      className={cn(
        "flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors",
        value
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border/60 bg-surface text-muted-foreground hover:bg-surface-elevated/60",
      )}
    >
      <span className="flex w-full items-center justify-between text-sm font-medium text-foreground">
        {label}
        <span
          className={cn(
            "inline-flex h-5 w-9 items-center rounded-full border transition-colors",
            value
              ? "border-primary/40 bg-primary/30"
              : "border-border/60 bg-surface-elevated",
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
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}

function LimitsSection({
  maxPositions,
  maxPositionWeight,
  maxSectorWeight,
  rebalance,
  onMaxPositions,
  onMaxPositionWeight,
  onMaxSectorWeight,
  onRebalance,
}: {
  maxPositions: number | null;
  maxPositionWeight: number | null;
  maxSectorWeight: number | null;
  rebalance: NonNullable<SavePresetActionInput["rebalance"]>;
  onMaxPositions: (value: number | null) => void;
  onMaxPositionWeight: (value: number | null) => void;
  onMaxSectorWeight: (value: number | null) => void;
  onRebalance: (value: NonNullable<SavePresetActionInput["rebalance"]>) => void;
}) {
  return (
    <section className="space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Limits
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <NumberField
          label="Max posities"
          value={maxPositions}
          min={1}
          max={50}
          step={1}
          onChange={onMaxPositions}
        />
        <NumberField
          label="Max per positie"
          value={maxPositionWeight}
          min={0}
          max={1}
          step={0.01}
          suffix="fractie"
          onChange={onMaxPositionWeight}
        />
        <NumberField
          label="Max per sector"
          value={maxSectorWeight}
          min={0}
          max={1}
          step={0.01}
          suffix="fractie"
          onChange={onMaxSectorWeight}
        />
        <SelectField
          label="Rebalance"
          value={rebalance}
          onChange={onRebalance}
          options={[
            { value: "monthly", label: "Maandelijks" },
            { value: "quarterly", label: "Kwartaal" },
            { value: "semiannual", label: "Halfjaarlijks" },
            { value: "annual", label: "Jaarlijks" },
            { value: "none", label: "Alleen bij start" },
          ]}
        />
      </div>
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}) {
  const [text, setText] = useState<string>(value !== null ? String(value) : "");
  useEffect(() => {
    setText(value !== null ? String(value) : "");
  }, [value]);

  return (
    <label className="block space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </span>
        {suffix && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const parsed = Number(raw.replace(",", "."));
          if (raw === "") onChange(null);
          else if (Number.isFinite(parsed)) onChange(parsed);
        }}
        className={cn(
          "w-full rounded-md border border-border/60 bg-surface px-3 py-2 text-sm tabular-nums",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      />
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
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
    </label>
  );
}

// ============================================================
//  Helpers
// ============================================================

function mapRebalanceFromDb(
  value: string,
): NonNullable<SavePresetActionInput["rebalance"]> {
  switch (value) {
    case "NONE":
      return "none";
    case "QUARTERLY":
      return "quarterly";
    case "SEMIANNUAL":
      return "semiannual";
    case "ANNUAL":
      return "annual";
    case "MONTHLY":
    default:
      return "monthly";
  }
}
