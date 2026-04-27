"use client";

import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * BeforeAfterToggle — pure UI-toggle ("Nu" ↔ "Na advies").
 *
 * Bevat geen businesslogica: het component houdt enkel z'n eigen
 * tab-state vast en geeft die door aan de render-prop. De simulatie
 * zelf (huidige + simulated allocation) wordt door
 * `simulateActionImpact` opgebouwd in de server-laag.
 */

export type BeforeAfterMode = "current" | "simulated";

interface Props {
  /** Default-tab. */
  initial?: BeforeAfterMode;
  /** Optionele controlled mode — wanneer gezet, wordt state genegeerd. */
  value?: BeforeAfterMode;
  onChange?: (mode: BeforeAfterMode) => void;
  /** Render-prop met de actieve mode. */
  render: (mode: BeforeAfterMode) => React.ReactNode;
  /** Extra className voor de wrapper. */
  className?: string;
}

export function BeforeAfterToggle({
  initial = "current",
  value,
  onChange,
  render,
  className,
}: Props) {
  const [internal, setInternal] = useState<BeforeAfterMode>(initial);
  const mode: BeforeAfterMode = value ?? internal;

  const setMode = (next: BeforeAfterMode) => {
    if (value === undefined) setInternal(next);
    onChange?.(next);
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        role="tablist"
        aria-label="Vergelijk huidige en gesimuleerde allocatie"
        className="inline-flex w-fit items-center gap-1 rounded-md border border-border/60 bg-surface-elevated p-0.5"
      >
        <ToggleButton
          isActive={mode === "current"}
          onClick={() => setMode("current")}
          label="Nu"
        />
        <ArrowRightLeft className="h-3 w-3 text-muted-foreground" aria-hidden />
        <ToggleButton
          isActive={mode === "simulated"}
          onClick={() => setMode("simulated")}
          label="Na advies"
        />
      </div>
      <div>{render(mode)}</div>
    </div>
  );
}

function ToggleButton({
  isActive,
  onClick,
  label,
}: {
  isActive: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className={cn(
        "rounded-sm px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors",
        isActive
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
